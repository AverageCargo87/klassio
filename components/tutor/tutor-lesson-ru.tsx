'use client'
// components/tutor/tutor-lesson-ru.tsx — AI-репетитор «Аня» на RU-стеке (Sber).
//
// КЛОН components/tutor/tutor-lesson.tsx с заменой ТОЛЬКО голосового слоя:
// 11labs useConversation → useSberConversation (WS к оркестратору во Франкфурте:
// SaluteSpeech STT → GigaChat-Pro tool-loop → SaluteSpeech TTS). Всё остальное —
// iframe-дизайн, engine-мост, клиент-тулзы с пейсинг-гвардами, модерация,
// трекинг /api/tutor/* — 1-в-1 с боевой версией. Старый /tutor не тронут.
//
// Отличия от 11labs-версии (по делу, не по вкусу):
//   • голоса = SaluteSpeech (Nec/May/Ost), свой ключ в localStorage;
//   • signed-url → /api/tutor/sber-url (HMAC-токен к оркестратору);
//   • тентатив-черновика (onDebug) нет — транскрипт Ани приходит ДО аудио,
//     так что пузырь и так не отстаёт от голоса;
//   • onModeChange умеет 'thinking' (дизайн его поддерживает).
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useSberConversation, type SberClientTools, type SberMode } from './use-sber-conversation'
import type { TutorDynamicVariables } from '@/lib/tutor/types'
import type { LessonCanvas } from '@/lib/curriculum'
import { formatFatigueSignal, formatTutorState } from '@/lib/tutor/contextual-updates'
import { useTranscriptLogger } from './use-transcript-logger'

interface TutorLessonProps {
  sessionId: string
  lessonTitle: string
  lessonSubtitle: string
  dynamicVariables: TutorDynamicVariables
  canvas?: LessonCanvas
}

// Учителя = голоса SaluteSpeech. Nec — проверенный («Кратову зашёл»), он и
// дефолт. Имя учителя идёт в приветствие + {{teacher_name}} в промпте + чат.
const TUTOR_VOICES = [
  { key: 'anna', name: 'Аня', label: 'Аня · тёплый', voiceId: 'Nec_24000' },
  { key: 'nadia', name: 'Надя', label: 'Надя · мягкий', voiceId: 'May_24000' },
  { key: 'rina', name: 'Рина', label: 'Рина · спокойный', voiceId: 'Ost_24000' },
] as const
const VOICE_STORAGE = 'klassio-tutor-voice-ru'

// Канонический порядок теории — next_slide идёт по нему, чтобы Аня не
// пропускала доски (sunEarth раньше терялся — фидбек 2026-06-04).
const DEFAULT_BOARD_ORDER = ['cover', 'etymology', 'bodies', 'solar', 'sunEarth', 'facts'] as const

// Пейсинг-гварды — те же значения, что в боевой версии (они и приручили
// 11labs-агента; GigaChat-Pro на спайке слушался их ещё лучше).
const MIN_DWELL_MS = 15000
const HIDE_GRACE_MS = 2600
const DEFAULT_TOTAL_TASKS = 13
const BOARD_MIN_MS = 60000
const DEFAULT_THEORY_BOARDS = ['etymology', 'bodies', 'solar', 'sunEarth', 'facts']

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
  variant?: string
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

