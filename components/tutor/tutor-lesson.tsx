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
import { useTranscriptLogger } from './use-transcript-logger'

interface TutorLessonProps {
  sessionId: string
  lessonTitle: string
  lessonSubtitle: string
  dynamicVariables: TutorDynamicVariables
}

// Tutor voices = distinct named teachers. Picking one makes the teacher that
// person everywhere: her intro (firstMessage built from `name`), the chat labels
// + avatar letter (engine.setTeacherName), and her self-name in the agent prompt
// (the {{teacher_name}} dynamic variable). 11labs voice timbre matches the name.
const TUTOR_VOICES = [
  { key: 'nadia', name: 'Надя', label: 'Надя · тёплый', voiceId: 'gedzfqL7OGdPbwm0ynTP' },
  { key: 'anna', name: 'Аня', label: 'Аня · мягкий', voiceId: 'd5ruruBhXNbnS7Va7n23' },
  { key: 'rina', name: 'Рина', label: 'Рина · спокойный', voiceId: 'ycbyWsnf4hqZgdpKHqiU' },
] as const
const VOICE_STORAGE = 'klassio-tutor-voice'

// Canonical theory-board order — next_slide advances through this so Аня never
// skips a board and always starts with the cover (title) slide. NOTE: the design
// has SIX boards; `sunEarth` (interactive Sun-vs-Earth: diameter/mass/distance,
// tasks q8-q10) was previously missing here, so next_slide skipped it and the
// child never saw it (operator feedback 2026-06-04).
const BOARD_ORDER = ['cover', 'etymology', 'bodies', 'solar', 'sunEarth', 'facts'] as const

// Minimum time a board/task stays in the centre before another can replace it —
// a safety FLOOR so every slide is readable and Аня can't flip through them
// (operator: «пусть каждый слайд не менее 15 секунд показывается»). Only bites
// when she rushes; if she paces properly (narrates + waits for a reaction) it's a
// no-op, because the child has usually spent longer than this anyway.
const MIN_DWELL_MS = 15000

// After a task is solved Аня usually chains straight into the next tool
// (task→task or task→board). hide_tool collapses the canvas back to the centred
// chat; if the next show came 2-3 s later, the chat bounced to centre and back.
// So hide_tool is DEFERRED by this grace window — any show_* within it cancels
// the collapse and the centre just swaps content (no bounce). A real return to
// conversation (no tool follows) still collapses once the window elapses.
const HIDE_GRACE_MS = 2600

// The lesson has 13 tasks. The «урок пройден» reward screen + session-complete
// only fire once ALL of them are solved — a hard guard, because gpt-5.4-mini
// sometimes tries to reward right after the first task.
const TOTAL_TASKS = 13

// Every THEORY board must stay in the centre at least this long — a hard FLOOR,
// NOT an auto-advance (operator: «не меньше 60 секунд, а там по ситуации»). After
// it elapses, the prompt's «move by the child's reaction» takes over. The cover
// (title) and reward screens are exempt.
const BOARD_MIN_MS = 60000
const THEORY_BOARDS = new Set(['etymology', 'bodies', 'solar', 'sunEarth', 'facts'])

