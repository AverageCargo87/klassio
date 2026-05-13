---
phase: 08-agent-control
plan: 01
subsystem: testing
tags: [vitest, playwright, tdd, nyquist, lesson-bus, client-tools, sendContextualUpdate, ts-expect-error]

# Dependency graph
requires:
  - phase: 06-voice
    provides: VoicePanel + @elevenlabs/react useConversation integration (extension point)
  - phase: 07-trainer
    provides: TrainerPanel + trainer event/command lesson bus contract
provides:
  - "lib/lesson-bus/events.ts extended with board:draw_request + board:clear_request variants"
  - "11 Wave 0 RED test scaffolds (7 lib + 3 component + 1 E2E) establishing GREEN targets for plans 08-02..08-08"
  - "Nyquist RED-before-GREEN gate satisfied for LLM-01, PED-02, HTM-01 across all downstream Phase 8 waves"
affects: [08-02, 08-03, 08-04, 08-05, 08-06, 08-07, 08-08]

# Tech tracking
tech-stack:
  added: []  # No new dependencies; uses existing vitest 4.x + Playwright 1.59 + @testing-library/react
  patterns:
    - "@ts-expect-error markers on Wave 0 RED imports — auto-removed when modules land"
    - "Wave 0 RED scaffold convention: file lands, vitest fails at import, TSC passes"
    - "Plural Wave 0 stub files (proactive-triggers-{visibility,mistakes}) for fine-grained PED-02 coverage gates"

key-files:
  created:
    - lib/__tests__/client-tool-handlers.test.ts
    - lib/__tests__/contextual-update-formatters.test.ts
    - lib/__tests__/lesson-state.test.ts
    - lib/__tests__/periodic-checkpoint.test.ts
    - lib/__tests__/proactive-triggers-visibility.test.ts
    - lib/__tests__/proactive-triggers-mistakes.test.ts
    - scripts/__tests__/restore-agent-config.test.ts
    - components/panels/__tests__/voice-panel-tools.test.tsx
    - components/panels/__tests__/voice-panel-subs.test.tsx
    - components/panels/__tests__/trainer-panel-progress.test.tsx
    - e2e/voice-agent-tools.spec.ts
  modified:
    - lib/lesson-bus/events.ts
    - lib/lesson-bus/index.ts

key-decisions:
  - "Used @ts-expect-error to suppress TS2307 'Cannot find module' on Wave 0 RED imports — satisfies success criterion 'tsc --noEmit exits 0' while preserving the runtime vitest RED contract"
  - "Inline type-casts (PHASE_8_TOOLS as Array<…>) in scripts/__tests__/restore-agent-config.test.ts to satisfy noImplicitAny without polluting the not-yet-existing module's contract"
  - "E2E spec uses test.fixme() for all 5 scenarios — Wave 5 plan 08-08 implements the SDK stubbing harness; current state documents the contract without executing"

patterns-established:
  - "Wave 0 RED contract: TS2307 errors suppressed with @ts-expect-error (line-targeted, NOT block-targeted) so the suppression flips to 'unused' error when the module lands — forces removal in Wave 1+"
  - "Negative-space tests pass at RED state: assertions like 'task_focused is NOT subscribed' or 'no useEffect([conversation])' verify absence — these flip to RED if downstream wave accidentally introduces forbidden patterns"
  - "Bus event additions are additive-only — new union variants do not affect existing consumers; barrel exports follow established Phase 3/7/9 comment pattern"

requirements-completed: []  # No requirements marked complete — Wave 0 scaffolds set up the GREEN targets that future plans (08-02..08-08) will satisfy to complete LLM-01, PED-02, HTM-01

# Metrics
duration: ~16min
completed: 2026-05-13
---

# Phase 8 Plan 01: Wave 0 RED-state foundation Summary

**Two new bus event types (board:draw_request, board:clear_request) plus 11 Wave 0 RED test scaffolds locking in the Nyquist GREEN targets for Phase 8 plans 08-02 through 08-08 — TSC clean via @ts-expect-error, runtime vitest fails as designed.**

## Performance

