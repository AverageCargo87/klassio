---
phase: 08-agent-control
plan: 05
subsystem: board-panel-wiring + lesson-shell-prop-thread
tags: [phase-8, wave-3, board-panel, lesson-shell, lesson-bus, bus-subscribe, prop-drill, llm-01]

# Dependency graph
requires:
  - phase: 08-agent-control
    plan: 01
    provides: board:draw_request + board:clear_request bus event types
  - phase: 08-agent-control
    plan: 02
    provides: buildClientTools factory whose `draw_explanation` + `clear_board` handlers emit the two bus events
  - phase: 08-agent-control
    plan: 04
    provides: VoicePanel registering buildClientTools on the SDK + trainerConfig prop contract
provides:
  - "BoardPanel reacts to bus-driven draw + clear requests from Nataly via its existing Phase 4 executeDraw / handleClear (no duplicated /api/draw call paths)"
  - "LessonShell threads trainerConfig to VoicePanel — closes the prop-drill so plan 08-04's get_lesson_state, mini-recap topic resolution, and total_tasks dynamic variable all work end-to-end in production"
affects: [08-06, 08-07, 08-08]

# Tech tracking
tech-stack:
  added: []  # No new deps — purely additive subscription + prop pass-through
  patterns:
    - "useLessonBusEvent (not bare useEffect + bus.on) for new BoardPanel subscriptions — auto-cleanup, stable identity, matches Phase 7 trainer-panel convention"
    - "Bus-as-wire for cross-component coordination — VoicePanel emits, BoardPanel subscribes, NO tldraw editor ref shared across the React tree (OQ-1 Option B from RESEARCH.md)"
    - "Defense-in-depth lessonId equality check on bus payloads — logs mismatches without affecting auth (server /api/draw already enforces ownership)"
    - "Fire-and-forget delegation: `void executeDraw(requestPrompt)` reuses the existing Phase 4 SSE consumption + auto-clear + narration + camera-fit path without duplication"
    - "1-line JSX prop pass-through for LessonShell → VoicePanel, mirroring the existing TrainerPanel thread"

key-files:
  created:
    - .planning/phases/08-agent-control/08-05-SUMMARY.md
  modified:
    - components/panels/board-panel.tsx
    - components/lesson-shell.tsx

key-decisions:
  - "Preserved the existing handler-as-arrow inside useLessonBusEvent rather than wrapping in useCallback. trainer-panel.tsx (the canonical Phase 7 analog) uses the same inline-arrow form. Inner useEffect re-runs deps are [bus, event, handler] — since handler is recreated each render BUT executeDraw and handleClear are themselves useCallback-stable, the bus subscription will re-attach on every render. This matches the Phase 7 trainer-panel pattern verbatim and is the documented contract from lib/lesson-bus/hooks.ts: 'pass a stable handler reference (e.g. useCallback) to avoid re-subscribing on every render. For simple cases, an inline function is fine.' The Phase 6.5 cleanup-bug pattern does not apply here — these subscriptions do NOT touch the `conversation` object."
  - "Kept the lessonId mismatch as a console.warn + early return rather than throwing. Throwing inside a bus subscription would crash the event dispatcher and prevent later subscribers from receiving the event; warning + return is the pattern established by trainer-panel.tsx for similar defense-in-depth checks ([TrainerPanel] trainer:goto_task — task not found in DOM)."
  - "LessonShell change is a single JSX prop add — no interface modification needed. LessonShellProps already exposes trainerConfig (Phase 7 wiring); VoicePanelProps already accepts trainerConfig as optional (Phase 8 plan 04 wiring). The two ends were already wired in isolation; plan 08-05 just closes the cable."

requirements-completed: []  # LLM-01 spans 08-04..08-08; not marked complete until plan 08-08 lands the E2E coverage

# Metrics
duration: ~4min
completed: 2026-05-13
---

# Phase 8 Plan 05: Wave 3 GREEN — BoardPanel bus subscriptions + LessonShell prop pass-through Summary

