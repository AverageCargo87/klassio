'use client'
// components/lesson-v2/task-card.tsx
// TaskCard wrapper + 3 subtype renderers (NumericInput, SingleChoice, Matching).
// Ported from Claude Design task-card.jsx.
//
// Phase 4 (Stage 4) integration hook: each TaskCard wraps its content in a div
// with `data-task-id={task.id}` so the existing Phase 7 bus contract (trainer:
// highlight, trainer:goto_task) keeps working. The `onSolve` / `onWrong`
// callbacks also emit trainer:answer_submitted upstream.

import { useState, useRef } from 'react'
import { PALETTE } from './palette'
import type {
  TaskScreen,
  TaskState,
  NumericInputTask,
  SingleChoiceTask,
  MatchingTask,
  SingleChoiceOption,
} from './types'
import { Checkmark, CrossMark, DifficultyBadge, Confetti } from './icons'
import { Hints, Explanation } from './hints'
import { ColumnExpression } from './column-expression'

/* ===================== NumericInput ===================== */

interface NumericInputProps {
  task: NumericInputTask
  solved: boolean
  onSolve: (userAnswer: string) => void
  onWrong: (userAnswer: string) => void
  hintsShown: number
  revealHint: () => void
}

function NumericInput({
  task,
  solved,
  onSolve,
  onWrong,
  hintsShown,
  revealHint,
}: NumericInputProps) {
  const [val, setVal] = useState('')
  const [shake, setShake] = useState(false)
  const [wrong, setWrong] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const hasExpr = Boolean(task.expr)

  function submit() {
    if (solved) return
    const clean = val.replace(/\s+/g, '').replace(/,/g, '.')
    if (!clean) return
    if (clean === task.answer) {
      onSolve(clean)
    } else {
      setWrong(true)
      setShake(true)
      setTimeout(() => setShake(false), 450)
      // auto-reveal next hint
      if (hintsShown < task.hints.length) revealHint()
      onWrong(clean)
    }
  }

  function onKey(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter') submit()
  }

  // Column-with-boxes mode: digit boxes live under the column line inside
  // ColumnExpression. We only render a full-width "Проверить" below it.
  if (hasExpr) {
    return (
      <div className="space-y-5">
        <div className={'flex justify-center ' + (shake ? 'animate-[lpShake_.45s_ease-in-out]' : '')}>
          <ColumnExpression
            expr={task.expr!}
            solved={solved}
            answer={task.answer}
            value={val}
            wrong={wrong}
            onChange={(v) => {
              setVal(v)
              if (wrong) setWrong(false)
            }}
            onSubmit={submit}
          />
        </div>
        {!solved && (
          <button
            onClick={submit}
            className="block mx-auto h-14 px-10 rounded-2xl text-base font-extrabold uppercase tracking-wide transition-transform active:translate-y-0.5 active:shadow-none"
            style={{
              background: PALETTE.blue,
              color: 'white',
              boxShadow: `0 4px 0 ${PALETTE.blueDeep}`,
            }}
          >
            Проверить
          </button>
        )}
      </div>
    )
  }

  // Plain numeric input (no column visual): single text field + Проверить.
  const inputBg = solved ? '#E8F7E6' : wrong ? '#FFE4E0' : '#F7F1E2'
  const inputBorder = solved ? PALETTE.greenDeep : wrong ? PALETTE.coralDeep : '#E1D3B0'

  return (
    <div className="space-y-4">
      <div
        className={
          'flex flex-col sm:flex-row gap-3 items-stretch ' +
          (shake ? 'animate-[lpShake_.45s_ease-in-out]' : '')
        }
      >
        <input
          ref={inputRef}
          type="text"
          inputMode="numeric"
          value={solved ? task.answer : val}
          disabled={solved}
          onChange={(e) => {
            setVal(e.target.value)
            if (wrong) setWrong(false)
          }}
          onKeyDown={onKey}
          placeholder="Твой ответ"
          className="flex-1 h-14 px-5 text-2xl font-extrabold tabular-nums rounded-2xl outline-none transition-colors duration-150 placeholder:font-normal placeholder:text-[18px]"
          style={{
            background: inputBg,
            border: `2.5px solid ${inputBorder}`,
            color: PALETTE.ink,
          }}
        />
        {!solved && (
          <button
            onClick={submit}
            className="h-14 px-7 rounded-2xl text-base font-extrabold uppercase tracking-wide transition-transform active:translate-y-0.5 active:shadow-none"
            style={{
              background: PALETTE.blue,
              color: 'white',
              boxShadow: `0 4px 0 ${PALETTE.blueDeep}`,
            }}
          >
            Проверить
          </button>
        )}
      </div>
    </div>
  )
}

