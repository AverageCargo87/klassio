---
phase: 08-agent-control
plan: 06
subsystem: voice-agent-control
tags: [phase-8, wave-3, voice-panel, periodic-checkpoint, contextual-updates, setinterval, lost-in-the-middle, tdd-green, llm-01, ped-02, htm-01, d-03-channel-4]

# Dependency graph
requires:
  - phase: 08-agent-control
    plan: 01
    provides: Wave 0 RED scaffold lib/__tests__/periodic-checkpoint.test.ts (3 RED tests, 10-min cadence + cleanup + count increments)
  - phase: 08-agent-control
    plan: 02
    provides: formatPeriodicCheckpoint formatter (Russian payload — '⏱ N мин урока. Решено: x/y, …')
  - phase: 08-agent-control
    plan: 04
    provides: VoicePanel state refs (solvedTaskIdsRef, mistakesRef, convoCmdRef) + Phase 6.5 cleanup-bug guard + conversation.status discipline
provides:
  - "lib/periodic-checkpoint/index.ts — pure utility startPeriodicCheckpoint(onCheckpoint) returning idempotent cleanup function; setInterval at 600_000 ms (10 min); count-based elapsedMinutes (10, 20, 30, …)"
  - "VoicePanel useEffect timer composing startPeriodicCheckpoint + formatPeriodicCheckpoint + state refs, scoped to conversation.status === 'connected'"
  - "Plan 08-06 GREEN: lib/__tests__/periodic-checkpoint.test.ts (3 RED → 3 GREEN)"
  - "D-03 channel #4 fully implemented; all 4 D-03 state-injection channels (dynamic_variables, sendContextualUpdate trainer events, mini-recap on goto_trainer_task, periodic checkpoint) now live"
  - "Test scaffold Rule-1 fix: tightened voice-panel-subs.test.tsx test #4 regex with tempered greedy token so legitimate downstream useCallback([conversation]) deps no longer false-positive"
affects: [08-07, 08-08]

# Tech tracking
tech-stack:
  added: []  # No new deps; consumes existing Phase 8 Wave 1 modules + native setInterval
  patterns:
    - "Pure setInterval factory with closure-bounded counter — no React, no IO, no SDK; testable with vi.useFakeTimers + advanceTimersByTime"
    - "Idempotent cleanup via nulled timer handle — calling the returned cleanup twice is a no-op (Wave 0 test #3 invariant)"
    - "ReturnType<typeof setInterval> for timer handles — cross-target typing (Node + browser) without needing to import @types/node or DOM lib"
    - "useEffect with conversation.STATUS (string primitive) in deps — the safe form per Phase 6.5 lesson; identity changes only on real status transitions, not on every SDK mode-change"
    - "First-tick semantics: setInterval fires the FIRST callback at T+interval (not T+0) — no spammy welcome update, matches Wave 0 test #1 ('fires callback after EXACTLY 10 minutes')"
    - "Tempered greedy regex token (?:(?!boundary)[\\s\\S])* for static source-text checks across multi-line hook bodies — prevents lazy-dotall from leaking past intermediate hook closings"

key-files:
  created:
    - lib/periodic-checkpoint/index.ts
    - .planning/phases/08-agent-control/08-06-SUMMARY.md
  modified:
    - components/panels/voice-panel.tsx
    - components/panels/__tests__/voice-panel-subs.test.tsx
    - lib/__tests__/periodic-checkpoint.test.ts

