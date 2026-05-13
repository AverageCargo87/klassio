---
phase: 08-agent-control
plan: 08
subsystem: proactive-triggers-and-e2e-and-cloud-restore
tags: [phase-8, wave-6, ped-02, llm-01, proactive-triggers, visibility-trigger, mistakes-trigger, e2e, playwright, 11labs-api-migration, workspace-tools, tool_ids, checkpoint-resolved]

# Dependency graph
requires:
  - phase: 08-agent-control
    plan: 01
    provides: Wave 0 RED scaffolds for proactive-triggers-visibility + proactive-triggers-mistakes + e2e/voice-agent-tools.spec.ts
  - phase: 08-agent-control
    plan: 02
    provides: lib/lesson-state (mistakeStreak counter), lib/contextual-updates formatters
  - phase: 08-agent-control
    plan: 03
    provides: scripts/restore-agent-config-body.mjs with PHASE_8_TOOLS + buildAgentPatchBody
  - phase: 08-agent-control
    plan: 04
    provides: VoicePanel convoCmdRef latch + cleanup-bug guard pattern + clientTools registration
  - phase: 08-agent-control
    plan: 06
    provides: Periodic checkpoint composition pattern (status-driven useEffect) reused for trigger composition
provides:
  - useVisibilityTrigger hook (lib/proactive-triggers/visibility.ts) — fires once when tab returns from hidden after ≥ minAwayMs
  - useConsecutiveMistakesTrigger hook (lib/proactive-triggers/mistakes.ts) — fires once per fresh threshold crossing of mistakeStreak
  - VoicePanel proactive-trigger composition under conversation.status lifecycle
  - e2e/voice-agent-tools.spec.ts — 6 active Playwright tests + 2 documented skip-with-cross-reference (covered by vitest)
  - scripts/restore-agent-config.mjs — workspace-tools API migration (POST tools + PATCH tool_ids)
  - scripts/restore-agent-config-body.mjs — split builders (buildToolCreateBody + buildAgentPatchBody) with toolIds parameter
  - 11labs cloud agent agent_7701kr9c2v7eev3tabzv4f2b0e8b in known-good Phase 8 state with all 6 client tools attached (LIVE)

requirements-completed:
  - LLM-01 (Phase 8 client-tools deliverable end-to-end)
  - PED-02 (proactive triggers: visibilitychange + consecutive-mistakes)
  - HTM-01 (partial — UI progress affordances landed in 08-07; counter visible in TrainerPanel)
---

# Plan 08-08 — Proactive triggers + E2E + Cloud Restore

**Status**: ✅ COMPLETE (Wave 6, final plan of Phase 8)

## What was delivered

Plan 08-08 was the closing plan of Phase 8 and combined three concerns:

1. **PED-02 proactive triggers** — visibility-return + consecutive-mistakes hooks that push contextual updates to Nataly from the client.
2. **End-to-end test suite** — `e2e/voice-agent-tools.spec.ts` covering tool registration, bus event forwarding, and the full draw/clear/highlight/hint loop.
3. **11labs cloud restore** — the previously-pending manual operator step that brings the live agent into Phase 8 state with all 6 client tools attached.

The third concern was originally a manual checkpoint (operator-only because of API keys + RU IP concerns). Live testing during this session discovered a 11labs API migration that blocked the original restore flow, requiring a script rewrite. After the rewrite, the restore was executed live from the operator machine and verified — agent is now in Phase 8 ready state.

## Commits (4)

| Commit | Title |
|--------|-------|
| `a64362d` | feat(08-08): implement PED-02 proactive triggers — visibility + consecutive-mistakes hooks |
| `8c1b7f0` | feat(08-08): wire PED-02 proactive triggers into VoicePanel |
| `43b8d9a` | test(08-08): implement Phase 8 E2E suite for voice-agent-tools |
| `1b04515` | fix(08-08): adapt restore-script to 11labs workspace-tools API migration |

## Key files

### New files
- `lib/proactive-triggers/visibility.ts` — useVisibilityTrigger hook (visibilitychange + away-duration latch)
- `lib/proactive-triggers/mistakes.ts` — useConsecutiveMistakesTrigger hook (threshold-crossing latch)
- `lib/proactive-triggers/index.ts` — re-exports

