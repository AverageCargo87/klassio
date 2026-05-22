'use client'
// components/lesson-v2/voice-toggle.tsx
// Voice picker dropdown for the lesson-v2 TopBar. Cycles between the
// voices in lib/lesson-v2/voices.ts. Persists via useVoice. Change takes
// effect on the NEXT startSession — when a session is already live, the
// button is disabled with a tooltip explaining why.

import { useEffect, useRef, useState } from 'react'
import { PALETTE } from './palette'
import { VOICES } from '@/lib/lesson-v2/voices'
import { useVoice } from '@/lib/lesson-v2/use-voice'

interface VoiceToggleProps {
  /** When true, picker is read-only — current session would not pick up
   *  the change. Lesson-page passes sessionStarted here. */
  locked: boolean
}

export function VoiceToggle({ locked }: VoiceToggleProps) {
  const { voice, setVoice } = useVoice()
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

  const current = VOICES.find((v) => v.key === voice) ?? VOICES[0]

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => !locked && setOpen((v) => !v)}
        disabled={locked}
        title={
          locked
            ? 'Голос можно сменить до старта урока'
            : `Голос: ${current.label}`
        }
        aria-label="Сменить голос"
        className="h-10 px-3 rounded-full inline-flex items-center gap-1.5 transition-transform hover:scale-[1.03] active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed"
        style={{
          background: PALETTE.card,
          color: PALETTE.ink,
          border: `1.5px solid ${PALETTE.line}`,
          boxShadow: `0 2px 0 ${PALETTE.line}`,
          fontSize: 13,
          fontWeight: 700,
          lineHeight: 1,
        }}
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
          <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
          <path d="M19 10v2a7 7 0 0 1-14 0v-2M12 19v4M8 23h8" />
        </svg>
        <span className="hidden sm:inline">{current.label}</span>
        <svg
          viewBox="0 0 24 24"
          width="10"
          height="10"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          style={{ opacity: 0.6 }}
        >
          <path d="M6 9l6 6 6-6" />
        </svg>
      </button>
      {open && !locked && (
        <div
          className="absolute right-0 top-12 z-50 w-52 rounded-2xl py-2 animate-[lpHintIn_.18s_ease-out]"
          style={{
            background: PALETTE.card,
            border: `1.5px solid ${PALETTE.line}`,
            boxShadow: '0 12px 32px rgba(31,42,55,0.16)',
          }}
        >
          {VOICES.map((opt) => {
            const isActive = opt.key === voice
            return (
              <button
                key={opt.key}
                onClick={() => {
                  setVoice(opt.key)
                  setOpen(false)
                }}
                className="w-full px-4 py-2.5 text-left text-sm font-bold inline-flex items-start gap-2.5 transition-colors hover:bg-black/5"
                style={{ color: PALETTE.ink }}
              >
                <span
                  className="shrink-0 w-5 h-5 rounded-full mt-0.5 flex items-center justify-center"
                  style={{
                    background: isActive ? PALETTE.green : 'transparent',
                    border: isActive ? 'none' : `1.5px solid ${PALETTE.line}`,
                  }}
                >
                  {isActive && (
                    <svg
                      viewBox="0 0 24 24"
                      width="12"
                      height="12"
                      fill="none"
                      stroke="white"
                      strokeWidth="3.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <path d="M5 12l5 5L20 7" />
                    </svg>
                  )}
                </span>
                <span className="flex-1 min-w-0">
                  <span className="block">{opt.label}</span>
                  <span
                    className="block text-[11px] font-medium opacity-70 leading-tight mt-0.5"
                    style={{ color: PALETTE.sub }}
                  >
                    {opt.description}
                  </span>
                </span>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
