---
phase: 08-agent-control
plan: 03
subsystem: agent-config-restore
tags: [phase-8, wave-1, agent-config, 11labs-patch, client-tools, restore-script, system-prompt, llm-01, d-11]

# Dependency graph
requires:
  - phase: 06-voice
    provides: scripts/restore-agent-config.mjs (Phase 6 baseline PATCH for voice/LLM/prompt)
  - phase: 08-agent-control
    plan: 01
    provides: scripts/__tests__/restore-agent-config.test.ts RED scaffold (7 tests gating buildAgentPatchBody + PHASE_8_TOOLS contract)
provides:
  - "Pure ESM body builder scripts/restore-agent-config-body.mjs — exports PHASE_8_TOOLS (6-entry array) + buildAgentPatchBody (factory)"
  - "Refactored scripts/restore-agent-config.mjs — thin orchestrator that PATCHes Nataly to Phase-8 canonical state (Phase 6 voice/LLM + 6 client tools + new system prompt)"
  - "Canonical Phase 8 system prompt addendum in .planning/PHASE-6-SETUP-2026-05-10.md § 9.5 — 6 tool surface, narrative lesson structure (D-04), dynamic_variables references, ✓/✗ semantic key, mini-recap format, PED-02 trigger interpretations"
affects: [08-04, 08-05, 08-06, 08-08]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Pure ESM body-builder module factored out of orchestrator — enables vitest unit testing of PATCH payload without invoking fetch"
    - "Dependency injection via buildAgentPatchBody({prompt, firstMessage, voiceId, tools}) — explicit tools parameter so future phases can extend without modifying the builder"
    - "Russian tool descriptions for Nataly's LLM context (RU system prompt + RU ASR keywords + RU tool descriptions are coherent)"
    - "PATCH body key locked at conversation_config (snake_case, singular) — verified working in Phase 6.5 production; documented in module header to prevent drift to the adjective-form key"

key-files:
  created:
    - scripts/restore-agent-config-body.mjs
  modified:
    - scripts/restore-agent-config.mjs
    - .planning/PHASE-6-SETUP-2026-05-10.md

key-decisions:
  - "Embedded PHASE_8_TOOLS inline in the body module (OQ-5 resolution) — script must be portable to the Frankfurt VPS; loading external JSON would require bundling or path assumptions"
  - "Russian tool descriptions instead of English — Nataly reads them in her system context to decide WHEN to call each tool; Russian descriptions match her Russian system prompt + RU ASR"
  - "execution_mode: 'immediate' + expects_response: true for all 6 tools — supports INV-02 fire-and-forget (Nataly speaks while board animates) while still feeding back the ack/error string so Nataly can reason about success/failure"
  - "PHASE-6-SETUP § 9.5 is ADDITIVE — § 9 Phase 6 baseline prompt preserved verbatim. Diff is 78 insertions / 0 deletions, so Phase 6 reproducibility is intact"
  - "Did NOT mark LLM-01 complete in REQUIREMENTS.md — LLM-01 spans the entire phase (plans 08-04 VoicePanel wiring, 08-05 BoardPanel subscriber, 08-06 periodic checkpoint must also land before LLM-01 can be checked off). Consistent with siblings 08-01 + 08-02 (both deferred LLM-01 to phase-end)"

requirements-completed: []  # LLM-01 deferred — spans plans 08-03..08-08

# Metrics
duration: ~5min
completed: 2026-05-13
---

# Phase 8 Plan 03: Wave 1 GREEN — agent-config restore script extension Summary

**Pure ESM body builder + 6 client tool definitions + § 9.5 system prompt addendum extend `scripts/restore-agent-config.mjs` from Phase 6 baseline to Phase 8 canonical state. The 7 Wave 0 restore-agent-config tests flip GREEN; the script remains idempotent and printf-verifiable; the Frankfurt-VPS deploy path is preserved.**

## Performance

- **Duration:** ~5 min (Task 1: ~3 min including comment-hygiene rewording, Task 2: ~2 min)
- **Started:** 2026-05-13T14:56:18Z
- **Completed:** 2026-05-13T15:01:35Z
- **Tasks:** 2 (committed atomically)
- **Files created:** 1 (177 LoC pure ESM)
- **Files modified:** 2 (restore script refactored; PHASE-6-SETUP doc extended additively)

