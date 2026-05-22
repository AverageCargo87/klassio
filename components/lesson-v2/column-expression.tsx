'use client'
// components/lesson-v2/column-expression.tsx
// Visual representation of "A + B" column addition. Renders A above B with
// right alignment, then a dashed underline, then the answer row.
//
// Three modes for the answer row:
//   - solved          → render task.answer in green
//   - interactive     → render one <input> per expected digit (boxes), so the
//                       child types the answer directly under the column
//   - display-only    → placeholder dots (fallback when no onChange supplied)

import { useMemo, useRef } from 'react'
import { PALETTE } from './palette'

interface ColumnExpressionProps {
  expr: string
  solved: boolean
  answer: string
  /** Current user input. Required for interactive mode. */
  value?: string
  /** Supplied → interactive (digit boxes). Omitted → display-only dots. */
  onChange?: (v: string) => void
  /** Triggered on Enter in any box. */
  onSubmit?: () => void
  /** Red border on boxes when last submit was wrong. */
  wrong?: boolean
}

const SLOT = 'inline-block w-8 text-center tabular-nums'

export function ColumnExpression({
  expr,
  solved,
  answer,
  value,
  onChange,
  onSubmit,
  wrong,
}: ColumnExpressionProps) {
  const m = expr.match(/^\s*(\d+)\s*\+\s*(\d+)\s*$/)
  const a = m?.[1] ?? ''
  const b = m?.[2] ?? ''
  const expectedLen = answer.length
  const width = Math.max(a.length, b.length, expectedLen)
  const interactive = !solved && typeof onChange === 'function'

  const inputs = useRef<Array<HTMLInputElement | null>>([])
  const digits = useMemo(() => {
    const v = value || ''
    return Array.from({ length: expectedLen }, (_, i) => v[i] || '')
  }, [value, expectedLen])

  if (!m) return null

  const pad = (s: string) => s.padStart(width, ' ')
  const cells = (s: string) =>
    pad(s)
      .split('')
      .map((ch, i) => (
        <span key={i} className={SLOT}>
          {ch === ' ' ? '' : ch}
        </span>
      ))

  function handleDigit(i: number, raw: string) {
    if (!onChange) return
    const ch = raw.replace(/\D/g, '').slice(-1)
    const next = [...digits]
    next[i] = ch
    onChange(next.join(''))
    if (ch && i + 1 < expectedLen) inputs.current[i + 1]?.focus()
  }

  function handleKey(i: number, e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter') {
      e.preventDefault()
      onSubmit?.()
      return
    }
    if (e.key === 'Backspace' && !digits[i] && i > 0) {
      e.preventDefault()
      const prev = [...digits]
      prev[i - 1] = ''
      onChange?.(prev.join(''))
      inputs.current[i - 1]?.focus()
      return
    }
    if (e.key === 'ArrowLeft' && i > 0) inputs.current[i - 1]?.focus()
    if (e.key === 'ArrowRight' && i + 1 < expectedLen) inputs.current[i + 1]?.focus()
  }

  let answerRow: React.ReactNode
  if (solved) {
    answerRow = (
      <div className="flex justify-end" style={{ color: PALETTE.greenDeep }}>
        {cells(answer)}
      </div>
    )
  } else if (interactive) {
    const boxBorder = wrong ? PALETTE.coralDeep : '#B89B5E'
    const boxBg = wrong ? '#FFE4E0' : '#FFFFFF'
    const leadingPads = Math.max(0, width - expectedLen)
    answerRow = (
      <div className="flex justify-end items-center">
        {Array.from({ length: leadingPads }, (_, i) => (
          <span key={`pad-${i}`} className={SLOT} />
        ))}
        {digits.map((d, i) => (
          <span key={i} className={SLOT + ' px-0.5'}>
            <input
              ref={(el) => {
                inputs.current[i] = el
              }}
              type="text"
              inputMode="numeric"
              maxLength={1}
              value={d}
              onChange={(e) => handleDigit(i, e.target.value)}
              onKeyDown={(e) => handleKey(i, e)}
              className="block w-full h-10 rounded-md text-center font-mono text-3xl font-extrabold tabular-nums outline-none transition-colors"
              style={{
                background: boxBg,
                border: `2px solid ${boxBorder}`,
                color: PALETTE.ink,
              }}
              aria-label={`Цифра ${i + 1} из ${expectedLen}`}
            />
          </span>
        ))}
      </div>
    )
  } else {
    answerRow = (
      <div className="flex justify-end" style={{ color: '#D6C9A4' }}>
        {pad('')
          .split('')
          .map((_, i) => (
            <span key={i} className={SLOT}>
              ·
            </span>
          ))}
      </div>
    )
  }

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
      {answerRow}
    </div>
  )
}
