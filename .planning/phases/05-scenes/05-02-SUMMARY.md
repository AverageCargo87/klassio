---
phase: 05-scenes
plan: 02
subsystem: api
tags: [scenes, generators, tdd, openai, sse, typescript]

# Dependency graph
requires:
  - phase: 05-01
    provides: scene registry (registerScene/getScene/isSceneName), types.ts (PrimitiveCall/SceneName/SceneGenerator), 8 Wave-1 scene files, route.ts agent loop with scene interception already wired

provides:
  - 7 new scene generator files in lib/board/scenes/ (Wave 2: multiplication grid, long division, decimal multiplication, rectangle area, rectangle perimeter, simple equation, arithmetic mean)
  - All 15 SceneName entries now registered in sceneRegistry when route.ts loads
  - 50 new unit tests across 7 scene test files + 1 integration test in route.test.ts
  - route.ts with complete 15-scene side-effect import block

affects:
  - Phase 6 (voice — scene system complete; bot can explain full 5th-grade curriculum)
  - Phase 8 (Pedagogical LLM — scene catalog feeds lesson planning decisions)
  - Phase 11 (stroke-drawing — scene timing gaps can be used for SSML sync)
  - Phase 12 (QA dry-run — BRD-02 acceptance criteria now all satisfied)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Scene generator: function* with unknown args cast, TypeError validation, registerScene() at module end"
    - "TDD RED→GREEN: test files written before implementation, verified to fail, then implementation added"
    - "Side-effect import pattern: route.ts imports scenes only for registry side effects; no named imports"
    - "Canvas coordinate safety: all x/y capped with Math.min(800)/Math.min(600), floored with Math.max(0)"

key-files:
  created:
    - lib/board/scenes/explain-multiplication-grid.ts
    - lib/board/scenes/explain-long-division.ts
    - lib/board/scenes/explain-decimal-multiplication.ts
    - lib/board/scenes/explain-rectangle-area.ts
    - lib/board/scenes/explain-rectangle-perimeter.ts
    - lib/board/scenes/explain-simple-equation.ts
    - lib/board/scenes/explain-arithmetic-mean.ts
    - lib/board/scenes/__tests__/explain-multiplication-grid.test.ts
    - lib/board/scenes/__tests__/explain-long-division.test.ts
    - lib/board/scenes/__tests__/explain-decimal-multiplication.test.ts
    - lib/board/scenes/__tests__/explain-rectangle-area.test.ts
    - lib/board/scenes/__tests__/explain-rectangle-perimeter.test.ts
    - lib/board/scenes/__tests__/explain-simple-equation.test.ts
    - lib/board/scenes/__tests__/explain-arithmetic-mean.test.ts
  modified:
    - app/api/draw/route.ts (added 7 Wave-2 side-effect imports + updated comment)
    - app/api/draw/__tests__/route.test.ts (added explain_long_division integration test + Wave-2 beforeAll imports)

key-decisions:
  - "explainSimpleEquation accepts type='multiply'|'add' discriminant rather than inferring from coefficient sign — cleaner LLM schema, unambiguous validation"
  - "explainDecimalMultiplication formats result with toFixed(totalDec) and strips trailing zeros — avoids floating-point display artifacts like 3.5999... without special-casing each number"
  - "explainLongDivision skips leading digit groups that are less than divisor in first position (standard Russian уголок behavior) — quotient never starts with a leading zero digit"
  - "Rectangle visual size capped at 280x180 px with Math.max(60,width*20) floor — ensures visible rectangle even for width=height=1"

patterns-established:
  - "Wave-N scene pattern: each scene validates args → yields say → yields draw_* + wait interleaved → yields highlight_region → yields concluding say"
  - "Scene test pattern: 6-7 tests per file covering count>=N, first=say, result in texts, canvas bounds, TypeError on bad input, edge case"

requirements-completed: [BRD-02]

# Metrics
duration: 6min
completed: 2026-05-10
---

# Phase 05 Plan 02: Scene Wave 2 Summary

**7 remaining explain_* scene generators implemented (multiplication grid, long division, decimal multiplication, rectangle geometry, simple equation, arithmetic mean), completing all 15 BRD-02 scenes and wiring them all into route.ts**

## Performance

- **Duration:** ~6 min
- **Started:** 2026-05-10T06:20:21Z
- **Completed:** 2026-05-10T06:26:53Z
- **Tasks:** 3 (Task 1: 2 complex scenes + tests; Task 2: 5 scenes + tests + route wiring; Task 3: verification + ROADMAP)
- **Files modified:** 16 (14 created, 2 modified)

## Accomplishments

- All 7 Wave-2 scene files implemented as TDD (RED tests written first, verified to fail, then GREEN implementation added)
- 50 new unit tests across 7 scene files + 1 integration test in route.test.ts = 233 total tests (up from 183)
- route.ts now imports all 15 scenes as side effects; sceneRegistry complete
- BRD-02 acceptance criteria all satisfied: 15 scenes, pedagogical step-sequences, scene_used tracking, cost within watermark
- `npm run build` passes; `tsc --noEmit` clean

