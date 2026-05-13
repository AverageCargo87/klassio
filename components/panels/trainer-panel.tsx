'use client'
// TODO: Phase 8 — wire voice reactions to trainer:answer_submitted (wrong) via bot commands. See D-21.
//
// TrainerPanel: replaces placeholder with real TrainerRenderer integration (Phase 7 Plan 02).
// - When trainerConfig=null/undefined: shows placeholder (BookOpen icon, Russian hint text).
// - When trainerConfig provided: renders <TrainerRenderer> with all tasks.
// - Always subscribes to 3 bot command types (trainer:highlight, trainer:show_hint, trainer:goto_task).
//   Commands work even in placeholder mode so the panel is ready before config is set.
//
// Phase 8 D-02 (HTM-01 extension): progress UI additive layer.
// - "N из M" counter rendered in CardHeader (right-aligned, muted style)
// - currently active task gets a visible ring (Tailwind ring-2 ring-blue-500) — distinct from
//   the Phase 7 yellow trainer:highlight ring so the two cues do not conflict visually
// - solved tasks get a green ✓ checkmark glyph (DOM-mutated, XSS-safe via createElement+textContent)
// - ANTI-SPEC (D-02): no gamification of any kind — no scoring, no progress meter, no timers
import { useEffect, useRef, useReducer, useCallback } from 'react'
import { BookOpen } from 'lucide-react'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { useLessonBusEvent } from '@/lib/lesson-bus'
import { TrainerRenderer } from '@/components/trainer/trainer-renderer'
import type { TrainerConfig } from '@/lib/trainer/config-schema'

// Phase 8 D-02 helper — applies Tailwind ring classes to the currently active task element,
// removing any previously applied ring. DOM-query based to stay decoupled from TrainerRenderer's
// internal task component implementations (each task component owns its own data-task-id wrapper).
// Ring color is blue-500 to visually distinguish from Phase 7 yellow trainer:highlight.
const RING_CLASSES = ['ring-2', 'ring-blue-500', 'trainer-current']
function applyCurrentRing(container: HTMLDivElement | null, taskId: string): void {
  if (!container) return
  // Remove ring from all previously-marked elements first.
  container.querySelectorAll('.trainer-current').forEach((el) => {
    el.classList.remove(...RING_CLASSES)
  })
  // Apply ring to the new current.
  const next = container.querySelector<HTMLElement>(`[data-task-id="${taskId}"]`)
  if (next) {
    next.classList.add(...RING_CLASSES)
  } else {
    console.warn(`[TrainerPanel] applyCurrentRing — task '${taskId}' not in DOM`)
  }
}

const SOLVED_CLASSES = ['trainer-solved']
function markSolved(container: HTMLDivElement | null, taskId: string): void {
  if (!container) return
  const el = container.querySelector<HTMLElement>(`[data-task-id="${taskId}"]`)
  if (!el) {
    console.warn(`[TrainerPanel] markSolved — task '${taskId}' not in DOM`)
    return
  }
  el.classList.add(...SOLVED_CLASSES)
  el.setAttribute('data-solved', 'true')
  // Insert a small ✓ glyph if not already present (header-level visual cue).
  // Idempotent: the .trainer-solved-mark selector guard prevents duplicate inserts on repeated events.
  // XSS-safe: createElement + textContent (NOT innerHTML); '✓' is a static literal.
  if (!el.querySelector('.trainer-solved-mark')) {
    const mark = document.createElement('span')
    mark.className = 'trainer-solved-mark text-green-600 font-semibold mr-1'
    mark.setAttribute('aria-label', 'решено')
    mark.textContent = '✓'
    el.insertBefore(mark, el.firstChild)
  }
}

// 1-indexed position of currentTaskId in tasks; falls back to 1 if not found.
function computeCurrentIndex(
  currentTaskId: string | null,
  config: TrainerConfig | null | undefined,
): number {
  if (!config?.tasks?.length) return 1
  if (!currentTaskId) return 1
  const idx = config.tasks.findIndex((t) => t.id === currentTaskId)
  return idx >= 0 ? idx + 1 : 1
}

interface TrainerPanelProps {
  lessonId?: string
  trainerConfig?: TrainerConfig | null
}

