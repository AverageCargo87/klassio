'use client'
import { useState } from 'react'
import { useLessonBus } from '@/lib/lesson-bus'
import type { TrainerTask } from '@/lib/trainer/config-schema'

type TaskStatus = 'pending' | 'correct' | 'wrong'

interface NumericInputTaskProps {
  task: TrainerTask
  onSubmit?: (event: { taskId: string; value: string; correct: boolean }) => void
  /** Optional hint level override from TrainerPanel (trainer:show_hint command). */
  hintLevelOverride?: number
}

export function NumericInputTask({ task, onSubmit, hintLevelOverride }: NumericInputTaskProps) {
  const bus = useLessonBus()
  const [inputValue, setInputValue] = useState('')
  const [status, setStatus] = useState<TaskStatus>('pending')
  const [localHintLevel, setLocalHintLevel] = useState(0)
  // Effective hint level: max of local and override (bot can advance hint display)
  const hintLevel = Math.max(localHintLevel, hintLevelOverride ?? 0)

  // TODO: Phase 8 — bot voice reaction to trainer:answer_submitted (wrong) — see D-21
  const handleSubmit = () => {
    const trimmed = inputValue.trim()
    const isCorrect = trimmed === String(task.correct)
    const payload = { taskId: task.id, value: trimmed, correct: isCorrect }
    bus.emit('trainer:answer_submitted', payload)
    onSubmit?.(payload)
    setStatus(isCorrect ? 'correct' : 'wrong')
  }

  const handleHintClick = () => {
    const maxHints = task.hints?.length ?? 0
    if (localHintLevel >= 3) {
      console.warn(`[NumericInputTask] hintLevel already at max (3) for task ${task.id}`)
      return
    }
    if (localHintLevel < maxHints) {
      const next = localHintLevel + 1
      setLocalHintLevel(next)
      bus.emit('trainer:hint_opened', { taskId: task.id, hintLevel: next })
    }
  }

  const handleFocus = () => {
    setTimeout(() => {
      bus.emit('trainer:task_focused', { taskId: task.id })
    }, 300)
  }

  const borderClass =
    status === 'correct'
      ? 'ring-2 ring-green-500'
      : status === 'wrong'
        ? 'ring-2 ring-red-500 animate-bounce'
        : ''

  const currentHint = hintLevel > 0 ? task.hints?.[hintLevel - 1] : null
  const showHintButton = status === 'wrong' && (task.hints?.length ?? 0) > 0 && localHintLevel < (task.hints?.length ?? 0)

  return (
    <div
      data-task-id={task.id}
      data-task-type="numeric-input"
      data-correct={String(task.correct)}
      data-hint-level={hintLevel}
      data-task-status={status}
      className={`flex flex-col gap-2 rounded-md border border-border p-3 ${borderClass}`}
    >
      <p className="text-sm font-medium text-foreground">{task.prompt}</p>

      <div className="flex gap-2">
        <input
          type="text"
          inputMode="numeric"
          pattern="[0-9.,]+"
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onFocus={handleFocus}
          disabled={status !== 'pending'}
          aria-label="Ответ"
          className="flex-1 rounded border border-input px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50"
        />
        <button
          onClick={handleSubmit}
          onFocus={handleFocus}
          disabled={status !== 'pending'}
          className="rounded bg-primary px-3 py-1 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
        >
          Ответить
        </button>
      </div>

      {status === 'correct' && (
        <p className="text-sm text-green-600">✓ Верно!</p>
      )}

      {status === 'wrong' && (
        <p className="text-sm text-red-600">✗ Неверно. Попробуй ещё раз.</p>
      )}

      {showHintButton && (
        <button
          onClick={handleHintClick}
          className="self-start rounded border border-border px-2 py-1 text-xs text-muted-foreground hover:bg-accent"
        >
          Показать подсказку
        </button>
      )}

      {currentHint && (
        <p className="rounded bg-muted px-2 py-1 text-xs text-muted-foreground">
          💡 {currentHint}
        </p>
      )}
    </div>
  )
}