## Task Commits

1. **Task 1: explain_multiplication_grid + explain_long_division + 13 tests** - `4fb8817` (feat)
2. **Task 2: 5 remaining scenes + route.ts wiring + 37 tests** - `2d551cc` (feat)
3. **Task 3: ROADMAP update + final verification** — included in metadata commit

## Files Created/Modified

- `lib/board/scenes/explain-multiplication-grid.ts` — column multiplication with partial products (≥20 primitives per run)
- `lib/board/scenes/explain-long-division.ts` — Russian уголок long division, bracket visual, step-by-step subtraction (≥20 primitives)
- `lib/board/scenes/explain-decimal-multiplication.ts` — multiply as integers then place decimal, shows place-count arithmetic
- `lib/board/scenes/explain-rectangle-area.ts` — visual rectangle via draw_rectangle, S = w × h formula
- `lib/board/scenes/explain-rectangle-perimeter.ts` — visual rectangle, P = 2(w+h) formula with intermediate sum step
- `lib/board/scenes/explain-simple-equation.ts` — solves c·x=v ('multiply') or x+c=v ('add') with verification step
- `lib/board/scenes/explain-arithmetic-mean.ts` — sum expression + count division for 2-8 numbers
- `lib/board/scenes/__tests__/explain-*.test.ts` (7 files) — 6-8 assertions each
- `app/api/draw/route.ts` — 7 Wave-2 side-effect imports added
- `app/api/draw/__tests__/route.test.ts` — explain_long_division integration test + Wave-2 scene beforeAll imports

## Decisions Made

- `explainSimpleEquation` takes explicit `type: 'multiply' | 'add'` discriminant. This keeps LLM schema unambiguous and avoids coefficient-sign inference heuristics.
- `explainDecimalMultiplication` uses `intProduct / 10^totalDec` and displays with `toFixed(totalDec)` stripping trailing zeros — sidesteps T-05-02-04 floating-point display issue at MVP stage (noted in threat model as `accept`).
- Long division skips leading digits that are smaller than divisor — matches standard Russian curriculum (уголок) where the first quotient group collects leftmost digits until sum >= divisor.

## Deviations from Plan

None — plan executed exactly as written. All 7 scenes, all tests, all route wiring completed per spec.

## Cost Watermark Notes (for Phase 8 context)

**Token budget impact of 15-scene tool catalog:**

- Each OpenAI API call now sends 24 tool descriptions (9 primitives + 15 scene tools) vs 9 in baseline.
- Estimated extra prompt tokens per turn: ~750 tokens (15 scene descriptions × ~50 tokens each).
- With prompt caching (OpenAI caches system prompt + tool descriptions across turns), only the first turn pays the full 750-token overhead. Subsequent turns in the same agent loop hit the cache.
- Scene call output cost: LLM emits ~10-30 output tokens for a scene call (e.g., `explain_long_division({"dividend":846,"divisor":4})`). Server-side expansion to 25-40 primitives means the LLM never emits those 25-40 primitive calls as output tokens. Net output token reduction: ~80-90% vs raw primitive approach.
- Estimated cost per scene разбор on gpt-4o-mini: 750 extra prompt tokens × $0.15/1M = +$0.00011 per turn overhead, amortized by caching → negligible. Output savings from scene calls offset the tool-description cost within 1-2 turns.
- Phase 8 optimization target: if 24-tool prompt is uncached on first call, consider prompt caching guarantee or tool-list compression for Pedagogical LLM (which sees full lesson history and may have larger context).

## Known Stubs

None — all 15 scenes produce real computed output from their arguments. No hardcoded placeholder text.

## Threat Flags

None — no new network endpoints, no new auth paths, no schema changes. All new code is pure generator functions registered at module load time.

## Self-Check

### Created files exist:
- lib/board/scenes/explain-multiplication-grid.ts: FOUND
- lib/board/scenes/explain-long-division.ts: FOUND
- lib/board/scenes/explain-decimal-multiplication.ts: FOUND
- lib/board/scenes/explain-rectangle-area.ts: FOUND
- lib/board/scenes/explain-rectangle-perimeter.ts: FOUND
- lib/board/scenes/explain-simple-equation.ts: FOUND
- lib/board/scenes/explain-arithmetic-mean.ts: FOUND

### Commits exist:
- 4fb8817: FOUND (feat(05-02): implement explain_multiplication_grid and explain_long_division)
- 2d551cc: FOUND (feat(05-02): implement 5 remaining scenes + wire all 7 into route.ts)

### Test suite: 233 passed (33 test files) — PASSED

### Build: npm run build exits 0 — PASSED

### TypeScript: npx tsc --noEmit exits 0 — PASSED

## Self-Check: PASSED

---
*Phase: 05-scenes*
*Completed: 2026-05-10*