/* ===================== SingleChoice ===================== */

interface SingleChoiceProps {
  task: SingleChoiceTask
  solved: boolean
  onSolve: (userAnswer: string) => void
  onWrong: (userAnswer: string) => void
  hintsShown: number
  revealHint: () => void
}

function SingleChoice({
  task,
  solved,
  onSolve,
  onWrong,
  hintsShown,
  revealHint,
}: SingleChoiceProps) {
  const [wrongKeys, setWrongKeys] = useState<string[]>([])
  const [shakeKey, setShakeKey] = useState<string | null>(null)

  function choose(opt: SingleChoiceOption) {
    if (solved) return
    if (wrongKeys.includes(opt.key)) return
    if (opt.correct) {
      onSolve(opt.label)
    } else {
      setWrongKeys((w) => [...w, opt.key])
      setShakeKey(opt.key)
      setTimeout(() => setShakeKey(null), 450)
      if (hintsShown < task.hints.length) revealHint()
      onWrong(opt.label)
    }
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
      {task.options.map((opt) => {
        const isWrong = wrongKeys.includes(opt.key)
        const isCorrect = solved && opt.correct
        let bg: string = '#FFFFFF'
        let border: string = '#E5DBC2'
        let badgeBg: string = '#F2E9D2'
        let badgeColor: string = PALETTE.sub
        if (isCorrect) {
          bg = '#E8F7E6'
          border = PALETTE.greenDeep
          badgeBg = PALETTE.greenDeep
          badgeColor = 'white'
        } else if (isWrong) {
          bg = '#FFE4E0'
          border = PALETTE.coralDeep
          badgeBg = PALETTE.coralDeep
          badgeColor = 'white'
        }
        return (
          <button
            key={opt.key}
            disabled={solved || isWrong}
            onClick={() => choose(opt)}
            className={
              'text-left rounded-2xl p-4 min-h-[64px] flex gap-3 items-center transition-all duration-150 active:scale-[0.98] disabled:cursor-not-allowed ' +
              (shakeKey === opt.key ? 'animate-[lpShake_.45s_ease-in-out]' : '')
            }
            style={{
              background: bg,
              border: `2.5px solid ${border}`,
              color: PALETTE.ink,
            }}
          >
            <div
              className="shrink-0 w-9 h-9 rounded-xl flex items-center justify-center text-base font-extrabold"
              style={{ background: badgeBg, color: badgeColor }}
            >
              {isCorrect ? <Checkmark /> : isWrong ? <CrossMark /> : opt.key}
            </div>
            <div className="text-[15px] font-semibold leading-snug">{opt.label}</div>
          </button>
        )
      })}
    </div>
  )
}

/* ===================== Matching ===================== */

interface MatchingProps {
  task: MatchingTask
  solved: boolean
  onSolve: (userAnswer: string) => void
  onWrong: (userAnswer: string) => void
  hintsShown: number
  revealHint: () => void
}

