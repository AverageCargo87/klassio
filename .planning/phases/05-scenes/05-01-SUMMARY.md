---
phase: 05-scenes
plan: 01
subsystem: api
tags: [openai, sse, generators, typescript, scenes, math, russian, tdd]

# Dependency graph
requires:
  - phase: 04-board-deploy
    provides: "drawTools schema (9 primitives), agent loop in route.ts, SSE contract"
provides:
  - "PrimitiveCall + SceneGenerator + SceneName types in lib/board/scenes/types.ts"
  - "sceneRegistry with registerScene/isSceneName/getScene in lib/board/scenes/index.ts"
  - "15 scene tool schemas added to allBoardTools in lib/board/tools.ts"
  - "8 Wave-1 scene generators: explain_column_addition, explain_column_subtraction, explain_fraction_addition, explain_fraction_subtraction, explain_fraction_comparison, explain_fraction_simplification, explain_decimal_addition, explain_percent_calculation"
  - "Server-side scene expansion in route.ts — client receives only primitive tool_use events"
  - "scene_used field on done SSE event for cost monitoring"
  - "Russian scene encouragement section in SYSTEM_PROMPT"
affects: ["05-02", "phase 8 proactive triggers", "SSE contract consumers"]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Generator functions for scene implementations (function*, yield PrimitiveCall)"
    - "Side-effect import registration pattern (registerScene() called at module load)"
    - "Server-side scene expansion before SSE forwarding to client"
    - "Module-level stream factory (_streamFactory) pattern for per-test OpenAI mock override"

key-files:
  created:
    - lib/board/scenes/types.ts
    - lib/board/scenes/index.ts
    - lib/board/scenes/explain-column-addition.ts
    - lib/board/scenes/explain-column-subtraction.ts
    - lib/board/scenes/explain-fraction-addition.ts
    - lib/board/scenes/explain-fraction-subtraction.ts
    - lib/board/scenes/explain-fraction-comparison.ts
    - lib/board/scenes/explain-fraction-simplification.ts
    - lib/board/scenes/explain-decimal-addition.ts
    - lib/board/scenes/explain-percent-calculation.ts
    - lib/board/scenes/__tests__/explain-column-addition.test.ts
    - lib/board/scenes/__tests__/explain-column-subtraction.test.ts
    - lib/board/scenes/__tests__/explain-fraction-addition.test.ts
    - lib/board/scenes/__tests__/explain-fraction-subtraction.test.ts
    - lib/board/scenes/__tests__/explain-fraction-comparison.test.ts
    - lib/board/scenes/__tests__/explain-fraction-simplification.test.ts
    - lib/board/scenes/__tests__/explain-decimal-addition.test.ts
    - lib/board/scenes/__tests__/explain-percent-calculation.test.ts
  modified:
    - lib/board/tools.ts
    - lib/board/index.ts
    - lib/board/__tests__/tools.test.ts
    - app/api/draw/route.ts
    - app/api/draw/__tests__/route.test.ts

key-decisions:
  - "allBoardTools has 24 entries (9 drawTools including finish + 15 sceneTools) — plan said 25 but finish is already in the 9 primitives; tests updated to expect 24"
  - "Scene registry uses side-effect import pattern (registerScene() at module level) to avoid circular imports"
  - "Route uses _streamFactory pattern in tests for per-test OpenAI mock override without re-hoisting vi.mock"
  - "explain_fraction_comparison highlights the larger fraction and emits comparison sign in draw_text"
  - "explain_fraction_simplification shows Euclidean algorithm steps (up to 3 visible lines on canvas)"
  - "explain_decimal_addition uses comma-alignment guide vertical line as key visual"

patterns-established:
  - "Scene file: export function* + registerScene() at bottom — registers on import"
  - "Scene validation: throw TypeError with Russian message for invalid args (T-05-01-01)"
  - "Scene layout: virtual 800x600 canvas, coordinates clamped with Math.max(0,...)/Math.min(800,...)"
  - "Scene structure: say → draw_* → wait (300-800ms) per logical step"
  - "Integration test pattern: _streamFactory module-level variable for stream mock override"

requirements-completed: [BRD-02]

# Metrics
duration: 13min
completed: 2026-05-10
---

# Phase 5 Plan 01: Scene Architecture Summary

**Server-side scene expansion system: 15 explain_* tool schemas + 8 generator implementations + route.ts interception that expands scene calls to primitive SSE events before client delivery**

## Performance

- **Duration:** 13 min
- **Started:** 2026-05-10T03:01:52Z
- **Completed:** 2026-05-10T03:15:00Z
- **Tasks:** 3
- **Files modified:** 19

## Accomplishments

- Scene type system (PrimitiveCall, SceneGenerator, SceneName) + registry (isSceneName/getScene/registerScene) established in lib/board/scenes/
- 15 scene tool schemas added to allBoardTools in tools.ts with Russian LLM-facing descriptions; OpenAI now receives 24 tools in its schema
- 8 Wave-1 scene generators implemented as pure TypeScript generator functions: column arithmetic (add/subtract), fraction arithmetic (add/subtract/compare/simplify), decimal addition, percent calculation — all with Russian text, wait pauses, and coordinate-safe layouts
- Route.ts intercepts explain_* tool calls server-side, expands to primitive SSE events, tracks scene_used — client receives only primitive tool_use events, never raw scene names
- 57 scene unit tests + 3 integration tests (183 total) all passing; npm run build passes

## Task Commits

