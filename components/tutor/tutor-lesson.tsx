'use client'
// components/tutor/tutor-lesson.tsx — AI-репетитор «Аня», LIVE on the Claude
// Design front-end.
//
// The design (public/tutor/anya.html) is served UNCHANGED inside a full-screen
// iframe. This thin React layer owns ONLY the voice stack (proven 11labs React
// SDK) and drives the design through `window.__klassioEngine` — the bridge the
// build step exposes over the design's OWN engine functions. No visual UI of our
// own: everything the child sees is the design.
//
//   mic button (design)         → start/stop the live session
//   Аня's real speech           → engine.pushBubble('tutor', …) + avatar speaking
//   child's speech              → engine.pushBubble('child', …) + moderation check
//   Аня's tool calls            → engine.showBoard / showTask / hideTool (your slides)
//   trainer solved              → record attempt + tell Аня
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ConversationProvider, useConversation } from '@elevenlabs/react'
import type { ClientTools } from '@elevenlabs/react'
import type { TutorDynamicVariables } from '@/lib/tutor/types'
import { formatFatigueSignal, formatTutorState } from '@/lib/tutor/contextual-updates'

interface TutorLessonProps {
  sessionId: string
  lessonTitle: string
  lessonSubtitle: string
  dynamicVariables: TutorDynamicVariables
}

// Minimal shape of the bridge the design exposes (build-tutor-html.mjs).
interface KlassioEngine {
  setStatus: (s: 'listening' | 'speaking' | 'thinking') => void
  setCaption: (t: string) => void
  showBoard: (variant: string, animate?: boolean) => void
  showTask: (step: unknown, animate?: boolean) => void
  hideTool: (animate?: boolean) => void
  pushBubble: (w: 'tutor' | 'child', t: string) => void
  onMic: null | (() => void)
  onSolve: null | ((step: { id?: string }) => void)
}
interface KlassioWindow extends Window {
  __klassioEngine?: KlassioEngine
  __KLASSIO_REAL_LESSON?: Array<{ type?: string; id?: string; skill?: string }>
}

export function TutorLesson(props: TutorLessonProps) {
  return (
    <ConversationProvider>
      <TutorLessonInner {...props} />
    </ConversationProvider>
  )
}