interface KlassioEngine {
  setStatus: (s: 'listening' | 'speaking' | 'thinking') => void
  setCaption: (t: string) => void
  setMuted: (m: boolean) => void
  setChildName: (name: string) => void
  setTeacherName: (name: string) => void
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
  variant?: string // 'choice' (pick an option) | 'blank' (type the answer into a field)
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
  const [moderationNotice, setModerationNotice] = useState<string | null>(null)
  const [completionStats, setCompletionStats] = useState<null | {
    solved: number; total: number; wrong: number; minutes: number
    perTask: Array<{ n: number; sec: number | null; wrong: number }>
  }>(null)
  const [engineReady, setEngineReady] = useState(false)
  // optimistic «Подключение…» the instant Start is clicked — before mic + signed-url
  // resolve (that wait was the 2-3 s the operator saw the button stay «Начать урок»).
  const [starting, setStarting] = useState(false)
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
  // per-task stats for the completion screen: shown/solved timestamps + wrong count
  const taskStatsRef = useRef<Record<string, { shownAt: number; solvedAt?: number; wrong: number }>>({})
  // Slide-pacing guards: which board is centre & when it appeared (60 s floor on
  // theory boards), and whether a task is on screen still unanswered (can't be
  // swapped away until it's solved).
  const currentBoardRef = useRef<string>('')
  const boardShownAtRef = useRef<number>(0)
  const taskActiveRef = useRef<boolean>(false)
  const lastStageAtRef = useRef<number>(0)
  const pendingHideRef = useRef<number | null>(null) // deferred hide_tool timer (anti-bounce)
  const moderationNoticeTimer = useRef<number | null>(null) // auto-hide for the «parent notified» banner
  const startTimeRef = useRef<number>(0)
  // latency probe: marks when the child's transcript was finalized, so the next
  // onModeChange→speaking yields the round-trip («felt») answer time.
  const turnTimingRef = useRef<{ at: number; text: string } | null>(null)
  const agentBubbleShownRef = useRef(false) // tutor bubble already shown this turn (from the tentative draft)
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

  // Запись урока для ЛК — копит реплики и шлёт батчами (см. use-transcript-logger).
  const { logLine, flush: flushTranscript } = useTranscriptLogger(sessionId)

  // Schedule a centre-stage change, never sooner than MIN_DWELL_MS after the
  // previous one — so a board can't flash when Аня chains two reveals in a turn.
  const revealStage = useCallback((fn: () => void) => {
    // Showing something cancels a pending collapse-to-centre → no bounce when
    // Аня chains hide_tool → next tool (the user's «чат прыгает в центр на 2с»).
    if (pendingHideRef.current !== null) { window.clearTimeout(pendingHideRef.current); pendingHideRef.current = null }
    const now = Date.now()
    const since = now - lastStageAtRef.current
    const wait = since >= MIN_DWELL_MS ? 0 : MIN_DWELL_MS - since
    lastStageAtRef.current = now + wait
    if (wait) window.setTimeout(fn, wait)
    else fn()
  }, [])

  // True while a THEORY board has been in the centre for less than its 60 s floor —
  // used to refuse swapping it for a task or another slide too early.
  const leavingBoardTooSoon = useCallback(
    () => THEORY_BOARDS.has(currentBoardRef.current) && Date.now() - boardShownAtRef.current < BOARD_MIN_MS,
    [],
  )

