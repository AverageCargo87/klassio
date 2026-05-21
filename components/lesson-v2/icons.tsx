'use client'
// components/lesson-v2/icons.tsx
// Inline SVG icons + small visual primitives ported from Claude Design's
// components.jsx + lesson-card.jsx. All purely visual, no state.

import { PALETTE } from './palette'

interface IconProps {
  size?: number
}

export function Checkmark({ size = 18 }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size}>
      <path
        d="M5 12.5l4.5 4.5L19 7.5"
        fill="none"
        stroke="white"
        strokeWidth="3.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

export function CrossMark({ size = 18 }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size}>
      <path
        d="M7 7l10 10M17 7L7 17"
        fill="none"
        stroke="white"
        strokeWidth="3.2"
        strokeLinecap="round"
      />
    </svg>
  )
}

interface StarsProps {
  n: number
  size?: number
}

export function Stars({ n, size = 14 }: StarsProps) {
  return (
    <div className="flex items-center gap-0.5">
      {[1, 2, 3].map((i) => (
        <svg
          key={i}
          viewBox="0 0 24 24"
          width={size}
          height={size}
          style={{ color: i <= n ? PALETTE.yellow : '#D8DCE3' }}
        >
          <path
            fill="currentColor"
            d="M12 2.6l2.8 5.7 6.2.9-4.5 4.4 1.1 6.2L12 17l-5.6 2.8 1.1-6.2L3 9.2l6.2-.9z"
          />
        </svg>
      ))}
    </div>
  )
}

interface DifficultyBadgeProps {
  n: 1 | 2 | 3
}

export function DifficultyBadge({ n }: DifficultyBadgeProps) {
  const colors = [PALETTE.d1, PALETTE.d2, PALETTE.d3]
  const labels = ['Разминка', 'Основа', 'Вызов']
  const c = colors[n - 1]
  return (
    <div
      className="inline-flex items-center gap-2 h-8 pl-2.5 pr-3.5 rounded-full text-xs font-extrabold"
      style={{ background: c + '1f', color: c }}
    >
      <Stars n={n} />
      <span>{labels[n - 1]}</span>
    </div>
  )
}

interface StarsBurstProps {
  play: boolean
}

/**
 * Visual stars burst around a centerpoint (e.g. correct-answer celebration).
 * Uses CSS keyframe `lpStarFly` defined in app/globals.css.
 */
export function StarsBurst({ play }: StarsBurstProps) {
  if (!play) return null
  return (
    <div className="pointer-events-none absolute inset-0 overflow-visible">
      {Array.from({ length: 6 }).map((_, i) => {
        const angle = (i / 6) * Math.PI * 2
        const dist = 140 + Math.random() * 60
        const dx = Math.cos(angle) * dist
        const dy = Math.sin(angle) * dist - 30
        const rot = (Math.random() - 0.5) * 540
        const color = [PALETTE.yellow, PALETTE.green, PALETTE.blue][i % 3]
        return (
          <span
            key={i}
            className="absolute left-1/2 top-1/2 block"
            style={
              {
                animation: 'lpStarFly 900ms cubic-bezier(.2,.7,.3,1) forwards',
                ['--dx' as string]: `${dx}px`,
                ['--dy' as string]: `${dy}px`,
                ['--rot' as string]: `${rot}deg`,
                color,
              } as React.CSSProperties
            }
          >
            <svg viewBox="0 0 24 24" width="28" height="28">
              <path
                fill="currentColor"
                d="M12 2.6l2.8 5.7 6.2.9-4.5 4.4 1.1 6.2L12 17l-5.6 2.8 1.1-6.2L3 9.2l6.2-.9z"
              />
            </svg>
          </span>
        )
      })}
    </div>
  )
}

interface ConfettiProps {
  play: boolean
}

/**
 * Confetti burst — used in the wrapped TaskCard on solve.
 * Same primitive feel as StarsBurst but with mixed-color rectangles.
 */
export function Confetti({ play }: ConfettiProps) {
  if (!play) return null
  const pieces = Array.from({ length: 18 })
  const colors = [
    PALETTE.yellow,
    PALETTE.green,
    PALETTE.blue,
    PALETTE.coral,
    PALETTE.lilac,
  ]
  return (
    <div className="pointer-events-none absolute inset-0 overflow-visible">
      {pieces.map((_, i) => {
        const c = colors[i % colors.length]
        const dx = (Math.random() - 0.5) * 360
        const dy = -120 - Math.random() * 140
        const rot = (Math.random() - 0.5) * 720
        const dur = 900 + Math.random() * 500
        return (
          <span
            key={i}
            className="absolute left-1/2 top-1/2 block"
            style={
              {
                width: 8,
                height: 12,
                background: c,
                borderRadius: 2,
                transform: 'translate(-50%, -50%)',
                animation: `lpConfetti ${dur}ms cubic-bezier(.2,.6,.4,1) forwards`,
                ['--dx' as string]: `${dx}px`,
                ['--dy' as string]: `${dy}px`,
                ['--rot' as string]: `${rot}deg`,
              } as React.CSSProperties
            }
          />
        )
      })}
    </div>
  )
}
