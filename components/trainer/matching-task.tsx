'use client'
// TODO: Phase 8 — consider DnD upgrade via @dnd-kit if click-to-pair proves insufficient
import { useState } from 'react'
import { useLessonBus } from '@/lib/lesson-bus'
import type { TrainerTask } from '@/lib/trainer/config-schema'

type TaskStatus = 'pending' | 'correct' | 'wrong'

interface MatchingTaskProps {
  task: TrainerTask
  onSubmit?: (event: { taskId: string; value: string; correct: boolean }) => void
  /** Optional hint level override from TrainerPanel (trainer:show_hint command). */
  hintLevelOverride?: number
}

// Stable shuffle seeded by task.id — sort characters to avoid Math.random hydration mismatch
function stableSort(items: string[], seed: string): string[] {
  // Sort by (item + seed) string to create a deterministic but shuffled order
  return [...items].sort((a, b) =>
    (a + seed).localeCompare(b + seed)
  )
}

export function MatchingTask({ task, onSubmit, hintLevelOverride }: MatchingTaskProps) {
  const bus = useLessonBus()
  const [status, setStatus] = useState<TaskStatus>('pending')
  const [localHintLevel, setLocalHintLevel] = useState(0)
  const hintLevel = Math.max(localHintLevel, hintLevelOverride ?? 0)
  const [selectedLeft, setSelectedLeft] = useState<string | null>(null)
  const [pairs, setPairs] = useState<Array<[string, string]>>([])

  // task.correct is Array<[string, string]> for matching type
  const correctPairs = task.correct as Array<[string, string]>
  const leftItems = correctPairs.map((p) => p[0])
  const rightItems = stableSort(task.options ?? correctPairs.map((p) => p[1]), task.id)

  const pairedLeftItems = new Set(pairs.map((p) => p[0]))
  const pairedRightItems = new Set(pairs.map((p) => p[1]))

  const handleLeftClick = (item: string) => {
    if (status !== 'pending' || pairedLeftItems.has(item)) return
    setSelectedLeft(item)
  }

  const handleRightClick = (item: string) => {
    if (status !== 'pending' || !selectedLeft || pairedRightItems.has(item)) return

    const newPairs: Array<[string, string]> = [...pairs, [selectedLeft, item]]
    setPairs(newPairs)
    setSelectedLeft(null)

    // Check if all pairs are formed
    if (newPairs.length === correctPairs.length) {
      const isAllCorrect = newPairs.every(([l, r]) =>
        correctPairs.some(([cl, cr]) => cl === l && cr === r)
      )
      const payload = {
        taskId: task.id,
        value: JSON.stringify(newPairs),
        correct: isAllCorrect,
      }
      bus.emit('trainer:answer_submitted', payload)
      onSubmit?.(payload)
      setStatus(isAllCorrect ? 'correct' : 'wrong')
    }
  }

  const handleHintClick = () => {
    const maxHints = task.hints?.length ?? 0
    if (localHintLevel >= 3) {
      console.warn(`[MatchingTask] hintLevel already at max (3) for task ${task.id}`)
      return
    }
    if (localHintLevel < maxHints) {
      const next = localHintLevel + 1
      setLocalHintLevel(next)
      bus.emit('trainer:hint_opened', { taskId: task.id, hintLevel: next })
    }
  }

  const showHintButton = status === 'wrong' && (task.hints?.length ?? 0) > 0 && localHintLevel < (task.hints?.length ?? 0)
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
      data-task-type="matching"
      data-correct={JSON.stringify(task.correct)}
      data-hint-level={hintLevel}
      data-task-status={status}
      className={`flex flex-col gap-2 rounded-md border border-border p-3 ${borderClass}`}
    >
      <p className="text-sm font-medium text-foreground">{task.prompt}</p>

      <div className="flex gap-4">
        {/* Left column */}
        <div className="flex flex-1 flex-col gap-1">
          {leftItems.map((item) => {
            const isPaired = pairedLeftItems.has(item)
            const isSelected = selectedLeft === item
            let cls = 'rounded border px-2 py-1 text-sm cursor-pointer'
            if (isPaired) {
              cls += ' opacity-50 pointer-events-none border-border'
            } else if (isSelected) {
              cls += ' ring-2 ring-blue-500 border-blue-500'
            } else {
              cls += ' border-border hover:bg-accent'
            }
            return (
              <button
                key={item}
                data-left-item={item}
                onClick={() => handleLeftClick(item)}
                disabled={status !== 'pending' || isPaired}
                className={cls}
              >
                {item}
              </button>
            )
          })}
        </div>

        {/* Right column */}
        <div className="flex flex-1 flex-col gap-1">
          {rightItems.map((item) => {
            const isPaired = pairedRightItems.has(item)
            let cls = 'rounded border px-2 py-1 text-sm cursor-pointer text-left'
            if (isPaired) {
              cls += ' opacity-50 pointer-events-none border-border'
            } else if (selectedLeft) {
              cls += ' border-border bg-accent/50 hover:bg-accent'
            } else {
              cls += ' border-border'
            }
            return (
              <button
                key={item}
                data-right-item={item}
                onClick={() => handleRightClick(item)}
                disabled={status !== 'pending' || isPaired}
                className={cls}
              >
                {item}
              </button>
            )
          })}
        </div>
      </div>

      {/* Show formed pairs */}
      {pairs.length > 0 && (
        <div className="text-xs text-muted-foreground">
          {pairs.map(([l, r]) => (
            <span key={`${l}-${r}`} className="mr-2">
              {l} → {r}
            </span>
          ))}
        </div>
      )}

      {status === 'correct' && (
        <p className="text-sm text-green-600">✓ Верно! Все пары совпадают.</p>
      )}

      {status === 'wrong' && (
        <p className="text-sm text-red-600">✗ Не все пары верны.</p>
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