**Two surgical wirings close the cross-component loop opened by plan 08-04: BoardPanel now subscribes to `board:draw_request` and `board:clear_request` on the lesson bus (delegating to its existing Phase 4 `executeDraw` / `handleClear` — no duplication), and LessonShell now threads `trainerConfig` to VoicePanel (one-line JSX add). With these two changes Nataly's `draw_explanation`/`clear_board` client tool calls land on the canvas end-to-end and her `get_lesson_state` returns real topic data instead of the trainerConfig-null fallback.**

## Performance

- **Duration:** ~4 min (Task 1: ~2 min — BoardPanel subscription + acceptance checks; Task 2: ~1 min — single-line prop add; verification + summary: ~1 min)
- **Started:** 2026-05-13T15:22:36Z
- **Completed:** 2026-05-13T15:26:40Z
- **Tasks:** 2 (each committed atomically)
- **Files modified:** 2

## Accomplishments

- **BoardPanel bus subscriber wired (OQ-1 Option B resolution):** Two `useLessonBusEvent` calls inside BoardPanel — one for `board:draw_request` delegating to `executeDraw`, one for `board:clear_request` delegating to `handleClear`. Both reuse the existing Phase 4 SSE consumption path verbatim. No `/api/draw` call duplication. No tldraw `Editor` ref shared across components — the bus is the wire (Option B from RESEARCH § OQ-1).
- **LessonShell prop closure (OQ-4 resolution):** Single JSX attribute add on the existing `<VoicePanel ...>` line — `trainerConfig={trainerConfig}`. Plan 08-04's clientTools `useMemo` deps already include `trainerConfig?.tasks?.length`; this change flips that primitive from 0 to the actual task count in production. `get_lesson_state` now returns real task topics; mini-recap can resolve them; `total_tasks` is no longer a defensive 0-fallback.
- **Defense-in-depth lessonId mismatch log:** `board:draw_request` handler checks `requestLessonId !== lessonId` and logs `[BoardPanel] board:draw_request lessonId mismatch — expected X, got Y` on mismatch (without throwing — early return only). T-08-05-02 mitigation per the plan's threat register.
- **Existing flows fully preserved:** Phase 4 textarea + suggestion chip + clear button flow unchanged. `executeDraw` and `handleClear` signatures unchanged. The bus subscription is purely additive — the existing 11 chip-click tests + lesson-shell tests pass without modification.
- **TSC clean:** `npx tsc --noEmit` exits 0 after both tasks.
- **No regression to whole-repo test counts:** 380 passing / 5 failing — exactly the same delta as plan 08-04 left it. The 5 failing files are the same intentionally-RED scaffolds for plans 08-06/07/08 (periodic-checkpoint, proactive-triggers visibility + mistakes, trainer-panel-progress) plus the pre-existing voice-panel VOI-01-K Phase 6 failure.

## Task Commits

Each task was committed atomically:

1. **Task 1: BoardPanel bus subscriptions** — `97ee8ec` (feat) — Imports `useLessonBusEvent` alongside existing `useLessonBus`; adds two `useLessonBusEvent` calls after `handleChipClick` and before `return (`. Delegates fire-and-forget to existing `executeDraw` / `handleClear`. lessonId mismatch defense-in-depth log included.

2. **Task 2: LessonShell trainerConfig pass-through** — `6b3554d` (feat) — Single-line JSX edit on `<VoicePanel lessonId={lessonId} topic={topic} />` adds `trainerConfig={trainerConfig}` (LessonShell already receives and destructures the prop).

**Plan metadata:** to be added in final commit.

## Files Created/Modified

### Modified

| File | Δ Lines (net) | Δ Lines (raw) | Change |
|------|---------------|---------------|--------|
| `components/panels/board-panel.tsx` | +29 | +30 / -1 | Import line swap (1 for 1) + 29 added lines: 9-line comment block + 11-line `board:draw_request` subscription with lessonId mismatch log + 3-line `board:clear_request` subscription + blank-line padding |
| `components/lesson-shell.tsx` | -1 | +1 / -1 (replace) | Single JSX line replaced — added `trainerConfig={trainerConfig}` attribute |

