'use client'
import type { TrainerConfig } from '@/lib/trainer/config-schema'
import { NumericInputTask } from './numeric-input-task'
import { SingleChoiceTask } from './single-choice-task'
import { MatchingTask }      from './matching-task'

interface TrainerRendererProps {
  config: TrainerConfig
  /** Optional override map from TrainerPanel for trainer:show_hint command.
   * Key: task.id. Value: hintLevel override (merged with component local state via Math.max).
   * Passed by reference — component re-renders when TrainerPanel calls forceUpdate() after mutation.
   */
  hintLevelOverrides?: Map<string, number>
}

export function TrainerRenderer({ config, hintLevelOverrides }: TrainerRendererProps) {
  return (
    <div data-block="trainer" className="flex flex-col gap-4 p-4 h-full">
      <h2 className="text-sm font-semibold text-foreground">{config.title}</h2>
      {config.tasks.map((task) => {
        const hintOverride = hintLevelOverrides?.get(task.id)
        switch (task.type) {
          case 'numeric-input':
            return <NumericInputTask key={task.id} task={task} hintLevelOverride={hintOverride} />
          case 'single-choice':
            return <SingleChoiceTask key={task.id} task={task} hintLevelOverride={hintOverride} />
          case 'matching':
            return <MatchingTask key={task.id} task={task} hintLevelOverride={hintOverride} />
          default:
            // Defensive: unknown task type — skip without crashing
            console.warn(`[TrainerRenderer] Unknown task type: ${(task as { type: string }).type}`)
            return null
        }
      })}
    </div>
  )
}