## Accomplishments

- **Plan 08-03 fully GREEN:** All 7 Wave 0 `scripts/__tests__/restore-agent-config.test.ts` tests pass (was 7 RED at plan start). Net delta: +7 passing tests.
- **Two-file split locks unit-testability:** `restore-agent-config-body.mjs` (pure ESM, no fetch/no env/no fs) is the testable module the Wave 0 spec imports via `@/scripts/restore-agent-config-body`. `restore-agent-config.mjs` (orchestrator) does fetch + env + readFileSync. The split mirrors plan 08-02's pure-lib pattern: side effects on one side of an import boundary, pure logic on the other.
- **All 6 D-07 tool definitions land with the correct shape:** draw_explanation, clear_board, goto_trainer_task, highlight_trainer_task, show_hint, get_lesson_state — each with `type: 'client'`, `execution_mode: 'immediate'`, `expects_response: true`, `response_timeout_secs: 20`, JSON-schema parameters. show_hint.hintLevel uses literal `enum: [1, 2, 3]` so the LLM can only pick from {1,2,3}.
- **PATCH body key is locked at `conversation_config`:** snake_case singular. Module header comment explicitly warns against drifting to the adjective-form key shown in some API references — this is the Phase 6.5 production-verified shape and breaking it would silently fail PATCH (11labs ignores unknown keys).
- **PHASE-6-SETUP § 9.5 documents the operator contract:** all 6 tools with Russian usage guidance for Nataly (when to call each, exact taskId format, hintLevel semantics, get_lesson_state as safety net), narrative lesson structure per D-04 (no explicit phases), `{{lesson_topic}}` + `{{total_tasks}}` dynamic_variables references per D-10, the `✓`/`✗` semantic key per D-08, mini-recap format per D-03, and the Page Visibility + consecutive-mistakes PED-02 triggers that future plans 08-08 will emit.
- **§ 9 Phase 6 baseline prompt preserved verbatim:** Diff is 78 insertions / 0 deletions on PHASE-6-SETUP-2026-05-10.md. Phase 6 reproducibility intact.
- **Idempotency holds:** Re-running `node scripts/restore-agent-config.mjs` after the first run PATCHes the same body shape — no merge, no duplicate tools, no version-drift artifacts. PATCH overwrite semantics are exactly what idempotency requires.

## Task Commits

Each task was committed atomically:

1. **Task 1: scripts/restore-agent-config-body.mjs** — `7c28e1e` (feat) — Pure ESM body builder with PHASE_8_TOOLS (6-entry array) + buildAgentPatchBody factory. 177 LoC, no fetch/env/fs imports.
2. **Task 2: refactor scripts/restore-agent-config.mjs + PHASE-6-SETUP § 9.5** — `a0f18a0` (feat) — Replaced inline body construction with import of body module symbols. Added verification prints (`tools count`, `tool names`). Inserted § 9.5 Phase 8 System Prompt Addendum between § 9 (untouched) and § 10. Updated scp/ssh hint to copy both `restore-agent-config*.mjs` files.

**Plan metadata:** to be added in final commit.

## Files Created/Modified

### Created (Production code)

| File | Lines | Exports | Purpose |
|------|-------|---------|---------|
| `scripts/restore-agent-config-body.mjs` | 177 | `PHASE_8_TOOLS`, `buildAgentPatchBody`, `NATALY_VOICE_ID`, `TTS_MODEL_ID`, `LLM_MODEL`, `LANGUAGE` | Pure ESM body builder — unit-testable PATCH body shape + 6 client tool defs |

### Modified

| File | Δ Lines | Change |
|------|---------|--------|
| `scripts/restore-agent-config.mjs` | -24 / +27 (refactor; net +3) | Imports body module; thin orchestrator; verification prints tools count + names; header documents D-11 + Risk 6 |
| `.planning/PHASE-6-SETUP-2026-05-10.md` | +78 / -0 (additive) | § 9.5 Phase 8 System Prompt Addendum — 6 tools, narrative structure, dynamic_variables refs, ✓/✗ key, mini-recap format, PED-02 triggers |

