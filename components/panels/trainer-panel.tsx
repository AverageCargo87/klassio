'use client'
// TODO: Phase 8 — wire voice reactions to trainer:answer_submitted (wrong) via bot commands. See D-21.
//
// TrainerPanel: replaces placeholder with real TrainerRenderer integration (Phase 7 Plan 02).
// - When trainerConfig=null/undefined: shows placeholder (BookOpen icon, Russian hint text).
// - When trainerConfig provided: renders <TrainerRenderer> with all tasks.
// - Always subscribes to 3 bot command types (trainer:highlight, trainer:show_hint, trainer:goto_task).
//   Commands work even in placeholder mode so the panel is ready before config is set.
import { useRef, useReducer } from 'react'
import { BookOpen } from 'lucide-react'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { useLessonBusEvent } from '@/lib/lesson-bus'
import { TrainerRenderer } from '@/components/trainer/trainer-renderer'
import type { TrainerConfig } from '@/lib/trainer/config-schema'

interface TrainerPanelProps {
  lessonId?: string
  trainerConfig?: TrainerConfig | null
}

export function TrainerPanel({ lessonId: _lessonId, trainerConfig }: TrainerPanelProps = {}) {
  // containerRef: allows querySelector scoped to this panel (T-07-02-03: no innerHTML/eval)
  const containerRef = useRef<HTMLDivElement>(null)
  // hintOverrides: Map<taskId, hintLevel> — passed to TrainerRenderer to override per-task hint display
  const hintOverrides = useRef<Map<string, number>>(new Map())
  // forceUpdate: trigger re-render when hintOverrides changes (ref mutations do not cause re-render)
  const [, forceUpdate] = useReducer((x: number) => x + 1, 0)

  // trainer:highlight — adds Tailwind ring classes + trainer-highlight marker class for durationMs
  // elementId must match a data-task-id attribute in the rendered tasks (T-07-02-03: CSS class only)
  useLessonBusEvent('trainer:highlight', ({ elementId, durationMs = 3000 }) => {
    const el = containerRef.current?.querySelector<HTMLElement>(`[data-task-id="${elementId}"]`)
    if (!el) {
      console.warn(`[TrainerPanel] trainer:highlight — element '${elementId}' not found in DOM`)
      return
    }
    el.classList.add('ring-2', 'ring-yellow-400', 'trainer-highlight')
    setTimeout(() => {
      el.classList.remove('ring-2', 'ring-yellow-400', 'trainer-highlight')
    }, durationMs)
  })

  // trainer:show_hint — overrides hint level for a specific task; TrainerRenderer propagates via prop
  useLessonBusEvent('trainer:show_hint', ({ taskId, hintLevel }) => {
    if (hintLevel > 3) {
      console.warn(`[TrainerPanel] trainer:show_hint — hintLevel ${hintLevel} > 3, ignoring`)
      return
    }
    hintOverrides.current.set(taskId, hintLevel)
    forceUpdate()
  })

  // trainer:goto_task — scrolls to task element and focuses first interactive child
  useLessonBusEvent('trainer:goto_task', ({ taskId }) => {
    const el = containerRef.current?.querySelector<HTMLElement>(`[data-task-id="${taskId}"]`)
    if (!el) {
      console.warn(`[TrainerPanel] trainer:goto_task — task '${taskId}' not found in DOM`)
      return
    }
    el.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
    const focusTarget = el.querySelector<HTMLElement>('input, button')
    focusTarget?.focus()
  })

  return (
    <Card className="h-full flex flex-col">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base font-medium">
          <BookOpen className="h-4 w-4" />
          Тренажёр
        </CardTitle>
      </CardHeader>
      <CardContent className="flex-1 flex flex-col min-h-0 overflow-hidden p-0">
        <div ref={containerRef} className="h-full overflow-y-auto">
          {trainerConfig ? (
            <TrainerRenderer config={trainerConfig} hintLevelOverrides={hintOverrides.current} />
          ) : (
            <div className="flex flex-col items-center justify-center gap-2 text-muted-foreground h-full p-4">
              <BookOpen className="h-10 w-10 opacity-20" />
              <p className="text-sm text-center">
                Тренажёр для этого урока ещё не настроен
              </p>
              <p className="text-xs text-center text-muted-foreground/60">
                Для добавления тренажёра используй: npm run admin:create-lesson -- --trainer-config &lt;filename&gt;
              </p>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