key-decisions:
  - "Counter lives in setInterval closure (let count = 0) — simpler than useRef and the function is React-free anyway; the counter is fully internal state, never exposed to the caller. Wave 0 contract demands elapsedMinutes={10,20,30,…} computed from the count."
  - "First tick at T+10min, NOT at T+0 — native setInterval semantics. The Wave 0 test #1 explicitly asserts onCheckpoint is NOT called after 9'59''999''' but IS called at exactly 10'00''. This avoids spamming Nataly with an empty 'you've been live 0 min' update at session start."
  - "PeriodicCheckpointArgs is a structured object ({elapsedMinutes: number}) not a bare number — leaves room for future fields (e.g. {elapsedMinutes, tickIndex}) without breaking the API. The Wave 0 test uses expect.objectContaining(...) to confirm this."
  - "Composition lives in VoicePanel, not LessonShell. RESEARCH § Timer for Periodic Checkpoint Option A is recommended — VoicePanel already owns the conversation reference and all 3 state refs (solvedTaskIdsRef, mistakesRef, convoCmdRef). Threading sendContextualUpdate up to LessonShell would have been messy and break the single-owner discipline."
  - "Dep array on the timer useEffect = [conversation.status, trainerConfig?.tasks?.length] — only string primitive + number primitive. NEVER [conversation] (object) — that would re-create the timer on every SDK mode-change and re-introduce the Phase 6.5 cleanup-bug pattern. The trainerConfig?.tasks?.length primitive is included so the timer restarts if the lesson config swaps mid-session (extremely unlikely but type-safe)."
  - "Test scaffold Rule-1 fix: tightened regex from /useEffect\\s*\\([\\s\\S]*?\\}\\s*,\\s*\\[conversation\\]\\s*\\)/g to /useEffect\\s*\\((?:(?!\\}\\s*,\\s*\\[)[\\s\\S])*\\}\\s*,\\s*\\[conversation\\]\\s*\\)/g. The plan-08-04 lazy-dotall version was STILL too broad: it would latch onto a downstream useCallback([conversation]) (e.g., the existing handleStop), producing a spurious match even though the useEffect's OWN deps were safe ([conversation.status, …]). Tempered greedy token (?:(?!boundary)[…])* explicitly excludes the body span from crossing another hook's '}, [' boundary. Detects real Phase 6.5 violations (count=1 on synthetic test fixture); ignores safe patterns (count=0). Sanity-verified inline before commit. Same kind of fix as plan 08-04 Decision #5 — this iteration extends that work."

requirements-completed: []  # LLM-01 + PED-02 still span 08-07 / 08-08; HTM-01 still spans 08-07. Plan 08-06 contributes to all three but does not fully complete any.

# Metrics
duration: ~7min
completed: 2026-05-13
---

# Phase 8 Plan 06: Wave 3 GREEN — periodic checkpoint timer for D-03 channel #4 Summary

**A ~40-line pure-setInterval factory + a single useEffect under conversation.status lifecycle complete the D-03 state-injection channels: every 10 minutes during an active session, Nataly receives a fresh '⏱ N мин урока. Решено: x/y, …' update anchored at the tail of her context window, mitigating lost-in-the-middle attention degradation on GPT-4.1 mini's 1M-token context (RESEARCH § Risk 5).**

## Performance

- **Duration:** ~7 min
- **Started:** 2026-05-13T15:32:52Z
- **Completed:** 2026-05-13T15:39:19Z
- **Tasks:** 2 (committed atomically)
- **Files created:** 1 (lib/periodic-checkpoint/index.ts, 41 lines)
- **Files modified:** 3 (voice-panel.tsx +32 lines, voice-panel-subs.test.tsx test-scaffold regex fix +15 net, lib/__tests__/periodic-checkpoint.test.ts —2 lines for marker removal)

## Accomplishments

- **Plan 08-06 fully GREEN.** lib/__tests__/periodic-checkpoint.test.ts flips 3 RED → 3 GREEN. All three invariants pass:
  - Fires callback after EXACTLY 10 minutes (not 9'59''999'''; not before)
  - Fires every 10 minutes — counter increments deterministically {10, 20, 30}
  - Cleanup function stops the timer (no further fires after cleanup() called)
