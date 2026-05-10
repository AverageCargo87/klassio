---
phase: 07-trainer
plan: "01"
subsystem: ui
tags: [zod, lesson-bus, react, vitest, tailwind, trainer, event-bus]

requires:
  - phase: 03-lesson-shell
    provides: LessonBus class, useLessonBus/useLessonBusEvent hooks, LessonBusEvent union

provides:
  - 7 new trainer event/command variants in LessonBusEvent discriminated union
  - TrainerConfig + TrainerTask zod schema with full validation
  - useTrainerIdle hook with 15s idle detection + 30s spam guard
  - TrainerRenderer root component dispatching to 3 task-type components
  - NumericInputTask (numeric input, Russian UI, hint system, bus emit)
  - SingleChoiceTask (button-group options, bus emit on click)
  - MatchingTask (click-to-pair, stable shuffle, pair validation, bus emit on completion)
  - 40 new vitest tests (6 task RED+GREEN cycles); 273 total tests green

affects:
  - 07-02 (TrainerPanel will import TrainerRenderer and subscribe to trainer commands)
  - phase-08 (voice reactions will wire to trainer:answer_submitted events)

tech-stack:
  added: []
  patterns:
    - TDD RED→GREEN for all 3 tasks (test commits precede feat commits)
    - vi.mock('@/lib/lesson-bus') for component isolation — no real LessonBusProvider needed
    - await import() pattern for dynamic module import after vi.mock in tests
    - stable deterministic shuffle seeded by task.id (sort by item+seed) avoids hydration mismatch
    - useRef for mutation-only idle state (lastActivityAt, lastEmitAt, intervalRef) — zero re-renders

key-files:
  created:
    - lib/trainer/config-schema.ts
    - lib/trainer/use-trainer-idle.ts
    - lib/trainer/__tests__/config-schema.test.ts
    - lib/trainer/__tests__/use-trainer-idle.test.ts
    - components/trainer/trainer-renderer.tsx
    - components/trainer/numeric-input-task.tsx
    - components/trainer/single-choice-task.tsx
    - components/trainer/matching-task.tsx
    - components/trainer/__tests__/trainer-renderer.test.tsx
    - components/trainer/__tests__/numeric-input-task.test.tsx
    - components/trainer/__tests__/single-choice-task.test.tsx
    - components/trainer/__tests__/matching-task.test.tsx
  modified:
    - lib/lesson-bus/events.ts
    - lib/lesson-bus/index.ts
    - lib/lesson-bus/__tests__/bus.test.ts

key-decisions:
  - "All 7 trainer event/command types added as named payload type aliases (TrainerAnswerSubmittedPayload etc.) for readability"
  - "trainerConfigSchema uses tasks.min(1) per critical constraint — empty tasks array is a schema error"
  - "useTrainerIdle subscribes to all 4 trainer event types to reset 15s timer (including trainer:idle_15s itself)"
  - "useRef for idle state (not useState) — polling logic needs no re-renders, only side effects"
  - "MatchingTask stable shuffle uses localeCompare(item+seed) — deterministic, no Math.random, SSR-safe"
  - "vi.mock + await import() pattern for task component tests — simpler than LessonBusProvider wrapper"
  - "NumericInputTask disables input+button after correct OR wrong (final answer, per D-07); wrong triggers hint flow"

patterns-established:
  - "Trainer component pattern: 'use client', TrainerTask prop, useLessonBus().emit, data-* attrs on root div"
  - "Task status type: 'pending' | 'correct' | 'wrong' — drives visual state + disabled state"
  - "Hint system: hintLevel state (0..3), incremented by Показать подсказку click, emits trainer:hint_opened"
  - "Test isolation: vi.mock module before await import() avoids circular import issues in vitest"

requirements-completed: [HTM-01]

duration: 6min
completed: 2026-05-10
---

# Phase 7 Plan 01: HTML Trainer — Event Contract + Task Components Summary

**7 trainer bus variants (4 events + 3 commands), zod TrainerConfig schema, useTrainerIdle 15s/30s idle hook, and 3 click-based task-type renderer components with 40 passing vitest tests**

## Performance

- **Duration:** ~6 min
- **Started:** 2026-05-10T06:44:04Z
- **Completed:** 2026-05-10T06:50:55Z
- **Tasks:** 3 (each with TDD RED + GREEN commits)
- **Files modified:** 15 (3 modified, 12 created)

## Accomplishments

- Extended `lib/lesson-bus/events.ts` with 7 trainer-specific discriminated union variants and exported all 7 payload types from index.ts
- Built `trainerConfigSchema` with zod (id, type enum, correct union, hints max-3, tasks min-1) + exported TrainerConfig/TrainerTask types
- Implemented `useTrainerIdle` hook: subscribes to all 4 trainer events via useLessonBusEvent, polls every 5s with useRef state, 15s idle threshold, 30s spam guard, cleanup on unmount
- Created TrainerRenderer root with data-block="trainer", dispatches to all 3 task components via switch
- NumericInputTask: inputmode=numeric, Ответить button, correct/wrong state, hint button (Показать подсказку), trainer:task_focused debounce 300ms, Phase 8 TODO comment
- SingleChoiceTask: options as buttons with data-option, disabled after selection, correct/wrong visual states
- MatchingTask: click-to-pair, stable seed shuffle (no Math.random), paired items marked, fires on all-pairs-formed, Phase 8 DnD upgrade TODO
- 40 new vitest tests (273 total); tsc --noEmit clean; npm run build clean

