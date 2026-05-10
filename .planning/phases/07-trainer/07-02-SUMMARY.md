---
phase: 07-trainer
plan: "02"
subsystem: ui
tags: [react, next.js, zod, lesson-bus, playwright, trainer, config-loader, server-only]

requires:
  - phase: 07-trainer/07-01
    provides: TrainerRenderer, TrainerConfig zod schema, 7 trainer event/command types, 3 task-type components
  - phase: 03-lesson-shell
    provides: LessonBus, LessonBusProvider, useLessonBusEvent hooks

provides:
  - TrainerPanel full rewrite — TrainerRenderer when config provided; 3 bus command subscriptions (highlight, show_hint, goto_task)
  - loadTrainerConfig server-side helper (public/trainer-configs/, zod parse, throws on error)
  - LessonShell trainerConfig optional prop threaded to TrainerPanel
  - Lesson page RSC calls loadTrainerConfig after ownership check; passes to LessonShell
  - 2 sample configs (sample-column-addition.json 5 tasks, sample-fractions.json 3 tasks) both validated against schema
  - admin CLI --trainer-config flag (alias of --trainer); backward compat preserved
  - E2E trainer-panel.spec.ts (3 Playwright specs: card visible, data-block=trainer with config, placeholder without)

affects:
  - phase-08 (voice reactions will subscribe to trainer:answer_submitted events; bot commands already wired)

tech-stack:
  added:
    - server-only (npm package — import guard for config-loader)
  patterns:
    - server-only import guard pattern in RSC helper modules
    - hintLevelOverride prop drilling (TrainerPanel ref map → TrainerRenderer → task components, Math.max with localHintLevel)
    - containerRef scoped querySelector for bus command DOM manipulation (no global query, T-07-02-03)
    - forceUpdate via useReducer for ref-mutation-triggered re-render (hintOverrides Map)
    - config-loader throws (not null) — callers use .catch(() => null) for graceful degradation

key-files:
  created:
    - lib/trainer/config-loader.ts
    - lib/trainer/__tests__/config-loader.test.ts
    - public/trainer-configs/sample-column-addition.json
    - public/trainer-configs/sample-fractions.json
    - e2e/trainer-panel.spec.ts
  modified:
    - components/panels/trainer-panel.tsx
    - components/lesson-shell.tsx
    - app/lesson/[id]/page.tsx
    - components/trainer/trainer-renderer.tsx
    - components/trainer/numeric-input-task.tsx
    - components/trainer/single-choice-task.tsx
    - components/trainer/matching-task.tsx
    - components/lesson-shell/__tests__/panels.test.tsx
    - scripts/admin/create-lesson.ts
    - scripts/seed.ts
    - e2e/lesson-shell.spec.ts

key-decisions:
  - "config-loader throws (not returns null) on error — calling site in page.tsx uses .catch(() => null) for graceful degradation; explicit error semantics are cleaner than silent null"
  - "hintLevelOverride prop threaded via TrainerRenderer to task components using Math.max(localHintLevel, override) — keeps task component local state as source of truth while allowing bot to advance hint display"
  - "server-only package added as devDependency — required to make config-loader import guard work in tests (vi.mock intercepts at module load)"
  - "E2E lesson-shell.spec.ts updated — old counter-based tests replaced with placeholder visibility tests (TrainerPanel no longer has event counter in Phase 7 rewrite)"
  - "Voice integration deferred to Phase 8 — trainer:answer_submitted events are emitted but no voice reactions yet; TODO comment added at top of TrainerPanel"

patterns-established:
  - "TrainerPanel command pattern: useLessonBusEvent for each command type, containerRef.current?.querySelector for scoped DOM access, forceUpdate for ref mutation visibility"
  - "Server config loading pattern: RSC helper (lib/trainer/config-loader.ts) with server-only guard, called in page.tsx after ownership check, result passed as serializable prop to client shell"
  - "hintLevelOverride pattern: Map<taskId, number> ref in panel, passed as prop to renderer, each task uses Math.max(local, override)"

requirements-completed: [HTM-01]

duration: 10min
completed: 2026-05-10
---

# Phase 7 Plan 02: HTML Trainer — Integration (Panel + Config + E2E) Summary

**TrainerPanel wired to TrainerRenderer with 3 bus command subscriptions, server-side config-loader fetching from public/trainer-configs/, 2 valid sample configs, admin CLI --trainer-config flag, and 3 Playwright E2E specs**

## Performance

