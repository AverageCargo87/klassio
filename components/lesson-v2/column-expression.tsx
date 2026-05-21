'use client'
// components/lesson-v2/column-expression.tsx
// Visual representation of "A + B" column addition. Used by NumericInput tasks
// that have an `expr` field. Renders A above B with right alignment, then a
// dashed underline, then either the answer (solved) or placeholder dots.

import { PALETTE } from './palette'

interface ColumnExpressionProps {
  expr: string
  solved: boolean
  answer: string
}

export function ColumnExpression({ expr, solved, answer }: ColumnExpressionProps) {
  const m = expr.match(/^\s*(\d+)\s*\+\s*(\d+)\s*$/)
  if (!m) return null
  const a = m[1]
  const b = m[2]
  const width = Math.max(a.length, b.length, solved ? answer.length : 0)
  const pad = (s: string) => s.padStart(width, ' ')
  const cells = (s: string) =>
    pad(s)
      .split('')
      .map((ch, i) => (
        <span key={i} className="inline-block w-8 text-center tabular-nums">
          {ch === ' ' ? '' : ch}
        </span>
      ))

  return (
    <div
      className="inline-block rounded-2xl px-5 py-4 font-mono text-3xl font-extrabold"
      style={{
        background: '#FFF8EA',
        border: '2px dashed #E7D8AE',
        color: PALETTE.ink,
        lineHeight: 1.15,
      }}
    >
      <div className="flex justify-end">{cells(a)}</div>
      <div className="flex justify-end items-center">
        <span className="mr-1" style={{ color: PALETTE.blueDeep }}>
          +
        </span>
        {cells(b)}
      </div>
      <div className="h-[3px] my-1 rounded-full" style={{ background: PALETTE.ink, opacity: 0.55 }} />
      <div
        className="flex justify-end"
        style={{ color: solved ? PALETTE.greenDeep : '#D6C9A4' }}
      >
        {solved
          ? cells(answer)
          : pad('')
              .split('')
              .map((_, i) => (
                <span key={i} className="inline-block w-8 text-center">
                  ·
                </span>
              ))}
      </div>
    </div>
  )
}
