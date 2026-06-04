'use client'
// components/tutor/tutor-lesson.tsx — AI-репетитор «Аня», LIVE on the Claude
// Design front-end.
//
// The design (public/tutor/anya.html) is served UNCHANGED inside a full-screen
// iframe. This thin React layer owns the voice stack (11labs React SDK) + three
// small overlays the operator asked for (a centred Start button, an End button,
// a voice/tutor picker) and drives the design through window.__klassioEngine —
// the bridge the build step exposes over the design's OWN engine functions.
//
//   centre «Начать урок» → start the live session
//   mic button (design)  → MUTE / UNMUTE only (never ends the lesson)
//   «Завершить урок»      → end the session
//   Аня's real speech    → engine.pushBubble('tutor', …) + avatar speaking
//   child's speech        → engine.pushBubble('child', …) + server moderation
//   Аня's tool calls      → engine.showBoard / showTask / hideTool (your slides)
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

// Tutor voices. The design always shows the teacher as «Аня», so every option
// introduces itself as Аня — only the voice timbre changes. firstMessage ASKS
// the child's name (operator: «пусть спрашивает моё имя»).
const TUTOR_VOICES = [
  {
    key: 'warm',
    label: 'Аня · тёплый',
    voiceId: 'gedzfqL7OGdPbwm0ynTP',
    firstMessage: 'Привет! Меня зовут Аня, сегодня мы вместе изучаем окружающий мир. А тебя как зовут?',
  },
  {
    key: 'soft',
    label: 'Аня · мягкий',
    voiceId: 'd5ruruBhXNbnS7Va7n23',
    firstMessage: 'Привет! Меня зовут Аня, сегодня мы вместе изучаем окружающий мир. А тебя как зовут?',
  },
] as const
const VOICE_STORAGE = 'klassio-tutor-voice'

// Canonical theory-board order — next_slide advances through this so Аня never
// skips a board and always starts with the cover (title) slide.
const BOARD_ORDER = ['cover', 'etymology', 'bodies', 'solar', 'facts'] as const

// Minimum time a board/task stays in the centre before another can replace it —
// a safety net so a board doesn't "flash" when Аня chains show_board+show_trainer
// in one turn. When she paces properly (narrates, then advances) this is a no-op.
const MIN_DWELL_MS = 6500

interface KlassioEngine {
  setStatus: (s: 'listening' | 'speaking' | 'thinking') => void
  setCaption: (t: string) => void
  setMuted: (m: boolean) => void
  setChildName: (name: string) => void
  showStartButton: () => void
  hideStartButton: () => void
  setStartButtonText: (text: string, disabled: boolean) => void
  startTimer: () => void
  setVoiceMenu: (voices: Array<{ key: string; label: string }>, selectedKey: string) => void
  onStart: null | (() => void)
  onWrong: null | (() => void)
  onVoiceSelect: null | ((key: string) => void)
  onPlanetClick: null | ((name: string) => void)
  showBoard: (variant: string, animate?: boolean) => void
  showTask: (step: unknown, animate?: boolean) => void
  hideTool: (animate?: boolean) => void
  pushBubble: (w: 'tutor' | 'child', t: string) => void
  onMute: null | ((isMuted: boolean) => void)
  onSolve: null | ((step: { id?: string; skill?: string }) => void)
}
interface LessonStep {
  type?: string
  id?: string
  skill?: string
  q?: string
  answer?: string
  explain?: string
  options?: Array<{ t: string; correct?: boolean }>
}
interface KlassioWindow extends Window {
  __klassioEngine?: KlassioEngine
  __KLASSIO_REAL_LESSON?: LessonStep[]
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
  const [engineReady, setEngineReady] = useState(false)
  const isStartingRef = useRef(false)

  // voice picker
  const [voiceKey, setVoiceKey] = useState<string>(TUTOR_VOICES[0].key)
  useEffect(() => {
    const v = localStorage.getItem(VOICE_STORAGE)
    if (v && TUTOR_VOICES.some((o) => o.key === v)) setVoiceKey(v)
  }, [])
  const selectVoice = useCallback((k: string) => {
    setVoiceKey(k)
    try { localStorage.setItem(VOICE_STORAGE, k) } catch {/* noop */}
  }, [])
  const voice = useMemo(() => TUTOR_VOICES.find((o) => o.key === voiceKey) ?? TUTOR_VOICES[0], [voiceKey])
  const voiceRef = useRef(voice)
  voiceRef.current = voice

