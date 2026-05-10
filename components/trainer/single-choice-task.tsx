'use client'
import { useState } from 'react'
import { useLessonBus } from '@/lib/lesson-bus'
import type { TrainerTask } from '@/lib/trainer/config-schema'

type TaskStatus = 'pending' | 'correct' | 'wrong'

interface SingleChoiceTaskProps {
  task: TrainerTask
  onSubmit?: (event: { taskId: string; value: string; correct: boolean }) => void
}

export function SingleChoiceTask({ task, onSubmit }: SingleChoiceTaskProps) {
  const bus = useLessonBus()
  const [status, setStatus] = useState<TaskStatus>('pending')
  const [hintLevel, setHintLevel] = useState(0)
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null)

  const options = task.options ?? []

  const handleOptionClick = (index: number) => {
    if (status !== 'pending') return
    const value = String(index)
    const isCorrect = value === String(task.correct)
    const payload = { taskId: task.id, value, correct: isCorrect }
    bus.emit('trainer:answer_submitted', payload)
    onSubmit?.(payload)
    setSelectedIndex(index)
    setStatus(isCorrect ? 'correct' : 'wrong')
  }

  const handleHintClick = () => {
    const maxHints = task.hints?.length ?? 0
    if (hintLevel >= 3) {
      console.warn(`[SingleChoiceTask] hintLevel already at max (3) for task ${task.id}`)
      return
    }
    if (hintLevel < maxHints) {
      const next = hintLevel + 1
      setHintLevel(next)
      bus.emit('trainer:hint_opened', { taskId: task.id, hintLevel: next })
    }
  }

  const showHintButton = status === 'wrong' && (task.hints?.length ?? 0) > 0 && hintLevel < (task.hints?.length ?? 0)
  const currentHint = hintLevel > 0 ? task.hints?.[hintLevel - 1] : null

  const borderClass =
    status === 'correct'
      ? 'ring-2 ring-green-500'
      : status === 'wrong'
        ? 'ring-2 ring-red-500'
        : ''

  return (
    <div
      data-task-id={task.id}
      data-task-type="single-choice"
      data-correct={String(task.correct)}
      data-hint-level={hintLevel}
      data-task-status={status}
      className={`flex flex-col gap-2 rounded-md border border-border p-3 ${borderClass}`}
    >
      <p className="text-sm font-medium text-foreground">{task.prompt}</p>

      <div className="flex flex-col gap-1">
        {options.map((option, index) => {
          const isSelected = selectedIndex === index
          const isCorrectOption = String(index) === String(task.correct)
          let optionClass = 'rounded border px-3 py-1 text-sm text-left'
          if (status !== 'pending') {
            if (isSelected && isCorrectOption) {
              optionClass += ' border-green-500 bg-green-50 text-green-700'
            } else if (isSelected && !isCorrectOption) {
              optionClass += ' border-red-500 bg-red-50 text-red-700'
            } else {
              optionClass += ' border-border opacity-50'
            }
          } else {
            optionClass += ' border-border hover:bg-accent'
          }

          return (
            <button
              key={index}
              data-option={String(index)}
              onClick={() => handleOptionClick(index)}
              disabled={status !== 'pending'}
              className={optionClass}
            >
              {option}
            </button>
          )
        })}
      </div>

      {status === 'correct' && (
        <p className="text-sm text-green-600">✓ Верно!</p>
      )}

      {status === 'wrong' && (
        <p className="text-sm text-red-600">✗ Неверно.</p>
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