- **lib/periodic-checkpoint/index.ts (~30 LoC excluding comments).** Pure setInterval factory: closure-bounded counter, ReturnType<typeof setInterval> handle, idempotent cleanup via nulled handle. No React, no SDK, no IO — single-purpose timer scheduling utility composable from any context (including non-React tests with fake timers).
- **VoicePanel useEffect wired under conversation.status lifecycle.** Inserted between the 3 trainer-event subscriptions (plan 08-04 channel #2) and the Phase 6.5 cleanup useEffect — preserving the established hook order. The dep array is `[conversation.status, trainerConfig?.tasks?.length]` (both primitives), explicitly avoiding the unsafe `[conversation]` (object) pattern. When status !== 'connected', the effect returns early; no timer is created. When status flips to 'connected', the timer starts; when it leaves 'connected' (e.g., disconnect), React fires the cleanup which clears the interval.
- **First tick at T+10min, NOT T+0.** Standard setInterval semantics, matching Wave 0 test #1 invariant. No spammy welcome update at session start. The first checkpoint reaches Nataly only after 10 wall-clock minutes of active session — by which point there's actual signal in `solvedTaskIdsRef.current.size` + `mistakesRef.current.length` worth summarising.
- **All 4 D-03 state-injection channels now live:**
  1. dynamic_variables (plan 08-04) — `{lesson_topic, total_tasks}` on `startSession`
  2. sendContextualUpdate trainer event forwards (plan 08-04) — answer_submitted ✓/✗, hint_opened, idle_15s
  3. mini-recap on goto_trainer_task (plan 08-02) — frontend formats recap inside the client tool handler before bus emission
  4. periodic checkpoint every ~10 min (THIS plan) — anchors fresh state at the tail of Nataly's context window
- **Test scaffold Rule-1 fix (voice-panel-subs.test.tsx test #4).** The plan-08-04 lazy-dotall regex `/useEffect\s*\([\s\S]*?\}\s*,\s*\[conversation\]\s*\)/g` was still too broad after plan 08-04's tightening: starting at my new safe useEffect with `[conversation.status, …]` deps, the body span could leak past the closing and latch onto the existing safe `handleStop = useCallback(…, [conversation])` (line ~416 in the post-Task-2 file). This produced a spurious match (test reported `expected 1 to be 0`) even though my new useEffect was correctly using the safe primitive form. Fix: switched to a tempered greedy token `(?:(?!\}\s*,\s*\[)[\s\S])*` that explicitly excludes intermediate hook dep-array boundaries from the body span. Now the regex can ONLY match a useEffect whose OWN deps are `[conversation]` — which is exactly the documented intent. Same kind of test-scaffold-defect fix as plan 08-04 Decision #5; iteratively tightened further.
- **TSC clean.** `npx tsc --noEmit` exits 0 across the whole repo.
- **No regression to plan 08-04 GREEN baseline.** 11/11 plan-target tests still pass (4 voice-panel-tools + 4 voice-panel-subs + 3 periodic-checkpoint). The 2 pre-existing VOI-01-K failures in voice-panel.test.tsx are unchanged — they predate Phase 8 and are out of scope (documented in 08-04 SUMMARY § Test count delta).

## Task Commits

Each task was committed atomically:

1. **Task 1: lib/periodic-checkpoint/index.ts pure utility** — `19d11f4` (feat)
2. **Task 2: VoicePanel wire periodic checkpoint + Rule-1 scaffold regex fix** — `6bbb3b8` (feat)

**Plan metadata:** to be added in final commit (SUMMARY.md + STATE.md + ROADMAP.md).

## Files Created/Modified

### Created (production)

| File | Lines | Exports | Purpose |
|------|-------|---------|---------|
| `lib/periodic-checkpoint/index.ts` | 41 | `startPeriodicCheckpoint`, `PeriodicCheckpointArgs` type | Pure timer factory: setInterval at 10-min cadence; bounded counter; idempotent cleanup |

### Modified (production)

| File | Δ Lines | Change |
|------|---------|--------|
| `components/panels/voice-panel.tsx` | +32 / -0 (net +32) | (1) Added `import { startPeriodicCheckpoint }` from `@/lib/periodic-checkpoint`; (2) added `formatPeriodicCheckpoint` to the existing `@/lib/contextual-updates` import group; (3) inserted a single new `useEffect` between the trainer-event subscriptions and the Phase 6.5 cleanup useEffect — composes the imports + state refs + convoCmdRef latch + try/catch error swallowing. Dep array is `[conversation.status, trainerConfig?.tasks?.length]` (string + number primitives — safe per Phase 6.5 lesson). |

### Modified (tests)

| File | Δ Lines | Change |
|------|---------|--------|
| `lib/__tests__/periodic-checkpoint.test.ts` | +1 / -3 (net –2) | Removed `@ts-expect-error` marker per Wave 0 RED→GREEN self-cleaning handover; updated leading comment from "Wave 0 RED" → "Wave 3 GREEN". Test assertions unchanged. |
| `components/panels/__tests__/voice-panel-subs.test.tsx` | +14 / -2 (net +12) | [Rule 1] Tightened test #4's regression-guard regex from `[\s\S]*?` (lazy-dotall) to `(?:(?!\}\s*,\s*\[)[\s\S])*` (tempered greedy) so the body span cannot cross another hook's `'}, ['` boundary. Comment block expanded to document why the prior fix from plan 08-04 was insufficient. No semantic change to test intent. |

**Total file delta:** 47 insertions / 5 deletions across 4 files; lib/periodic-checkpoint/index.ts is 41 lines (within plan's ≤ 50 envelope); voice-panel.tsx is now 517 lines (was 485 post-08-04, within plan's 350-520 working envelope).

## Phase 6.5 Cleanup-Bug Guard — Verified Untouched

The Phase 6.5 latched-ref cleanup pattern (lines 432-447 in the post-plan-08-06 file, was 401-416 post-08-04, was 207-221 in original Phase 6 file) is preserved bit-for-bit. The +32 LoC added by Task 2 lives BEFORE this block; the cleanup useEffect itself + its `conversationRef.current = conversation` ref-latch line + the `[]` empty-deps array are untouched.

The new periodic-checkpoint useEffect uses dep `[conversation.status, trainerConfig?.tasks?.length]` — string + number primitives. The voice-panel-subs.test.tsx test #4 static regex (now correctly tightened) verifies NO new useEffect with `[conversation]` (object) exists. The 4 voice-panel-subs tests all GREEN confirms the subscriptions discipline (allow-list + stable handler refs + no unsafe useEffect + bus subs via useLessonBusEvent) holds.

Cross-check via grep:
- `grep -c ", \[conversation.status" components/panels/voice-panel.tsx` → 1 (the new useEffect)
- `grep -cE "useEffect.*?\}\s*,\s*\[conversation\]\)" components/panels/voice-panel.tsx` via the tightened regex → 0 (no unsafe useEffect)
- The only `[conversation]` token in the file is the line-416 `handleStop = useCallback(…, [conversation])` — a SAFE useCallback dep that has been there since Phase 6, explicitly documented by plan 08-04 Decision #5 as the intended pattern.

## Test count delta

| Metric | Before plan 08-06 | After plan 08-06 | Delta |
|--------|-------------------|------------------|-------|
| Plan 08-06 target tests passing | 0 | 3 | +3 |
| `lib/__tests__/periodic-checkpoint.test.ts` | 0/3 (RED — module missing) | 3/3 GREEN | +3 |
| `components/panels/__tests__/voice-panel-subs.test.tsx` | 4/4 GREEN | 4/4 GREEN | 0 (regex tightened; semantic intent preserved; all 4 still pass after the new useEffect lands) |
| `components/panels/__tests__/voice-panel-tools.test.tsx` | 4/4 GREEN | 4/4 GREEN | 0 |
| `components/panels/__tests__/voice-panel.test.tsx` | 15/17 (2 pre-existing VOI-01-K failures) | 15/17 (same — no regression) | 0 |
| Whole-repo passing | 380 | 383 | +3 |
| Whole-repo failing | 5 | 5 | 0 (the 3 RED scaffolds for 08-07/08-08 + 2 pre-existing VOI-01-K remain unchanged) |
| TSC errors | 0 | 0 | 0 |

The 5 still-failing tests belong to:
- `lib/__tests__/proactive-triggers-visibility.test.ts` (08-08 Wave 0 RED — intentional)
- `lib/__tests__/proactive-triggers-mistakes.test.ts` (08-08 Wave 0 RED — intentional)
- `components/panels/__tests__/trainer-panel-progress.test.tsx` (08-07 Wave 0 RED — intentional; 3 tests but 1 ts-expect-error covered test passes)
- `components/panels/__tests__/voice-panel.test.tsx` (2 pre-existing VOI-01-K failures predating Phase 8)

## Decisions Made

1. **Counter lives in setInterval closure (`let count = 0`) — not useRef.** Since startPeriodicCheckpoint is React-free, useRef isn't an option anyway. Closure semantics are simpler: the counter is fully internal, never observed by the caller. Wave 0 contract is satisfied via `count * 10` deriving the elapsedMinutes shown in the assertion.

2. **First tick at T+10min, NOT T+0.** Native setInterval fires the first callback at T+interval, not T+0. The Wave 0 test #1 explicitly asserts this: `advanceTimersByTime(10 * 60 * 1000 - 1)` → no call; `advanceTimersByTime(1)` → 1 call with elapsedMinutes=10. This avoids spamming Nataly with an empty "you've been live 0 min" update at session start. By T+10min, there's real signal in solvedTaskIdsRef.current.size + mistakesRef.current.length to summarise.

3. **PeriodicCheckpointArgs is `{elapsedMinutes: number}`, not a bare number.** The Wave 0 test uses `expect.objectContaining({ elapsedMinutes: 10 })` confirming this shape. Structured object leaves room for future fields (e.g., `{elapsedMinutes, tickIndex}`) without breaking the API.

4. **Composition lives in VoicePanel, not LessonShell.** RESEARCH § Timer for Periodic Checkpoint Option A is the recommended placement — VoicePanel already owns the conversation reference and all 3 state refs (solvedTaskIdsRef, mistakesRef, convoCmdRef). Threading sendContextualUpdate up to LessonShell would be messy and break the single-owner discipline.

5. **Dep array `[conversation.status, trainerConfig?.tasks?.length]`.** String + number primitives — safe per Phase 6.5 lesson. trainerConfig?.tasks?.length is included as a primitive so the timer restarts if the lesson config swaps mid-session (extremely unlikely but type-safe). Critically, NEVER `[conversation]` (object) — that would re-create the timer on every SDK mode-change and re-introduce the Phase 6.5 cleanup-bug pattern.

6. **Try/catch around the sendContextualUpdate call inside the tick.** Mirrors the existing answer/hint/idle forwarders from plan 08-04. If one tick's SDK call throws (e.g., during a transient disconnect race), the timer keeps running and the next tick will fire normally 10 min later. No exception escapes the tick, so the user never sees a console-rage stack trace from this code path.

7. **Test scaffold Rule-1 fix: tightened the regression-guard regex with a tempered greedy token.** See "Deviations from Plan" below for full rationale and trace.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] voice-panel-subs.test.tsx test #4 regex false-positives on safe `[conversation]` useCallback deps appearing AFTER a useEffect**

- **Found during:** Task 2 verification (running `npx vitest run components/panels/__tests__/voice-panel-subs` after inserting the periodic-checkpoint useEffect).
- **Issue:** The test #4 static regex from plan 08-04 `/useEffect\s*\([\s\S]*?\}\s*,\s*\[conversation\]\s*\)/g` is lazy-dotall: starting at any `useEffect(`, the body span `[\s\S]*?` keeps extending until it finds the first `}, [conversation])`. In the post-plan-08-04 file there was only ONE `useEffect(` (the Phase 6.5 cleanup effect ending with `}, [])`), and the only `[conversation]` tokens (handleStart and handleStop useCallback deps at lines 384/387) were BEFORE that useEffect — so the regex returned 0 matches because the required `[conversation]` must come AFTER the useEffect in the body-span direction. After my Task 2 inserted a new safe useEffect at line ~332 with `[conversation.status, trainerConfig?.tasks?.length]` deps, the regex's body span starting from my new useEffect could now reach the safe `handleStop = useCallback(…, [conversation])` at line ~416. The body of my new useEffect ends with `}, [conversation.status, …])` — not `[conversation])` — so the lazy regex skipped past my own closing and latched onto handleStop's `[conversation])` as the terminator. False-positive: 1 match reported, expected 0. The match was logically a fragment "from my useEffect's opening through several hundred chars to handleStop's [conversation]) closing" — bridging two separate hooks, neither unsafe on its own.
- **Why this differs from plan 08-04's fix:** Plan 08-04 Decision #5 tightened the regex specifically to "target useEffect specifically" so that a useCallback with `[conversation]` deps (handleStop) wouldn't directly match. That fix was correct in its narrow scope, but the lazy-dotall behavior across multiple hooks remained vulnerable. A new useEffect appearing BEFORE the existing handleStop useCallback exposes this latent regex defect.
- **Fix:** Replace `[\s\S]*?` with the tempered greedy token `(?:(?!\}\s*,\s*\[)[\s\S])*`. The negative lookahead `(?!\}\s*,\s*\[)` is checked at each char; if the next chars are about to form a `'}, ['` boundary (any hook's dep-array end), the regex backs off — preventing the body span from crossing another hook. Now the regex CAN ONLY match a useEffect whose OWN dep array is `[conversation]` — which is exactly the documented intent. Sanity-verified inline before commit using node -e: detects a real violation (synthetic `useEffect(…, [conversation])` → count=1), ignores safe patterns (synthetic `useEffect(…, [conversation.status])` followed by `useCallback(…, [conversation])` → count=0).
- **Files modified:** `components/panels/__tests__/voice-panel-subs.test.tsx` (the regex + a comment block explaining why the prior plan-08-04 fix was insufficient).
- **Verification:** All 4 voice-panel-subs tests now pass after the regex tightening. The 4 voice-panel-tools tests still pass. The 3 periodic-checkpoint tests (Task 1 GREEN) still pass. `npx tsc --noEmit` exits 0.
- **Committed in:** `6bbb3b8` (Task 2 — bundled with the wiring change since both are conceptually the same single feat).
- **Precedent:** Plan 08-04 Deviation #1 (three voice-panel-subs.test.tsx scaffold bugs) — also Rule 1 fixes to the same test file. This deviation continues the pattern of iteratively tightening the Wave 0 scaffold's static checks as the production code accrues additional safe-but-textually-similar patterns.

---

**Total deviations:** 1 auto-fixed (Rule 1 — test scaffold defect).
**Impact on plan:** No semantic change to test intent (still verifying NO unsafe `useEffect([conversation])` is added; still allowing safe `useCallback([conversation])`). No additional scope, no architectural change, no impact on production code. The 4 voice-panel-subs tests now correctly verify the documented invariants without producing false-positives when a new safe useEffect with primitive-dep array is added BEFORE an existing safe useCallback.

## Issues Encountered

- **None blocking.** Task 1 was mechanical (the plan supplied a verbatim ~30-LoC code block matching the Wave 0 contract). Task 2 hit the scaffold-regex false-positive above — handled per Rule 1.

## User Setup Required

None — pure-wiring plan. No new env vars, no infra changes, no migrations.

The 11labs agent config PATCH (from plan 08-03) still needs to be applied manually from the VPS before voice-side end-to-end testing of Phase 8 features. See plan 08-03 SUMMARY § Manual Action Required. Plan 08-06 LANDED LOCALLY — the periodic checkpoint timer is wired and the formatter is ready, but Nataly will only receive the updates once a real WS session reaches the 10-min mark (which requires the agent config to recognise the 6 client tools and Phase 8 system prompt).

## Threat Model — Mitigations Applied

| Threat ID | Disposition | Mitigation In This Plan |
|-----------|-------------|------------------------|
| T-08-06-01 (Multiple stale timers from rapid status flips → DoS) | mitigate | useEffect cleanup returns startPeriodicCheckpoint's cleanup function. On any status transition (disconnected → connecting → connected → disconnecting), React fires cleanup before re-running the effect. The combination of the `if (conversation.status !== 'connected') return` early-exit + the always-returned cleanup guarantees no timer can leak across status transitions. Wave 0 test #3 ("cleanup function stops the timer") plus the early-exit gate cover this end-to-end. |
| T-08-06-02 (Information Disclosure via checkpoint payload) | accept | Checkpoint includes only counts (solvedCount, totalTasks, mistakeCount, elapsedMinutes) — no taskId-specific PII, no child-identifying data. Same envelope as mini-recap and existing transcript stream. |
| T-08-06-03 (Cost Overrun via checkpoint frequency) | accept | Max 4 checkpoints per 45-min lesson × ~100 tokens each ≈ 400 tokens. Negligible vs 200-300K total session tokens (RESEARCH § Cadence analysis). |
| T-08-06-04 (Phase 6.5 cleanup-bug recurrence) | mitigate | useEffect dep is `[conversation.status, trainerConfig?.tasks?.length]` — string + number primitives only. NEVER [conversation] (object). voice-panel-subs.test.tsx Wave 0 scaffold test #4 (now with the tightened tempered-greedy regex) has an explicit static check that fails RED on any `useEffect(…, [conversation])` pattern in the file. |

## Self-Check: PASSED

### File existence verification

```
[FOUND] lib/periodic-checkpoint/index.ts                              (41 lines, created)
[FOUND] components/panels/voice-panel.tsx                             (517 lines, modified +32)
[FOUND] components/panels/__tests__/voice-panel-subs.test.tsx         (modified — regex tightening)
[FOUND] lib/__tests__/periodic-checkpoint.test.ts                     (modified — @ts-expect-error removed)
[FOUND] .planning/phases/08-agent-control/08-06-SUMMARY.md            (this file)
```

### Commit verification

```
[FOUND] 19d11f4 — feat(08-06): implement lib/periodic-checkpoint pure utility
[FOUND] 6bbb3b8 — feat(08-06): wire periodic checkpoint into VoicePanel under conversation.status lifecycle
```

### Test verification

```
[GREEN] lib/__tests__/periodic-checkpoint.test.ts                    — 3/3 tests passing (was 0/3 RED)
[GREEN] components/panels/__tests__/voice-panel-tools.test.tsx       — 4/4 tests passing (no regression)
[GREEN] components/panels/__tests__/voice-panel-subs.test.tsx        — 4/4 tests passing (regex tightened; semantic intent preserved)
[BASELINE] components/panels/__tests__/voice-panel.test.tsx          — 15/17 passing (2 pre-existing VOI-01-K failures unchanged)
[STILL-RED] lib/__tests__/proactive-triggers-visibility.test.ts      — 0/N (intentional — 08-08 Wave 0 RED)
[STILL-RED] lib/__tests__/proactive-triggers-mistakes.test.ts        — 0/N (intentional — 08-08 Wave 0 RED)
[STILL-RED] components/panels/__tests__/trainer-panel-progress.test  — 1/4 (intentional — 08-07 Wave 0 RED)
[CLEAN] npx tsc --noEmit                                             — exits 0
```

### Acceptance-criteria spot check

```
[ok] grep "export function startPeriodicCheckpoint" lib/periodic-checkpoint/index.ts → 1
[ok] grep -E "10 \\* 60 \\* 1000|600_000|600000" lib/periodic-checkpoint/index.ts → 1
[ok] grep "elapsedMinutes" lib/periodic-checkpoint/index.ts → multiple
[ok] grep "clearInterval" lib/periodic-checkpoint/index.ts → 1
[ok] grep "startPeriodicCheckpoint" components/panels/voice-panel.tsx → multiple
[ok] grep "formatPeriodicCheckpoint" components/panels/voice-panel.tsx → multiple
[ok] grep "conversation.status" components/panels/voice-panel.tsx → multiple
[ok] grep -c ", \\[conversation.status" components/panels/voice-panel.tsx → 1 (the new useEffect dep)
[ok] tempered-greedy regex match for unsafe useEffect([conversation]) → 0 (Phase 6.5 guard intact)
[ok] grep "elapsedMinutes" components/panels/voice-panel.tsx → 1
[ok] wc -l lib/periodic-checkpoint/index.ts → 41 (≤ 50 envelope)
[ok] Phase 6.5 cleanup useEffect at lines 432-447 unchanged
```

## Resume hint for plan 08-07 executor

**TrainerPanel progress UI (D-02 + HTM-01) — independent of VoicePanel.**

Plan 08-07 adds:
- "N из M" counter in TrainerPanel CardHeader (M = `trainerConfig.tasks.length`)
- Current task ring (`ring-2 ring-blue-500`) on the `data-task-id` element matching `currentTaskIdRef.current`
- Solved task checkmark indicator (✓ glyph or similar) on each `data-task-id` element where the taskId is in `solvedTaskIdsRef.current` Set
- Smooth-scroll on `trainer:goto_task` is already there — just verify it doesn't regress

Wave 0 RED scaffold: `components/panels/__tests__/trainer-panel-progress.test.tsx` (4 tests). Currently 1/4 passes (the smooth-scroll-already-there test); 3/4 are RED until plan 08-07 lands the UI extension.

Critical: TrainerPanel does NOT subscribe to VoicePanel's state refs directly. It tracks its own currentTaskIdRef + solvedTaskIdsRef via bus subscriptions (mirroring how VoicePanel tracks them). The forceUpdate pattern from the existing Phase 7 hintOverrides ref is the established model — pluggable.

## Resume hint for plan 08-08 executor

**Proactive triggers (PED-02) — visibility detector + consecutive-mistakes streak.**

Plan 08-08 adds two new pure-lib modules + VoicePanel composition:
- `lib/proactive-triggers/visibility.ts` — `useVisibilityTrigger(onHidden: () => void): void` hook that listens for `visibilitychange` events and fires `onHidden` when `document.visibilityState === 'hidden'`. Latched-ref pattern per PATTERNS.md § visibility.
- `lib/proactive-triggers/mistakes.ts` — Track consecutive wrong answers via `useRef<number>`. Threshold = 2. Reset on `correct === true`. Caller passes `onConsecutiveMistakes(taskId, count)` callback.

VoicePanel composition: subscribe both to the existing `trainer:answer_submitted` (which the Phase 8.04 forwarders already use — share the existing handler or add a parallel hook). When fired, call `convoCmdRef.current.sendContextualUpdate('Ребёнок отвлёкся')` for visibility and `'Ребёнок ошибся N раз подряд на task-X'` for mistakes-streak.

Wave 0 RED scaffolds: `lib/__tests__/proactive-triggers-visibility.test.ts`, `lib/__tests__/proactive-triggers-mistakes.test.ts`. All RED until plan 08-08 lands.

## Threat Flags

None new. Plan 08-06 introduces no new network endpoints, no new auth surface, no new schema changes at trust boundaries beyond what was already declared in the plan's threat_model (T-08-06-01..04 above).

## Next Phase Readiness

- Wave 3 of Phase 8 complete (plan 08-06 ✅). All 4 D-03 state-injection channels are now live.
- Plan 08-07 (TrainerPanel progress UI) is independent of VoicePanel and can run in parallel with 08-08 if needed.
- Plan 08-08 (proactive triggers) depends on VoicePanel's `convoCmdRef` latch — already provided by plan 08-04.
- TSC clean across the entire repo; 11/11 plan 08-06 target tests GREEN; other RED scaffolds untouched (still RED — by design).
- No new dependencies added.
- No manual user action required (apart from the still-pending plan 08-03 agent-config PATCH on the VPS).

---
*Phase: 08-agent-control*
*Plan: 06 (Wave 3 — periodic checkpoint GREEN)*
*Completed: 2026-05-13*