export function TrainerPanel({ lessonId: _lessonId, trainerConfig }: TrainerPanelProps = {}) {
  // containerRef: allows querySelector scoped to this panel (T-07-02-03: no innerHTML/eval)
  const containerRef = useRef<HTMLDivElement>(null)
  // hintOverrides: Map<taskId, hintLevel> — passed to TrainerRenderer to override per-task hint display
  const hintOverrides = useRef<Map<string, number>>(new Map())

  // Phase 8 D-02: progress-state refs (HTM-01 extension)
  // currentTaskIdRef = "active task in focus" — updated on goto_task and (on mount) initialised
  // to the first config task. Mutations require forceUpdate() to re-render the counter.
  const currentTaskIdRef = useRef<string | null>(null)
  // solvedTaskIdsRef = set of task IDs that have been answered correctly. Idempotent on duplicate adds.
  const solvedTaskIdsRef = useRef<Set<string>>(new Set<string>())

  // forceUpdate: trigger re-render when ref state changes (mutations alone do not cause re-render)
  const [, forceUpdate] = useReducer((x: number) => x + 1, 0)

  // Phase 8 D-02: initialise currentTaskId from the first config task on mount.
  // Only when trainerConfig is provided; placeholder mode leaves currentTaskIdRef null.
  // Dep is the string primitive (task ID), so the effect is stable across re-renders.
  // setTimeout(..., 0) deferred-paint is intentional: TrainerRenderer mounts tasks during the same
  // React commit; ring application must occur AFTER children mount their data-task-id wrappers.
  const firstTaskId = trainerConfig?.tasks?.[0]?.id ?? null
  useEffect(() => {
    if (firstTaskId && currentTaskIdRef.current === null) {
      currentTaskIdRef.current = firstTaskId
      const t = setTimeout(() => {
        applyCurrentRing(containerRef.current, firstTaskId)
        forceUpdate()
      }, 0)
      return () => clearTimeout(t)
    }
  }, [firstTaskId])

  // CRITICAL — Phase 8 UAT fix (browser freeze on Submit button):
  //
  // ALL bus handlers below MUST use useCallback with stable deps. Without stable
  // identities, useLessonBusEvent's useEffect (deps [bus, event, handler]) re-fires
  // off(old)+on(new) on every render. That mutates the LessonBus's handler Set DURING
  // an in-progress emit's `Set.forEach` iteration. Per JS spec, forEach visits values
  // added during iteration — so the new handler gets called too, doing forceUpdate
  // again → another render → another off+on → another visit. INFINITE RECURSION until
  // the browser kills the page.
  //
  // Also REMOVED `flushSync(forceUpdate)` — the synchronous re-render inside the
  // emit's handler loop is the catalyst that turned the subscription-churn into a
  // hot loop. Plain forceUpdate schedules a re-render on the next tick — the UI
  // counter updates within ~16ms which is imperceptible and fully sufficient for
  // the "N из M" indicator.

  // trainer:highlight — adds Tailwind ring classes + trainer-highlight marker class for durationMs
  // elementId must match a data-task-id attribute in the rendered tasks (T-07-02-03: CSS class only)
  // NOTE: Phase 7 yellow ring; distinct from Phase 8 blue current-task ring (RING_CLASSES above).
  const handleHighlight = useCallback(({ elementId, durationMs = 3000 }: { elementId: string; durationMs?: number }) => {
    const el = containerRef.current?.querySelector<HTMLElement>(`[data-task-id="${elementId}"]`)
    if (!el) {
      console.warn(`[TrainerPanel] trainer:highlight — element '${elementId}' not found in DOM`)
      return
    }
    el.classList.add('ring-2', 'ring-yellow-400', 'trainer-highlight')
    setTimeout(() => {
      el.classList.remove('ring-2', 'ring-yellow-400', 'trainer-highlight')
    }, durationMs)
  }, [])
  useLessonBusEvent('trainer:highlight', handleHighlight)

  // trainer:show_hint — overrides hint level for a specific task; TrainerRenderer propagates via prop
  const handleShowHint = useCallback(({ taskId, hintLevel }: { taskId: string; hintLevel: number }) => {
    if (hintLevel > 3) {
      console.warn(`[TrainerPanel] trainer:show_hint — hintLevel ${hintLevel} > 3, ignoring`)
      return
    }
    hintOverrides.current.set(taskId, hintLevel)
    forceUpdate()
  }, [])
  useLessonBusEvent('trainer:show_hint', handleShowHint)

  // trainer:goto_task — scrolls to task element, focuses first interactive child,
  // and (Phase 8 D-02) moves the current-task ring + advances the counter.
  const handleGotoTask = useCallback(({ taskId }: { taskId: string }) => {
    const el = containerRef.current?.querySelector<HTMLElement>(`[data-task-id="${taskId}"]`)
    if (!el) {
      console.warn(`[TrainerPanel] trainer:goto_task — task '${taskId}' not found in DOM`)
      return
    }
    // Phase 7 behavior preserved:
    el.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
    const focusTarget = el.querySelector<HTMLElement>('input, button')
    focusTarget?.focus()
    // Phase 8 D-02 additions: update current-task ref + ring + counter.
    currentTaskIdRef.current = taskId
    applyCurrentRing(containerRef.current, taskId)
    forceUpdate() // async — UI updates next tick; no flushSync (see top of section)
  }, [])
  useLessonBusEvent('trainer:goto_task', handleGotoTask)

  // Phase 8 D-02 + HTM-01 extension: track solved tasks for counter + visual checkmark.
  // Only correct answers are visualised in the panel; incorrect answers are a
  // sendContextualUpdate concern (D-08) handled outside TrainerPanel.
  const handleAnswerSubmitted = useCallback(({ taskId, correct }: { taskId: string; value: string; correct: boolean }) => {
    if (!correct) return
    solvedTaskIdsRef.current.add(taskId)
    markSolved(containerRef.current, taskId)
    forceUpdate() // async — UI counter/checkmark updates next tick
  }, [])
  useLessonBusEvent('trainer:answer_submitted', handleAnswerSubmitted)

  return (
    <Card className="h-full flex flex-col">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center justify-between gap-2 text-base font-medium">
          <span className="flex items-center gap-2">
            <BookOpen className="h-4 w-4" />
            Тренажёр
          </span>
          {trainerConfig?.tasks?.length ? (
            <span className="text-xs font-normal text-muted-foreground" data-trainer-counter>
              {computeCurrentIndex(currentTaskIdRef.current, trainerConfig)} из{' '}
              {trainerConfig.tasks.length}
            </span>
          ) : null}
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
