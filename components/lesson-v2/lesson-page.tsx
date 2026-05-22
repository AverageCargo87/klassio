'use client'
// components/lesson-v2/lesson-page.tsx
// Main client component for /lesson-v2/[id]/. Orchestrates:
// - Screen navigation (intro/task list with prev/next buttons)
// - Per-task state (status, hintsShown, attempts) + solved set
// - Floating overlays (board, teacher chat, mic)
// - Lesson timer (starts on first mic toggle)
// - Stage 1: teacher messages are local mocks via teacherSpeak(). Stage 3
//   replaces this with real 11labs message events.
//
// Ported from Claude Design lesson-page.jsx (LP_LessonPage) with all DOM
// globals (window.LP_*) replaced by ES imports + TypeScript types.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ConversationProvider, useConversation } from '@elevenlabs/react'
import { PALETTE } from './palette'
import { TEACHER_SCRIPT } from './teacher-script'
import { trainerConfigToScreens } from './adapt-config'
import { TopBar } from './topbar'
import { TaskCard } from './task-card'
import { IntroCard } from './intro-card'
import { FloatingTeacher, TEACHER_W } from './floating-teacher'
import { FloatingMic } from './floating-mic'
import { FloatingBoardToggle, BoardOverlay } from './floating-board'
import { BoardCanvasV2 } from './board-canvas-v2'
import type { ChatMessage, Screen, TaskScreen, TaskState, TeacherStatus } from './types'
import type { TrainerConfig } from '@/lib/trainer/config-schema'
import { LessonBusProvider, useLessonBus, useLessonBusEvent } from '@/lib/lesson-bus'
import { buildClientTools } from '@/lib/client-tools'
import { getLessonStateSnapshot, type LessonMistake } from '@/lib/lesson-state'
import {
  formatAnswerSubmitted,
  formatHintOpened,
  formatIdle15s,
} from '@/lib/contextual-updates'
import { useTrainerIdle } from '@/lib/trainer/use-trainer-idle'

interface LessonPageProps {
  lessonId: string
  topic: string
  trainerConfig: TrainerConfig
}

export function LessonPageV2({ lessonId, topic, trainerConfig }: LessonPageProps) {
  // Derived: convert config to screens once per mount (memoized).
  const screens: Screen[] = useMemo(
    () => trainerConfigToScreens(trainerConfig),
    [trainerConfig],
  )
  const taskIndices: number[] = useMemo(
    () => screens.map((s, i) => (s.kind === 'task' ? i : -1)).filter((i) => i >= 0),
    [screens],
  )
  const totalTasks = taskIndices.length

  // Defensive: empty lesson — render a minimal fallback so we never crash.
  if (screens.length === 0) {
    return (
      <div className="min-h-screen flex items-center justify-center p-8 text-center text-zinc-500">
        В этом уроке пока нет заданий.
      </div>
    )
  }

  return (
    <LessonBusProvider>
      <ConversationProvider>
        <div className="lesson-v2-root">
          <FontPreload />
          <LessonPageInner
            lessonId={lessonId}
            topic={topic}
            trainerConfig={trainerConfig}
            screens={screens}
            taskIndices={taskIndices}
            totalTasks={totalTasks}
          />
        </div>
      </ConversationProvider>
    </LessonBusProvider>
  )
}

/** Inject Google Fonts <link> tags for Nunito + JetBrains Mono. Idempotent
 *  via id check — safe to mount across HMR / SPA navigation. */
function FontPreload() {
  useEffect(() => {
    if (document.getElementById('lesson-v2-fonts')) return
    const link = document.createElement('link')
    link.id = 'lesson-v2-fonts'
    link.rel = 'stylesheet'
    link.href =
      'https://fonts.googleapis.com/css2?family=Nunito:wght@500;700;800;900&family=JetBrains+Mono:wght@600;800&display=swap'
    document.head.appendChild(link)
  }, [])
  return null
}

interface InnerProps {
  lessonId: string
  topic: string
  trainerConfig: TrainerConfig
  screens: Screen[]
  taskIndices: number[]
  totalTasks: number
}