Each task was committed atomically:

1. **Task 1: Scene architecture (types, registry, 15 schemas, index exports)** - `7714aad` (feat)
2. **Task 2: 8 Wave-1 scene implementations + 57 unit tests** - `8e6ea5a` (feat)
3. **Task 3: Route.ts interception + system prompt + 3 integration tests** - `b840396` (feat)

_Note: All 3 tasks used TDD approach (RED failing tests first, then GREEN implementation)_

## Files Created/Modified

- `lib/board/scenes/types.ts` — PrimitiveCall, PrimitiveName, SceneName (15 names), SceneGenerator types
- `lib/board/scenes/index.ts` — registerScene, isSceneName, getScene, registeredScenes registry
- `lib/board/scenes/explain-column-addition.ts` — digit-by-digit with carry, right-aligned column layout
- `lib/board/scenes/explain-column-subtraction.ts` — borrow marking, same column layout
- `lib/board/scenes/explain-fraction-addition.ts` — LCM common denominator, simplification step
- `lib/board/scenes/explain-fraction-subtraction.ts` — same as addition but minus
- `lib/board/scenes/explain-fraction-comparison.ts` — cross-multiply via LCM, conclusion sign + highlight
- `lib/board/scenes/explain-fraction-simplification.ts` — Euclidean GCD steps, division display
- `lib/board/scenes/explain-decimal-addition.ts` — comma-alignment guide vertical line
- `lib/board/scenes/explain-percent-calculation.ts` — formula → substitute → multiply → divide → result
- `lib/board/scenes/__tests__/` — 8 test files, 57 tests total
- `lib/board/tools.ts` — added SceneToolName, SceneToolSchema, sceneTools (15), allBoardTools (24 total)
- `lib/board/index.ts` — re-exports all scene types and allBoardTools
- `lib/board/__tests__/tools.test.ts` — 6 new tests for allBoardTools/sceneTools (19 total)
- `app/api/draw/route.ts` — scene interception, allBoardTools for openaiTools, scene_used tracking, Russian scene prompt section
- `app/api/draw/__tests__/route.test.ts` — 3 new integration tests (11 total)

## Decisions Made

**allBoardTools count is 24 not 25:** Plan said "9 + 15 + finish = 25" but `finish` is already included in the 9 primitive drawTools. The actual count is 9 drawTools (including finish) + 15 sceneTools = 24. Tests updated to expect 24. The must_haves say "24+ tools" which is satisfied.

**Side-effect import pattern for registry:** Each scene file calls `registerScene()` at module load time as a side effect. Route.ts imports all 8 scene files explicitly, ensuring the registry is populated before any request. This avoids circular imports (types.ts → index.ts → scene files would be circular if done via index.ts).

**Test mock approach via _streamFactory:** Since `vi.mock('openai')` is hoisted globally, overriding the constructor behavior per-test requires a module-level variable (`_streamFactory`) that the mock reads. This avoids needing `vi.resetModules()` per test.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] allBoardTools count corrected from 25 to 24**
- **Found during:** Task 1 (scene architecture)
- **Issue:** Plan specified "25 entries (9 + 15 + finish = 25)" but `finish` is already one of the 9 primitive tools in drawTools — adding 15 sceneTools gives 24 total, not 25
- **Fix:** Updated test assertion to expect 24; documented in key-decisions. The must_haves say "LLM receives 24+ tools" which is satisfied
- **Files modified:** lib/board/__tests__/tools.test.ts
- **Verification:** Test passes with 24 entries

---

**Total deviations:** 1 auto-fixed (Rule 1 - counting bug in plan spec)
**Impact on plan:** Minimal — the actual tool count satisfies the must_haves requirement (24+). Semantically correct.

## Issues Encountered

None — plan executed smoothly. The mock stream pattern for integration tests required a design decision (module-level _streamFactory variable) which worked correctly.

## Threat Surface Scan

No new network endpoints or auth paths introduced. The `scene_used` field on the done SSE event exposes which scene the LLM chose — documented as accepted in T-05-01-04 (information disclosure: acceptable for cost monitoring).

## Known Stubs

None — all 8 scene implementations have complete pedagogical flows with say + draw + wait structure.

## User Setup Required

None — no external service configuration required.

## Next Phase Readiness

- Wave-1 scene infrastructure complete — Wave-2 scenes (plan 05-02) can follow the same generator pattern
- 7 remaining scenes for 05-02: explain_multiplication_grid, explain_long_division, explain_decimal_multiplication, explain_rectangle_area, explain_rectangle_perimeter, explain_simple_equation, explain_arithmetic_mean
- Route.ts already imports stubs for all 15 scene schemas — Wave-2 just needs to add side-effect imports for the 7 remaining scene files
- `isSceneName` checks against the registry (populated scenes only) — Wave-2 scenes won't be callable until they register themselves

---
*Phase: 05-scenes*
*Completed: 2026-05-10*

## Self-Check: PASSED

All files found:
- lib/board/scenes/types.ts: FOUND
- lib/board/scenes/index.ts: FOUND
- lib/board/scenes/explain-column-addition.ts: FOUND
- lib/board/scenes/explain-percent-calculation.ts: FOUND
- lib/board/scenes/__tests__/explain-column-addition.test.ts: FOUND

All commits found:
- 7714aad (Task 1 — scene architecture): FOUND
- 8e6ea5a (Task 2 — 8 scene implementations): FOUND
- b840396 (Task 3 — route.ts interception): FOUND