**Total new code:** 282 insertions / 24 deletions across 3 files.

## Test count delta

| Metric | Before plan 08-03 | After plan 08-03 | Delta |
|--------|-------------------|------------------|-------|
| Plan 08-03 target tests passing | 0 | 7 | +7 |
| `scripts/__tests__/restore-agent-config.test.ts` | 0/7 (RED — module missing) | 7/7 GREEN | +7 |
| Other RED scaffolds (08-04/06/07/08 targets) | 9 failing | 9 failing | 0 (unchanged — intentionally still RED) |
| Pre-existing voice-panel.test.tsx VOI-01-K failure | 1 failing | 1 failing | 0 (predates Phase 8) |
| TSC errors | 0 | 0 | 0 |

The 9 still-RED tests belong to plans 08-04 (`voice-panel-tools.test.tsx`, `voice-panel-subs.test.tsx`), 08-06 (`periodic-checkpoint.test.ts`), 08-07 (`trainer-panel-progress.test.tsx`), 08-08 (`proactive-triggers-visibility.test.ts`, `proactive-triggers-mistakes.test.ts`). Plus the pre-existing voice-panel VOI-01-K Phase 6 failure. All explicitly out of scope per the plan's own success criteria.

## Decisions Made

1. **Inline tool definitions over external JSON (OQ-5 resolution).** The script must be portable — operators scp it to the Frankfurt VPS and run there (RU IPs are flaky against 11labs). An external `agent-tools-config.json` would either require bundling (adds toolchain) or path assumptions (breaks portability). Inline ESM constants are simplest and match the existing PROMPT-file pattern (the prompt itself is loaded from a file for historical reasons — large copy-pasteable text is a different shape than 6 small structured objects).

2. **Russian tool descriptions, not English.** The 11labs LLM reads tool descriptions in its system context to decide *when* to call each tool. Nataly's system prompt is Russian, her ASR is Russian, her TTS is Russian — English descriptions would be the odd one out and could subtly degrade tool-selection quality. Russian descriptions match the conversational language model context.

3. **`execution_mode: 'immediate'` + `expects_response: true` for ALL 6 tools.** This combination supports D-09 fire-and-forget (Nataly continues speaking while the tool runs) AND gives her back the ack/error string so she can react ("Error: board unavailable, narrate verbally" → she falls back to voice explanation). Pure `expects_response: false` would lose the error feedback channel; pure `post_tool_speech` mode would force her to stop speaking until the tool returns — breaking INV-02.

4. **`response_timeout_secs: 20` is generous on purpose.** Handlers themselves return in < 50ms (the actual animation is decoupled). But the SDK's transport-level timeout safety net is 20s. If anything that big-screw happens (network hiccup between browser and 11labs websocket), the timeout gracefully degrades to a normal "no response" path instead of locking up the conversation.

5. **PATCH body key `conversation_config` documented prominently.** Module header has a `CRITICAL` note explaining that the API reference shows the adjective-form key in some places, but production uses the noun-form snake_case and 11labs accepts it. This is the Phase 6.5 production-verified shape. Plan-Checker iteration discovered this discrepancy in research; the comment serves as a tripwire for future maintainers who might "correct" the key based on the API reference.

6. **Comment-hygiene rewording for grep-based acceptance criteria.** Initial draft of the body module had a comment literally mentioning the adjective-form key as a counter-example ("The API reference confusingly shows `conversational_config`..."). The plan's literal grep acceptance criterion `grep -q "conversational_config"` exits NON-zero requires the string to be absent from the file. Rewrote the comment to use natural language ("the adjective-form key shown in some places") which preserves documentation intent and passes the literal grep check. Same precedent as plan 08-02 Decision 4.

