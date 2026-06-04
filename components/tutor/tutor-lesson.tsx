'use client'
// components/tutor/tutor-lesson.tsx — AI-репетитор «Аня» lesson client.
//
// FUNCTIONAL INTEGRATION HARNESS (not the final design). Wires the whole tutor
// backend end-to-end so it can be tested as a real voice lesson:
//   - 11labs session via /api/tutor/signed-url + the 8 tutor client tools
//     (buildTutorClientTools) + dynamic variables (greeting by name, first/Nth).
//   - tool-on-demand reveal: tools emit lesson-bus events → TutorStage shows /
//     hides a board / trainer / reward / break placeholder over the empty canvas.
//   - behaviour moderation: every CHILD utterance is checked server-side
//     (/api/tutor/moderation); a warn/escalate verdict is pushed back to «Аня»
//     via sendContextualUpdate.
//   - fatigue signal: a periodic [СОСТОЯНИЕ] note (3 numbers) per LESSON-FLOW §6.
//   - tracking: graded answers (trainer:answer_submitted) → /api/tutor/attempt;
//     session completion → /api/tutor/complete.
//
// The beige-minimal chrome + rich boards are intentionally plain here; the
// Claude-Design port (.tmp/sketches/tutor/anya-tutor-clean.html) replaces the
// TutorStage visuals later. SDK lifecycle patterns mirror components/lesson-v2.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ConversationProvider, useConversation } from '@elevenlabs/react'
import { LessonBusProvider, useLessonBus, useLessonBusEvent } from '@/lib/lesson-bus'
import { Avatar } from '@/components/avatar/avatar'
import { useAvatarState } from '@/components/avatar/use-avatar-state'
import { buildTutorClientTools } from '@/lib/tutor-tools'
import { formatFatigueSignal, formatTutorState } from '@/lib/tutor/contextual-updates'
import type { TutorDynamicVariables } from '@/lib/tutor/types'

interface TutorLessonProps {
  sessionId: string
  lessonTitle: string
  lessonSubtitle: string
  dynamicVariables: TutorDynamicVariables
}

const BEIGE = {
  bg: '#F5F0E6',
  panel: '#FFFFFF',
  ink: '#2E2A24',
  sub: '#8A8170',
  accent: '#C9A227',
}

type ActiveTool =
  | { tool: 'board'; variant?: string; drawPrompt?: string }
  | { tool: 'trainer'; taskId?: string }
  | null

type ChatMsg = { role: 'agent' | 'user'; text: string; t: number }

export function TutorLesson(props: TutorLessonProps) {
  return (
    <LessonBusProvider>
      <ConversationProvider>
        <TutorLessonInner {...props} />
      </ConversationProvider>
    </LessonBusProvider>
  )
}