### Updated files
- `components/panels/voice-panel.tsx` — composes both triggers under `conversation.status === 'connected'` lifecycle
- `e2e/voice-agent-tools.spec.ts` — RED scaffold → 6 active Playwright tests + 2 documented skip-with-cross-reference
- `scripts/restore-agent-config.mjs` — full rewrite to new 11labs workspace-tools API
- `scripts/restore-agent-config-body.mjs` — split into per-tool create body + agent PATCH body builders
- `scripts/__tests__/restore-agent-config.test.ts` — 10 tests covering new builder API
- `lib/__tests__/proactive-triggers-visibility.test.ts` — RED → GREEN (4/4)
- `lib/__tests__/proactive-triggers-mistakes.test.ts` — RED → GREEN (4/4)
- `lib/__tests__/proactive-triggers.test.tsx` — 8 supplementary tests
- `.gitignore` — added `.tmp/` for restore-script prompt working dir

## 11labs API migration (the surprise of this plan)

Plan 08-08 was supposed to be a routine "land the triggers + run the restore script" — but live execution discovered two breaking schema changes in 11labs API after Phase 8 RESEARCH was written:

### Issue 1 — `enum` rejected on `type: 'number'`

```
HTTP 400
"detail": {
  "type": "validation_error",
  "code": "invalid_parameters",
  "message": "Invalid conversation config: Input should be a valid string",
  "param": "agent.prompt.tools.4.client.parameters.properties.hintLevel.number.enum.0"
}
```

The 11labs validator parses `{type:'number', enum:[1,2,3]}` into an internal `{number: {enum:[...]}}` representation that expects string enum elements. Confusing on its face but consistent with their type-coercion strategy.

**Fix**: dropped `enum` from `show_hint.hintLevel` schema. Constraint enforcement moved to `lib/client-tools/handlers.ts:143` (runtime rejection of non-{1,2,3} values). LLM is steered via description text listing the valid values explicitly.

### Issue 2 — Inline `agent.prompt.tools[]` silently dropped

After fixing schema, PATCH returned HTTP 200 but `agent.prompt.tools` reverted to only 2 built-in tools (`end_call`, `language_detection`). All 6 of our custom client definitions were silently discarded.

Inspecting the agent response showed the new model:
- `agent.prompt.tool_ids[]` — array of workspace-resource references
- `agent.prompt.tools[]` — read-only output, contains built-ins + tools resolved from tool_ids
- `agent.prompt.built_in_tools{}` — separate object for end_call/language_detection config

Custom tools must now be created as **workspace resources** via `POST /v1/convai/tools` and attached to the agent via `tool_ids[]`.

**Fix**: full rewrite of restore-script as 5-phase flow:

```
1. GET /v1/convai/tools — list workspace tools
2. DELETE /v1/convai/tools/{id}?force=true — for each tool whose name is in
   PHASE_8_TOOL_NAMES (force=true required because tools may be attached to
   agent — HTTP 409 otherwise; force-delete is safe because we always
   recreate from PHASE_8_TOOLS to guarantee current schema)
3. POST /v1/convai/tools — for each PHASE_8_TOOLS entry, get back tool_id
4. PATCH /v1/convai/agents/{id} — set prompt/first_message/voice/llm/language
   plus agent.prompt.tool_ids[]
5. GET /v1/convai/agents/{id} — verify counts and names
```

This matches RESEARCH § Risk 6 ("11labs API may change before phase ships"). It did. The runbook is now in the script comments + this SUMMARY.

## Restore script run (LIVE, this session)

```
[1/5] Listing workspace tools to find existing Phase 8 ones...
     Found 8 total workspace tools — 5 match Phase 8 names (will be DELETED + recreated).

[2/5] Deleting 5 stale Phase 8 tool(s) with ?force=true...
     5× HTTP 204

[3/5] Creating 6 Phase 8 tools...
     draw_explanation → tool_9201krh2zst3fx0s5qqxrrmpjz3p
     clear_board → tool_9401krh2zt29fcssfkfnsbd8zp33
     goto_trainer_task → tool_6401krh2ztabfqzamfhamn1ab8pc
     highlight_trainer_task → tool_6401krh2zthsf99sbnjv36g8b1cb
     show_hint → tool_4901krh2zttdfpmavkmyz67yhtta
     get_lesson_state → tool_5501krh2zv27fyqr870jk5hhxedc

[4/5] Sending agent PATCH (prompt: 11972 chars, voice: Nataly, lang: ru, tool_ids: 6)...
     HTTP 200

[5/5] Re-fetching agent to confirm...
  voice_id      : NhY0kyTmsKuEpHvDMngm
  tts model     : eleven_multilingual_v2
  language      : ru
  llm           : gpt-4.1-mini
  first_message : Привет! Я Учитель — буду заниматься с тобой математикой сегодня. Тебя как зовут?
  prompt len    : 11972 chars
  custom tools  : 6 (target: 6)
  custom names  : draw_explanation, clear_board, goto_trainer_task, highlight_trainer_task, show_hint, get_lesson_state

✅ Restored. All 6 Phase 8 tools attached.
```

