'use client'
// components/lesson-v2/hints.tsx
// Nested hint stack + Explanation block. Ported from Claude Design components.jsx.

import { PALETTE } from './palette'
import { Checkmark } from './icons'

interface HintsProps {
  hints: string[]
  shown: number
  onReveal: () => void
  disabled?: boolean
}

export function Hints({ hints, shown, onReveal, disabled }: HintsProps) {
  return (
    <div className="space-y-2">
      {hints.slice(0, shown).map((h, i) => (
        <div
          key={i}
          className="rounded-2xl px-4 py-3 flex gap-3 items-start animate-[lpHintIn_.25s_ease-out]"
          style={{ background: PALETTE.yellowSoft, border: `1.5px solid ${PALETTE.yellow}` }}
        >
          <div
            className="shrink-0 w-7 h-7 rounded-full flex items-center justify-center text-sm font-bold"
            style={{ background: PALETTE.yellow, color: PALETTE.ink }}
          >
            {i + 1}
          </div>
          <div className="text-[14.5px] leading-snug pt-0.5" style={{ color: PALETTE.ink }}>
            {h}
          </div>
        </div>
      ))}
      {shown < hints.length && (
        <button
          type="button"
          onClick={onReveal}
          disabled={disabled}
          className="inline-flex items-center gap-2 h-11 px-4 rounded-full text-sm font-bold transition-transform active:scale-95 disabled:opacity-40"
          style={{
            background: PALETTE.yellowSoft,
            color: PALETTE.ink,
            border: `2px dashed ${PALETTE.yellow}`,
          }}
        >
          <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
            <path d="M9 21h6v-1H9v1zm3-20a7 7 0 0 0-4 12.7V17a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1v-3.3A7 7 0 0 0 12 1z" />
          </svg>
          {shown === 0 ? 'Показать подсказку' : `Подсказка ${shown + 1}`}
        </button>
      )}
    </div>
  )
}

interface ExplanationProps {
  text: string
}

export function Explanation({ text }: ExplanationProps) {
  return (
    <div
      className="rounded-2xl p-4 flex gap-3 items-start animate-[lpHintIn_.3s_ease-out]"
      style={{ background: PALETTE.greenSoft, border: `1.5px solid ${PALETTE.green}` }}
    >
      <div
        className="shrink-0 w-8 h-8 rounded-full flex items-center justify-center"
        style={{ background: PALETTE.greenDeep }}
      >
        <Checkmark size={18} />
      </div>
      <div className="text-[14.5px] leading-snug pt-1" style={{ color: '#1f4a1a' }}>
        {text}
      </div>
    </div>
  )
}