7. **LLM-01 not marked complete in REQUIREMENTS.md.** This plan delivers only the agent-config piece of LLM-01 (which requires plans 08-04 VoicePanel wiring + 08-05 BoardPanel subscriber + 08-06 periodic checkpoint to all land before the requirement is fully satisfied). Consistent with siblings 08-01 + 08-02 which also deferred LLM-01 completion to phase-end. Verifier or phase-completion plan will mark it.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Module header comment contained literal `conversational_config` string**
- **Found during:** Task 1 acceptance verification
- **Issue:** Plan's verbatim code block for `restore-agent-config-body.mjs` included a documentation comment that mentioned `conversational_config` as a counter-example to clarify which key is correct. The plan's literal acceptance grep `grep -q "conversational_config" scripts/restore-agent-config-body.mjs` should exit NON-zero, but the comment caused it to exit 0.
- **Fix:** Reworded the comment to convey the same documentation intent without using the literal string. New text: "The 11labs API reference confusingly shows the adjective-form key (with extra 'ational') in some places, but the script in production uses the noun-form snake_case key shown above and 11labs accepts it."
- **Files modified:** `scripts/restore-agent-config-body.mjs`
- **Verification:** `grep -q "conversational_config" scripts/restore-agent-config-body.mjs` now exits 1 (absent); 7/7 Wave 0 tests still pass; both forms of the key are still distinguished in the comment.
- **Committed in:** 7c28e1e (Task 1)

---

**Total deviations:** 1 auto-fixed (Rule 3 — blocking against literal acceptance criteria).
**Impact on plan:** No semantic change. Documentation intent preserved through rewording. No additional scope, no architectural change. Direct precedent from plan 08-02 Decision 4 / Deviation 1.

## Issues Encountered

- **None blocking.** The plan supplied verbatim code blocks for both tasks; the only friction was the literal grep-based acceptance criterion above. The plan-supplied PATCH body shape was already correct (verified against Phase 6.5 production behavior in research), the Russian tool descriptions matched Nataly's existing system-prompt register, and the operator-instruction wording at the end of § 9.5 fit the existing PHASE-6-SETUP doc tone.

## Manual Action Required

> **Operator: PATCH the live 11labs agent before testing Phase 8 features in production.**

This plan ships only the LOCAL definitions of Nataly's Phase 8 state. The actual 11labs cloud agent (`agent_7701kr9c2v7eev3tabzv4f2b0e8b`) does not pick up these changes until someone runs the script.

**To apply:**

1. Edit `/tmp/klassio-prompt.txt` on the VPS — append the § 9.5 block from `.planning/PHASE-6-SETUP-2026-05-10.md` to the END of the existing Phase 6 baseline prompt.
2. scp the two restore script files to the VPS (RU IPs are flaky against 11labs API):
   ```bash
   scp scripts/restore-agent-config*.mjs root@87.120.93.35:/tmp/
   ```
3. ssh in and run:
   ```bash
   ELEVENLABS_API_KEY=sk_... ELEVENLABS_AGENT_ID=agent_7701kr9c2v7eev3tabzv4f2b0e8b \
     node /tmp/restore-agent-config.mjs
   ```
4. Verify the script's verification output prints `tools count: 6` and `tool names: draw_explanation, clear_board, goto_trainer_task, highlight_trainer_task, show_hint, get_lesson_state`.
5. Open the 11labs agent UI in a browser and confirm the 6 tools are listed under the Tools tab.

**Without this manual action, Nataly will not have the 6 tools registered.** VoicePanel wiring (plan 08-04) can still register `clientTools` on the SDK side, but the LLM will never call them because the agent config doesn't know they exist.

## Self-Check: PASSED

### File existence verification

```
[FOUND] scripts/restore-agent-config-body.mjs                 (177 lines, 5841 bytes)
[FOUND] scripts/restore-agent-config.mjs                      (82 lines, modified)
[FOUND] .planning/PHASE-6-SETUP-2026-05-10.md                 (modified, § 9.5 added)
```

### Commit verification

```
[FOUND] 7c28e1e — feat(08-03): extract testable PATCH body builder + 6 Phase 8 client tool definitions
[FOUND] a0f18a0 — feat(08-03): refactor restore script to import body builder + document § 9.5 tool surface
```

### Test verification

