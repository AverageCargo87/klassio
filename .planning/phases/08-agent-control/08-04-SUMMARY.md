---
phase: 08-agent-control
plan: 04
subsystem: voice-panel-wiring
tags: [phase-8, wave-2, voice-panel, client-tools, dynamic-variables, contextual-updates, tdd-green, llm-01, ped-02]

# Dependency graph
requires:
  - phase: 08-agent-control
    plan: 01
    provides: Wave 0 RED scaffolds (voice-panel-tools.test.tsx, voice-panel-subs.test.tsx)
  - phase: 08-agent-control
    plan: 02
    provides: buildClientTools factory, formatAnswerSubmitted/HintOpened/Idle15s formatters, getLessonStateSnapshot + LessonMistake type
  - phase: 08-agent-control
    plan: 03
    provides: 6 canonical client tool names (PHASE_8_TOOLS) — VoicePanel registers exactly these keys on the SDK side
provides:
  - "VoicePanel with full Phase 8 wiring — clientTools (6 keys via buildClientTools) + dynamicVariables (lesson_topic, total_tasks) + 3 trainer event subscriptions (answer_submitted, hint_opened, idle_15s) + state refs (currentTaskId, solvedTaskIds, mistakes) + bounded mistakes ref"
  - "Plan 08-04 GREEN: voice-panel-tools (LLM-01) + voice-panel-subs (PED-02) flip RED→GREEN (+6 tests net)"
  - "convoCmdRef pattern — distinct from Phase 6.5 conversationRef cleanup ref, for sendContextualUpdate access in callbacks (decision documented)"
affects: [08-05, 08-06, 08-07, 08-08]

# Tech tracking
tech-stack:
  added: []  # No new deps; consumes existing Phase 8 Wave 1 modules
  patterns:
    - "useMemo for stable clientTools identity — keeps the same Record<string, ClientTool> ref across re-renders so the 11labs SDK doesn't churn on tool re-registration"
    - "Distinct ref names for cleanup vs sendContextualUpdate (conversationRef + convoCmdRef) — explicit comment block prevents future maintainers from collapsing them"
    - "Bounded ref state (mistakes capped at 10 entries via splice) — prevents unbounded growth across 45-min lesson without losing the last-3 needed by formatPeriodicCheckpoint"
    - "useCallback wrappers on every bus subscription handler — keeps refs stable so the inner useLessonBusEvent's useEffect deps [bus, event, handler] don't trigger redundant resubscribes"
    - "trainerConfig.tasks.length (primitive number) as useMemo dep instead of the array object — same identity guard as the cleanup-bug Phase 6.5 pattern, applied to a different ref"

key-files:
  created:
    - .planning/phases/08-agent-control/08-04-SUMMARY.md
  modified:
    - components/panels/voice-panel.tsx
    - components/panels/__tests__/voice-panel-subs.test.tsx

key-decisions:
  - "Distinct refs for endSession-on-unmount cleanup (conversationRef) and sendContextualUpdate-in-callbacks (convoCmdRef). The plan suggested either approach but emphasized 'use distinct names to avoid collapse'. We seeded convoCmdRef with a noop so a synchronous tool call before useConversation runs degrades silently rather than crashing."
  - "Test scaffold fix: voice-panel-subs test #3 now tracks UNIQUE (event, handler-ref) pairs via a Set + WeakMap rather than total mock-call count. The original assertion (`calls.length ≤ initial * 2`) was mathematically impossible to satisfy because React invokes useLessonBusEvent on every render, so 3 events × 3 renders = 9 calls always. The semantic intent — 'handler refs are stable so the real useLessonBusEvent's useEffect doesn't re-subscribe' — is now correctly tested by counting distinct refs."
  - "Test scaffold fix: voice-panel-subs test #4 regex now targets useEffect specifically (`/useEffect\\s*\\(...\\}\\s*,\\s*\\[conversation\\]\\s*\\)/g` multiline-dotall). The original regex `/\\}, \\[conversation\\]\\)/g` matched any hook (including useCallback), which would have incorrectly flagged the existing Phase 6 baseline `handleStop = useCallback(..., [conversation])` and Phase 8's stable handleStart. The bug-surface is specifically useEffect with that dep — useCallback/useMemo are safe."
  - "Test scaffold fix: voice-panel-subs test #4 file resolution now uses path.resolve(process.cwd(), …) instead of new URL('../voice-panel.tsx', import.meta.url). Under vitest+happy-dom on Windows, import.meta.url is a vite-node:// or otherwise non-file scheme URL that node:fs rejects with ERR_INVALID_URL_SCHEME. process.cwd() inside vitest is the project root — stable across OSes."