- **Duration:** ~10 min
- **Started:** 2026-05-10T03:56:11Z
- **Completed:** 2026-05-10T04:06:00Z
- **Tasks:** 3 (Task 1 had TDD RED+GREEN cycle)
- **Files modified:** 14 (5 created, 9 modified)

## Accomplishments

- Full TrainerPanel rewrite: renders TrainerRenderer when trainerConfig prop is provided; shows Russian placeholder when null; subscribes to trainer:highlight (ring-2 ring-yellow-400, CSS class, scoped querySelector), trainer:show_hint (hintLevelOverrides Map, forceUpdate), trainer:goto_task (scrollIntoView + focus first input)
- server-side config-loader: `lib/trainer/config-loader.ts` with `server-only` import guard, reads `public/trainer-configs/<filename>`, zod parses — throws on any error, callers use `.catch(() => null)`
- LessonShell accepts optional `trainerConfig?: TrainerConfig | null` prop and passes it to TrainerPanel
- Lesson page RSC calls `loadTrainerConfig(lesson.htmlTrainerPath).catch(() => null)` after ownership check and passes result to LessonShell
- 2 sample configs created and validated: `sample-column-addition.json` (5 tasks: 2 numeric-input, 1 single-choice, 1 matching, 2 numeric-input) and `sample-fractions.json` (3 tasks: 1 single-choice, 1 numeric-input, 1 matching)
- Admin CLI `--trainer-config` flag added as alias of `--trainer`; help text updated; seed.ts updated to link seed lesson to sample-column-addition.json
- Task components (NumericInputTask, SingleChoiceTask, MatchingTask) extended with `hintLevelOverride` prop
- 280 vitest tests pass (was 273 + 5 config-loader + 2 new panel tests); tsc --noEmit clean; npm run build clean

## Task Commits

1. **Task 1: RED — config-loader + TrainerPanel tests** — `6e491a2` (test)
2. **Task 1: GREEN — config-loader + TrainerPanel rewrite + LessonShell + page.tsx** — `81e2570` (feat)
3. **Task 2: Sample configs + admin CLI + seed update** — `9628b5d` (feat)
4. **Task 3: E2E trainer-panel spec + update lesson-shell spec** — `f2f511a` (feat)

## Files Created/Modified

- `lib/trainer/config-loader.ts` — server-only, reads public/trainer-configs/<filename>, zod parse, throws on error
- `lib/trainer/__tests__/config-loader.test.ts` — 5 tests (valid parse, zod reject, ENOENT, bad JSON, path check)
- `components/panels/trainer-panel.tsx` — full rewrite: TrainerRenderer when config, placeholder when null; 3 bus command subscriptions; containerRef; hintOverrides ref Map
- `components/lesson-shell.tsx` — trainerConfig optional prop added, threaded to TrainerPanel
- `app/lesson/[id]/page.tsx` — loadTrainerConfig called after ownership check, result passed to LessonShell
- `components/trainer/trainer-renderer.tsx` — hintLevelOverrides Map prop, passed per-task to task components
- `components/trainer/numeric-input-task.tsx` — hintLevelOverride prop, Math.max(localHintLevel, override)
- `components/trainer/single-choice-task.tsx` — hintLevelOverride prop, Math.max
- `components/trainer/matching-task.tsx` — hintLevelOverride prop, Math.max
- `components/lesson-shell/__tests__/panels.test.tsx` — 2 new TrainerPanel tests; mock TrainerRenderer; updated existing test text
- `public/trainer-configs/sample-column-addition.json` — 5 tasks, Russian math curriculum, schema-valid
- `public/trainer-configs/sample-fractions.json` — 3 tasks, fraction comparison, schema-valid
- `scripts/admin/create-lesson.ts` — --trainer-config flag (alias of --trainer); help text updated
- `scripts/seed.ts` — seed lesson now includes html_trainer_path = 'sample-column-addition.json'
- `e2e/trainer-panel.spec.ts` — 3 Playwright specs (TRN-01): card heading visible, data-block=trainer with config, placeholder without config
- `e2e/lesson-shell.spec.ts` — 2 tests updated: removed counter-based tests, added placeholder visibility tests

## Decisions Made