function TutorLessonInner({ sessionId, lessonTitle, lessonSubtitle, dynamicVariables }: TutorLessonProps) {
  const bus = useLessonBus()
  const [error, setError] = useState<string | null>(null)
  const isStartingRef = useRef(false)

  // ── tracking refs (read by tools + fatigue; never trigger re-render) ──────
  const phaseRef = useRef<string>('connecting')
  const solvedRef = useRef<Set<string>>(new Set())
  const shownTasksRef = useRef<Set<string>>(new Set())
  const consecutiveErrorsRef = useRef<number>(0)
  const reactionTimesRef = useRef<number[]>([])
  const startTimeRef = useRef<number>(0)
  const lastShownAtRef = useRef<number>(0)

  // latched command surface for use inside bus/SDK callbacks
  const convoCmdRef = useRef<{ sendContextualUpdate: (t: string) => void }>({
    sendContextualUpdate: () => {},
  })

  // ── lesson-state snapshot for the lesson_state tool ───────────────────────
  const getState = useCallback(
    () =>
      formatTutorState({
        phase: phaseRef.current,
        solvedCount: solvedRef.current.size,
        totalShown: shownTasksRef.current.size,
        consecutiveErrors: consecutiveErrorsRef.current,
      }),
    [],
  )

  // ── the 8 tutor client tools (stable identity) ────────────────────────────
  const clientTools = useMemo(
    () => buildTutorClientTools({ bus, sessionId, getState }),
    [bus, sessionId, getState],
  )

  // ── stable SDK callbacks ──────────────────────────────────────────────────
  const handleConnect = useCallback(() => bus.emit('voice:state', { state: 'idle' }), [bus])
  const handleDisconnect = useCallback(() => bus.emit('voice:state', { state: 'idle' }), [bus])
  const handleModeChange = useCallback(
    ({ mode }: { mode: 'speaking' | 'listening' }) => bus.emit('voice:state', { state: mode }),
    [bus],
  )
  const handleError = useCallback(
    (message: string) => {
      console.error('[tutor] SDK error:', message)
      bus.emit('voice:state', { state: 'idle' })
      setError('Ошибка голосового сервиса. Попробуйте снова.')
    },
    [bus],
  )

  // Behaviour moderation: check every CHILD utterance server-side and push the
  // verdict back to «Аня» as a contextual note (LESSON-FLOW §7, layer 1→2).
  const checkModeration = useCallback(
    async (text: string) => {
      try {
        const res = await fetch('/api/tutor/moderation', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sessionId, text }),
        })
        if (!res.ok) return
        const data = (await res.json()) as { action: string; contextualUpdate: string | null }
        if (data.action !== 'none' && data.contextualUpdate) {
          convoCmdRef.current.sendContextualUpdate(data.contextualUpdate)
        }
      } catch (err) {
        console.error('[tutor] moderation check failed:', err)
      }
    },
    [sessionId],
  )

  const [chat, setChat] = useState<ChatMsg[]>([])
  const handleMessage = useCallback(
    (payload: { message: string; role: 'user' | 'agent' }) => {
      const text = (payload?.message ?? '').trim()
      if (!text) return
      bus.emit('voice:transcript', { text, role: payload.role, timestamp: Date.now() })
      setChat((c) => [...c.slice(-40), { role: payload.role, text, t: Date.now() }])
      if (payload.role === 'user') void checkModeration(text)
    },
    [bus, checkModeration],
  )

  const conversation = useConversation({
    clientTools,
    onConnect: handleConnect,
    onDisconnect: handleDisconnect,
    onModeChange: handleModeChange,
    onMessage: handleMessage,
    onError: handleError,
  })
  convoCmdRef.current = conversation as unknown as { sendContextualUpdate: (t: string) => void }

  const avatarState = useAvatarState()

  // ── tool-on-demand reveal (TutorStage state) ──────────────────────────────
  const [activeTool, setActiveTool] = useState<ActiveTool>(null)
  const [breakActive, setBreakActive] = useState(false)
  const [reward, setReward] = useState<string | null>(null)
  const rewardTimerRef = useRef<number | null>(null)

  useLessonBusEvent('tutor:show_tool', (p) => {
    if (p.tool === 'board') {
      setActiveTool({ tool: 'board', variant: p.variant })
      shownTasksRef.current.add(`board:${p.variant ?? '?'}`)
    } else if (p.tool === 'trainer') {
      setActiveTool({ tool: 'trainer', taskId: p.taskId })
      if (p.taskId) shownTasksRef.current.add(p.taskId)
      lastShownAtRef.current = Date.now()
    }
  })
  useLessonBusEvent('tutor:hide_tool', () => setActiveTool(null))
  useLessonBusEvent('tutor:break', ({ active }) => setBreakActive(active))
  useLessonBusEvent('tutor:phase', ({ phase }) => {
    phaseRef.current = phase
  })
  useLessonBusEvent('tutor:reward', ({ label }) => {
    setReward(label || 'Молодец!')
    if (rewardTimerRef.current) window.clearTimeout(rewardTimerRef.current)
    rewardTimerRef.current = window.setTimeout(() => setReward(null), 3500)
  })
  // draw_board → reveal the board placeholder with what «Аня» asked to draw.
  useLessonBusEvent('board:draw_request', ({ prompt }) => {
    setActiveTool({ tool: 'board', variant: 'draw', drawPrompt: prompt })
  })

  // ── graded-answer tracking (ready for the real trainer) ───────────────────
  // When the trainer emits trainer:answer_submitted, record the attempt and
  // update fatigue counters. Wired now; fires once the trainer UI is ported in.
  useLessonBusEvent('trainer:answer_submitted', ({ taskId, value, correct }) => {
    const reactionMs = lastShownAtRef.current ? Date.now() - lastShownAtRef.current : undefined
    if (typeof reactionMs === 'number') reactionTimesRef.current.push(reactionMs)
    if (correct) {
      solvedRef.current.add(taskId)
      consecutiveErrorsRef.current = 0
    } else {
      consecutiveErrorsRef.current += 1
    }
    void fetch('/api/tutor/attempt', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId, taskId, correct, reactionMs, value }),
    }).catch((err) => console.error('[tutor] attempt post failed:', err))
  })

  // ── periodic fatigue signal (LESSON-FLOW §6: 3 numbers → agent) ───────────
  useEffect(() => {
    if (conversation.status !== 'connected') return
    if (!startTimeRef.current) startTimeRef.current = Date.now()
    const id = window.setInterval(() => {
      const times = reactionTimesRef.current
      const avgReactionSec =
        times.length > 0 ? times.reduce((a, b) => a + b, 0) / times.length / 1000 : 0
      const minutesElapsed = (Date.now() - startTimeRef.current) / 60000
      try {
        convoCmdRef.current.sendContextualUpdate(
          formatFatigueSignal({
            avgReactionSec,
            consecutiveErrors: consecutiveErrorsRef.current,
            minutesElapsed,
          }),
        )
      } catch (err) {
        console.error('[tutor] fatigue signal failed:', err)
      }
    }, 90_000)
    return () => window.clearInterval(id)
  }, [conversation.status])

  // ── start / stop ──────────────────────────────────────────────────────────
  const handleStart = useCallback(async () => {
    if (isStartingRef.current) return
    isStartingRef.current = true
    setError(null)
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true }).catch((err: { name?: string }) => {
        if (err?.name === 'NotAllowedError') setError('Доступ к микрофону запрещён. Разреши его в браузере.')
        else if (err?.name === 'NotFoundError') setError('Микрофон не найден.')
        else setError('Не удалось получить микрофон.')
        return null
      })
      if (!stream) return
      stream.getTracks().forEach((t) => t.stop())

      const res = await fetch('/api/tutor/signed-url', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId }),
      })
      if (!res.ok) {
        setError('Не удалось получить ссылку. Попробуй снова.')
        return
      }
      const data = (await res.json()) as { signedUrl: string }

      startTimeRef.current = Date.now()
      conversation.startSession({
        signedUrl: data.signedUrl,
        connectionType: 'websocket',
        dynamicVariables: { ...dynamicVariables },
      })
    } catch (err) {
      console.error('[tutor] start failed:', err)
      setError('Ошибка голосового сервиса. Попробуй снова.')
    } finally {
      isStartingRef.current = false
    }
  }, [conversation, sessionId, dynamicVariables])

  const handleStop = useCallback(() => {
    try {
      conversation.endSession()
    } catch (err) {
      console.error('[tutor] stop failed:', err)
    }
    // Mark the session complete (server computes duration + logs the event).
    void fetch('/api/tutor/complete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId }),
    }).catch((err) => console.error('[tutor] complete post failed:', err))
  }, [conversation, sessionId])

  // cleanup on unmount (latched-ref pattern from Phase 6.5)
  const conversationRef = useRef(conversation)
  conversationRef.current = conversation
  useEffect(() => {
    return () => {
      const c = conversationRef.current
      if (c.status === 'connected' || c.status === 'connecting') {
        try {
          c.endSession()
        } catch (err) {
          console.error('[tutor] cleanup endSession:', err)
        }
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const isActive = conversation.status === 'connected' || conversation.status === 'connecting'
  const statusText =
    conversation.status === 'connecting'
      ? 'Подключаемся…'
      : conversation.status === 'connected' && conversation.mode === 'speaking'
        ? 'Аня говорит…'
        : conversation.status === 'connected' && conversation.mode === 'listening'
          ? 'Аня слушает…'
          : 'Готовы начать'

  return (
    <div className="min-h-screen flex flex-col" style={{ background: BEIGE.bg, color: BEIGE.ink }}>
      {/* header */}
      <header className="px-6 py-4 flex items-center justify-between">
        <div>
          <h1 className="text-base font-semibold">{lessonTitle}</h1>
          <p className="text-xs" style={{ color: BEIGE.sub }}>{lessonSubtitle}</p>
        </div>
        <a href="/cabinet/okr-mir-4" className="text-xs hover:underline" style={{ color: BEIGE.sub }}>
          ← выйти
        </a>
      </header>

      {/* stage — empty canvas with avatar; tools reveal over it */}
      <main className="flex-1 flex flex-col items-center justify-center px-6 gap-6">
        <TutorStage activeTool={activeTool} breakActive={breakActive} reward={reward}>
          <div className="flex flex-col items-center gap-3">
            <Avatar state={avatarState} size="text-8xl" />
            <p className="text-sm" style={{ color: BEIGE.sub }}>{statusText}</p>
          </div>
        </TutorStage>
      </main>

      {/* transcript */}
      {chat.length > 0 && (
        <div className="px-6 pb-3 max-h-40 overflow-y-auto w-full max-w-2xl mx-auto space-y-1">
          {chat.slice(-6).map((m, i) => (
            <p key={i} className="text-sm">
              <span className="font-semibold" style={{ color: m.role === 'agent' ? BEIGE.accent : BEIGE.ink }}>
                {m.role === 'agent' ? 'Аня' : 'Ты'}:
              </span>{' '}
              <span style={{ color: BEIGE.ink }}>{m.text}</span>
            </p>
          ))}
        </div>
      )}

      {/* controls */}
      <footer className="px-6 py-5 flex flex-col items-center gap-2">
        {!isActive ? (
          <button
            onClick={handleStart}
            className="h-14 px-10 rounded-2xl text-base font-extrabold uppercase tracking-wide text-white transition-transform active:translate-y-0.5"
            style={{ background: BEIGE.accent, boxShadow: '0 4px 0 rgba(0,0,0,0.12)' }}
          >
            🎙 Начать урок
          </button>
        ) : (
          <button
            onClick={handleStop}
            className="h-12 px-8 rounded-2xl text-sm font-bold border"
            style={{ borderColor: BEIGE.sub, color: BEIGE.ink }}
          >
            Завершить урок
          </button>
        )}
        {error && (
          <p className="text-xs text-center max-w-md" style={{ color: '#C0392B' }}>{error}</p>
        )}
      </footer>
    </div>
  )
}

/** Central stage — empty-canvas child by default; reveals a tool placeholder. */
function TutorStage({
  activeTool,
  breakActive,
  reward,
  children,
}: {
  activeTool: ActiveTool
  breakActive: boolean
  reward: string | null
  children: React.ReactNode
}) {
  return (
    <div className="relative w-full max-w-2xl min-h-[320px] flex items-center justify-center">
      {/* reward overlay */}
      {reward && (
        <div className="absolute top-2 left-1/2 -translate-x-1/2 z-10 flex items-center gap-2 rounded-full px-4 py-2 text-sm font-bold animate-[lpHintIn_.3s_ease-out]"
          style={{ background: '#FFF7DB', color: BEIGE.accent, boxShadow: '0 2px 0 rgba(0,0,0,0.06)' }}>
          ⭐ {reward}
        </div>
      )}

      {breakActive ? (
        <div className="text-center" style={{ color: BEIGE.sub }}>
          <div className="text-5xl mb-2">☕</div>
          <p className="text-sm">Небольшая пауза — отдохни немного.</p>
        </div>
      ) : activeTool?.tool === 'board' ? (
        <div className="w-full rounded-3xl p-8 text-center" style={{ background: BEIGE.panel, boxShadow: '0 6px 0 rgba(0,0,0,0.05)' }}>
          <div className="text-4xl mb-2">🪐</div>
          <p className="text-sm font-semibold">Доска: {activeTool.variant ?? 'схема'}</p>
          {activeTool.drawPrompt && (
            <p className="text-xs mt-1" style={{ color: BEIGE.sub }}>{activeTool.drawPrompt}</p>
          )}
          <p className="text-[11px] mt-3" style={{ color: BEIGE.sub }}>
            (визуальная доска подключается в дизайн-порте)
          </p>
        </div>
      ) : activeTool?.tool === 'trainer' ? (
        <div className="w-full rounded-3xl p-8 text-center" style={{ background: BEIGE.panel, boxShadow: '0 6px 0 rgba(0,0,0,0.05)' }}>
          <div className="text-4xl mb-2">🎯</div>
          <p className="text-sm font-semibold">Задание: {activeTool.taskId ?? 'task'}</p>
          <p className="text-[11px] mt-3" style={{ color: BEIGE.sub }}>
            (интерактивный тренажёр подключается в дизайн-порте)
          </p>
        </div>
      ) : (
        children
      )}
    </div>
  )
}