  // tracking refs
  const phaseRef = useRef<string>('connecting')
  const solvedRef = useRef<Set<string>>(new Set())
  const shownTasksRef = useRef<Set<string>>(new Set())
  const shownBoardsRef = useRef<Set<string>>(new Set())
  const boardIndexRef = useRef<number>(0)
  const consecutiveErrorsRef = useRef<number>(0)
  const currentTaskIdRef = useRef<string>('')
  const lastStageAtRef = useRef<number>(0)
  const startTimeRef = useRef<number>(0)
  const convoCmdRef = useRef<{ sendContextualUpdate: (t: string) => void; sendUserMessage: (t: string) => void }>({
    sendContextualUpdate: () => {},
    sendUserMessage: () => {},
  })

  const engine = useCallback((): KlassioEngine | null => {
    const w = iframeRef.current?.contentWindow as KlassioWindow | null
    return w?.__klassioEngine ?? null
  }, [])
  const realLesson = useCallback(() => {
    const w = iframeRef.current?.contentWindow as KlassioWindow | null
    return w?.__KLASSIO_REAL_LESSON ?? []
  }, [])

  const getState = useCallback(() => {
    const shown = BOARD_ORDER.filter((b) => shownBoardsRef.current.has(b))
    const left = BOARD_ORDER.filter((b) => !shownBoardsRef.current.has(b))
    const base = formatTutorState({
      phase: phaseRef.current,
      solvedCount: solvedRef.current.size,
      totalShown: shownTasksRef.current.size,
      consecutiveErrors: consecutiveErrorsRef.current,
    })
    return `${base} | доски показаны: [${shown.join(',') || '—'}], осталось: [${left.join(',') || '—'}]`
  }, [])

  const post = useCallback((url: string, body: unknown) => {
    void fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      .catch((e) => console.error('[tutor] POST failed', url, e))
  }, [])

  // Schedule a centre-stage change, never sooner than MIN_DWELL_MS after the
  // previous one — so a board can't flash when Аня chains two reveals in a turn.
  const revealStage = useCallback((fn: () => void) => {
    const now = Date.now()
    const since = now - lastStageAtRef.current
    const wait = since >= MIN_DWELL_MS ? 0 : MIN_DWELL_MS - since
    lastStageAtRef.current = now + wait
    if (wait) window.setTimeout(fn, wait)
    else fn()
  }, [])

  // ── agent client tools → drive the design ─────────────────────────────────
  const clientTools: ClientTools = useMemo(
    () => ({
      show_board: (p: Record<string, unknown>) => {
        const board = typeof p.board === 'string' ? p.board.trim() : ''
        if (!board) return 'Error: пустой board'
        revealStage(() => engine()?.showBoard(board))
        shownBoardsRef.current.add(board)
        const oi = (BOARD_ORDER as readonly string[]).indexOf(board)
        if (oi >= 0) boardIndexRef.current = Math.max(boardIndexRef.current, oi + 1)
        post('/api/tutor/event', { sessionId, eventType: 'tool_used', payload: { tool: 'board', variant: board } })
        return `OK, доска "${board}" показана — рассказывай чуть медленнее.`
      },
      // advance the theory boards strictly in order (skip-proof + cover first)
      next_slide: () => {
        const i = Math.min(boardIndexRef.current, BOARD_ORDER.length - 1)
        const board = BOARD_ORDER[i]
        boardIndexRef.current = i + 1
        revealStage(() => engine()?.showBoard(board))
        shownBoardsRef.current.add(board)
        post('/api/tutor/event', { sessionId, eventType: 'tool_used', payload: { tool: 'board', variant: board, via: 'next' } })
        return `OK, показана доска "${board}" (${i + 1}/${BOARD_ORDER.length}).`
      },
      show_trainer: (p: Record<string, unknown>) => {
        const taskId = typeof p.taskId === 'string' ? p.taskId.trim() : ''
        const n = parseInt(taskId.replace(/[^0-9]/g, ''), 10)
        const tasks = realLesson().filter((s) => s?.type === 'task')
        const step = Number.isFinite(n) ? tasks[n - 1] : undefined
        if (!step) return `Error: задача "${taskId}" не найдена`
        revealStage(() => engine()?.showTask(step))
        currentTaskIdRef.current = taskId
        shownTasksRef.current.add(taskId)
        post('/api/tutor/event', { sessionId, eventType: 'tool_used', payload: { tool: 'trainer', taskId } })
        // Return the EXACT task content so Аня introduces the question that's
        // actually on screen (fixes «спрашивает одно — на тесте другое»).
        const opts = Array.isArray(step.options) ? step.options.map((o) => o.t).join(' / ') : (step.answer ?? '')
        const correct = Array.isArray(step.options)
          ? (step.options.find((o) => o.correct)?.t ?? '')
          : (step.answer ?? '')
        return `OK, на экране задание ${taskId}: «${step.q ?? ''}». Варианты: ${opts}. Правильный: ${correct}. Объяви ИМЕННО этот вопрос своими словами и попроси выбрать ответ на экране. НЕ называй правильный ответ вслух.`
      },
      hide_tool: () => { engine()?.hideTool(); return 'Холст очищен' },
      set_phase: (p: Record<string, unknown>) => {
        const phase = typeof p.phase === 'string' ? p.phase.trim() : ''
        phaseRef.current = phase
        post('/api/tutor/phase', { sessionId, phase })
        return `Фаза: ${phase}`
      },
      give_reward: (p: Record<string, unknown>) => {
        const label = typeof p.label === 'string' ? p.label.trim() : undefined
        revealStage(() => engine()?.showBoard('reward'))
        post('/api/tutor/event', { sessionId, eventType: 'reward_given', payload: { label: label ?? null } })
        // reward = end of the lesson → mark the session completed
        post('/api/tutor/complete', { sessionId })
        return 'Награда показана'
      },
      take_break: (p: Record<string, unknown>) => {
        const active = (typeof p.active === 'string' ? p.active.trim() : '') === 'start'
        engine()?.hideTool()
        engine()?.setStatus('listening')
        post('/api/tutor/event', { sessionId, eventType: active ? 'pause_started' : 'pause_ended', payload: {} })
        return active ? 'Пауза' : 'Возвращаемся к уроку'
      },
      lesson_state: () => getState(),
      set_child_name: (p: Record<string, unknown>) => {
        const name = typeof p.name === 'string' ? p.name.trim() : ''
        if (!name) return 'Error: пустое имя'
        engine()?.setChildName(name)
        return `Имя запомнено: ${name}`
      },
    }),
    [engine, realLesson, getState, post, revealStage, sessionId],
  )