- **config-loader throws, not returns null**: Explicit error semantics; callers use `.catch(() => null)` at page.tsx level. This matches Next.js RSC conventions for graceful degradation without silent failures.
- **hintLevelOverride via Math.max**: Task component local state is source of truth; bot override only advances (never retreats) the hint display. This prevents race conditions between local user clicks and bot commands.
- **server-only as devDependency**: Required to allow `vi.mock('server-only', () => ({}))` to intercept in tests. Without the package installed, Vite's module resolution fails even with the mock.
- **E2E lesson-shell.spec.ts updated**: The old event counter tests tested Phase 3/4 placeholder behavior; replacing with Phase 7 placeholder text assertion is a necessary deviation (Rule 1 bug fix — tests would fail E2E after TrainerPanel rewrite).
- **Voice integration deferred to Phase 8**: trainer:answer_submitted events are emitted by task components but no bot reactions are wired yet. Phase 8 TODO comment added at top of trainer-panel.tsx.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Updated existing lesson-shell.spec.ts E2E tests for TrainerPanel rewrite**
- **Found during:** Task 3 (E2E spec creation)
- **Issue:** Two existing E2E tests in lesson-shell.spec.ts checked for "Получено 0 тестовых событий" — text that no longer exists after TrainerPanel rewrite. These would fail E2E.
- **Fix:** Replaced with placeholder visibility tests — "Тренажёр для этого урока ещё не настроен" (when no config) and "Тренажёр" heading visible.
- **Files modified:** e2e/lesson-shell.spec.ts
- **Committed in:** f2f511a (Task 3 commit)

**2. [Rule 2 - Missing Critical] Added hintLevelOverride prop to all 3 task components**
- **Found during:** Task 1 (TrainerPanel rewrite)
- **Issue:** Plan specified trainer:show_hint should override hint level per task; TrainerRenderer needed to propagate the override Map to each task. Without hintLevelOverride prop, the show_hint command would have no effect.
- **Fix:** Added `hintLevelOverride?: number` prop to NumericInputTask, SingleChoiceTask, MatchingTask. Each uses `Math.max(localHintLevel, hintLevelOverride ?? 0)`. Renamed `hintLevel` state variable to `localHintLevel` to avoid conflict.
- **Files modified:** components/trainer/numeric-input-task.tsx, single-choice-task.tsx, matching-task.tsx, trainer-renderer.tsx
- **Committed in:** 81e2570 (Task 1 GREEN commit)

---

**Total deviations:** 2 auto-fixed (1 Rule 1 bug, 1 Rule 2 missing critical)
**Impact on plan:** Both auto-fixes essential for correctness. No scope creep.

## Issues Encountered

- `server-only` package was not installed in node_modules — the `vi.mock('server-only', () => ({}))` in test file failed because Vite's module resolver couldn't find the package even for mocking. Fixed by installing `server-only` as devDependency via `npm install server-only --save-dev`.

## User Setup Required

None — no external service configuration required for this plan.

## Known Stubs

None — TrainerPanel renders real TrainerRenderer when trainerConfig is provided. Sample configs are validated against schema. No hardcoded mock data flows to UI.

## Threat Surface Scan

No new network endpoints or auth paths introduced. The loadTrainerConfig function is server-only (guarded by `server-only` import). Path traversal risk is mitigated by the fixed prefix `public/trainer-configs/` and the fact that html_trainer_path is set by admin CLI only (T-07-02-01). TrainerRenderer and task components are client-only rendering with no new trust boundaries.

## Next Phase Readiness

Phase 8 can wire voice reactions via bot commands:
- `trainer:answer_submitted` events are emitted by task components on every answer
- `trainer:highlight`, `trainer:show_hint`, `trainer:goto_task` commands are subscribed in TrainerPanel
- Phase 8 TODO comment at top of trainer-panel.tsx: "wire voice reactions to trainer:answer_submitted (wrong) via bot commands"

Seed lesson now has `html_trainer_path = 'sample-column-addition.json'` — E2E tests for Phase 8 can navigate to the seed lesson and see live tasks.

## TDD Gate Compliance

Task 1 followed RED → GREEN cycle:
- RED: `6e491a2` (test) — config-loader tests + new panel tests
- GREEN: `81e2570` (feat) — full implementation

Tasks 2 and 3 were not TDD-tagged.

## Self-Check: PASSED

All key files exist:
- FOUND: lib/trainer/config-loader.ts
- FOUND: components/panels/trainer-panel.tsx
- FOUND: components/lesson-shell.tsx
- FOUND: app/lesson/[id]/page.tsx
- FOUND: public/trainer-configs/sample-column-addition.json
- FOUND: public/trainer-configs/sample-fractions.json
- FOUND: e2e/trainer-panel.spec.ts
- FOUND: lib/trainer/__tests__/config-loader.test.ts

All 4 task commits exist: 6e491a2, 81e2570, 9628b5d, f2f511a

280 vitest tests pass. tsc --noEmit clean. npm run build clean.

---
*Phase: 07-trainer*
*Completed: 2026-05-10*