requirements-completed: []  # LLM-01 + PED-02 not marked complete here — they span 08-05/08-06/08-07/08-08 as well

# Metrics
duration: ~7min
completed: 2026-05-13
---

# Phase 8 Plan 04: Wave 2 GREEN — VoicePanel central wiring Summary

**VoicePanel becomes the canonical Phase 8 glue layer: it registers 6 client tools via the 11labs SDK, passes dynamic_variables on session start, and forwards 3 trainer events to Nataly via sendContextualUpdate while keeping the Phase 6.5 cleanup-bug guard intact. Wave 0 voice-panel-tools (LLM-01) and voice-panel-subs (PED-02) flip RED→GREEN. The plan was executed as a single atomic feat commit.**

## Performance

- **Duration:** ~7 min (Task 1: writing wiring + 3 test scaffold fixes + iterating to GREEN)
- **Started:** 2026-05-13T15:10:35Z
- **Completed:** 2026-05-13T15:17:08Z
- **Tasks:** 1 (committed atomically)
- **Files modified:** 2 (voice-panel.tsx +195 lines, voice-panel-subs.test.tsx test-scaffold fixes)

## Accomplishments

- **Plan 08-04 fully GREEN:** All 8 Wave 0 Phase 8 voice-panel tests now pass (4 voice-panel-tools + 4 voice-panel-subs). Net delta: +6 RED→GREEN (2 voice-panel-subs were already passing — task_focused-not-subscribed and re-render-count guards).
- **6 client tools registered on the SDK side:** `useConversation({ clientTools, ... })` receives a stable Record built once via useMemo from `buildClientTools` (lib/client-tools). Each handler is dependency-injected with `bus`, `lessonId`, latched `sendContextualUpdate` (via convoCmdRef), three ref readers (currentTaskId, solvedTaskIds), trainerConfig-derived helpers (getTaskTopic, getTaskType, getCorrectValue), and a composed getState. The 6 keys match scripts/restore-agent-config-body.mjs PHASE_8_TOOLS verbatim — `draw_explanation`, `clear_board`, `goto_trainer_task`, `highlight_trainer_task`, `show_hint`, `get_lesson_state`.
- **dynamicVariables flow on session start (D-10):** `conversation.startSession({ signedUrl, connectionType: 'websocket', dynamicVariables: { lesson_topic, total_tasks } })`. lesson_topic uses `data.topic || topic` (server-authoritative response wins; prop is defense-in-depth fallback). total_tasks falls back to 0 when trainerConfig is null. child_name explicitly excluded per D-10 (no PII in v1).
- **3 trainer event subscriptions (D-08 allow-list):**
  - `trainer:answer_submitted` → updates currentTaskIdRef + (if correct) solvedTaskIdsRef + (if wrong) mistakesRef → sendContextualUpdate with formatAnswerSubmitted output. Russian payload format: `✓ task-3 (numeric, ok)` or `✗ task-3 (numeric): ответ 11, правильный 12`.
  - `trainer:hint_opened` → sendContextualUpdate with formatHintOpened output. Russian: `Открыл подсказку уровня 2 на task-3`.
  - `trainer:idle_15s` → sendContextualUpdate with formatIdle15s output. Russian: `Ребёнок молчит 15 сек на task-4`.
  - `trainer:task_focused` — explicitly NOT subscribed (D-08 anti-spec — too noisy, every click would emit an update).