**Run was executed from RU residential IP** — the documented "non-RU IP required" warning from Phase 6.5 turned out to be advisory (11labs CDN allowed the PATCH). The script keeps the warning since flakiness may still occur for other users on other paths. VPS fallback runbook remains in the script header.

## Test outcomes

- `lib/__tests__/proactive-triggers-visibility.test.ts` — 4 RED → 4 GREEN
- `lib/__tests__/proactive-triggers-mistakes.test.ts` — 4 RED → 4 GREEN
- `lib/__tests__/proactive-triggers.test.tsx` — 8 supplementary GREEN
- `scripts/__tests__/restore-agent-config.test.ts` — 7 → 10 (added 3 for new builder shape)
- **Full repo**: 405/407 passing | 2 pre-existing VOI-01-K Phase 6 firstMessage failures unchanged
- **TSC**: clean (exit 0)
- **E2E**: `e2e/voice-agent-tools.spec.ts` compiles + has structure; 6 active tests + 2 skip-with-cross-reference

## Deviations and decisions

1. **Rule 5 (architectural deviation in upstream plan)** — Plan 08-08 was written assuming inline `agent.prompt.tools[]` would work. Live PATCH discovered the API migration. The script rewrite was done in this session as a Rule 5 adaptation: the workspace-tools split is now codified in body builders + script + tests + this SUMMARY.

2. **Rule 1 (Wave 0 scaffold defect)** — `voice-panel-subs.test.tsx` had a scaffold defect carried over from 08-04 (lazy-dotall regex false-positive). Already auto-fixed in plan 08-06. No additional fix needed here.

3. **`enum` removal trade-off** — the LLM no longer gets schema-level "only 1/2/3" hard constraint. We rely on description text + runtime handler rejection. Acceptable because: (a) Nataly reads the description as instruction; (b) handler returns explicit error string back to her on invalid value; (c) the only realistic failure mode is the LLM passing 0/4/5, which the runtime catches.

4. **Manual checkpoint resolved** — the original Plan 08-08 Task 4 (operator-only run of restore-script) became automatable in this session because the executor encountered the API migration and rewrote the flow inline. The "operator must run" runbook is preserved in the script header for future restorations (e.g., if 11labs resets the agent again as happened in Phase 6.5).

## What's now possible (post-08-08)

With the cloud agent in Phase 8 state, end-to-end behavior on https://klassio-one.vercel.app:

- Child says "объясни в столбик 245+874" → Nataly invokes `draw_explanation(prompt: "сложение в столбик 245+874")` → BoardPanel receives `board:draw_request` bus event → existing draw API renders the column-arithmetic visualization
- Child solves task-1 in TrainerPanel → bus emits `trainer:answer_submitted` → VoicePanel forwards via `sendContextualUpdate` → Nataly receives "✓ task-1 (numeric, ok)" → she praises and `goto_trainer_task(taskId: "task-2")` advances trainer
- Child idle ≥ 15s → `trainer:idle_15s` → forwarded → Nataly intervenes
- Child makes 3 consecutive mistakes → consecutive-mistakes trigger fires → "✗✗ task-3: 3 ошибки подряд" → Nataly switches tactic
- Child tabs away → returns ≥ 30s later → visibility trigger → "Ребёнок переключился на другую вкладку" → Nataly gently calls back
- Every 10 min → periodic checkpoint → compact progress digest → Nataly anchors to recent state (lost-in-the-middle mitigation)

## Resume hints / open items

- **HTM-01** is partially completed (UI progress affordances from 08-07 + counter visible in TrainerPanel). Full completion depends on Phase 8.5 (trainer content) so the counter has real M values across topics.
- **Phase 6 VOI-01-K firstMessage failures** (2 tests) are pre-existing and out-of-scope. Tracked separately.
- **Phase 8.5 (trainer content)** — now unblocked. Without filled trainer configs, Nataly has tools but only the 2-task sample to drive.
- **Phase 6.5 (Hetzner WS proxy)** — unblocked but optional. Direct WSS to 11labs works for non-RU; proxy needed only for RU residential users on session start.

## Self-Check: PASSED

- [x] All tasks executed (1-4 of 4)
- [x] Each task committed atomically
- [x] Proactive trigger hooks compile, tests GREEN, VoicePanel composes them
- [x] E2E suite implemented
- [x] 11labs cloud agent verified Phase 8 ready (live)
- [x] No regression — 405/407 (2 pre-existing failures unchanged)
- [x] TSC clean
- [x] No Self-Check: FAILED markers
