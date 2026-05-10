'use client'
import type { TrainerConfig } from '@/lib/trainer/config-schema'
import { NumericInputTask } from './numeric-input-task'
import { SingleChoiceTask } from './single-choice-task'
import { MatchingTask }      from './matching-task'

interface TrainerRendererProps {
  config: TrainerConfig
}

export function TrainerRenderer({ config }: TrainerRendererProps) {
  return (
    <div data-block="trainer" className="flex flex-col gap-4 p-4 overflow-y-auto h-full">
      <h2 className="text-sm font-semibold text-foreground">{config.title}</h2>
      {config.tasks.map((task) => {
        switch (task.type) {
          case 'numeric-input':
            return <NumericInputTask key={task.id} task={task} />
          case 'single-choice':
            return <SingleChoiceTask key={task.id} task={task} />
          case 'matching':
            return <MatchingTask key={task.id} task={task} />
          default:
            // Defensive: unknown task type — skip without crashing
            console.warn(`[TrainerRenderer] Unknown task type: ${(task as { type: string }).type}`)
            return null
        }
      })}
    </div>
  )
}