function TutorLessonInner({ sessionId, lessonTitle, dynamicVariables }: TutorLessonProps) {
  const iframeRef = useRef<HTMLIFrameElement | null>(null)
  const [error, setError] = useState<string | null>(null)
  const isStartingRef = useRef(false)

  // ── tracking refs (read by tools/fatigue; no re-render) ───────────────────
  const phaseRef = useRef<string>('connecting')
  const solvedRef = useRef<Set<string>>(new Set())
  const shownTasksRef = useRef<Set<string>>(new Set())
  const consecutiveErrorsRef = useRef<number>(0)
  const startTimeRef = useRef<number>(0)
  const convoCmdRef = useRef<{ sendContextualUpdate: (t: string) => void }>({ sendContextualUpdate: () => {} })

  const engine = useCallback((): KlassioEngine | null => {
    const w = iframeRef.current?.contentWindow as KlassioWindow | null
    return w?.__klassioEngine ?? null
  }, [])
  const realLesson = useCallback(() => {
    const w = iframeRef.current?.contentWindow as KlassioWindow | null
    return w?.__KLASSIO_REAL_LESSON ?? []
  }, [])

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

  // ── fire-and-forget tracking POSTs ────────────────────────────────────────
  const post = useCallback((url: string, body: unknown) => {
    void fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }).catch((e) => console.error('[tutor] POST failed', url, e))
  }, [])

  // ── the agent's client tools → drive the design ───────────────────────────
  const clientTools: ClientTools = useMemo(
    () => ({
      // Reveal one of the design's prebuilt boards.
      show_board: (p: Record<string, unknown>) => {
        const board = typeof p.board === 'string' ? p.board.trim() : ''
        if (!board) return 'Error: пустой board'
        engine()?.showBoard(board)
        shownTasksRef.current.add('board:' + board)
        post('/api/tutor/event', { sessionId, eventType: 'tool_used', payload: { tool: 'board', variant: board } })
        return `OK, доска "${board}" показана — рассказывай чуть медленнее.`
      },
      // Reveal an interactive trainer task ("task-1", "task-2"…).
      show_trainer: (p: Record<string, unknown>) => {
        const taskId = typeof p.taskId === 'string' ? p.taskId.trim() : ''
        const n = parseInt(taskId.replace(/[^0-9]/g, ''), 10)
        const tasks = realLesson().filter((s) => s?.type === 'task')
        const step = Number.isFinite(n) ? tasks[n - 1] : undefined
        if (!step) return `Error: задача "${taskId}" не найдена`
        engine()?.showTask(step)
        shownTasksRef.current.add(taskId)
        post('/api/tutor/event', { sessionId, eventType: 'tool_used', payload: { tool: 'trainer', taskId } })
        return `OK, задание ${taskId} показано.`
      },
      hide_tool: () => {
        engine()?.hideTool()
        return 'Холст очищен'
      },
      set_phase: (p: Record<string, unknown>) => {
        const phase = typeof p.phase === 'string' ? p.phase.trim() : ''
        phaseRef.current = phase
        post('/api/tutor/phase', { sessionId, phase })
        return `Фаза: ${phase}`
      },
      give_reward: (p: Record<string, unknown>) => {
        const label = typeof p.label === 'string' ? p.label.trim() : undefined
        engine()?.showBoard('reward')
        post('/api/tutor/event', { sessionId, eventType: 'reward_given', payload: { label: label ?? null } })
        return 'Награда показана'
      },
      take_break: (p: Record<string, unknown>) => {
        const mode = typeof p.active === 'string' ? p.active.trim() : ''
        const active = mode === 'start'
        engine()?.hideTool()
        engine()?.setStatus('listening')
        post('/api/tutor/event', { sessionId, eventType: active ? 'pause_started' : 'pause_ended', payload: {} })
        return active ? 'Пауза' : 'Возвращаемся к уроку'
      },
      lesson_state: () => getState(),
    }),
    [engine, realLesson, getState, post, sessionId],
  )

  // ── SDK callbacks ─────────────────────────────────────────────────────────
  const handleModeChange = useCallback(({ mode }: { mode: 'speaking' | 'listening' }) => {
    engine()?.setStatus(mode)
  }, [engine])

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
      } catch (e) {
        console.error('[tutor] moderation failed', e)
      }
    },
    [sessionId],
  )

  const handleMessage = useCallback(
    (payload: { message: string; role: 'user' | 'agent' }) => {
      const text = (payload?.message ?? '').trim()
      if (!text) return
      engine()?.pushBubble(payload.role === 'agent' ? 'tutor' : 'child', text)
      if (payload.role === 'user') void checkModeration(text)
    },
    [engine, checkModeration],
  )

  const handleError = useCallback((message: string) => {
    console.error('[tutor] SDK error', message)
    setError('Ошибка голосового сервиса. Попробуй ещё раз.')
  }, [])

  const conversation = useConversation({
    clientTools,
    onModeChange: handleModeChange,
    onMessage: handleMessage,
    onError: handleError,
  })
  convoCmdRef.current = conversation as unknown as { sendContextualUpdate: (t: string) => void }

  // ── start / stop (driven by the design's mic button) ──────────────────────
  const startSession = useCallback(async () => {
    if (isStartingRef.current) return
    isStartingRef.current = true
    setError(null)
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true }).catch((err: { name?: string }) => {
        setError(
          err?.name === 'NotAllowedError'
            ? 'Разреши доступ к микрофону в браузере.'
            : err?.name === 'NotFoundError'
              ? 'Микрофон не найден.'
              : 'Не удалось получить микрофон.',
        )
        return null
      })
      if (!stream) return
      stream.getTracks().forEach((t) => t.stop())

      const res = await fetch('/api/tutor/signed-url', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId }),
      })
      if (!res.ok) { setError('Не удалось подключиться. Попробуй ещё раз.'); return }
      const data = (await res.json()) as { signedUrl: string }

      startTimeRef.current = Date.now()
      engine()?.setCaption('Соединяюсь…')
      conversation.startSession({
        signedUrl: data.signedUrl,
        connectionType: 'websocket',
        dynamicVariables: { ...dynamicVariables },
      })
    } catch (e) {
      console.error('[tutor] start failed', e)
      setError('Ошибка голосового сервиса.')
    } finally {
      isStartingRef.current = false
    }
  }, [conversation, sessionId, dynamicVariables, engine])

  const stopSession = useCallback(() => {
    try { conversation.endSession() } catch (e) { console.error('[tutor] stop', e) }
    post('/api/tutor/complete', { sessionId })
  }, [conversation, post, sessionId])

  // Latest mic handler via ref (so the engine callback stays stable).
  const micHandlerRef = useRef<() => void>(() => {})
  micHandlerRef.current = () => {
    if (conversation.status === 'connected' || conversation.status === 'connecting') stopSession()
    else void startSession()
  }
  const solveHandlerRef = useRef<(step: { id?: string; skill?: string }) => void>(() => {})
  solveHandlerRef.current = (step) => {
    const taskId = step?.id ?? 'task'
    solvedRef.current.add(taskId)
    consecutiveErrorsRef.current = 0
    post('/api/tutor/attempt', { sessionId, taskId, correct: true, skillTag: step?.skill })
    try {
      convoCmdRef.current.sendContextualUpdate(`[ПЛАТФОРМА] Ребёнок решил задание ${taskId}. Похвали и продолжай.`)
    } catch {/* noop */}
  }

  // ── wire into the design once its engine is ready ─────────────────────────
  useEffect(() => {
    let tries = 0
    const id = window.setInterval(() => {
      const e = engine()
      if (e) {
        window.clearInterval(id)
        e.onMic = () => micHandlerRef.current()
        e.onSolve = (step) => solveHandlerRef.current(step)
        e.setCaption('Нажми микрофон, чтобы начать урок')
      } else if (++tries > 100) {
        window.clearInterval(id)
        console.warn('[tutor] __klassioEngine never appeared')
      }
    }, 100)
    return () => window.clearInterval(id)
  }, [engine])

  // ── periodic fatigue signal ───────────────────────────────────────────────
  useEffect(() => {
    if (conversation.status !== 'connected') return
    const id = window.setInterval(() => {
      const minutesElapsed = startTimeRef.current ? (Date.now() - startTimeRef.current) / 60000 : 0
      try {
        convoCmdRef.current.sendContextualUpdate(
          formatFatigueSignal({ avgReactionSec: 0, consecutiveErrors: consecutiveErrorsRef.current, minutesElapsed }),
        )
      } catch {/* noop */}
    }, 90_000)
    return () => window.clearInterval(id)
  }, [conversation.status])

  // cleanup on unmount
  const conversationRef = useRef(conversation)
  conversationRef.current = conversation
  useEffect(() => {
    return () => {
      const c = conversationRef.current
      if (c.status === 'connected' || c.status === 'connecting') {
        try { c.endSession() } catch {/* noop */}
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div className="fixed inset-0">
      <iframe
        ref={iframeRef}
        src="/tutor/anya.html"
        title={lessonTitle}
        className="w-full h-full border-0 block"
        allow="microphone; autoplay"
      />
      {error && (
        <div className="absolute top-3 left-1/2 -translate-x-1/2 z-50 rounded-lg bg-red-600 text-white text-sm px-3 py-2 shadow-lg">
          {error}
        </div>
      )}
    </div>
  )
}