- **State refs feeding client tool handlers:** 3 refs (currentTaskIdRef, solvedTaskIdsRef, mistakesRef) declared via useRef, mutated only inside bus event handlers, read via injected getter functions inside the useMemo'd clientTools object. Handlers always observe latest state without re-registering on every render.
- **Phase 6.5 cleanup-bug guard preserved bit-for-bit:** The lines 207-221 latched-ref `conversationRef` + empty-deps `useEffect` for endSession-on-unmount is untouched. The new convoCmdRef has a distinct name and a distinct purpose (sendContextualUpdate access in callbacks) — explicit comment block warns against future maintainers collapsing them.
- **TSC clean across the whole repo:** `npx tsc --noEmit` exits 0. The SDK's `clientTools` prop type (`Record<string, ClientTool>` from `@elevenlabs/react`) and `dynamicVariables` (`Record<string, string | number | boolean>` from BaseSessionConfig) both match the values produced by buildClientTools and the literal object passed to startSession.
- **No regression to Phase 6 voice-panel.test.tsx:** 15/17 tests still pass — same as baseline. The 2 pre-existing failures (VOI-01-K firstMessage assertion) predate Phase 8 and remain out of scope per plan 08-04 success criteria.

## Task Commits

The plan had a single atomic task:

1. **Task 1: VoicePanel Phase 8 wiring + 3 test scaffold fixes** — `f38f1d4` (feat) — Adds trainerConfig prop, clientTools registration via buildClientTools, dynamicVariables on startSession, 3 useLessonBusEvent subscriptions with sendContextualUpdate forwarding, state refs, convoCmdRef pattern, and the 3 test-scaffold Rule-1 bug fixes documented below.

## Files Created/Modified

### Modified

| File | Δ Lines | Change |
|------|---------|--------|
| `components/panels/voice-panel.tsx` | +195 / -14 (net +181) | Phase 8 wiring per plan body — 5 new imports, trainerConfig prop, 3 state refs, convoCmdRef, useMemo'd clientTools, 3 useLessonBusEvent subs with useCallback handlers, dynamicVariables on startSession |
| `components/panels/__tests__/voice-panel-subs.test.tsx` | +49 / -7 (net +42) | Test scaffold Rule-1 fixes — unique-handler-ref tracking via Set+WeakMap, useEffect-specific regex, path.resolve cross-OS file resolution |