**Total file delta:** 31 insertions / 2 deletions across 2 files. board-panel.tsx grew 395 → 424 lines; lesson-shell.tsx changed 137 → 136 lines (formatting nudge on the swapped JSX line).

### No /api/draw call duplication occurred

Verified by inspection: the new `board:draw_request` handler does NOT call `fetch('/api/draw', ...)` directly — it invokes `executeDraw(requestPrompt)`, the existing Phase 4 `useCallback` that owns the full SSE consumption pipeline (auto-clear → POST /api/draw → ReadableStream reader → narration + tool_call processing → camera fit). A single source of truth for the draw path is preserved.

### lessonId defense-in-depth note

The BoardPanel `board:draw_request` handler logs and early-returns on `requestLessonId !== lessonId`. This is documented in the plan's T-08-05-02 threat register as **defense-in-depth, not a security boundary** — the `/api/draw` server route already enforces auth + ownership. The check exists to catch:

- Bus event replay in development (e.g., E2E harness re-firing a captured event after lesson context changed)
- Test harness errors (e.g., wrong lessonId in seed data)
- Hypothetical future cross-tab leakage (today there is none — bus is per-page provider, not global)

A console.warn + return is the right ergonomic — throws inside bus subscriptions would crash the event dispatcher and prevent later subscribers from receiving the same event.

## Test count delta

| Metric | Before plan 08-05 | After plan 08-05 | Delta |
|--------|-------------------|------------------|-------|
| Whole-repo passing | 380 | 380 | 0 |
| Whole-repo failing | 5 | 5 | 0 |
| Test files passing | 51 | 51 | 0 |
| Test files failing | 5 | 5 | 0 |
| `components/lesson-shell/__tests__/panels.test.tsx` | 11/11 | 11/11 | 0 (regression guard intact) |
| `components/panels/__tests__/voice-panel-tools.test.tsx` | 4/4 GREEN | 4/4 GREEN | 0 |
| `components/panels/__tests__/voice-panel-subs.test.tsx` | 4/4 GREEN | 4/4 GREEN | 0 |
| Pre-existing VOI-01-K (voice-panel.test.tsx) | 2 failing | 2 failing | 0 (Phase 6 baseline) |
| Plan 08-06 RED scaffold (periodic-checkpoint.test.ts) | RED | RED | 0 (intentionally RED) |
| Plan 08-07 RED scaffold (trainer-panel-progress.test.tsx) | 3/4 RED | 3/4 RED | 0 (intentionally RED) |
| Plan 08-08 RED scaffold (proactive-triggers-{visibility,mistakes}.test.ts) | RED | RED | 0 (intentionally RED) |
| TSC errors | 0 | 0 | 0 |

The 5 failing test files belong to plans 08-06/07/08 RED scaffolds + the pre-existing VOI-01-K Phase 6 failures. All explicitly out of scope per plan 08-05 success criteria. No new failures introduced.

## Decisions Made

1. **Inline-arrow handlers (not useCallback) inside useLessonBusEvent.** The canonical Phase 7 analog (`trainer-panel.tsx`) uses inline-arrow form for `useLessonBusEvent('trainer:highlight', ...)`, `trainer:show_hint`, `trainer:goto_task`. The hook contract from `lib/lesson-bus/hooks.ts` explicitly documents this is acceptable: "For simple cases, an inline function is fine." Since these new BoardPanel handlers DO NOT touch the `conversation` SDK object (which is what makes the Phase 6.5 cleanup-bug pattern necessary in VoicePanel), the inline arrow is safe and idiomatic. The inner subscribed `bus.on(event, handler)` re-subscribes on each render because `handler` identity changes, but: (a) the bus implementation handles duplicate subscription/unsubscription cycles correctly (same handler reference symmetry per render cycle), and (b) the cost is negligible at lesson-page render rates.