  // ── agent client tools → drive the design ─────────────────────────────────
  const clientTools: ClientTools = useMemo(
    () => ({
      show_board: (p: Record<string, unknown>) => {
        const board = typeof p.board === 'string' ? p.board.trim() : ''
        if (!board) return 'Error: пустой board'
        if (board === 'reward') {
          return solvedRef.current.size >= TOTAL_TASKS
            ? 'Для экрана «урок пройден» используй give_reward (в самом конце).'
            : `Рано: экран «урок пройден» — только после всех ${TOTAL_TASKS} заданий (решено ${solvedRef.current.size}). Не показывай его сейчас.`
        }
        if (board !== currentBoardRef.current && leavingBoardTooSoon()) {
          return `Рано уходить со слайда — теоретический слайд держится не меньше ${BOARD_MIN_MS / 1000} секунд. Разбери его, дай ребёнку рассмотреть, потом переходи.`
        }
        if (taskActiveRef.current) {
          return 'Рано показывать доску: на экране задание, на которое ребёнок ещё не ответил. Помоги на нём и дождись ответа.'
        }
        revealStage(() => engine()?.showBoard(board))
        currentBoardRef.current = board
        boardShownAtRef.current = Date.now()
        taskActiveRef.current = false
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
        if (board !== currentBoardRef.current && leavingBoardTooSoon()) {
          return `Рано листать дальше — теоретический слайд держится не меньше ${BOARD_MIN_MS / 1000} секунд. Разбери текущий, потом следующий.`
        }
        if (taskActiveRef.current) {
          return 'Рано листать дальше: на экране задание без ответа — дождись, пока ребёнок ответит.'
        }
        boardIndexRef.current = i + 1
        revealStage(() => engine()?.showBoard(board))
        currentBoardRef.current = board
        boardShownAtRef.current = Date.now()
        taskActiveRef.current = false
        shownBoardsRef.current.add(board)
        post('/api/tutor/event', { sessionId, eventType: 'tool_used', payload: { tool: 'board', variant: board, via: 'next' } })
        return `OK, показана доска "${board}" (${i + 1}/${BOARD_ORDER.length}).`
      },
      show_trainer: (p: Record<string, unknown>) => {
        const taskId = typeof p.taskId === 'string' ? p.taskId.trim() : ''
        if (leavingBoardTooSoon()) {
          return `Рано показывать задание — теоретический слайд держится не меньше ${BOARD_MIN_MS / 1000} секунд. Разбери доску и дай ребёнку рассмотреть, потом задание.`
        }
        if (taskActiveRef.current && taskId !== currentTaskIdRef.current) {
          return 'Рано: предыдущее задание ещё не решено. Дождись ответа на него, потом давай следующее.'
        }
        const n = parseInt(taskId.replace(/[^0-9]/g, ''), 10)
        const tasks = realLesson().filter((s) => s?.type === 'task')
        const step = Number.isFinite(n) ? tasks[n - 1] : undefined
        if (!step) return `Error: задача "${taskId}" не найдена`
        revealStage(() => engine()?.showTask(step))
        currentTaskIdRef.current = taskId
        currentBoardRef.current = '' // a task occupies the centre now, not a board
        taskActiveRef.current = true
        shownTasksRef.current.add(taskId)
        if (!taskStatsRef.current[taskId]) taskStatsRef.current[taskId] = { shownAt: Date.now(), wrong: 0 }
        post('/api/tutor/event', { sessionId, eventType: 'tool_used', payload: { tool: 'trainer', taskId } })
        // Return the EXACT task content + INPUT TYPE so Аня introduces what's
        // actually on screen (choice = pick an option; blank = type into a field)
        // and phrases the ask right (fixes «просит выбрать вариант на blank-задании»).
        const choiceOpts = Array.isArray(step.options) && step.options.length > 0 ? step.options : null
        const correct = choiceOpts ? (choiceOpts.find((o) => o.correct)?.t ?? '') : (step.answer ?? '')
        return choiceOpts
          ? `OK, на экране задание ${taskId} (ВЫБОР варианта): «${step.q ?? ''}». Варианты: ${choiceOpts.map((o) => o.t).join(' / ')}. Правильный: ${correct}. Объяви ИМЕННО этот вопрос своими словами и попроси ребёнка ВЫБРАТЬ правильный вариант на экране. Правильный ответ вслух НЕ называй.`
          : `OK, на экране задание ${taskId} (ПОЛЕ ВВОДА — ребёнок печатает сам): «${step.q ?? ''}». Правильный ответ: ${correct}. Объяви ИМЕННО этот вопрос своими словами и попроси ребёнка ВПИСАТЬ ответ в окошко на экране (это НЕ выбор варианта). Правильный ответ вслух НЕ называй.`
      },
      hide_tool: () => {
        // Defer the collapse-to-centre. If a show_* lands within HIDE_GRACE_MS,
        // revealStage cancels this and the centre swaps in place — no bounce.
        if (pendingHideRef.current !== null) window.clearTimeout(pendingHideRef.current)
        pendingHideRef.current = window.setTimeout(() => {
          pendingHideRef.current = null
          engine()?.hideTool()
        }, HIDE_GRACE_MS)
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
        const solved = solvedRef.current.size
        if (solved < TOTAL_TASKS) {
          // HARD guard: «урок пройден» is end-of-lesson ONLY. gpt-5.4-mini sometimes
          // fires this after the very first task — refuse until everything is solved.
          return `Рано: экран «урок пройден» показывается ТОЛЬКО в самом конце. Сейчас решено ${solved} из ${TOTAL_TASKS} — продолжай урок, награду пока не показывай.`
        }
        revealStage(() => engine()?.showBoard('reward'))
        // build the per-task stats for the completion overlay
        const perTask = Object.entries(taskStatsRef.current)
          .map(([id, s]) => ({
            n: parseInt(id.replace(/\D/g, ''), 10) || 0,
            sec: s.solvedAt ? Math.max(0, Math.round((s.solvedAt - s.shownAt) / 1000)) : null,
            wrong: s.wrong,
          }))
          .sort((a, b) => a.n - b.n)
        setCompletionStats({
          solved,
          total: TOTAL_TASKS,
          wrong: perTask.reduce((acc, t) => acc + t.wrong, 0),
          minutes: startTimeRef.current ? Math.max(1, Math.round((Date.now() - startTimeRef.current) / 60000)) : 0,
          perTask,
        })
        post('/api/tutor/event', { sessionId, eventType: 'reward_given', payload: { label: label ?? null } })
        // Сначала дослать запись урока, потом complete — чтобы AI-резюме строилось
        // по полному транскрипту (complete генерирует резюме из сохранённой записи).
        void flushTranscript().then(() => post('/api/tutor/complete', { sessionId }))
        return 'Награда показана — урок завершён.'
      },
      take_break: (p: Record<string, unknown>) => {
        const active = (typeof p.active === 'string' ? p.active.trim() : '') === 'start'
        // Genuine return to conversation → collapse now (and drop any deferred hide).
        if (pendingHideRef.current !== null) { window.clearTimeout(pendingHideRef.current); pendingHideRef.current = null }
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
    [engine, realLesson, getState, post, revealStage, leavingBoardTooSoon, sessionId, flushTranscript],
  )

  // ── SDK callbacks ─────────────────────────────────────────────────────────
  const handleModeChange = useCallback(({ mode }: { mode: 'speaking' | 'listening' }) => {
    engine()?.setStatus(mode)
    // TURN-latency probe: time from the child's finalized transcript to Аня's
    // first audio = ASR-final + LLM + TTS-first-byte + network (the felt «~2 s»).
    if (mode === 'speaking' && turnTimingRef.current) {
      const dt = Math.round(performance.now() - turnTimingRef.current.at)
      console.log(`[latency:turn] Аня ответила через ${dt} мс — «${turnTimingRef.current.text.slice(0, 48)}»`)
      const w = window as unknown as { __klassioTurnLatency?: number[] }
      w.__klassioTurnLatency = [...(w.__klassioTurnLatency ?? []), dt]
      turnTimingRef.current = null
    }
  }, [engine])

  const checkModeration = useCallback(
    async (text: string) => {
      try {
        const res = await fetch('/api/tutor/moderation', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sessionId, text }),
        })
        if (!res.ok) return
        const data = (await res.json()) as { action: string; contextualUpdate: string | null; notifyParent?: boolean }
        if (data.action !== 'none' && data.contextualUpdate) convoCmdRef.current.sendContextualUpdate(data.contextualUpdate)
        if (data.notifyParent) {
          // Repeat offence → parent is notified (recorded server-side). Confirm it on screen.
          setModerationNotice('Уведомление о поведении отправлено родителям')
          if (moderationNoticeTimer.current) window.clearTimeout(moderationNoticeTimer.current)
          moderationNoticeTimer.current = window.setTimeout(() => setModerationNotice(null), 7000)
        }
      } catch (e) { console.error('[tutor] moderation failed', e) }
    },
    [sessionId],
  )