```
[GREEN] scripts/__tests__/restore-agent-config.test.ts        — 7/7 tests passing (was 7 RED)
[CLEAN] npx tsc --noEmit                                       — exits 0
[CLEAN] node --check scripts/restore-agent-config-body.mjs    — exits 0
[CLEAN] node --check scripts/restore-agent-config.mjs         — exits 0
[CLEAN] dry-run env-guard test                                 — script exits 1 cleanly when env vars empty
```

### Acceptance-criteria spot check

```
[ok] export const PHASE_8_TOOLS exists
[ok] export function buildAgentPatchBody exists
[ok] tool name count is exactly 6
[ok] all 6 D-07 tool names present
[ok] type: 'client' on every tool
[ok] execution_mode: 'immediate' on every tool
[ok] response_timeout_secs: 20 on every tool
[ok] expects_response: true on every tool
[ok] conversation_config snake_case key present
[ok] conversational_config (adjective form) NOT present
[ok] show_hint.parameters.properties.hintLevel.enum === [1, 2, 3]
[ok] draw_explanation.parameters.required === ['prompt']
[ok] § 9.5 header present in PHASE-6-SETUP doc
[ok] 6 tool names documented in § 9.5
[ok] {{lesson_topic}} + {{total_tasks}} referenced
[ok] ✓/✗ semantic key documented
[ok] mini-recap format "Переход task-X→task-Y" documented
[ok] Page Visibility PED-02 trigger documented
[ok] § 9 Phase 6 baseline prompt unchanged (diff is +78 / -0)
[ok] orchestrator script imports from body module
[ok] verification step prints tools count + tool names
[ok] node --check passes for both scripts
[ok] env-check guard fires cleanly when API key/agent ID missing
```

## Resume hint for plan 08-04 executor

The Phase 8 tool surface is now LOCKED at the agent-config layer:

- 6 tool names with exact JSON schemas live in `scripts/restore-agent-config-body.mjs` PHASE_8_TOOLS.
- `lib/client-tools/buildClientTools` (plan 08-02 output) implements the 6 handlers with the same names.
- VoicePanel wiring must register these same 6 keys via `useConversation({ clientTools })`.

**The keys must match exactly** (`draw_explanation`, `clear_board`, `goto_trainer_task`, `highlight_trainer_task`, `show_hint`, `get_lesson_state`). If a handler is registered under a different key, the 11labs LLM will fail to invoke it (the cloud agent config knows only these 6 names).

**dynamicVariables payload** for `startSession`:
```typescript
dynamicVariables: {
  lesson_topic: data.topic || topic,
  total_tasks: trainerConfig?.tasks?.length ?? 0,
}
```

`lesson_topic` and `total_tasks` are the names referenced in § 9.5 of PHASE-6-SETUP via `{{lesson_topic}}` / `{{total_tasks}}` — Nataly is told they will arrive at session start.

## Resume hint for plan 08-05 executor

BoardPanel subscribes to `board:draw_request` and `board:clear_request` (lesson-bus events added by plan 08-01). The VoicePanel `draw_explanation` handler from plan 08-02 emits `board:draw_request`; the `clear_board` handler emits `board:clear_request`. Plan 08-05 is purely BoardPanel wiring + a probable thread of `trainerConfig` from LessonShell to VoicePanel (per OQ-4 resolution).

## Threat Flags

None found. The agent-config restore script does not introduce new attack surface beyond what already existed in Phase 6.5:
- API key + agent ID remain env-only (T-08-03-01 from threat model)
- PATCH body construction is fully under our control — Russian text descriptions are advisory to the LLM, not authentication (T-08-03-03)
- The script is a single writer for the tools array (T-08-03-02)

## Next Phase Readiness

- Wave 1 of Phase 8 is now fully complete (08-02 ✅ pure libs; 08-03 ✅ agent-config restore).
- Wave 2 (plans 08-04 VoicePanel + 08-05 BoardPanel) is unblocked.
- TSC clean; 7/7 plan-target tests GREEN; other RED scaffolds untouched (still RED — by design).
- No new dependencies.
- Manual action required: operator must run `node scripts/restore-agent-config.mjs` from VPS with real env vars before voice-side testing of Phase 8 features in production.

---
*Phase: 08-agent-control*
*Plan: 03 (Wave 1 — agent-config restore script extension)*
*Completed: 2026-05-13*