export function TutorLessonRu({ sessionId, lessonTitle, dynamicVariables, canvas }: TutorLessonProps) {
  // Per-lesson canvas config — astronomy lesson uses these module defaults; other
  // lessons (e.g. инвестиции) pass their own board order / html / task count.
  const BOARD_ORDER = useMemo<readonly string[]>(() => canvas?.boardOrder ?? DEFAULT_BOARD_ORDER, [canvas])
  const THEORY_BOARDS = useMemo(() => new Set<string>(canvas?.theoryBoards ?? DEFAULT_THEORY_BOARDS), [canvas])
  const TOTAL_TASKS = canvas?.totalTasks ?? DEFAULT_TOTAL_TASKS
  const htmlSrc = canvas?.htmlFile ?? '/tutor/anya.html'
  const iframeRef = useRef<HTMLIFrameElement | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [moderationNotice, setModerationNotice] = useState<string | null>(null)
  const [completionStats, setCompletionStats] = useState<null | {
    solved: number; total: number; wrong: number; minutes: number
    perTask: Array<{ n: number; sec: number | null; wrong: number }>
  }>(null)
  const [engineReady, setEngineReady] = useState(false)
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
  const taskStatsRef = useRef<Record<string, { shownAt: number; solvedAt?: number; wrong: number }>>({})
  const currentBoardRef = useRef<string>('')
  const boardShownAtRef = useRef<number>(0)
  const taskActiveRef = useRef<boolean>(false)
  const lastStageAtRef = useRef<number>(0)
  const pendingHideRef = useRef<number | null>(null)
  const moderationNoticeTimer = useRef<number | null>(null)
  const startTimeRef = useRef<number>(0)
  const turnTimingRef = useRef<{ at: number; text: string } | null>(null)
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
      .catch((e) => console.error('[tutor-ru] POST failed', url, e))
  }, [])

  // Запись урока для ЛК — копит реплики, шлёт батчами (как в 11labs-версии).
  const { logLine, flush: flushTranscript } = useTranscriptLogger(sessionId)

  const revealStage = useCallback((fn: () => void) => {
    if (pendingHideRef.current !== null) { window.clearTimeout(pendingHideRef.current); pendingHideRef.current = null }
    const now = Date.now()
    const since = now - lastStageAtRef.current
    const wait = since >= MIN_DWELL_MS ? 0 : MIN_DWELL_MS - since
    lastStageAtRef.current = now + wait
    if (wait) window.setTimeout(fn, wait)
    else fn()
  }, [])

  const leavingBoardTooSoon = useCallback(
    () => THEORY_BOARDS.has(currentBoardRef.current) && Date.now() - boardShownAtRef.current < BOARD_MIN_MS,
    [],
  )

  // ── agent client tools → drive the design (1-в-1 с tutor-lesson.tsx) ───────
  const clientTools: SberClientTools = useMemo(
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
        currentBoardRef.current = ''
        taskActiveRef.current = true
        shownTasksRef.current.add(taskId)
        if (!taskStatsRef.current[taskId]) taskStatsRef.current[taskId] = { shownAt: Date.now(), wrong: 0 }
        post('/api/tutor/event', { sessionId, eventType: 'tool_used', payload: { tool: 'trainer', taskId } })
        const choiceOpts = Array.isArray(step.options) && step.options.length > 0 ? step.options : null
        const correct = choiceOpts ? (choiceOpts.find((o) => o.correct)?.t ?? '') : (step.answer ?? '')
        return choiceOpts
          ? `OK, на экране задание ${taskId} (ВЫБОР варианта): «${step.q ?? ''}». Варианты: ${choiceOpts.map((o) => o.t).join(' / ')}. Правильный: ${correct}. Объяви ИМЕННО этот вопрос своими словами и попроси ребёнка ВЫБРАТЬ правильный вариант на экране. Правильный ответ вслух НЕ называй.`
          : `OK, на экране задание ${taskId} (ПОЛЕ ВВОДА — ребёнок печатает сам): «${step.q ?? ''}». Правильный ответ: ${correct}. Объяви ИМЕННО этот вопрос своими словами и попроси ребёнка ВПИСАТЬ ответ в окошко на экране (это НЕ выбор варианта). Правильный ответ вслух НЕ называй.`
      },
      hide_tool: () => {
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
          return `Рано: экран «урок пройден» показывается ТОЛЬКО в самом конце. Сейчас решено ${solved} из ${TOTAL_TASKS} — продолжай урок, награду пока не показывай.`
        }
        revealStage(() => engine()?.showBoard('reward'))
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
        // Сначала дослать запись урока, потом complete — резюме строится по транскрипту.
        void flushTranscript().then(() => post('/api/tutor/complete', { sessionId }))
        return 'Награда показана — урок завершён.'
      },
      take_break: (p: Record<string, unknown>) => {
        const active = (typeof p.active === 'string' ? p.active.trim() : '') === 'start'
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
    [engine, realLesson, getState, post, revealStage, leavingBoardTooSoon, sessionId],
  )

  // ── hook callbacks ──────────────────────────────────────────────────────────
  const handleModeChange = useCallback(({ mode }: { mode: SberMode }) => {
    engine()?.setStatus(mode)
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
          setModerationNotice('Уведомление о поведении отправлено родителям')
          if (moderationNoticeTimer.current) window.clearTimeout(moderationNoticeTimer.current)
          moderationNoticeTimer.current = window.setTimeout(() => setModerationNotice(null), 7000)
        }
      } catch (e) { console.error('[tutor-ru] moderation failed', e) }
    },
    [sessionId],
  )

  const handleMessage = useCallback(
    (payload: { message: string; role: 'user' | 'agent' }) => {
      const text = (payload?.message ?? '').trim()
      if (!text) return
      if (payload.role === 'agent') {
        // Оркестратор шлёт транскрипт Ани ДО синтеза аудио — пузырь не отстаёт
        // от голоса и без 11labs-овского tentative-черновика.
        engine()?.pushBubble('tutor', text)
        logLine('tutor', text) // запись урока
        return
      }
      engine()?.pushBubble('child', text)
      logLine('child', text) // запись урока
      turnTimingRef.current = { at: performance.now(), text }
      void checkModeration(text)
    },
    [engine, checkModeration, logLine],
  )

  const handleError = useCallback((message: string) => {
    console.error('[tutor-ru] voice error', message)
    setError('Ошибка голосового сервиса. Попробуй ещё раз.')
  }, [])

  const conversation = useSberConversation({
    clientTools,
    onModeChange: handleModeChange,
    onMessage: handleMessage,
    onError: handleError,
  })
  convoCmdRef.current = conversation
  const isActive = conversation.status === 'connected' || conversation.status === 'connecting'

  // ── start / stop ──────────────────────────────────────────────────────────
  const startSession = useCallback(async () => {
    if (isStartingRef.current || isActive) return
    isStartingRef.current = true
    setError(null)
    setStarting(true)
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

      const res = await fetch('/api/tutor/sber-url', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId }),
      })
      if (!res.ok) { setError('Не удалось подключиться. Попробуй ещё раз.'); setStarting(false); return }
      const data = (await res.json()) as { wsUrl: string }
      const tUrl = performance.now()
      console.log(`[latency:start] mic ${Math.round(tMic - t0)} мс · sber-url ${Math.round(tUrl - tMic)} мс`)

      startTimeRef.current = Date.now()
      engine()?.setMuted(false)
      engine()?.setCaption('Соединяюсь…')
      await conversation.startSession({
        wsUrl: data.wsUrl,
        voiceName: voiceRef.current.name,
        voiceId: voiceRef.current.voiceId,
        dynamicVariables: { ...dynamicVariables, teacher_name: voiceRef.current.name },
      })
    } catch (e) {
      console.error('[tutor-ru] start failed', e)
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
    try { conversation.setMuted(isMuted) } catch (e) { console.error('[tutor-ru] setMuted', e) }
  }
  const solveHandlerRef = useRef<(step: { id?: string; skill?: string }) => void>(() => {})
  solveHandlerRef.current = (step) => {
    const taskId = currentTaskIdRef.current || step?.id || 'task'
    solvedRef.current.add(taskId)
    consecutiveErrorsRef.current = 0
    taskActiveRef.current = false
    { const st = taskStatsRef.current[taskId]; if (st && !st.solvedAt) st.solvedAt = Date.now() }
    post('/api/tutor/attempt', { sessionId, taskId, correct: true, skillTag: step?.skill })
    try {
      convoCmdRef.current.sendUserMessage(
        '[ПЛАТФОРМА] Ребёнок ответил ПРАВИЛЬНО. Тепло похвали и веди дальше сама — когда расскажешь связку, покажи следующее (show_trainer / next_slide). НЕ спрашивай «готов?» и не жди, пока ребёнок попросит, но и не части — спокойно и по-доброму.',
      )
    } catch {/* noop */}
  }
  const planetHandlerRef = useRef<(name: string) => void>(() => {})
  planetHandlerRef.current = (name: string) => {
    try {
      convoCmdRef.current.sendUserMessage(
        `[ПЛАТФОРМА] Ребёнок кликнул на «${name}» на карте Солнечной системы. Расскажи об этом небесном теле коротко и по-доброму (2-3 предложения), как и обещала.`,
      )
    } catch {/* noop */}
  }
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
        setEngineReady(true)
      } else if (++tries > 600) {
        window.clearInterval(id)
        console.warn('[tutor-ru] __klassioEngine never appeared')
      }
    }, 100)
    return () => window.clearInterval(id)
  }, [engine])

  // drive the design's centre button by connection state
  useEffect(() => {
    const e = engine()
    if (!e || !engineReady) return
    const s = conversation.status
    if (s === 'connected') {
      e.hideStartButton()
      e.startTimer()
    } else if (s === 'connecting' || starting) {
      e.showStartButton()
      e.setStartButtonText('Подключение…', true)
    } else {
      e.showStartButton()
      e.setStartButtonText('Начать урок', false)
    }
  }, [conversation.status, engineReady, engine, starting])

  useEffect(() => {
    if (conversation.status === 'connecting' || conversation.status === 'connected') setStarting(false)
  }, [conversation.status])

  // (re)build the voice menu on Аня's avatar, highlighting the current choice
  useEffect(() => {
    if (!engineReady) return
    engine()?.setVoiceMenu(TUTOR_VOICES.map((v) => ({ key: v.key, label: v.label })), voiceKey)
    engine()?.setTeacherName(voice.name)
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
        src={htmlSrc}
        title={lessonTitle}
        className="w-full h-full border-0 block"
        allow="microphone; autoplay"
      />

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
