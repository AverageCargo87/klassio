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

import { useEffect, useMemo, useRef, useState } from 'react'
import { PALETTE } from './palette'
import { TEACHER_SCRIPT } from './teacher-script'
import { trainerConfigToScreens } from './adapt-config'
import { TopBar } from './topbar'
import { TaskCard } from './task-card'
import { IntroCard } from './intro-card'
import { FloatingTeacher, TEACHER_W } from './floating-teacher'
import { FloatingMic } from './floating-mic'
import { FloatingBoardToggle, BoardOverlay } from './floating-board'
import type { ChatMessage, Screen, TaskScreen, TaskState, TeacherStatus } from './types'
import type { TrainerConfig } from '@/lib/trainer/config-schema'

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
    <div className="lesson-v2-root">
      <FontPreload />
      <LessonPageInner
        lessonId={lessonId}
        topic={topic}
        screens={screens}
        taskIndices={taskIndices}
        totalTasks={totalTasks}
      />
    </div>
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
  screens: Screen[]
  taskIndices: number[]
  totalTasks: number
}

function LessonPageInner({ lessonId: _lessonId, topic, screens, taskIndices, totalTasks }: InnerProps) {
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

  // overlays
  const [micOn, setMicOn] = useState(false)
  const [boardOpen, setBoardOpen] = useState(false)
  const [teacherExpanded, setTeacherExpanded] = useState(true) // pinned by default
  const [teacherStatus, setTeacherStatus] = useState<TeacherStatus>('speaking')
  const [teacherLog, setTeacherLog] = useState<ChatMessage[]>([])
  const [bubble, setBubble] = useState<string | null>(null)
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

  /* ----- task interactions ----- */
  function onSolve(userAnswerText: string) {
    if (!isTask) return
    if (userAnswerText) pushMsg(`Мой ответ: ${userAnswerText}`, 'user')
    setTaskStates((s) => ({
      ...s,
      [screen.id]: { ...s[screen.id], status: 'solved' },
    }))
    const praise = TEACHER_SCRIPT.correct[Math.floor(Math.random() * TEACHER_SCRIPT.correct.length)]
    teacherSpeak(praise)
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
    teacherSpeak(TEACHER_SCRIPT.wrong[Math.floor(Math.random() * TEACHER_SCRIPT.wrong.length)])
  }
  function onRevealHint() {
    if (!isTask) return
    pushMsg('Дай подсказку', 'user')
    setTaskStates((s) => {
      const cur = s[screen.id]
      const task = screen as TaskScreen
      if (cur.hintsShown >= task.hints.length) return s
      return { ...s, [screen.id]: { ...cur, hintsShown: cur.hintsShown + 1 } }
    })
    teacherSpeak(TEACHER_SCRIPT.hintReveal)
  }
  function setBoardOpenSafe(next: boolean) {
    // on narrow viewports, auto-collapse chat to keep task area usable
    if (next && typeof window !== 'undefined' && window.innerWidth < 1280) {
      setTeacherExpanded(false)
    }
    setBoardOpen(next)
  }

  function toggleMic() {
    if (!timerStarted) setTimerStarted(true)
    setMicOn((v) => {
      const next = !v
      teacherSpeak(next ? TEACHER_SCRIPT.micOn : TEACHER_SCRIPT.micOff)
      setTeacherStatus(next ? 'listening' : 'idle')
      return next
    })
  }

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
                  onSolve={onSolve}
                  onWrong={onWrong}
                  onRevealHint={onRevealHint}
                />
              )}
            </div>
          )}

          {/* «Дальше →» — only on intros + solved tasks */}
          {!finished && canGoForward && (
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
      <BoardOverlay open={boardOpen} onClose={() => setBoardOpen(false)} contextLabel={contextLabel} />

      <FloatingBoardToggle open={boardOpen} onToggle={() => setBoardOpenSafe(!boardOpen)} />

      <FloatingMic on={micOn} onToggle={toggleMic} style={{ left: micLeft }} />

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