- **Duration:** ~16 min
- **Started:** 2026-05-13T14:24:00Z (approximate, before plan execution)
- **Completed:** 2026-05-13T14:40:13Z
- **Tasks:** 3 (all committed atomically)
- **Files modified:** 2 (lib/lesson-bus/events.ts, lib/lesson-bus/index.ts)
- **Files created:** 11 (7 lib RED + 3 component RED + 1 E2E RED scaffold)

## Accomplishments

- **Lesson bus extended (OQ-1 + OQ-6 resolution):** Added `BoardDrawRequestPayload` and `BoardClearRequestPayload` type aliases plus their union variants. VoicePanel will emit `board:draw_request` / `board:clear_request` from Phase 8 client tools; BoardPanel subscribes (Wave 2 plan 08-05). Avoids exposing tldraw Editor across the React tree.
- **Wave 0 Nyquist gate satisfied:** All 11 test files (LLM-01, PED-02, HTM-01) land with imports that target Wave 1+ modules. Tests fail RED at vitest runtime (vite cannot resolve imports), but TSC passes via line-targeted `@ts-expect-error`. When future plans create the missing modules, the `@ts-expect-error` markers become "unused suppression" errors — forcing their removal, ensuring the RED→GREEN handover is mechanical.
- **PED-02 fine-grained coverage:** Per plan-checker iteration 1 revision, the PED-02 proactive triggers are split across two stub files (`proactive-triggers-visibility.test.ts` + `proactive-triggers-mistakes.test.ts`) so plan 08-08 has independent visibility and consecutive-mistakes GREEN targets.

## Task Commits

Each task was committed atomically:

1. **Task 1: Add board:draw_request + board:clear_request event types** — `6626fd4` (feat)
2. **Task 2: 7 RED test scaffolds for lib utilities + restore script** — `fd2a2ed` (test)
3. **Task 3: 4 RED test scaffolds for components + E2E** — `f7b6a5a` (test)

**Plan metadata:** to be added in final commit.

## Files Created/Modified

### Modified

- `lib/lesson-bus/events.ts` (+11 lines) — Added BoardDrawRequestPayload, BoardClearRequestPayload type aliases + 2 new variants in LessonBusEvent union.
- `lib/lesson-bus/index.ts` (+3 lines) — Re-export both new payload types from the barrel.

### Created (RED scaffolds)

| File | Lines | Target plan | Covers |
|------|-------|-------------|--------|
| `lib/__tests__/client-tool-handlers.test.ts` | 105 | 08-02 | LLM-01: 6 client tools, fire-and-forget, mini-recap ordering, taskId validation |
| `lib/__tests__/contextual-update-formatters.test.ts` | 67 | 08-02 | PED-02 + HTM-01: 5 formatters (Russian) + task_focused allow-list discipline |
| `lib/__tests__/lesson-state.test.ts` | 37 | 08-02 | LLM-01 + D-03: snapshot format, mistakes truncation, single-line |
| `lib/__tests__/periodic-checkpoint.test.ts` | 40 | 08-06 | HTM-01: 10-min cadence, cleanup, fake timers |
| `lib/__tests__/proactive-triggers-visibility.test.ts` | 65 | 08-08 | PED-02: visibilitychange detector + latched-ref pattern |
| `lib/__tests__/proactive-triggers-mistakes.test.ts` | 69 | 08-08 | PED-02: ≥ 2 consecutive wrong → fires once, resets on correct/task switch |
| `scripts/__tests__/restore-agent-config.test.ts` | 58 | 08-03 | LLM-01 + D-11: 6 tool definitions PATCH body, conversation_config snake_case |
| `components/panels/__tests__/voice-panel-tools.test.tsx` | 117 | 08-04 | LLM-01: clientTools wired, dynamicVariables on startSession, draw_explanation INV-02 |
| `components/panels/__tests__/voice-panel-subs.test.tsx` | 93 | 08-04 | PED-02: useLessonBusEvent (not bare bus.on), Phase 6.5 cleanup-bug regression guard |
| `components/panels/__tests__/trainer-panel-progress.test.tsx` | 65 | 08-07 | HTM-01 + D-02: N из M counter, current task ring, smooth-scroll |
| `e2e/voice-agent-tools.spec.ts` | 47 | 08-08 | LLM-01 + PED-02 + HTM-01 end-to-end (5 test.fixme stubs) |