  // ── SDK callbacks ─────────────────────────────────────────────────────────
  const handleModeChange = useCallback(({ mode }: { mode: 'speaking' | 'listening' }) => {
    engine()?.setStatus(mode)
  }, [engine])

  const checkModeration = useCallback(
    async (text: string) => {
      try {
        const res = await fetch('/api/tutor/moderation', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sessionId, text }),
        })
        if (!res.ok) return
        const data = (await res.json()) as { action: string; contextualUpdate: string | null }
        if (data.action !== 'none' && data.contextualUpdate) convoCmdRef.current.sendContextualUpdate(data.contextualUpdate)
      } catch (e) { console.error('[tutor] moderation failed', e) }
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
  convoCmdRef.current = conversation as unknown as {
    sendContextualUpdate: (t: string) => void
    sendUserMessage: (t: string) => void
  }
  const isActive = conversation.status === 'connected' || conversation.status === 'connecting'

  // ── start / stop ──────────────────────────────────────────────────────────
  const startSession = useCallback(async () => {
    if (isStartingRef.current || isActive) return
    isStartingRef.current = true
    setError(null)
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true }).catch((err: { name?: string }) => {
        setError(
          err?.name === 'NotAllowedError' ? 'Разреши доступ к микрофону в браузере.'
            : err?.name === 'NotFoundError' ? 'Микрофон не найден.'
              : 'Не удалось получить микрофон.',
        )
        return null
      })
      if (!stream) return
      stream.getTracks().forEach((t) => t.stop())

      const res = await fetch('/api/tutor/signed-url', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId }),
      })
      if (!res.ok) { setError('Не удалось подключиться. Попробуй ещё раз.'); return }
      const data = (await res.json()) as { signedUrl: string }

      startTimeRef.current = Date.now()
      engine()?.setMuted(false)
      engine()?.setCaption('Соединяюсь…')
      conversation.startSession({
        signedUrl: data.signedUrl,
        connectionType: 'websocket',
        dynamicVariables: { ...dynamicVariables },
        // Voice + first-message override (requires Voice + First message toggles
        // enabled in the 11labs agent Security tab — they are, inherited from the
        // reused agent). The first message ASKS the child's name.
        overrides: {
          tts: { voiceId: voiceRef.current.voiceId },
          agent: { firstMessage: voiceRef.current.firstMessage },
        },
      })
    } catch (e) {
      console.error('[tutor] start failed', e)
      setError('Ошибка голосового сервиса.')
    } finally {
      isStartingRef.current = false
    }
  }, [conversation, sessionId, dynamicVariables, engine, isActive])


  // design's centre «Начать урок» button → start the session
  const startHandlerRef = useRef<() => void>(() => {})
  startHandlerRef.current = () => { void startSession() }
  // mic = mute/unmute (design's mic button → here), never ends the session
  const muteHandlerRef = useRef<(isMuted: boolean) => void>(() => {})
  muteHandlerRef.current = (isMuted: boolean) => {
    if (conversation.status !== 'connected') return
    try { conversation.setMuted(isMuted) } catch (e) { console.error('[tutor] setMuted', e) }
  }
  const solveHandlerRef = useRef<(step: { id?: string; skill?: string }) => void>(() => {})
  solveHandlerRef.current = (step) => {
    const taskId = currentTaskIdRef.current || step?.id || 'task'
    solvedRef.current.add(taskId)
    consecutiveErrorsRef.current = 0
    post('/api/tutor/attempt', { sessionId, taskId, correct: true, skillTag: step?.skill })
    // sendUserMessage (not sendContextualUpdate) → 11labs treats it as input so
    // Аня reacts NOW instead of buffering behind her turn (the 5-10 s lag).
    try {
      convoCmdRef.current.sendUserMessage(
        '[ПЛАТФОРМА] Ребёнок выбрал ПРАВИЛЬНЫЙ ответ на экране. Коротко похвали ПРЯМО СЕЙЧАС и веди дальше к следующему блоку/заданию.',
      )
    } catch {/* noop */}
  }
  // child clicked a planet on the Solar-System board → Аня narrates it (she
  // promised «кликай — расскажу», so she must actually react).
  const planetHandlerRef = useRef<(name: string) => void>(() => {})
  planetHandlerRef.current = (name: string) => {
    try {
      convoCmdRef.current.sendUserMessage(
        `[ПЛАТФОРМА] Ребёнок кликнул на «${name}» на карте Солнечной системы. Расскажи об этом небесном теле коротко и по-доброму (2-3 предложения), как и обещала.`,
      )
    } catch {/* noop */}
  }
  // child picked a WRONG trainer option → Аня helps instead of staying silent
  const wrongHandlerRef = useRef<() => void>(() => {})
  wrongHandlerRef.current = () => {
    consecutiveErrorsRef.current += 1
    if (currentTaskIdRef.current) post('/api/tutor/attempt', { sessionId, taskId: currentTaskIdRef.current, correct: false })
    try {
      convoCmdRef.current.sendUserMessage(
        '[ПЛАТФОРМА] Ребёнок выбрал НЕВЕРНЫЙ ответ на экране. Мягко поддержи и подскажи ПРЯМО СЕЙЧАС, не давай сразу правильный ответ. НЕ переходи дальше — дождись верного выбора.',
      )
    } catch {/* noop */}
  }

  // wire into the design once its engine is ready
  useEffect(() => {
    let tries = 0
    const id = window.setInterval(() => {
      const e = engine()
      if (e) {
        window.clearInterval(id)
        e.onStart = () => startHandlerRef.current()
        e.onMute = (isMuted) => muteHandlerRef.current(isMuted)
        e.onSolve = (step) => solveHandlerRef.current(step)
        e.onWrong = () => wrongHandlerRef.current()
        e.onPlanetClick = (name) => planetHandlerRef.current(name)
        e.onVoiceSelect = (key) => selectVoice(key)
        e.setCaption('')
        setEngineReady(true) // → the status effect reveals the Start button (now safe to click)
      } else if (++tries > 600) {
        window.clearInterval(id)
        console.warn('[tutor] __klassioEngine never appeared')
      }
    }, 100)
    return () => window.clearInterval(id)
  }, [engine])

  // drive the design's centre button by connection state. Runs only once the
  // engine is ready (onStart wired) — so the button appears only when a click
  // will actually work, and shows «Подключение…» while connecting.
  useEffect(() => {
    const e = engine()
    if (!e || !engineReady) return
    const s = conversation.status
    if (s === 'connected') {
      e.hideStartButton()
      e.startTimer() // lesson timer starts when the teacher connects, not on page-load
    } else if (s === 'connecting') {
      e.showStartButton()
      e.setStartButtonText('Подключение…', true)
    } else {
      e.showStartButton()
      e.setStartButtonText('Начать урок', false)
    }
  }, [conversation.status, engineReady, engine])

  // (re)build the voice menu on Аня's avatar, highlighting the current choice
  useEffect(() => {
    if (!engineReady) return
    engine()?.setVoiceMenu(TUTOR_VOICES.map((v) => ({ key: v.key, label: v.label })), voiceKey)
  }, [voiceKey, engineReady, engine])

  // periodic fatigue signal
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
      if (c.status === 'connected' || c.status === 'connecting') { try { c.endSession() } catch {/* noop */} }
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

      {/* All chrome lives INSIDE the design now: the voice picker is a hover
          dropdown on Аня's avatar, «Начать урок» is the centered button, and
          «Выйти» (top-right) ends the lesson — all wired via the build bridge.
          React owns only voice + the error toast. */}

      {error && (
        <div className="absolute top-14 left-1/2 -translate-x-1/2 z-50 rounded-lg bg-red-600 text-white text-sm px-3 py-2 shadow-lg">
          {error}
        </div>
      )}
    </div>
  )
}