  const handleMessage = useCallback(
    (payload: { message: string; role: 'user' | 'agent' }) => {
      const text = (payload?.message ?? '').trim()
      if (!text) return
      if (payload.role === 'agent') {
        // The tutor bubble is normally shown EARLY from the tentative draft
        // (handleDebug, fires as she STARTS speaking). Push here only as a fallback
        // if that didn't fire, then reset the flag for the next turn.
        if (!agentBubbleShownRef.current) engine()?.pushBubble('tutor', text)
        agentBubbleShownRef.current = false
        logLine('tutor', text) // запись урока (финальный текст реплики Ани)
        return
      }
      agentBubbleShownRef.current = false // child spoke → new turn, allow the next tutor bubble
      engine()?.pushBubble('child', text)
      logLine('child', text) // запись урока (реплика ребёнка)
      turnTimingRef.current = { at: performance.now(), text } // start the turn-latency clock
      void checkModeration(text)
    },
    [engine, checkModeration, logLine],
  )

  // 11labs emits a TENTATIVE agent draft (onDebug) the moment the LLM finishes the
  // text — right as Аня starts speaking — well before the final agent_response.
  // Render the chat bubble from it so the text keeps pace with her voice instead of
  // lagging to the end of her turn.
  const handleDebug = useCallback((info: { type?: string; response?: string }) => {
    if (info?.type !== 'tentative_agent_response') return
    const text = (info.response ?? '').trim()
    if (!text || agentBubbleShownRef.current) return
    engine()?.pushBubble('tutor', text)
    agentBubbleShownRef.current = true
  }, [engine])