**Total new test code:** 763 lines across 11 files

## Test count delta

| Metric | Baseline (pre-plan) | After plan 08-01 | Delta |
|--------|---------------------|------------------|-------|
| Test files passing | 45 | 45 | 0 (unchanged) |
| Test files failing | 1 (pre-existing voice-panel.test.tsx) | 11 (1 pre-existing + 10 RED — E2E excluded by vitest) | +10 RED files |
| Tests passing | 344 | 347 | +3 (allow-list/regression tests pass at RED state) |
| Tests failing | 2 (pre-existing) | 11 (2 pre-existing + 9 new RED) | +9 |
| Bus event count | 14 | 16 | +2 (board:draw_request + board:clear_request) |

## Decisions Made

1. **@ts-expect-error suppression strategy.** The plan's success criteria require both `tsc --noEmit` to exit 0 AND Wave 0 RED tests to fail with module-not-found errors at runtime. These are in tension — TS2307 is a TSC error by default. Resolution: use line-targeted `@ts-expect-error` markers immediately above each missing-module import. When Wave 1+ creates the module, the `@ts-expect-error` becomes an "unused suppression" error (TS2578), which TSC reports and forces the executor to remove the marker. This makes the RED→GREEN handover self-cleaning.

2. **Multi-line import `@ts-expect-error` placement.** For the contextual-updates import (8-line destructuring), placing `@ts-expect-error` above the `import` keyword reports TS2578 ("Unused directive") because TSC attaches the TS2307 to the `from` clause, not the `import` keyword. Workaround: place the marker on the line before `from` (inside the destructure block, as a comment after the last identifier). This is the standard Vue/Angular convention for multi-line imports.

