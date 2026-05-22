'use client'
// components/lesson-v2/topbar.tsx
// Top bar with: logo (→ /lessons), centered lesson title + timer + counter +
// segmented progress, right-side user avatar dropdown. Ported from
// Claude Design lesson-page.jsx (LP_TopBar + LP_UserMenu + LP_LessonTimer).

import { useEffect, useRef, useState } from 'react'
import { PALETTE } from './palette'
import { ThemeToggle } from './theme-toggle'
import type { Screen } from './types'

interface LessonTimerProps {
  sec: number
}

function LessonTimer({ sec }: LessonTimerProps) {
  const mm = String(Math.floor(sec / 60)).padStart(2, '0')
  const ss = String(sec % 60).padStart(2, '0')
  let color: string = PALETTE.sub
  if (sec >= 50 * 60) color = '#FB923C'
  else if (sec >= 40 * 60) color = '#D97706'
  return (
    <div
      className="inline-flex items-center gap-1.5 text-sm font-mono font-bold tabular-nums"
      style={{ color, opacity: sec === 0 ? 0.45 : 1 }}
      title={sec === 0 ? 'Таймер стартует при первом включении микрофона' : undefined}
    >
      <svg
        viewBox="0 0 24 24"
        width="14"
        height="14"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <circle cx="12" cy="13" r="7" />
        <path d="M12 9v4l2 1M9 2h6M12 6V2" />
      </svg>
      <span>
        {mm}:{ss}
      </span>
    </div>
  )
}

interface UserMenuProps {
  onProfile: () => void
  onSettings: () => void
  onAllLessons: () => void
  onFinish: () => void
}

function UserMenu({ onProfile, onSettings, onAllLessons, onFinish }: UserMenuProps) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [open])

  const items: Array<{ icon: string; label: string; action: () => void }> = [
    { icon: '👤', label: 'Профиль', action: onProfile },
    { icon: '⚙️', label: 'Настройки', action: onSettings },
    { icon: '📅', label: 'Все уроки', action: onAllLessons },
  ]

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-10 h-10 rounded-full flex items-center justify-center transition-transform hover:scale-105 active:scale-95"
        style={{
          background: `linear-gradient(135deg, ${PALETTE.yellow}, ${PALETTE.coral})`,
          color: 'white',
          border: '2px solid white',
          boxShadow: `0 2px 0 ${PALETTE.line}, 0 3px 10px rgba(31,42,55,0.10)`,
          fontSize: 18,
        }}
        title="Меню"
      >
        <span style={{ lineHeight: 1 }}>👦</span>
      </button>
      {open && (
        <div
          className="absolute right-0 top-12 z-50 w-56 rounded-2xl py-2 animate-[lpHintIn_.18s_ease-out]"
          style={{
            background: PALETTE.card,
            border: `1.5px solid ${PALETTE.line}`,
            boxShadow: '0 12px 32px rgba(31,42,55,0.16)',
          }}
        >
          {items.map((it) => (
            <button
              key={it.label}
              onClick={() => {
                it.action()
                setOpen(false)
              }}
              className="w-full px-4 py-2.5 text-left text-sm font-bold inline-flex items-center gap-3 transition-colors hover:bg-gray-50"
              style={{ color: PALETTE.ink }}
            >
              <span className="text-base w-5 text-center">{it.icon}</span>
              <span>{it.label}</span>
            </button>
          ))}
          <div className="my-1.5 h-px mx-3" style={{ background: PALETTE.line }} />
          <button
            onClick={() => {
              onFinish()
              setOpen(false)
            }}
            className="w-full px-4 py-2.5 text-left text-sm font-bold inline-flex items-center gap-3 transition-colors"
            style={{ color: PALETTE.coralDeep }}
            onMouseEnter={(e) => (e.currentTarget.style.background = PALETTE.coralSoft)}
            onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
          >
            <span className="text-base w-5 text-center">🚪</span>
            <span>Завершить урок</span>
          </button>
        </div>
      )}
    </div>
  )
}

interface TopBarProps {
  title: string
  isTask: boolean
  currentTaskIdx: number
  solvedTaskIds: Set<string>
  currentIdx: number
  timerSec: number
  taskIndices: number[]
  screens: Screen[]
  onHome: () => void
  onProfile: () => void
  onSettings: () => void
  onFinish: () => void
}

export function TopBar({
  title,
  isTask,
  currentTaskIdx,
  solvedTaskIds,
  currentIdx,
  timerSec,
  taskIndices,
  screens,
  onHome,
  onProfile,
  onSettings,
  onFinish,
}: TopBarProps) {
  const totalTasks = taskIndices.length
  return (
    <header
      className="sticky top-0 z-40"
      style={{
        height: 64,
        background: `color-mix(in srgb, ${PALETTE.bg} 92%, transparent)`,
        borderBottom: `1.5px solid ${PALETTE.line}`,
        backdropFilter: 'blur(10px)',
      }}
    >
      <div className="h-full px-5 flex items-center gap-5">
        {/* LEFT: logo → /lessons */}
        <a
          href="/lessons"
          onClick={(e) => {
            e.preventDefault()
            onHome()
          }}
          className="flex items-center gap-2 group shrink-0"
          style={{ width: 180 }}
          title="Все уроки"
        >
          <span className="inline-block text-2xl group-hover:animate-[lpPulse_.6s_ease-out]">
            🧮
          </span>
          <span
            className="text-base font-extrabold tracking-tight"
            style={{ color: PALETTE.ink }}
          >
            Klassio
          </span>
        </a>

        {/* CENTER: title + timer + counter + segmented bar */}
        <div className="flex-1 flex flex-col items-stretch gap-1.5 max-w-2xl mx-auto min-w-0">
          <div className="flex items-center gap-4 w-full">
            <div
              className="text-xs font-extrabold truncate flex-1"
              style={{ color: PALETTE.ink }}
            >
              {title}
            </div>
            <LessonTimer sec={timerSec} />
            <div
              className="text-xs font-extrabold tabular-nums whitespace-nowrap"
              style={{
                color: isTask ? PALETTE.ink : PALETTE.sub,
                minWidth: 70,
                textAlign: 'right',
              }}
            >
              {isTask ? `${currentTaskIdx + 1} / ${totalTasks}` : 'Подготовка'}
            </div>
          </div>
          <div className="flex w-full items-center gap-1">
            {taskIndices.map((screenIdx) => {
              const task = screens[screenIdx]
              const isSolved = solvedTaskIds.has(task.id)
              const isCurrent = currentIdx === screenIdx
              let bg: string = PALETTE.line
              let extra: React.CSSProperties = {}
              if (isSolved) bg = PALETTE.green
              else if (isCurrent) {
                bg = PALETTE.blue
                extra = { animation: 'lpSegPulse 1.8s ease-in-out infinite' }
              }
              return (
                <div
                  key={task.id}
                  className="flex-1 h-2.5 rounded-full transition-colors"
                  style={{ background: bg, ...extra }}
                />
              )
            })}
          </div>
        </div>

        {/* RIGHT: theme toggle + user avatar dropdown */}
        <div style={{ width: 180 }} className="flex justify-end items-center gap-2 shrink-0">
          <ThemeToggle />
          <UserMenu
            onProfile={onProfile}
            onSettings={onSettings}
            onAllLessons={onHome}
            onFinish={onFinish}
          />
        </div>
      </div>
    </header>
  )
}