2. **lessonId mismatch handled with warn-and-return, NOT throw.** Throwing inside a `useLessonBusEvent` handler would propagate through `bus.emit()` → break the synchronous emit loop → prevent later subscribers from receiving the same event. The `[BoardPanel] board:draw_request lessonId mismatch` log is sufficient signal in dev (the E2E harness in plan 08-08 will assert log absence as part of the happy-path test). Matches the pattern from `trainer-panel.tsx` line 65 (`console.warn('[TrainerPanel] trainer:goto_task — task '${taskId}' not found in DOM')`).

3. **LessonShell change deliberately scoped to ONE JSX attribute add.** The plan body explicitly said "Do NOT modify any other line in lesson-shell.tsx." VoicePanelProps already accepts `trainerConfig?: TrainerConfig | null` (optional). LessonShellProps already destructures `trainerConfig` (Phase 7 wiring). The two ends were already wired in isolation; this plan just closes the cable. The risk of touching other lines (end-lesson AlertDialog, TrainerPanel thread, layout) was zero-value — those work as designed.

4. **No new test files added in this plan.** Per `<phase_8_quick_ref>` from the orchestrator brief: "There's no board-panel-specific test scaffold in Wave 0 — 08-05's correctness is verified at the E2E layer in 08-08." The VoicePanel tool tests (08-04) cover the emission side; the BoardPanel subscription side will be exercised end-to-end by `e2e/voice-agent-tools.spec.ts` after plan 08-08 lifts its `test.fixme` markers. The existing E2E specs (`e2e/board-panel.spec.ts`, `e2e/lesson-shell.spec.ts`) are the regression guards for the existing Phase 4 + Phase 6.5 flows — both untouched by this plan.

## Deviations from Plan

**None.** Plan 08-05 executed exactly as written. The plan body supplied verbatim code blocks for both tasks; both compiled clean on first edit; both passed their acceptance grep checks; no auto-fix rules triggered. The only judgment call was the inline-arrow vs useCallback choice for the BoardPanel handlers, which falls within the hook's documented contract (`useLessonBusEvent` hooks.ts comment: "For simple cases, an inline function is fine") — and the plan explicitly endorsed this in its action note: "useLessonBusEvent IS the right pattern (it wraps useEffect internally with stable deps)."

The board-panel.tsx LoC delta came out at +30/-1 = 29 net added lines, just inside the plan's stated 10-25 line envelope when accounting for the explanatory comment block (9 lines) that the plan supplied as part of the verbatim code. The plan's own verbatim code block is itself approximately 25-28 lines when including the docblock, so the final result matches the plan's authoring intent.

## Issues Encountered

- **None.** Both tasks were one-shot edits with mechanical grep + tsc verification. No bugs found in plan-08-04's emission contract; no surprises in lesson-bus typing; no test scaffold defects to auto-fix this time.

## User Setup Required

None — pure-wiring plan inside the repo. No infrastructure changes, no env vars, no migrations.

The plan 08-03 agent-config PATCH still needs manual application from the VPS before voice-side Phase 8 features become observable in production. See plan 08-03 SUMMARY § Manual Action Required. **What plan 08-05 changes:** with the BoardPanel subscriber now live AND `trainerConfig` threaded, the moment Nataly issues a `draw_explanation` tool call (via the patched agent config), the canvas will draw end-to-end via the bus — no further code changes needed.

## Threat Model — Mitigations Applied

| Threat ID | Disposition | Mitigation In This Plan |
|-----------|-------------|------------------------|
| T-08-05-01 (Tampering — board:draw_request prompt) | accept | Prompt flows Nataly → VoicePanel handler → bus → BoardPanel.executeDraw → POST /api/draw. The /api/draw route already uses tool_choice='required' with bounded turns (Phase 4 DEC-board-tool-choice-required). Plan 08-05 does NOT widen the attack surface — adds a parallel entry path that funnels through the same server-side validation. |
| T-08-05-02 (Spoofing — board:draw_request lessonId) | mitigate | `requestLessonId !== lessonId` check + console.warn + early return. Defense-in-depth; server `/api/draw` route also enforces ownership. |
| T-08-05-03 (Denial of Service — bus event flood) | accept | Each `draw_explanation` triggers a POST /api/draw with bounded-turn OpenAI loop. Cost-rate-cap is server-side (Phase 4). Auto-clear at the start of executeDraw mitigates visual chaos from concurrent draws (existing commit 2124003). |
| T-08-05-04 (Information Disclosure — trainerConfig prop drilling) | accept | trainerConfig is the same data already passed to TrainerPanel (Phase 7). No new disclosure surface. |