  const handleError = useCallback((message: string) => {
    console.error('[tutor] SDK error', message)
    setError('Ошибка голосового сервиса. Попробуй ещё раз.')
  }, [])

  const conversation = useConversation({
    clientTools,
    onModeChange: handleModeChange,
    onMessage: handleMessage,
    onDebug: handleDebug,
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
    setStarting(true) // paint «Подключение…» NOW, before mic + signed-url (the 2-3 s gap)
    const t0 = performance.now()
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true }).catch((err: { name?: string }) => {
        setError(
          err?.name === 'NotAllowedError' ? 'Разреши доступ к микрофону в браузере.'
            : err?.name === 'NotFoundError' ? 'Микрофон не найден.'
              : 'Не удалось получить микрофон.',
        )
        return null
      })
      if (!stream) { setStarting(false); return }
      stream.getTracks().forEach((t) => t.stop())
      const tMic = performance.now()

      const res = await fetch('/api/tutor/signed-url', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId }),
      })
      if (!res.ok) { setError('Не удалось подключиться. Попробуй ещё раз.'); setStarting(false); return }
      const data = (await res.json()) as { signedUrl: string; proxied?: boolean; usingFallbackAgent?: boolean }
      const tUrl = performance.now()
      // START-latency breakdown (explains the «Начать урок»→«Подключение…» gap):
      console.log(
        `[latency:start] mic ${Math.round(tMic - t0)} мс · signed-url ${Math.round(tUrl - tMic)} мс · ` +
          `proxied=${data.proxied ?? false} fallbackAgent=${data.usingFallbackAgent ?? false}`,
      )

      startTimeRef.current = Date.now()
      engine()?.setMuted(false)
      engine()?.setCaption('Соединяюсь…')
      conversation.startSession({
        signedUrl: data.signedUrl,
        connectionType: 'websocket',
        dynamicVariables: { ...dynamicVariables, teacher_name: voiceRef.current.name },
        // Voice + first-message override (requires Voice + First message toggles
        // enabled in the 11labs agent Security tab). The first message introduces
        // the teacher by HER name (Надя/Аня/Рина) and asks the child's name.
        overrides: {
          tts: { voiceId: voiceRef.current.voiceId },
          agent: { firstMessage: `Привет! Меня зовут ${voiceRef.current.name}. А тебя как зовут?` },
        },
      })
    } catch (e) {
      console.error('[tutor] start failed', e)
      setError('Ошибка голосового сервиса.')
      setStarting(false)
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
    taskActiveRef.current = false // answered → boards / the next task may proceed
    { const st = taskStatsRef.current[taskId]; if (st && !st.solvedAt) st.solvedAt = Date.now() }
    post('/api/tutor/attempt', { sessionId, taskId, correct: true, skillTag: step?.skill })
    // sendUserMessage (not sendContextualUpdate) → 11labs treats it as input so
    // Аня reacts NOW instead of buffering behind her turn (the 5-10 s lag).
    try {
      convoCmdRef.current.sendUserMessage(
        '[ПЛАТФОРМА] Ребёнок ответил ПРАВИЛЬНО. Тепло похвали и веди дальше сама — когда расскажешь связку, покажи следующее (show_trainer / next_slide). НЕ спрашивай «готов?» и не жди, пока ребёнок попросит, но и не части — спокойно и по-доброму.',
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
    { const st = taskStatsRef.current[currentTaskIdRef.current]; if (st) st.wrong += 1 }
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
    } else if (s === 'connecting' || starting) {
      // `starting` paints «Подключение…» the instant Start is clicked, before the
      // SDK has even reached 'connecting' (mic + signed-url take 2-3 s on RU).
      e.showStartButton()
      e.setStartButtonText('Подключение…', true)
    } else {
      e.showStartButton()
      e.setStartButtonText('Начать урок', false)
    }
  }, [conversation.status, engineReady, engine, starting])

  // Once the SDK actually takes over (status leaves 'disconnected'), drop the
  // optimistic flag so connection status becomes the single source of truth.
  useEffect(() => {
    if (conversation.status === 'connecting' || conversation.status === 'connected') setStarting(false)
  }, [conversation.status])

  // (re)build the voice menu on Аня's avatar, highlighting the current choice
  useEffect(() => {
    if (!engineReady) return
    engine()?.setVoiceMenu(TUTOR_VOICES.map((v) => ({ key: v.key, label: v.label })), voiceKey)
    engine()?.setTeacherName(voice.name) // teacher's display name (avatar + chat) follows the chosen voice
  }, [voiceKey, engineReady, engine, voice.name])

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
      if (pendingHideRef.current !== null) window.clearTimeout(pendingHideRef.current)
      if (moderationNoticeTimer.current !== null) window.clearTimeout(moderationNoticeTimer.current)
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

      {moderationNotice && (
        <div className="absolute top-14 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2 rounded-lg bg-amber-500 text-white text-sm font-medium px-4 py-2 shadow-lg">
          <span aria-hidden>📩</span>{moderationNotice}
        </div>
      )}

      {/* Completion stats — shown UNDER the design's «Урок пройден» reward screen */}
      {completionStats && (
        <div className="absolute left-1/2 -translate-x-1/2 z-40 w-[640px] max-w-[92vw]" style={{ top: '61%' }}>
          <div className="rounded-2xl bg-white/95 backdrop-blur shadow-xl ring-1 ring-black/5 px-6 py-4 text-[#3a3a3a]">
            <div className="flex items-center justify-between gap-3 mb-3">
              <span className="font-extrabold text-lg">Итоги урока</span>
              <span className="text-sm text-[#6b6b6b]">
                решено <b className="text-[#3a3a3a]">{completionStats.solved}/{completionStats.total}</b>
                {' · '}ошибок <b className="text-[#3a3a3a]">{completionStats.wrong}</b>
                {' · '}<b className="text-[#3a3a3a]">{completionStats.minutes}</b> мин
              </span>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-5 gap-y-1 text-sm max-h-[34vh] overflow-auto">
              {completionStats.perTask.map((t) => (
                <div key={t.n} className="flex items-center justify-between border-b border-black/5 py-1">
                  <span className="text-[#6b6b6b]">Задание {t.n}</span>
                  <span className="tabular-nums">
                    {t.sec != null ? `${t.sec} с` : '—'}
                    <span className={t.wrong > 0 ? 'text-[#c0392b] ml-2' : 'text-[#9a9a9a] ml-2'}>{t.wrong} ош.</span>
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