## Task Commits

Each task followed TDD RED → GREEN cycle:

1. **Task 1: RED — config-schema + use-trainer-idle tests** — `9f41d83` (test)
2. **Task 1: GREEN — events.ts + index.ts + config-schema + use-trainer-idle** — `e2fb6d1` (feat)
3. **Task 2: RED — 3 task component tests** — `32f2dc0` (test)
4. **Task 2: GREEN — NumericInputTask, SingleChoiceTask, MatchingTask** — `8d1911a` (feat)
5. **Task 3: RED — trainer-renderer test** — `38c15d5` (test)
6. **Task 3: GREEN — TrainerRenderer** — `4a29018` (feat)

## Files Created/Modified

- `lib/lesson-bus/events.ts` — +7 trainer payload types + 7 union variants (4 events + 3 commands)
- `lib/lesson-bus/index.ts` — +7 payload type exports
- `lib/lesson-bus/__tests__/bus.test.ts` — +2 trainer round-trip tests (answer_submitted, highlight)
- `lib/trainer/config-schema.ts` — zod schema: trainerTaskSchema, trainerConfigSchema, TrainerTask, TrainerConfig
- `lib/trainer/use-trainer-idle.ts` — idle detection hook with 5s poll, 15s threshold, 30s spam guard
- `lib/trainer/__tests__/config-schema.test.ts` — 8 tests (valid configs, edge cases, rejection cases)
- `lib/trainer/__tests__/use-trainer-idle.test.ts` — 5 tests (vi.useFakeTimers, emit after 15s, reset, spam guard, cleanup)
- `components/trainer/trainer-renderer.tsx` — root dispatch component, data-block="trainer"
- `components/trainer/numeric-input-task.tsx` — numeric input, Russian UI, hint system
- `components/trainer/single-choice-task.tsx` — button-group options, correct/wrong states
- `components/trainer/matching-task.tsx` — click-to-pair, stable shuffle, pair validation
- `components/trainer/__tests__/trainer-renderer.test.tsx` — 7 integration tests
- `components/trainer/__tests__/numeric-input-task.test.tsx` — 6 unit tests
- `components/trainer/__tests__/single-choice-task.test.tsx` — 4 unit tests
- `components/trainer/__tests__/matching-task.test.tsx` — 4 unit tests

## Decisions Made

- **useRef for idle state** — lastActivityAt, lastEmitAt, intervalRef are refs not state. Polling is a side effect; no visual output from useTrainerIdle, so zero re-renders needed.
- **MatchingTask stable shuffle** — `items.sort((a,b) => (a+seed).localeCompare(b+seed))` — deterministic per task.id, SSR-safe (no Math.random hydration mismatch).
- **tasks.min(1) in schema** — empty tasks array rejected per critical constraint #2. Plan action body says no min but critical constraint says min(1) — critical constraint wins.
- **vi.mock + await import() pattern** — mock `@/lib/lesson-bus` before dynamic import of component avoids real provider overhead and circular issues in vitest happy-dom.

## Deviations from Plan

None — plan executed exactly as written. The only minor clarification: `trainerConfigSchema.tasks` uses `.min(1)` per critical_constraints item 2, whereas the plan action body showed the schema without `.min(1)`. Critical constraints take precedence (confirmed by test "rejects config with empty tasks array").

## Issues Encountered

None.

## User Setup Required

None — no external service configuration required.

## Known Stubs

None — all components emit real bus events and read from real TrainerTask props. No hardcoded mock data flows to rendered output.

## Threat Surface Scan

No new network endpoints, auth paths, or trust boundaries introduced. Components are client-only rendering with local state. TrainerConfig zod parse (T-07-01-03) is the only trust boundary, implemented as specified. No threat flags.

## TDD Gate Compliance

All 3 tasks followed RED → GREEN cycle:
- Task 1: `9f41d83` (test) → `e2fb6d1` (feat) ✓
- Task 2: `32f2dc0` (test) → `8d1911a` (feat) ✓
- Task 3: `38c15d5` (test) → `4a29018` (feat) ✓

## Next Phase Readiness

Plan 07-02 can import TrainerRenderer directly:
```typescript
import { TrainerRenderer } from '@/components/trainer/trainer-renderer'
import { trainerConfigSchema } from '@/lib/trainer/config-schema'
```
TrainerPanel will subscribe to `trainer:highlight`, `trainer:show_hint`, `trainer:goto_task` commands.
Lesson page server component will fetch JSON from `lesson.htmlTrainerPath` (public/trainer-configs/), parse with trainerConfigSchema, and pass config down to LessonShell → TrainerPanel → TrainerRenderer.

## Self-Check: PASSED

All 15 files exist. All 6 task commits exist (9f41d83, e2fb6d1, 32f2dc0, 8d1911a, 38c15d5, 4a29018). 273 tests pass. tsc --noEmit clean. npm run build clean.

---
*Phase: 07-trainer*
*Completed: 2026-05-10*