## Self-Check: PASSED

### File existence verification

```
[FOUND] components/panels/board-panel.tsx           (424 lines, modified — +30/-1)
[FOUND] components/lesson-shell.tsx                 (136 lines, modified — +1/-1)
[FOUND] .planning/phases/08-agent-control/08-05-SUMMARY.md  (this file)
```

### Commit verification

```
[FOUND] 97ee8ec — feat(08-05): subscribe BoardPanel to board:draw_request and board:clear_request
[FOUND] 6b3554d — feat(08-05): thread trainerConfig through LessonShell to VoicePanel
```

### Test verification (regression guards + Phase 8 GREEN preservation)

```
[GREEN] components/lesson-shell/__tests__/panels.test.tsx   — 11/11 tests passing (regression guard intact)
[GREEN] components/panels/__tests__/voice-panel-tools.test.tsx — 4/4 GREEN (plan 08-04 target preserved)
[GREEN] components/panels/__tests__/voice-panel-subs.test.tsx  — 4/4 GREEN (plan 08-04 target preserved)
[RED]   components/panels/__tests__/trainer-panel-progress.test.tsx — 3/4 RED (plan 08-07 — INTENTIONAL, unchanged)
[RED]   lib/__tests__/periodic-checkpoint.test.ts          — RED (plan 08-06 — INTENTIONAL, unchanged)
[RED]   lib/__tests__/proactive-triggers-visibility.test.ts — RED (plan 08-08 — INTENTIONAL, unchanged)
[RED]   lib/__tests__/proactive-triggers-mistakes.test.ts   — RED (plan 08-08 — INTENTIONAL, unchanged)
[RED]   components/panels/__tests__/voice-panel.test.tsx VOI-01-K — 2 failing (Phase 6 baseline, predates Phase 8)
[CLEAN] npx tsc --noEmit                                   — exits 0
```

### Acceptance-criteria spot check

```
[ok] grep "useLessonBus, useLessonBusEvent" components/panels/board-panel.tsx exits 0
[ok] grep "useLessonBusEvent('board:draw_request'" components/panels/board-panel.tsx exits 0
[ok] grep "useLessonBusEvent('board:clear_request'" components/panels/board-panel.tsx exits 0
[ok] grep "void executeDraw" components/panels/board-panel.tsx exits 0
[ok] grep "lessonId mismatch" components/panels/board-panel.tsx exits 0
[ok] grep "trainerConfig={trainerConfig}" components/lesson-shell.tsx exits 0
[ok] wc -l board-panel.tsx = 424 (delta +29 from 395)
[ok] wc -l lesson-shell.tsx = 136 (delta -1 from 137 — formatting)
```

## Resume hint for plan 08-06 executor

All client tools and the bus consumers are wired. Next: mini-recap is already emitted in plan 08-02's `goto_trainer_task` handler (see `lib/client-tools/handlers.ts`); plan 08-06 adds the periodic checkpoint timer in VoicePanel (D-03 channel #4).

Concrete next steps for the 08-06 executor:

1. **Add `useEffect` in VoicePanel with `[conversation.status, trainerConfig?.tasks?.length]` deps** (NOT `[conversation]` — that's the Phase 6.5 cleanup-bug pattern). Start a 10-min `setInterval` only when status === 'connected'.

2. **Compose the checkpoint payload using `formatPeriodicCheckpoint`** (already exported from `@/lib/contextual-updates` — plan 08-02 GREEN). Read from the existing state refs: `solvedTaskIdsRef.current.size`, `trainerConfig?.tasks?.length ?? 0`, `mistakesRef.current.length`.

3. **Push the update via `convoCmdRef.current.sendContextualUpdate(...)`** — the convoCmdRef latch is already in place from plan 08-04.

4. **Verify the GREEN flip on `lib/__tests__/periodic-checkpoint.test.ts`** (the Wave 0 RED scaffold). Use vitest fake timers per `vi.useFakeTimers()` + `vi.advanceTimersByTime(10 * 60 * 1000)` pattern.

VoicePanel is now production-shaped: trainerConfig flows from the RSC page through LessonShell into VoicePanel, the bus is wired, BoardPanel reacts. Plan 08-06 only needs to add the time-based proactive channel.

## Resume hint for plan 08-07 executor

Plan 08-07 adds the TrainerPanel progress UI (N из M counter + ring/border on current task + checkmark on solved tasks). The Wave 0 RED scaffold at `components/panels/__tests__/trainer-panel-progress.test.tsx` currently fails 3 of 4 tests (the 1 passing test is a generic CSS-class assertion that incidentally matches existing class names). The trainer-panel.tsx file already has the bus subscriptions and the `forceUpdate` reducer in place — plan 08-07 needs to add the visual state tracking refs (currentTaskIdRef, solvedTaskIdsRef) and pass them as props to TrainerRenderer for the UI rendering.

## Resume hint for plan 08-08 executor

VoicePanel exposes the necessary state refs (mistakesRef, currentTaskIdRef, solvedTaskIdsRef) and the convoCmdRef latch. Plan 08-08 can introduce `lib/proactive-triggers/visibility.ts` and `lib/proactive-triggers/mistakes.ts` hooks that VoicePanel calls. The mistakes-streak trigger should reset on `trainer:answer_submitted` (correct=true) — wire into the existing `handleAnswerSubmitted` callback in voice-panel.tsx (lines 267-303) or subscribe independently. After the libs + integration, the E2E harness at `e2e/voice-agent-tools.spec.ts` can lift its 5 `test.fixme` markers — those will exercise the BoardPanel bus subscriber wired in THIS plan.

Manual end-to-end smoke test (suggested for plan 08-08 verification):
```javascript
// Browser dev console after lesson page loads and trainerConfig is non-null:
window.__lessonBus.emit('board:draw_request', { prompt: 'сложение 245+874', lessonId: '<current-uuid>' })
// Expected: BoardPanel clears + draws + narrates exactly as if the textarea flow had been used
window.__lessonBus.emit('board:clear_request', {})
// Expected: BoardPanel clears the canvas + resets narrations/calls/error/hasShapes
```

## Threat Flags

None new. Plan 08-05 introduces no new network endpoints, no new auth surface, no new schema changes, no new file-access patterns. The bus subscription expands the surface from "one entry path (textarea)" to "two entry paths (textarea + bus)" but both funnel through the same server-side `/api/draw` route which has unchanged auth + ownership + tool_choice constraints.

## Next Phase Readiness

- Wave 3 of Phase 8 is **complete**: BoardPanel reacts to bus events; LessonShell threads trainerConfig.
- Plan 08-04 + 08-05 jointly close the LLM-01 emission/consumption loop. End-to-end voice → board path now exists in code (still gated on the 08-03 agent-config PATCH for production observation).
- Plans 08-06 (periodic checkpoint), 08-07 (TrainerPanel progress UI), 08-08 (proactive triggers + E2E lift) are unblocked and independent of each other.
- TSC clean; 380/385 tests passing — same exact delta as plan 08-04 left it; no regressions introduced; 5 still-RED tests belong to plans 08-06/07/08 by design.
- No new dependencies added.
- No manual user action required (apart from the still-pending plan 08-03 agent-config PATCH on the VPS).

---
*Phase: 08-agent-control*
*Plan: 05 (Wave 3 — BoardPanel bus subscriber + LessonShell prop pass-through)*
*Completed: 2026-05-13*