function Matching({
  task,
  solved,
  onSolve,
  onWrong,
  hintsShown,
  revealHint,
}: MatchingProps) {
  const [assignments, setAssignments] = useState<Record<string, string>>({})
  const [wrong, setWrong] = useState(false)
  const [shake, setShake] = useState(false)

  function setPair(left: string, right: string) {
    if (solved) return
    setAssignments((a) => ({ ...a, [left]: right }))
    if (wrong) setWrong(false)
  }

  function submit() {
    if (solved) return
    const allFilled = task.pairs.every((p) => assignments[p.left])
    if (!allFilled) return
    const correct = task.pairs.every((p) => assignments[p.left] === p.right)
    const userAnswer = task.pairs.map((p) => `${p.left}→${assignments[p.left]}`).join(', ')
    if (correct) {
      onSolve(userAnswer)
    } else {
      setWrong(true)
      setShake(true)
      setTimeout(() => setShake(false), 450)
      if (hintsShown < task.hints.length) revealHint()
      onWrong(userAnswer)
    }
  }

  return (
    <div className="space-y-4">
      <div className={'space-y-2.5 ' + (shake ? 'animate-[lpShake_.45s_ease-in-out]' : '')}>
        {task.pairs.map((p) => {
          const val = solved ? p.right : assignments[p.left] || ''
          const isCorrectPair = solved || (val && val === p.right)
          const isWrongPair = wrong && val && val !== p.right
          let bg = '#FFFFFF'
          let border = '#E5DBC2'
          if (solved) {
            bg = '#E8F7E6'
            border = PALETTE.greenDeep
          } else if (isWrongPair) {
            bg = '#FFE4E0'
            border = PALETTE.coralDeep
          } else if (isCorrectPair) {
            bg = '#F7F1E2'
            border = '#E1D3B0'
          }
          return (
            <div
              key={p.left}
              className="flex items-center gap-3 rounded-2xl p-3 pl-4 transition-colors"
              style={{ background: bg, border: `2.5px solid ${border}` }}
            >
              <div
                className="w-14 h-14 rounded-xl flex items-center justify-center font-mono text-2xl font-extrabold"
                style={{
                  background: '#FFF8EA',
                  border: '2px dashed #E7D8AE',
                  color: PALETTE.ink,
                }}
              >
                {p.left}
              </div>
              <div className="text-xl" style={{ color: PALETTE.sub }}>
                →
              </div>
              <select
                disabled={solved}
                value={val}
                onChange={(e) => setPair(p.left, e.target.value)}
                className="flex-1 h-12 px-3 rounded-xl text-base font-bold outline-none appearance-none cursor-pointer"
                style={{
                  background: 'white',
                  border: `2px solid ${border}`,
                  color: PALETTE.ink,
                  backgroundImage:
                    "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%237A6E5E' stroke-width='2.5' stroke-linecap='round' stroke-linejoin='round'><path d='M6 9l6 6 6-6'/></svg>\")",
                  backgroundRepeat: 'no-repeat',
                  backgroundPosition: 'right 10px center',
                  backgroundSize: '18px',
                  paddingRight: 36,
                }}
              >
                <option value="" disabled>
                  выбери разряд
                </option>
                {task.rightOptions.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </select>
            </div>
          )
        })}
      </div>
      {!solved && (
        <button
          onClick={submit}
          className="h-14 w-full rounded-2xl text-base font-extrabold uppercase tracking-wide transition-transform active:translate-y-0.5 active:shadow-none"
          style={{
            background: PALETTE.blue,
            color: 'white',
            boxShadow: `0 4px 0 ${PALETTE.blueDeep}`,
          }}
        >
          Проверить
        </button>
      )}
    </div>
  )
}

/* ===================== TaskCard wrapper ===================== */

interface TaskCardProps {
  task: TaskScreen
  index: number
  state: TaskState
  isActive: boolean
  /** Phase 8.7 Stage 4 — Nadya called highlight_trainer_task on this id. */
  isHighlighted?: boolean
  onSolve: (userAnswer: string) => void
  onWrong: (userAnswer: string) => void
  onRevealHint: () => void
}

export function TaskCard({
  task,
  index,
  state,
  isActive,
  isHighlighted = false,
  onSolve,
  onWrong,
  onRevealHint,
}: TaskCardProps) {
  const solved = state.status === 'solved'
  const [pulse, setPulse] = useState(false)
  const [confetti, setConfetti] = useState(false)

  function handleSolve(userAnswer: string) {
    setConfetti(true)
    setTimeout(() => setConfetti(false), 1200)
    setPulse(true)
    setTimeout(() => setPulse(false), 600)
    onSolve(userAnswer)
  }

  let ringStyle: React.CSSProperties = {}
  if (isHighlighted) {
    // Phase 8.7 Stage 4 — Nadya's highlight call gets a distinct yellow glow,
    // visually different from the steady "current" blue ring.
    ringStyle = {
      border: `3px solid ${PALETTE.yellow}`,
      boxShadow: `0 0 0 8px ${PALETTE.yellow}44`,
      animation: 'lpBreathe 1.2s ease-in-out infinite',
    }
  } else if (solved) {
    ringStyle = { border: `2.5px solid ${PALETTE.greenDeep}` }
  } else if (isActive) {
    ringStyle = {
      border: `3px solid ${PALETTE.blue}`,
      boxShadow: `0 0 0 6px ${PALETTE.blue}22`,
      animation: 'lpBreathe 2.2s ease-in-out infinite',
    }
  } else {
    ringStyle = { border: '2px solid #ECDFC2' }
  }

  return (
    <div
      data-task-id={task.id}
      className={
        'relative rounded-3xl bg-white p-5 md:p-7 transition-all ' +
        (pulse ? 'animate-[lpPop_.5s_ease-out]' : '')
      }
      style={{
        ...ringStyle,
        boxShadow: solved
          ? '0 2px 0 #d6e9cf'
          : isActive
            ? `0 0 0 6px ${PALETTE.blue}22`
            : '0 2px 0 #EFE3C5',
      }}
    >
      <Confetti play={confetti} />

      {/* corner solved badge */}
      {solved && (
        <div
          className="absolute -top-3 -right-3 w-10 h-10 rounded-full flex items-center justify-center shadow-md"
          style={{ background: PALETTE.greenDeep }}
        >
          <Checkmark size={22} />
        </div>
      )}

      {/* header */}
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="flex items-center gap-2.5">
          <div
            className="w-9 h-9 rounded-xl flex items-center justify-center text-sm font-extrabold tabular-nums"
            style={{
              background: solved ? PALETTE.greenDeep : isActive ? PALETTE.blue : '#F2E9D2',
              color: solved || isActive ? 'white' : PALETTE.sub,
            }}
          >
            {index + 1}
          </div>
          <DifficultyBadge n={task.difficulty} />
        </div>
        {isActive && !solved && (
          <div
            className="text-[11px] font-extrabold uppercase tracking-wider px-2.5 py-1 rounded-full"
            style={{ background: `${PALETTE.blue}22`, color: PALETTE.blueDeep }}
          >
            Сейчас
          </div>
        )}
      </div>

      {/* prompt */}
      <h3
        className="text-[17px] md:text-lg font-bold leading-snug mb-4"
        style={{ color: PALETTE.ink }}
      >
        {task.prompt}
      </h3>

      {/* type-specific body */}
      {task.type === 'numeric-input' && (
        <NumericInput
          task={task}
          solved={solved}
          onSolve={handleSolve}
          onWrong={onWrong}
          hintsShown={state.hintsShown}
          revealHint={onRevealHint}
        />
      )}
      {task.type === 'single-choice' && (
        <SingleChoice
          task={task}
          solved={solved}
          onSolve={handleSolve}
          onWrong={onWrong}
          hintsShown={state.hintsShown}
          revealHint={onRevealHint}
        />
      )}
      {task.type === 'matching' && (
        <Matching
          task={task}
          solved={solved}
          onSolve={handleSolve}
          onWrong={onWrong}
          hintsShown={state.hintsShown}
          revealHint={onRevealHint}
        />
      )}

      {/* hints */}
      {(state.hintsShown > 0 || (!solved && isActive)) && (
        <div className="mt-4">
          <Hints
            hints={task.hints}
            shown={state.hintsShown}
            onReveal={onRevealHint}
            disabled={solved}
          />
        </div>
      )}

      {/* explanation only when solved */}
      {solved && task.explanation && (
        <div className="mt-4">
          <Explanation text={task.explanation} />
        </div>
      )}
    </div>
  )
}