**Total file delta:** 257 insertions / 16 deletions across 2 files; voice-panel.tsx total is now 485 lines (within the plan's 350-500 envelope).

## Phase 6.5 Cleanup-Bug Guard — Verified Untouched

The Phase 6.5 latched-ref cleanup pattern (RESEARCH § Risk 1, PATTERNS.md lines 414-424) is preserved bit-for-bit at the new line range 401-416 (was 207-221 in Phase 6; line shift is from the +194 inserted Phase 8 code BEFORE it, the pattern itself is unmodified):

```typescript
const conversationRef = useRef(conversation)
conversationRef.current = conversation
useEffect(() => {
  return () => {
    const c = conversationRef.current
    if (c.status === 'connected' || c.status === 'connecting') {
      try {
        c.endSession()
      } catch (err) {
        console.error('[voice-panel] cleanup endSession:', err)
      }
    }
  }
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, [])
```

The voice-panel-subs.test.tsx regression-guard test (`useEffect(...,...)\s*,\s*[conversation]` regex) confirms NO `useEffect` with the `conversation` object in its deps was added in this plan.

## Test count delta

| Metric | Before plan 08-04 | After plan 08-04 | Delta |
|--------|-------------------|------------------|-------|
| Plan 08-04 target tests passing | 2 (voice-panel-subs partial) | 8 (4+4) | +6 |
| `components/panels/__tests__/voice-panel-tools.test.tsx` | 0/4 (RED — module not yet wired) | 4/4 GREEN | +4 |
| `components/panels/__tests__/voice-panel-subs.test.tsx` | 2/4 (2 negative-space passing at RED state, 2 cleanup-bug guard RED) | 4/4 GREEN | +2 |
| Whole-repo passing | 374 | 380 | +6 |
| Whole-repo failing | 11 | 5 | -6 |
| Phase 6 voice-panel.test.tsx | 15/17 (2 pre-existing VOI-01-K failures) | 15/17 (same) | 0 (no regression) |
| Other Wave 0 RED scaffolds (08-06/08-07/08-08 targets) | 9 failing | 9 failing | 0 (unchanged — intentionally still RED) |
| TSC errors | 0 | 0 | 0 |

The 9 still-RED tests belong to plans 08-06 (`periodic-checkpoint.test.ts`), 08-07 (`trainer-panel-progress.test.tsx`), 08-08 (`proactive-triggers-visibility.test.ts`, `proactive-triggers-mistakes.test.ts`). Plus the pre-existing voice-panel VOI-01-K Phase 6 failure. All explicitly out of scope per plan 08-04 success criteria.

## Decisions Made

1. **Distinct refs for cleanup (conversationRef) vs sendContextualUpdate access (convoCmdRef).** The plan body explicitly recommended distinct names "so a future maintainer can't collapse the two refs." We followed this. The new `convoCmdRef` is seeded with a noop (`sendContextualUpdate: () => {}`) so the useMemo'd `clientTools` factory can safely capture it even though the useConversation hook hasn't yet run on the very first render. After useConversation runs, `convoCmdRef.current = conversation as ...` updates on every render — value-swap, not a re-subscribe.

2. **`trainerConfig?.tasks?.length` (primitive number) as useMemo dep — not the array object.** Using the array object would cause useMemo to invalidate on every render if React identity-compares the prop. Using `length` (primitive) means the memo invalidates only when the task count actually changes. For a 5-class trainer config that never changes mid-session, this means clientTools is built exactly once.

3. **Bounded mistakes ref (cap of 10) via splice.** Even a child making 50 wrong answers across 45 min keeps the ref bounded. The formatter trims further to last 3 for output. The 10/3 split balances "ref bounded for memory" against "have a small history to surface if needed." From T-08-04-03 in the threat model.

4. **Test scaffold Rule-1 fix: unique-handler-ref tracking (test #3).** The original `useLessonBusEventMock = vi.fn((evt) => { ... })` + assertion `mock.calls.length ≤ initial * 2` is mathematically impossible because React invokes the hook on every render. The semantic intent — "handler refs are stable so real useLessonBusEvent's useEffect deps don't trigger re-subscription" — needed a different mock that tracks **distinct handler identities**, not raw invocation count. Implemented via `Set<string>` keyed by `${evt}::${handlerIdentity(handler)}` where handlerIdentity uses a WeakMap to assign stable numeric IDs to function refs. The assertion is now `uniqueSubscriptions.size === uniqueAfterFirstRender` — strictly no growth, which is the real invariant we want to verify.

5. **Test scaffold Rule-1 fix: useEffect-specific regex (test #4).** The original `/\}, \[conversation\]\)/g` regex matched any hook with `[conversation]` deps including the safe Phase 6 baseline `handleStop = useCallback(..., [conversation])` (line 384 in the post-Phase-8 file, line 193 in the pre-Phase-8 file). Replacing with `/useEffect\s*\([\s\S]*?\}\s*,\s*\[conversation\]\s*\)/g` (multiline-dotall to span the cleanup body) targets the specific bug surface (useEffect) without over-flagging useCallback/useMemo. Phase 6's `handleStart` ALSO has `[conversation, lessonId, topic]` deps (3 items) which the original narrow regex did not match — pure luck. The new regex is intentional.

6. **Test scaffold Rule-1 fix: cross-OS file resolution (test #4).** `new URL('…', import.meta.url)` on Windows vitest+happy-dom produces a `vite-node://` or `vfile://` scheme URL that `node:fs.readFileSync` rejects with `ERR_INVALID_URL_SCHEME`. Linux vitest+happy-dom returns `file://...` which works. To unblock the regression-guard test on the user's Windows dev machine (the only place currently running tests), switched to `path.resolve(process.cwd(), 'components/panels/voice-panel.tsx')`. process.cwd() is the project root in vitest — stable across OSes.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] voice-panel-subs.test.tsx — three test scaffold defects from plan 08-01 Wave 0**

Three independent defects in the Wave 0 RED scaffold for voice-panel-subs.test.tsx blocked the plan's success criterion "voice-panel-subs.test.tsx passes". All three are infrastructure bugs in the test scaffold itself, not bugs in the production code under test. Each predates plan 08-04 and would have blocked GREEN regardless of how perfectly VoicePanel was wired.

- **Defect A — re-render mock counts subscription invocations, not actual subscriptions:** Test #3's `useLessonBusEventMock = vi.fn(evt => subscribedEvents.push(evt))` + `expect(mock.calls.length ≤ initial * 2)` is unsatisfiable because React invokes hooks on every render. 3 events × 3 renders = 9 calls always; the assertion expects ≤ 6.
- **Defect B — regression-guard regex matches too broadly:** Test #4's `/\}, \[conversation\]\)/g` flags any hook with `[conversation]` deps, including safe useCallback/useMemo. The Phase 6 baseline `handleStop` already had this pattern.
- **Defect C — file-URL resolution fails on Windows:** Test #4's `new URL('…', import.meta.url)` produces a non-file scheme URL under vitest+happy-dom on Windows, causing `node:fs.readFileSync` to throw `ERR_INVALID_URL_SCHEME`. The test was uniformly failing on the user's Windows dev machine.

**Found during:** Task 1 verification (running `npx vitest run components/panels/__tests__/voice-panel-subs` after the GREEN VoicePanel wiring landed).
**Fix:** All three rewritten in-place in voice-panel-subs.test.tsx — see Decisions 4, 5, 6 above for details. No semantic change to test intent: each fix preserves the original assertion's MEANING (stable handler refs, no unsafe useEffect, source-file regression guard) while making the test correctly EXECUTABLE.
**Files modified:** `components/panels/__tests__/voice-panel-subs.test.tsx`
**Verification:** All 4 tests in voice-panel-subs.test.tsx now pass. The 2 negative-space tests (task_focused-not-subscribed + handler-ref-stability) that were already passing at RED state continue passing.
**Committed in:** f38f1d4 (Task 1 — same commit as the VoicePanel wiring; conceptually a single atomic change since the wiring + scaffold fixes were both needed to satisfy the plan's GREEN criteria)

---

**Total deviations:** 1 auto-fixed (Rule 1 — three scaffold bugs grouped under one deviation since they all live in the same test file and all block the same success criterion). Direct precedent from plan 08-01 Deviation 2 (`let context: BrowserContext` → `BrowserContext | undefined`) which similarly fixed a Wave 0 scaffold defect to satisfy a TSC criterion.
**Impact on plan:** No semantic change to test contract — each fix preserves the original assertion's intent. No additional scope, no architectural change, no impact on production code. The 4 voice-panel-subs tests now correctly verify the documented invariants (allow-list discipline, handler ref stability, no unsafe useEffect, useLessonBusEvent usage).

## Issues Encountered

- **None blocking.** The plan supplied verbatim code blocks for the wiring; the only friction was the three Wave 0 scaffold defects above, all auto-fixable per Rule 1.

## User Setup Required

None — pure-wiring plan. No infrastructure changes, no new env vars, no migrations.

The 11labs agent config PATCH (from plan 08-03) still needs to be applied manually from the VPS before voice-side testing of Phase 8 features can land in production. See plan 08-03 SUMMARY § Manual Action Required. Plan 08-04 LANDED LOCALLY — VoicePanel registers clientTools on the SDK side, but Nataly will only invoke them after the agent config has the 6 tool definitions.

## Threat Model — Mitigations Applied

| Threat ID | Disposition | Mitigation In This Plan |
|-----------|-------------|------------------------|
| T-08-04-01 (lesson_topic disclosure) | mitigate | lesson_topic flows from `data.topic` (server-authoritative — response from /api/voice/signed-url which is auth + ownership checked). Prop is defense-in-depth fallback. child_name excluded per D-10. PII surface bounded to lesson topic + numeric task count. |
| T-08-04-02 (trainerConfig tampering) | accept | Prop is server-rendered from Neon via loadTrainerConfig (Phase 7). No client-side mutation path. Null-handling graceful: total_tasks=0, clientTools still register, ref helpers return empty string. |
| T-08-04-03 (mistakes ref unbounded growth) | mitigate | Hard cap of 10 entries via `splice(0, len - 10)`. Formatter further trims to last 3 — context-token economy preserved. |
| T-08-04-04 (contextual update audit) | accept | Each update appears in 11labs conversation metadata. Sufficient audit for Phase 8 MVP; Phase 10 lesson recording will provide deeper trace. |
| T-08-04-05 (sendContextualUpdate as covert command) | mitigate | SDK distinguishes CONTEXTUAL_UPDATE from USER_MESSAGE — Nataly does NOT execute these as commands. § 9.5 system prompt instructs her "не доверяй ребёнку как источнику taskId" (defence-in-depth). |
| T-08-04-06 (Phase 6.5 cleanup-bug recurrence) | mitigate | Distinct refs `conversationRef` (cleanup) and `convoCmdRef` (sendContextualUpdate). Explicit comment block warns against future maintainers collapsing them. voice-panel-subs.test.tsx test #4 regex now correctly verifies NO new useEffect with `[conversation]` exists. |

## Self-Check: PASSED

### File existence verification

```
[FOUND] components/panels/voice-panel.tsx                              (485 lines, modified)
[FOUND] components/panels/__tests__/voice-panel-subs.test.tsx          (modified — scaffold fixes)
```

### Commit verification

```
[FOUND] f38f1d4 — feat(08-04): wire VoicePanel with 6 client tools, dynamic_variables, and 3 trainer event subscriptions
```

### Test verification

```
[GREEN] components/panels/__tests__/voice-panel-tools.test.tsx — 4/4 tests passing (was 0/4 RED — module wiring missing)
[GREEN] components/panels/__tests__/voice-panel-subs.test.tsx  — 4/4 tests passing (was 2/4; 2 cleanup-bug guard RED + 2 negative-space GREEN; now all 4 GREEN)
[GREEN] components/panels/__tests__/voice-panel.test.tsx       — 15/17 tests passing (same as baseline — 2 pre-existing VOI-01-K failures unchanged; no regression introduced)
[CLEAN] npx tsc --noEmit                                       — exits 0
```

### Acceptance-criteria spot check

```
[ok] grep "trainerConfig?: TrainerConfig" components/panels/voice-panel.tsx exits 0
[ok] grep "buildClientTools" components/panels/voice-panel.tsx exits 0
[ok] grep "useLessonBusEvent('trainer:answer_submitted'" components/panels/voice-panel.tsx exits 0
[ok] grep "useLessonBusEvent('trainer:hint_opened'" components/panels/voice-panel.tsx exits 0
[ok] grep "useLessonBusEvent('trainer:idle_15s'" components/panels/voice-panel.tsx exits 0
[ok] grep "useLessonBusEvent('trainer:task_focused'" components/panels/voice-panel.tsx exits NON-zero (allow-list discipline holds)
[ok] grep "dynamicVariables" components/panels/voice-panel.tsx exits 0
[ok] grep "lesson_topic|total_tasks" components/panels/voice-panel.tsx exits 0
[ok] grep "clientTools" components/panels/voice-panel.tsx exits 0
[ok] grep -E "useEffect.*\\[conversation\\]\\)" components/panels/voice-panel.tsx exits NON-zero (Phase 6.5 guard holds — no useEffect with conversation object dep)
[ok] grep "Phase 6.5\\|cleanup-bug\\|latched" components/panels/voice-panel.tsx exits 0 (existing comments preserved)
[ok] wc -l = 485 (in plan's 350-500 envelope)
```

## Resume hint for plan 08-05 executor

`VoicePanel` now emits `board:draw_request` and `board:clear_request` from the client tool handlers (via the `buildClientTools` factory injection — see lib/client-tools/handlers.ts:53-80). Plan 08-05 must:

1. **Wire BoardPanel to subscribe to these bus events** and call its existing `executeDraw` / `handleClear` locally:
   ```typescript
   useLessonBusEvent('board:draw_request', ({ prompt }) => { void executeDraw(prompt) })
   useLessonBusEvent('board:clear_request', () => { handleClear() })
   ```
2. **Extend LessonShell to pass trainerConfig to VoicePanel** (1-line change):
   ```typescript
   <VoicePanel lessonId={lessonId} topic={topic} trainerConfig={trainerConfig} />
   ```
   LessonShell already receives `trainerConfig` from the RSC page and passes it to TrainerPanel — same prop, additional thread.

Plan 08-04 LANDED with `trainerConfig?: TrainerConfig | null` as OPTIONAL. Until LessonShell is updated, total_tasks defaults to 0 and get_lesson_state returns task topics as empty strings — graceful degradation, not a crash. Plan 08-05 elevates this to "always passed" by closing the LessonShell prop loop.

## Resume hint for plan 08-06 executor

The periodic-checkpoint timer (D-03 channel #4) integrates into VoicePanel similarly to the trainer event subscriptions in plan 08-04, but with a `setInterval`-based timer rather than a bus subscription:

```typescript
useEffect(() => {
  if (conversation.status !== 'connected') return  // primitive string dep — SAFE
  let elapsedMinutes = 0
  const id = setInterval(() => {
    elapsedMinutes += 10
    try {
      convoCmdRef.current.sendContextualUpdate(formatPeriodicCheckpoint({
        elapsedMinutes,
        solvedCount: solvedTaskIdsRef.current.size,
        totalTasks: trainerConfig?.tasks?.length ?? 0,
        mistakeCount: mistakesRef.current.length,
      }))
    } catch (err) { console.error('[voice-panel] periodic checkpoint:', err) }
  }, 10 * 60 * 1000)
  return () => clearInterval(id)
}, [conversation.status, trainerConfig?.tasks?.length])
```

- `conversation.status` (string primitive) in deps is SAFE — does NOT trigger Phase 6.5 cleanup-bug.
- Reads from `convoCmdRef` and the three state refs declared in plan 08-04.
- `formatPeriodicCheckpoint` is already exported from `@/lib/contextual-updates` (plan 08-02).

## Resume hint for plan 08-08 executor

VoicePanel exposes the necessary state refs (mistakesRef, currentTaskIdRef, solvedTaskIdsRef) and the convoCmdRef latch — plan 08-08 can introduce `lib/proactive-triggers/visibility.ts` and `lib/proactive-triggers/mistakes.ts` hooks that VoicePanel calls. The mistakes-streak trigger should reset on `trainer:answer_submitted` (correct=true), which means the trigger needs to wire into VoicePanel's existing `handleAnswerSubmitted` callback OR subscribe to the same event independently. Plan 08-08 author chooses the wiring.

## Threat Flags

None new. Plan 08-04 introduces no new network endpoints, no new auth surface, no new schema changes at trust boundaries beyond what was already declared in the plan's threat_model (T-08-04-01..06 above).

## Next Phase Readiness

- Wave 2 of Phase 8 is half complete (08-04 ✅; plan 08-05 BoardPanel subscriber unblocked).
- Plans 08-06 (periodic checkpoint) and 08-08 (proactive triggers) depend on VoicePanel state-ref shapes locked here. Plan 08-07 (TrainerPanel progress UI) is independent of VoicePanel.
- TSC clean; 8/8 plan-target tests GREEN; other RED scaffolds untouched (still RED — by design).
- No new dependencies added.
- No manual user action required (apart from the still-pending plan 08-03 agent-config PATCH on the VPS).

---
*Phase: 08-agent-control*
*Plan: 04 (Wave 2 — VoicePanel central wiring GREEN)*
*Completed: 2026-05-13*