function LessonPageInner({
  lessonId,
  topic,
  trainerConfig,
  screens,
  taskIndices,
  totalTasks,
}: InnerProps) {
  const bus = useLessonBus()
  const [voiceError, setVoiceError] = useState<string | null>(null)
  const isStartingRef = useRef(false)

  // ── Phase 8: per-session refs (mirrored from VoicePanel pattern) ─────────
  const currentTaskIdRef = useRef<string>('')
  const solvedTaskIdsRef = useRef<Set<string>>(new Set<string>())
  const mistakesRef = useRef<LessonMistake[]>([])

  // ── Phase 8: latched sendContextualUpdate + sendUserMessage ref ─────────
  // UAT 2026-05-22 round 7: explicit force-interrupt path uses sendUserMessage,
  // which 11labs treats as user-side input and aborts whatever Nadya is
  // currently speaking. Plain sendContextualUpdate only appends context for
  // her NEXT turn — buffered behind any in-flight TTS, which is why the
  // submit reaction lagged 15s.
  const convoCmdRef = useRef<{
    sendContextualUpdate: (text: string) => void
    sendUserMessage: (text: string) => void
  }>({
    sendContextualUpdate: () => {},
    sendUserMessage: () => {},
  })

  const getTaskTopic = useCallback(
    (taskId: string): string => {
      const t = trainerConfig.tasks.find((x) => x.id === taskId)
      return t?.prompt ?? ''
    },
    [trainerConfig],
  )

  const getTaskType = useCallback(
    (taskId: string): 'numeric-input' | 'single-choice' | 'matching' => {
      return trainerConfig.tasks.find((t) => t.id === taskId)?.type ?? 'numeric-input'
    },
    [trainerConfig],
  )

  const getCorrectValue = useCallback(
    (taskId: string): string | undefined => {
      const correct = trainerConfig.tasks.find((t) => t.id === taskId)?.correct
      if (correct === undefined || correct === null) return undefined
      if (Array.isArray(correct)) return correct.map((p) => p.join('→')).join(',')
      return String(correct)
    },
    [trainerConfig],
  )

  // Build 11labs client tools — same factory as VoicePanel, same 6 tools.
  const clientTools = useMemo(
    () =>
      buildClientTools({
        bus,
        lessonId,
        sendContextualUpdate: (text: string) => {
          try {
            convoCmdRef.current.sendContextualUpdate(text)
          } catch (err) {
            console.error('[lesson-v2] sendContextualUpdate failed:', err)
          }
        },
        getCurrentTaskId: () => currentTaskIdRef.current,
        getSolvedTaskIds: () => solvedTaskIdsRef.current,
        getTaskTopic,
        getState: () =>
          getLessonStateSnapshot(
            currentTaskIdRef.current,
            solvedTaskIdsRef.current,
            mistakesRef.current,
            trainerConfig.tasks.length,
          ),
      }),
    [bus, lessonId, getTaskTopic, trainerConfig],
  )

  // Stable SDK callbacks
  const handleConnect = useCallback(() => {
    bus.emit('voice:state', { state: 'idle' })
  }, [bus])
  const handleDisconnect = useCallback(() => {
    bus.emit('voice:state', { state: 'idle' })
  }, [bus])
  const handleModeChange = useCallback(
    ({ mode }: { mode: 'speaking' | 'listening' }) => {
      bus.emit('voice:state', { state: mode })
    },
    [bus],
  )
  const handleError = useCallback(
    (message: string) => {
      console.error('[lesson-v2] SDK error:', message)
      bus.emit('voice:state', { state: 'idle' })
      setVoiceError('Ошибка голосового сервиса. Попробуйте снова.')
    },
    [bus],
  )
  const handleMessage = useCallback(
    (payload: { message: string; role: 'user' | 'agent' }) => {
      const text = (payload?.message ?? '').trim()
      if (!text) return
      bus.emit('voice:transcript', { text, role: payload.role, timestamp: Date.now() })
    },
    [bus],
  )

  // The SDK hook — must be inside ConversationProvider.
  const conversation = useConversation({
    clientTools,
    onConnect: handleConnect,
    onDisconnect: handleDisconnect,
    onModeChange: handleModeChange,
    onMessage: handleMessage,
    onError: handleError,
  })

  // Latch latest conversation command surface into convoCmdRef each render
  // so bus subscription handlers can call it through a stable identity.
  convoCmdRef.current = conversation as unknown as {
    sendContextualUpdate: (text: string) => void
    sendUserMessage: (text: string) => void
  }

  // Latched conversation ref for safe cleanup on unmount (Phase 6.5 pattern).
  const conversationRef = useRef(conversation)
  conversationRef.current = conversation
  useEffect(() => {
    return () => {
      const c = conversationRef.current
      if (c.status === 'connected' || c.status === 'connecting') {
        try {
          c.endSession()
        } catch (err) {
          console.error('[lesson-v2] cleanup endSession:', err)
        }
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  // navigation
  const [currentIdx, setCurrentIdx] = useState(0)
  const [dir, setDir] = useState(1)

  // per-task state — initialised once based on screens.
  const [taskStates, setTaskStates] = useState<Record<string, TaskState>>(() => {
    const m: Record<string, TaskState> = {}
    for (const s of screens) {
      if (s.kind === 'task') m[s.id] = { status: 'pending', hintsShown: 0, attempts: 0 }
    }
    return m
  })
  const [finished, setFinished] = useState(false)

  // session lifecycle
  //   sessionStarted: true after «Начать урок» — voice session is live.
  //   micOn: true when mic is unmuted and capturing audio. After start, mic
  //   defaults to ON. Tapping the floating mic toggles MUTE (not disconnect).
  const [sessionStarted, setSessionStarted] = useState(false)
  const [micOn, setMicOn] = useState(false)
  const [boardOpen, setBoardOpen] = useState(false)
  // Phase 8.7 UAT 2026-05-22 — robust draw trigger: when user opens the board,
  // we stash the desired prompt here and BoardCanvasV2 picks it up on mount
  // (replaces the prior bus-emit-with-setTimeout race).
  const [pendingBoardPrompt, setPendingBoardPrompt] = useState<string | null>(null)
  const [teacherExpanded, setTeacherExpanded] = useState(true) // pinned by default
  const [teacherStatus, setTeacherStatus] = useState<TeacherStatus>('speaking')
  const [teacherLog, setTeacherLog] = useState<ChatMessage[]>([])
  const [bubble, setBubble] = useState<string | null>(null)
  // Stage 4 — highlighted task id (set by trainer:highlight bus event)
  const [highlightedTaskId, setHighlightedTaskId] = useState<string | null>(null)
  const highlightTimerRef = useRef<number | null>(null)
  const bubbleTimerRef = useRef<number | null>(null)
  const statusTimerRef = useRef<number | null>(null)
  const micOnRef = useRef(false)
  useEffect(() => {
    micOnRef.current = micOn
  }, [micOn])

  // lesson timer
  const [timerSec, setTimerSec] = useState(0)
  const [timerStarted, setTimerStarted] = useState(false)
  useEffect(() => {
    if (!timerStarted) return
    const id = window.setInterval(() => setTimerSec((s) => s + 1), 1000)
    return () => window.clearInterval(id)
  }, [timerStarted])

  /* ----- derived ----- */
  const screen = screens[currentIdx]
  const isTask = screen.kind === 'task'
  const taskState = isTask ? taskStates[screen.id] : null
  const isSolved = isTask && taskState?.status === 'solved'
  const solvedTaskIds = useMemo(
    () =>
      new Set(
        Object.entries(taskStates)
          .filter(([_, v]) => v.status === 'solved')
          .map(([k]) => k),
      ),
    [taskStates],
  )
  const canGoBack = currentIdx > 0
  const isLastScreen = currentIdx === screens.length - 1
  const canGoForward = !isTask || !!isSolved

  /* ----- chat helpers ----- */
  function pushMsg(text: string, role: 'teacher' | 'user' = 'teacher') {
    setTeacherLog((l) => [...l, { role, text, t: Date.now() }])
  }
  function teacherSpeak(text: string) {
    pushMsg(text, 'teacher')
    setBubble(text)
    setTeacherStatus('speaking')
    if (bubbleTimerRef.current !== null) window.clearTimeout(bubbleTimerRef.current)
    if (statusTimerRef.current !== null) window.clearTimeout(statusTimerRef.current)
    bubbleTimerRef.current = window.setTimeout(() => setBubble(null), 5000)
    statusTimerRef.current = window.setTimeout(
      () => setTeacherStatus(micOnRef.current ? 'listening' : 'idle'),
      2200,
    )
  }

  /* ----- lifecycle ----- */
  useEffect(() => {
    teacherSpeak(TEACHER_SCRIPT.welcome)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  useEffect(() => {
    if (screen.kind === 'intro') teacherSpeak(TEACHER_SCRIPT.introStart)
    else teacherSpeak(TEACHER_SCRIPT.taskStart)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentIdx])

  /* ----- nav ----- */
  function goNext() {
    if (!canGoForward) return
    if (currentIdx === screens.length - 1) {
      setFinished(true)
      teacherSpeak(TEACHER_SCRIPT.finish)
      return
    }
    setDir(1)
    setCurrentIdx((i) => i + 1)
  }
  function goPrev() {
    if (!canGoBack) return
    setDir(-1)
    setCurrentIdx((i) => i - 1)
  }
  function finishLesson() {
    setFinished(true)
    // End the voice session cleanly — Nadya disconnects, mic releases.
    if (sessionStarted) {
      try {
        conversation.endSession()
      } catch (err) {
        console.error('[lesson-v2] finishLesson.endSession:', err)
      }
      setSessionStarted(false)
      setMicOn(false)
    }
    teacherSpeak(TEACHER_SCRIPT.finish)
  }
  function restart() {
    setFinished(false)
    setCurrentIdx(0)
    setDir(1)
    const m: Record<string, TaskState> = {}
    for (const s of screens) {
      if (s.kind === 'task') m[s.id] = { status: 'pending', hintsShown: 0, attempts: 0 }
    }
    setTaskStates(m)
  }

  /* ----- task interactions (Stage 4: emit bus events for voice + tools) ----- */
  function onSolve(userAnswerText: string) {
    if (!isTask) return
    if (userAnswerText) pushMsg(`Мой ответ: ${userAnswerText}`, 'user')
    setTaskStates((s) => ({
      ...s,
      [screen.id]: { ...s[screen.id], status: 'solved' },
    }))
    // Stage 4: emit trainer:answer_submitted — VoicePanel-style handler
    // below forwards to Nadya via sendContextualUpdate.
    bus.emit('trainer:answer_submitted', {
      taskId: screen.id,
      value: userAnswerText,
      correct: true,
    })
    // Mock praise only if voice is OFF — when on, Nadya reacts via 11labs.
    if (!micOn) {
      const praise =
        TEACHER_SCRIPT.correct[Math.floor(Math.random() * TEACHER_SCRIPT.correct.length)]
      teacherSpeak(praise)
    }
  }
  function onWrong(userAnswerText: string) {
    if (!isTask) return
    if (userAnswerText) pushMsg(`Мой ответ: ${userAnswerText}`, 'user')
    setTaskStates((s) => {
      const cur = s[screen.id]
      const next: TaskState = { ...cur, attempts: cur.attempts + 1 }
      const task = screen as TaskScreen
      if (cur.hintsShown < task.hints.length) next.hintsShown = cur.hintsShown + 1
      return { ...s, [screen.id]: next }
    })
    bus.emit('trainer:answer_submitted', {
      taskId: screen.id,
      value: userAnswerText,
      correct: false,
    })
    if (!micOn) {
      teacherSpeak(
        TEACHER_SCRIPT.wrong[Math.floor(Math.random() * TEACHER_SCRIPT.wrong.length)],
      )
    }
  }
  function onRevealHint() {
    if (!isTask) return
    pushMsg('Дай подсказку', 'user')
    const task = screen as TaskScreen
    let nextLevel = 0
    setTaskStates((s) => {
      const cur = s[screen.id]
      if (cur.hintsShown >= task.hints.length) {
        nextLevel = cur.hintsShown
        return s
      }
      nextLevel = cur.hintsShown + 1
      return { ...s, [screen.id]: { ...cur, hintsShown: nextLevel } }
    })
    // Defer the bus emit so we read the updated hintsShown after state flush.
    queueMicrotask(() => {
      bus.emit('trainer:hint_opened', { taskId: screen.id, hintLevel: nextLevel })
    })
    if (!micOn) teacherSpeak(TEACHER_SCRIPT.hintReveal)
  }
  function setBoardOpenSafe(next: boolean) {
    // on narrow viewports, auto-collapse chat to keep task area usable
    if (next && typeof window !== 'undefined' && window.innerWidth < 1280) {
      setTeacherExpanded(false)
    }
    setBoardOpen(next)
    // UAT 2026-05-22: do NOT auto-trigger drawing when the user manually
    // opens the board. Manual open shows the empty canvas — Nadya draws
    // only on her own `draw_explanation` call. Earlier rounds auto-issued
    // a prompt here, which confused users who just wanted to peek at the
    // board ("открыл доску — началось объяснение, я этого не просил").
  }

  // Listen to board:say events emitted by BoardCanvasV2 — push them into
  // teacherLog so Nadya's narration shows up in the chat panel.
  //
  // UAT 2026-05-22 fix: when the voice session is ACTIVE, Nadya's words come
  // through voice:transcript already (the SDK's onMessage fires for every
  // agent utterance). board:say in that case duplicates the chat — once as
  // one big block from voice (her actual TTS) and again as scene's step-by-
  // step say primitives. Skip board:say when session is on.
  useLessonBusEvent('board:say', ({ text }) => {
    if (sessionStarted) return // voice transcript handles narration
    pushMsg(text, 'teacher')
    setBubble(text)
    setTeacherStatus('speaking')
    if (bubbleTimerRef.current !== null) window.clearTimeout(bubbleTimerRef.current)
    bubbleTimerRef.current = window.setTimeout(() => setBubble(null), 5000)
  })

  // UAT 2026-05-22 — auto-open board when Nadya issues draw_explanation
  // (which fans out into a board:draw_request via the client-tools handler).
  // Without this the canvas renders shapes behind a closed overlay and the
  // child has to tap the board pill manually to see them.
  // User-initiated open already goes through setPendingBoardPrompt (prop),
  // not the bus — so this listener only catches Nadya's tool-driven calls.
  useLessonBusEvent('board:draw_request', () => {
    setBoardOpen(true)
  })

  /* ===== Stage 4 — trainer bus integration ===== */

  // sync state refs ← React state so client tool handlers always read fresh
  // values (the buildClientTools getters read refs, not state).
  useEffect(() => {
    if (isTask) currentTaskIdRef.current = screen.id
  }, [isTask, screen.id])

  useEffect(() => {
    const next = new Set<string>()
    for (const [id, st] of Object.entries(taskStates)) {
      if (st.status === 'solved') next.add(id)
    }
    solvedTaskIdsRef.current = next
  }, [taskStates])

  // trainer:goto_task — Nadya tells the trainer to jump to a specific task.
  // We translate taskId → screen index and update navigation.
  useLessonBusEvent('trainer:goto_task', ({ taskId }) => {
    const idx = screens.findIndex((s) => s.id === taskId)
    if (idx < 0) {
      console.warn(`[lesson-v2] trainer:goto_task — unknown id ${taskId}`)
      return
    }
    setDir(idx > currentIdx ? 1 : -1)
    setCurrentIdx(idx)
  })

  // trainer:highlight — show a ring around the named task card for durationMs.
  useLessonBusEvent('trainer:highlight', ({ elementId, durationMs = 3000 }) => {
    setHighlightedTaskId(elementId)
    if (highlightTimerRef.current !== null) window.clearTimeout(highlightTimerRef.current)
    highlightTimerRef.current = window.setTimeout(
      () => setHighlightedTaskId(null),
      durationMs,
    )
  })

  // trainer:show_hint — Nadya pre-reveals hint N for current task.
  useLessonBusEvent('trainer:show_hint', ({ taskId, hintLevel }) => {
    setTaskStates((s) => {
      const cur = s[taskId]
      if (!cur) return s
      // Hint level is 1-based from Nadya's tool; our hintsShown counts how
      // many are visible. Pull it forward but don't shrink already-shown.
      const next = Math.max(cur.hintsShown, hintLevel)
      if (next === cur.hintsShown) return s
      return { ...s, [taskId]: { ...cur, hintsShown: next } }
    })
  })

  // Forward trainer:answer_submitted → Nadya via sendContextualUpdate.
  // Same allow-list pattern as VoicePanel D-08.
  const handleAnswerSubmitted = useCallback(
    ({ taskId, value, correct }: { taskId: string; value: string; correct: boolean }) => {
      currentTaskIdRef.current = taskId
      const taskType = getTaskType(taskId)
      if (correct) {
        solvedTaskIdsRef.current.add(taskId)
        try {
          // Base allow-listed event marker (Phase 8 D-08 pattern).
          convoCmdRef.current.sendContextualUpdate(
            formatAnswerSubmitted({ taskId, value, correct: true }, taskType),
          )
          // UAT 2026-05-22 round 7: force-interrupt via sendUserMessage.
          // sendContextualUpdate just appends context for the NEXT turn —
          // queued behind any in-flight TTS, hence the 15s delay user saw.
          // sendUserMessage is treated as user-side input and aborts current
          // TTS so Nadya can respond immediately. Prefix [ПЛАТФОРМА] makes
          // it clear to her this is a system event, not the child speaking.
          convoCmdRef.current.sendUserMessage(
            `[ПЛАТФОРМА] Ребёнок только что молча ввёл правильный ответ для ${taskId}: ${value}. Похвали ПРЯМО СЕЙЧАС короткой репликой и предложи перейти к следующей задаче.`,
          )
        } catch (err) {
          console.error('[lesson-v2] forward answer (ok):', err)
        }
      } else {
        const correctValue = getCorrectValue(taskId)
        mistakesRef.current.push({ taskId, value, correct: correctValue ?? '?' })
        if (mistakesRef.current.length > 10) {
          mistakesRef.current.splice(0, mistakesRef.current.length - 10)
        }
        try {
          convoCmdRef.current.sendContextualUpdate(
            formatAnswerSubmitted(
              { taskId, value, correct: false },
              taskType,
              { correctValue },
            ),
          )
          convoCmdRef.current.sendUserMessage(
            `[ПЛАТФОРМА] Ребёнок только что ввёл неправильный ответ для ${taskId}: ${value} (правильный ${correctValue ?? '?'}). Мягко прокомментируй ПРЯМО СЕЙЧАС и подскажи следующий шаг.`,
          )
        } catch (err) {
          console.error('[lesson-v2] forward answer (wrong):', err)
        }
      }
    },
    [getTaskType, getCorrectValue],
  )
  useLessonBusEvent('trainer:answer_submitted', handleAnswerSubmitted)

  const handleHintOpened = useCallback(
    ({ taskId, hintLevel }: { taskId: string; hintLevel: number }) => {
      try {
        convoCmdRef.current.sendContextualUpdate(formatHintOpened({ taskId, hintLevel }))
      } catch (err) {
        console.error('[lesson-v2] forward hint_opened:', err)
      }
    },
    [],
  )
  useLessonBusEvent('trainer:hint_opened', handleHintOpened)

  const handleIdle15s = useCallback(() => {
    const taskId = currentTaskIdRef.current || '(start)'
    try {
      convoCmdRef.current.sendContextualUpdate(formatIdle15s({ taskId }))
    } catch (err) {
      console.error('[lesson-v2] forward idle_15s:', err)
    }
  }, [])
  useLessonBusEvent('trainer:idle_15s', handleIdle15s)

  // Idle detector — emits trainer:idle_15s after 15s of no trainer events.
  useTrainerIdle()

  /* Stage 3+UAT fix (2026-05-22) — voice session lifecycle split into two
     concerns:

     1) startLesson() — runs ONCE at the «Начать урок» CTA. Requests mic
        permission, fetches signed URL, calls startSession(), starts the
        lesson timer, marks the session live. After this, FloatingMic
        appears and Nadya begins talking.

     2) toggleMic() — runs every time the user taps the floating mic
        AFTER session started. Uses conversation.setMicMuted() — the
        SDK keeps the WebSocket open, Nadya stays connected. Just the
        mic audio capture is paused/resumed. No reconnect roundtrip,
        no greeting replay. */
  const startLesson = useCallback(async () => {
    if (isStartingRef.current || sessionStarted) return
    isStartingRef.current = true
    setVoiceError(null)
    try {
      const stream = await navigator.mediaDevices
        .getUserMedia({ audio: true })
        .catch((err: { name?: string }) => {
          if (err?.name === 'NotAllowedError') {
            setVoiceError(
              'Доступ к микрофону запрещён. Разреши его в настройках браузера.',
            )
          } else if (err?.name === 'NotFoundError') {
            setVoiceError('Микрофон не найден. Подключи микрофон.')
          } else {
            setVoiceError('Не удалось получить микрофон.')
          }
          return null
        })
      if (!stream) return
      stream.getTracks().forEach((t) => t.stop())

      const res = await fetch('/api/voice/signed-url', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lessonId }),
      })
      if (!res.ok) {
        setVoiceError('Не удалось получить ссылку. Попробуй снова.')
        return
      }
      const data = (await res.json()) as { signedUrl: string; topic: string }

      conversation.startSession({
        signedUrl: data.signedUrl,
        connectionType: 'websocket',
        dynamicVariables: {
          lesson_topic: data.topic || topic,
          total_tasks: trainerConfig.tasks.length,
        },
      })
      setSessionStarted(true)
      setMicOn(true)
      setTimerStarted(true)
    } catch (err) {
      console.error('[lesson-v2] startLesson failed:', err)
      setVoiceError('Ошибка голосового сервиса. Попробуй снова.')
    } finally {
      isStartingRef.current = false
    }
  }, [conversation, lessonId, sessionStarted, topic, trainerConfig])

  /** Mute/unmute the mic without breaking the session. */
  const toggleMic = useCallback(() => {
    if (!sessionStarted) return
    const nextOn = !micOn
    try {
      // useConversation exposes `setMuted` (the underlying BaseConversation
      // method is `setMicMuted`; the React hook wraps it with the shorter name).
      conversation.setMuted(!nextOn)
    } catch (err) {
      console.error('[lesson-v2] setMuted failed:', err)
      return
    }
    setMicOn(nextOn)
  }, [conversation, micOn, sessionStarted])

  // Mirror SDK mode (speaking/listening) into teacherStatus, but DO NOT touch
  // micOn here — micOn is the local mute toggle and lives independently of
  // SDK mode. If the underlying connection drops outside our control (e.g.
  // network hiccup), we surface 'idle' but leave micOn for the user to retry.
  useEffect(() => {
    if (conversation.status === 'connected') {
      if (conversation.mode === 'speaking') setTeacherStatus('speaking')
      else if (conversation.mode === 'listening') setTeacherStatus('listening')
      else setTeacherStatus('idle')
    } else if (conversation.status === 'connecting') {
      setTeacherStatus('speaking')
    } else {
      setTeacherStatus('idle')
    }
  }, [conversation.status, conversation.mode])

  // Listen to voice transcript events from the SDK — push them into teacherLog
  // for the two-way chat panel.
  useLessonBusEvent('voice:transcript', ({ text, role }) => {
    pushMsg(text, role === 'agent' ? 'teacher' : 'user')
    if (role === 'agent') {
      setBubble(text)
      if (bubbleTimerRef.current !== null) window.clearTimeout(bubbleTimerRef.current)
      bubbleTimerRef.current = window.setTimeout(() => setBubble(null), 5000)
    }
  })

  // top-bar menu stubs (prototype: Nadya narrates the action)
  function onHome() {
    teacherSpeak('Здесь будет переход к списку всех уроков.')
  }
  function onProfile() {
    teacherSpeak('Здесь будет твой профиль и достижения.')
  }
  function onSettings() {
    teacherSpeak('Здесь будут настройки звука, голоса и темы.')
  }

  /* ----- layout math ----- */
  const boardW = boardOpen ? '50vw' : '0px'
  const chatW = teacherExpanded ? `${TEACHER_W}px` : '0px'
  const mainOffsetLeft = boardOpen ? '50vw' : '0px'
  const mainOffsetRight = teacherExpanded ? `${TEACHER_W}px` : '0px'
  // mic center: left edge of main area + half of main width
  const micLeft = `calc(${mainOffsetLeft} + (100vw - ${boardW} - ${chatW}) / 2)`

  const animClass = dir > 0 ? 'animate-[lpSlideInRight_.32s_ease-out]' : 'animate-[lpSlideInLeft_.32s_ease-out]'

  // context label for board overlay header
  const contextLabel = isTask
    ? `Задача ${taskIndices.indexOf(currentIdx) + 1} · ${
        screen.kind === 'task' && screen.type === 'numeric-input' && screen.expr
          ? screen.expr
          : screen.kind === 'task'
            ? screen.prompt.slice(0, 24) + '…'
            : 'Теория'
      }`
    : 'Теория'

  return (
    <div className="min-h-screen relative" style={{ background: PALETTE.bg, color: PALETTE.ink }}>
      <TopBar
        title={topic}
        currentIdx={currentIdx}
        solvedTaskIds={solvedTaskIds}
        isTask={isTask}
        currentTaskIdx={isTask ? taskIndices.indexOf(currentIdx) : -1}
        timerSec={timerSec}
        taskIndices={taskIndices}
        screens={screens}
        onHome={onHome}
        onProfile={onProfile}
        onSettings={onSettings}
        onFinish={finishLesson}
      />

      {/* Main hero area — between board (left) and chat (right) */}
      <main
        className="transition-[margin] duration-300 ease-out"
        style={{
          marginLeft: mainOffsetLeft,
          marginRight: mainOffsetRight,
          minHeight: 'calc(100vh - 64px)',
        }}
      >
        <div className="mx-auto px-5 pt-7 pb-44" style={{ maxWidth: 680 }}>
          {/* back-row */}
          <div className="flex items-center mb-4 h-8">
            <button
              onClick={goPrev}
              disabled={!canGoBack}
              className="inline-flex items-center gap-1.5 h-8 px-3 -ml-3 rounded-full text-xs font-extrabold uppercase tracking-wider transition-colors hover:bg-white disabled:opacity-30 disabled:cursor-not-allowed"
              style={{ color: PALETTE.sub }}
            >
              ← Предыдущая
            </button>
          </div>

          {/* card / finished state */}
          {finished ? (
            <div
              className="rounded-3xl p-10 text-center text-white"
              style={{
                background: `linear-gradient(135deg, ${PALETTE.green}, ${PALETTE.blue})`,
                boxShadow: '0 10px 0 rgba(0,0,0,0.06)',
              }}
            >
              <div className="text-6xl mb-3">🏆</div>
              <h2 className="text-2xl font-extrabold mb-2">Урок окончен!</h2>
              <p className="opacity-90 mb-6">
                Решено {solvedTaskIds.size} из {totalTasks}. Ты молодец!
              </p>
              <button
                onClick={restart}
                className="h-12 px-6 rounded-2xl font-extrabold uppercase tracking-wide bg-white"
                style={{ color: PALETTE.greenDeep, boxShadow: '0 3px 0 rgba(0,0,0,0.15)' }}
              >
                Пройти заново
              </button>
            </div>
          ) : (
            <div key={currentIdx} className={animClass}>
              {screen.kind === 'intro' && (
                <IntroCard item={screen} idx={screens.slice(0, currentIdx + 1).filter((s) => s.kind === 'intro').length - 1} />
              )}
              {screen.kind === 'task' && taskState && (
                <TaskCard
                  task={screen}
                  index={taskIndices.indexOf(currentIdx)}
                  state={taskState}
                  isActive={true}
                  isHighlighted={highlightedTaskId === screen.id}
                  onSolve={onSolve}
                  onWrong={onWrong}
                  onRevealHint={onRevealHint}
                />
              )}
            </div>
          )}

          {/* «Начать урок» — pre-session CTA on the very first screen.
              Shown until startLesson() runs successfully. Replaces both
              «Дальше →» and FloatingMic until that point. */}
          {!finished && !sessionStarted && (
            <div className="flex flex-col items-center mt-7 gap-3 animate-[lpHintIn_.3s_ease-out]">
              <button
                onClick={startLesson}
                className="h-16 px-12 rounded-2xl text-lg font-extrabold uppercase tracking-wide transition-all active:translate-y-0.5 active:shadow-none inline-flex items-center gap-3"
                style={{
                  background: PALETTE.green,
                  color: 'white',
                  boxShadow: `0 6px 0 ${PALETTE.greenDeep}`,
                  minWidth: 280,
                }}
              >
                <svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor">
                  <path d="M12 14a3 3 0 0 0 3-3V6a3 3 0 0 0-6 0v5a3 3 0 0 0 3 3z" />
                  <path d="M19 11a1 1 0 0 0-2 0 5 5 0 0 1-10 0 1 1 0 0 0-2 0 7 7 0 0 0 6 6.92V21h-3a1 1 0 0 0 0 2h8a1 1 0 0 0 0-2h-3v-3.08A7 7 0 0 0 19 11z" />
                </svg>
                Начать урок
              </button>
              <div className="text-xs font-bold text-center max-w-md" style={{ color: PALETTE.sub }}>
                Нажми, когда будешь готов. Запросим доступ к микрофону — Надя
                поздоровается и начнёт урок голосом.
              </div>
              {voiceError && (
                <div
                  className="text-xs font-bold text-center max-w-md mt-1"
                  style={{ color: PALETTE.coralDeep }}
                >
                  {voiceError}
                </div>
              )}
            </div>
          )}

          {/* «Дальше →» — after session started, on intros + solved tasks */}
          {!finished && sessionStarted && canGoForward && (
            <div className="flex justify-center mt-7 animate-[lpHintIn_.3s_ease-out]">
              <button
                onClick={goNext}
                className="h-14 px-10 rounded-2xl text-base font-extrabold uppercase tracking-wide transition-all active:translate-y-0.5 active:shadow-none inline-flex items-center gap-2"
                style={{
                  background: PALETTE.green,
                  color: 'white',
                  boxShadow: `0 4px 0 ${PALETTE.greenDeep}`,
                  minWidth: 260,
                }}
              >
                {isLastScreen ? 'Завершить урок' : 'Дальше'} →
              </button>
            </div>
          )}
        </div>
      </main>

      {/* overlays */}
      <BoardOverlay open={boardOpen} onClose={() => setBoardOpen(false)} contextLabel={contextLabel}>
        <BoardCanvasV2
          lessonId={lessonId}
          initialPrompt={pendingBoardPrompt}
          onPromptConsumed={() => setPendingBoardPrompt(null)}
        />
      </BoardOverlay>

      <FloatingBoardToggle open={boardOpen} onToggle={() => setBoardOpenSafe(!boardOpen)} />

      {/* FloatingMic — only after «Начать урок» pressed. While not started,
          the big start CTA in the hero area is the entry point. */}
      {sessionStarted && (
        <FloatingMic on={micOn} onToggle={toggleMic} style={{ left: micLeft }} />
      )}

      <FloatingTeacher
        expanded={teacherExpanded}
        onExpand={() => setTeacherExpanded(true)}
        onCollapse={() => setTeacherExpanded(false)}
        log={teacherLog}
        status={teacherStatus}
        currentBubble={bubble}
      />
    </div>
  )
}