3. **Type-cast strategy for restore-agent-config test.** The imported `PHASE_8_TOOLS` is `never` at RED state (module doesn't exist), so `.map(t => t.name)` triggers TS7006 implicit-any on `t`. Resolution: cast the array to `Array<{ name: string; … }>` inline at each use site. When the actual module lands, these casts become redundant but not incorrect — the real type from the implementation is structurally compatible. Plan 08-03 author can remove or refactor casts.

4. **E2E spec landed as test.fixme() stubs.** Per plan instructions, the 5 E2E scenarios are documented with `test.fixme()` skip markers. They neither pass nor fail in CI — they're skipped. Plan 08-08 will replace `test.fixme(true, ...)` with the real SDK-stubbing harness from `e2e/voice-flow.spec.ts`.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] @ts-expect-error suppression for Wave 0 RED imports**
- **Found during:** Task 2 (after writing first 7 RED test files, `npx tsc --noEmit` reported 8 TS2307 + 3 TS7006 errors)
- **Issue:** Plan's success criterion #6 demands `tsc --noEmit` exits 0, but the Wave 0 RED contract requires modules to be missing (`Cannot find module` errors). Pure RED at TSC level conflicts with the documented success criterion.
- **Fix:** Added line-targeted `@ts-expect-error — module not yet created (Wave 0 RED contract)` markers to each missing-module import. Also added inline type casts to `PHASE_8_TOOLS as Array<…>` in the restore-agent-config test to silence TS7006 (implicit-any from `never` typed map argument).
- **Files modified:** All 7 lib RED files + scripts/__tests__/restore-agent-config.test.ts (added during Task 2 commit).
- **Verification:** `npx tsc --noEmit` exits 0 cleanly; vitest still shows all 7 files RED at runtime ("Failed to resolve import"). `@ts-expect-error` markers will become unused-suppression errors when modules land — forcing their removal in Wave 1+ commits.
- **Committed in:** fd2a2ed (Task 2 commit)

**2. [Rule 3 - Blocking] E2E spec `let context: BrowserContext` triggers TS2454**
- **Found during:** Task 3 (after writing e2e/voice-agent-tools.spec.ts)
- **Issue:** `let context: BrowserContext` followed by `void context` in beforeAll → TS2454 "Variable used before being assigned" because the type is non-nullable.
- **Fix:** Changed declaration to `let context: BrowserContext | undefined` and removed `void context` from the void-list (kept the other void-imports for documentation).
- **Files modified:** e2e/voice-agent-tools.spec.ts
- **Verification:** `npx tsc --noEmit` exits 0.
- **Committed in:** f7b6a5a (Task 3 commit)

---

**Total deviations:** 2 auto-fixed (both Rule 3 — blocking issues that prevented satisfying success criteria).
**Impact on plan:** Both deviations preserve the plan's stated intent. The `@ts-expect-error` markers are self-documenting and self-cleaning. No scope creep; no architectural change.

## Issues Encountered

- **None.** The plan's tasks were specified precisely (verbatim code blocks), so implementation was mechanical. The two deviations above were tooling/strictness adjustments, not problems with the plan logic.

## User Setup Required

None — Wave 0 is pure RED scaffolding inside the repo.

## Self-Check: PASSED

### File existence verification

```
[FOUND] lib/lesson-bus/events.ts (modified, +11 lines)
[FOUND] lib/lesson-bus/index.ts (modified, +3 lines)
[FOUND] lib/__tests__/client-tool-handlers.test.ts (created, 105 lines)
[FOUND] lib/__tests__/contextual-update-formatters.test.ts (created, 67 lines)
[FOUND] lib/__tests__/lesson-state.test.ts (created, 37 lines)
[FOUND] lib/__tests__/periodic-checkpoint.test.ts (created, 40 lines)
[FOUND] lib/__tests__/proactive-triggers-visibility.test.ts (created, 65 lines)
[FOUND] lib/__tests__/proactive-triggers-mistakes.test.ts (created, 69 lines)
[FOUND] scripts/__tests__/restore-agent-config.test.ts (created, 58 lines)
[FOUND] components/panels/__tests__/voice-panel-tools.test.tsx (created, 117 lines)
[FOUND] components/panels/__tests__/voice-panel-subs.test.tsx (created, 93 lines)
[FOUND] components/panels/__tests__/trainer-panel-progress.test.tsx (created, 65 lines)
[FOUND] e2e/voice-agent-tools.spec.ts (created, 47 lines)
```

### Commit verification

```
[FOUND] 6626fd4 — feat(08-01): add board:draw_request + board:clear_request bus events
[FOUND] fd2a2ed — test(08-01): add Wave 0 RED scaffolds for lib utilities + restore script
[FOUND] f7b6a5a — test(08-01): add Wave 0 RED scaffolds for components + E2E
```

## Resume hint for plan 08-02 executor

RED scaffolds for `lib/client-tools`, `lib/contextual-updates`, `lib/lesson-state` are in place at:
- `lib/__tests__/client-tool-handlers.test.ts` — imports `buildClientTools` from `@/lib/client-tools` (8 tests)
- `lib/__tests__/contextual-update-formatters.test.ts` — imports 5 formatters from `@/lib/contextual-updates` (8 tests, includes negative `task_focused` allow-list test)
- `lib/__tests__/lesson-state.test.ts` — imports `getLessonStateSnapshot` from `@/lib/lesson-state` (4 tests)

Implement those three modules to flip them GREEN. Match the exact signatures and return formats asserted in the tests (including the exact Russian strings in formatters and the precise `STATE:` prefix format in lesson-state). When you remove the `@ts-expect-error` markers, TSC will validate the import contract — if your module exports don't match, TSC will flag mismatched/missing names.

### Note on the two PED-02 proactive-trigger RED stubs

`proactive-triggers-visibility.test.ts` + `proactive-triggers-mistakes.test.ts` target plan 08-08 Task 1's `lib/proactive-triggers/{visibility,mistakes,index}.ts` files. They will stay RED until plan 08-08 lands; this is correct per the Nyquist RED-before-GREEN contract and the plan-checker iteration 1 revision that added these gates.

## Next Phase Readiness

- Plans 08-02 through 08-08 have explicit GREEN targets.
- Bus event contract is locked: `board:draw_request` and `board:clear_request` ready for VoicePanel emit + BoardPanel subscribe.
- TSC clean across the entire repo.
- Pre-existing 344-test suite stays green (no regressions from bus additions).
- Wave 1 (plan 08-02, 08-03) is unblocked and ready to execute.

---
*Phase: 08-agent-control*
*Plan: 01 (Wave 0 — RED-state foundation)*
*Completed: 2026-05-13*
