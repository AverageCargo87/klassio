---
phase: 8
slug: agent-control
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-05-13
---

# Phase 8 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.
> Source: 08-RESEARCH.md § Validation Architecture (lines 592-654).

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest 4.x + Playwright 1.59 |
| **Config file** | `tldraw-test/vitest.config.ts` (exists) + `tldraw-test/playwright.config.ts` (exists) |
| **Quick run command** | `npx vitest run --reporter=verbose` |
| **Full suite command** | `npx vitest run --reporter=verbose && npx playwright test --project=chromium` |
| **Estimated runtime** | ~45-90 seconds (vitest only ~15s; E2E adds ~30-75s depending on lesson session bootstrap) |

---

## Sampling Rate

- **After every task commit:** Run `npx vitest run --reporter=verbose`
- **After every plan wave:** Run `npx vitest run && npx playwright test --project=chromium`
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** ~15s vitest tier; ~90s full tier (dimension 8 sampling target: per-commit feedback < 30s)

---

## Per-Task Verification Map

> Planner fills final Task IDs after PLAN.md generation. Below is the **research-derived requirement → test mapping** that plans must cover.

| Req ID | Behavior | Wave | Test Type | Automated Command | File Exists |
|--------|----------|------|-----------|-------------------|-------------|
| LLM-01 | `restore-agent-config.mjs` PATCH includes 6 client tool definitions (name + description + JSON schema + `type: client`) | 0 | integration | `vitest run scripts/__tests__/restore-agent-config.test` | ❌ W0 |
| LLM-01 | `draw_explanation` handler emits `board:draw_request` (or calls /api/draw fire-and-forget) and returns ack string | 1 | unit | `vitest run lib/__tests__/client-tool-handlers.test` | ❌ W0 |
| LLM-01 | `clear_board` handler emits `board:clear_request` and returns ack string | 1 | unit | `vitest run lib/__tests__/client-tool-handlers.test` | ❌ W0 |
| LLM-01 | `goto_trainer_task` handler emits `trainer:goto_task` (after mini-recap) and returns ack | 1 | unit | `vitest run lib/__tests__/client-tool-handlers.test` | ❌ W0 |
| LLM-01 | `highlight_trainer_task` handler emits `trainer:highlight` and returns ack | 1 | unit | `vitest run lib/__tests__/client-tool-handlers.test` | ❌ W0 |
| LLM-01 | `show_hint` handler emits `trainer:show_hint` and returns ack | 1 | unit | `vitest run lib/__tests__/client-tool-handlers.test` | ❌ W0 |
| LLM-01 | `get_lesson_state` returns compact state string `"topic=X tasks=Y/Z mistakes=[…]"` | 1 | unit | `vitest run lib/__tests__/lesson-state.test` | ❌ W0 |
| LLM-01 | `VoicePanel` passes `clientTools` (6 keys) into `useConversation` and `dynamicVariables` into `startSession` | 2 | component | `vitest run components/panels/__tests__/voice-panel-tools.test` | ❌ W0 |
| LLM-01 | All client tools return promptly (< 50ms after invocation); animation completion is decoupled | 2 | unit | `vitest run lib/__tests__/client-tool-handlers.test` | ❌ W0 |
| PED-02 | `trainer:answer_submitted` → `sendContextualUpdate("✓ task-N (type, ok)")` or wrong-answer variant | 1 | unit | `vitest run lib/__tests__/contextual-update-formatters.test` | ❌ W0 |
| PED-02 | `trainer:hint_opened` → `sendContextualUpdate("Открыл подсказку уровня L на task-N")` | 1 | unit | `vitest run lib/__tests__/contextual-update-formatters.test` | ❌ W0 |
| PED-02 | `trainer:idle_15s` → `sendContextualUpdate("Ребёнок молчит 15 сек на task-N")` | 1 | unit | `vitest run lib/__tests__/contextual-update-formatters.test` | ❌ W0 |
| PED-02 | `task_focused` event is **not** forwarded (allow-list discipline) | 1 | unit | `vitest run lib/__tests__/contextual-update-formatters.test` | ❌ W0 |
| PED-02 | VoicePanel subscribes to forwarded trainer events without re-running on `conversation` ref change (Phase 6.5 cleanup-bug guard) | 2 | component | `vitest run components/panels/__tests__/voice-panel-subs.test` | ❌ W0 |
| HTM-01 | Before `goto_trainer_task` emit, frontend sends mini-recap update `"Переход task-A→task-B. Решено: …"` | 1 | unit | `vitest run lib/__tests__/client-tool-handlers.test` | ❌ W0 |
| HTM-01 | Periodic checkpoint fires every ~10 min (fake timers): `"⏱ 10 мин урока. Решено: N/M, ошибок: K."` | 3 | unit | `vitest run lib/__tests__/periodic-checkpoint.test` | ❌ W0 |
| HTM-01 | Progress UI in TrainerPanel: current task has visual ring/border + lightweight counter "N из M" | 4 | component | `vitest run components/panels/__tests__/trainer-panel-progress.test` | ❌ W0 |
| HTM-01 | `goto_trainer_task` causes smooth-scroll to target task element (verified via mocked `scrollIntoView`) | 4 | component | `vitest run components/panels/__tests__/trainer-panel-progress.test` | ❌ W0 |
| E2E | Tool registration: open lesson, call `clientTools.goto_trainer_task({taskId:'task-3'})` → assert TrainerPanel current task is task-3 | 5 | e2e | `playwright test e2e/voice-agent-tools.spec.ts` | ❌ W0 |
| E2E | Event forwarding: submit answer in TrainerPanel → assert mocked `sendContextualUpdate` called with `"✓ task-N …"` format | 5 | e2e | `playwright test e2e/voice-agent-tools.spec.ts` | ❌ W0 |
| E2E | `dynamic_variables`: start session → assert `startSession` called with `{lesson_topic, total_tasks}` | 5 | e2e | `playwright test e2e/voice-agent-tools.spec.ts` | ❌ W0 |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## E2E Strategy (window.__lessonBus + mocked useConversation)

`window.__lessonBus` is already exposed in non-prod by `LessonBusProvider` (Phase 9 D-11). For Phase 8 E2E:

```typescript
// e2e/voice-agent-tools.spec.ts approach:
// 1. Mock @elevenlabs/react useConversation so:
//    - startSession is a spy that captures dynamicVariables
//    - clientTools registered via prop are accessible on window.__voiceClientTools (test-only escape hatch)
//    - sendContextualUpdate is a spy that captures all text + contextId
// 2. Navigate to /lesson/<test-uuid>
// 3. Simulate client tool invocation by calling window.__voiceClientTools.goto_trainer_task({taskId:'task-3'})
// 4. Assert bus event emitted via window.__lessonBus.on('trainer:goto_task', ...)
// 5. Assert TrainerPanel CSS ring on task-3 element
// 6. Trigger trainer answer (window.__lessonBus.emit('trainer:answer_submitted', ...))
//    → assert mocked sendContextualUpdate received "✓ task-N (numeric, ok)"
```

Reference: Phase 6's `e2e/voice-flow.spec.ts` already mocks `useConversation` at the SDK boundary — extend the same harness, do not invent a new mocking strategy.

---

## Wave 0 Requirements

All Wave 0 test files **must exist before any production code is written** (per planner heuristic — RED before GREEN).

- [ ] `tldraw-test/lib/__tests__/client-tool-handlers.test.ts` — stubs for 6 client tools (LLM-01)
- [ ] `tldraw-test/lib/__tests__/contextual-update-formatters.test.ts` — stubs for 3 event forwarders + allow-list (PED-02)
- [ ] `tldraw-test/lib/__tests__/lesson-state.test.ts` — stubs for `get_lesson_state` compact format (LLM-01)
- [ ] `tldraw-test/lib/__tests__/periodic-checkpoint.test.ts` — stubs with fake timers for 10-min cadence (HTM-01)
- [ ] `tldraw-test/scripts/__tests__/restore-agent-config.test.ts` — stubs for tool definitions PATCH payload (LLM-01)
- [ ] `tldraw-test/components/panels/__tests__/voice-panel-tools.test.tsx` — stubs for `clientTools` + `dynamicVariables` wiring (LLM-01)
- [ ] `tldraw-test/components/panels/__tests__/voice-panel-subs.test.tsx` — stubs for Phase 6.5 cleanup-bug guard (PED-02)
- [ ] `tldraw-test/components/panels/__tests__/trainer-panel-progress.test.tsx` — stubs for ring + counter + smooth-scroll (HTM-01)
- [ ] `tldraw-test/e2e/voice-agent-tools.spec.ts` — E2E scaffold (LLM-01 + PED-02 + HTM-01)

Framework already installed (vitest + Playwright from Phase 6); no install step required.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| 11labs agent config drift check — agent in 11labs UI matches `restore-agent-config.mjs` output | LLM-01 | 11labs API has no read-back parity guarantee; UI drifts (Phase 6.5 lesson) | Run `node scripts/restore-agent-config.mjs`; open 11labs UI; visually verify 6 tools listed + system prompt matches PHASE-6-SETUP-2026-05-10.md § Phase 8 prompt |
| Live conversation with Nataly using new tools (dry-run on prod) | LLM-01 + PED-02 + HTM-01 | Voice/timing/proactive reactions cannot be unit-tested — requires real WS + LLM | User opens admin-test lesson URL, says "объясни сложение в столбик 245+874", verifies Nataly calls `draw_explanation` → board renders → Nataly continues speaking in parallel (INV-02). Then submits wrong answer → Nataly reacts within ~3 sec. Then stays silent 20 sec → Nataly self-prompts. |
| GPT-4.1 mini context drift on 45-min session | LLM-01 | Lost-in-the-middle behavior only observable on long real sessions | Run full 45-min dry-run lesson; track whether Nataly forgets earlier task results or contradicts mini-recap content. Document in Phase 12 QA. |
| Cost watermark per 45-min lesson (Pedagogical + Realtime + 11labs + storage) | LLM-01 success criterion #6 | Cost only emerges from real 11labs billing dashboard | After a full dry-run lesson, pull 11labs usage report + Vercel function logs; compute total RUB cost; record in COSTS.md as Phase 8 watermark; verify ≤ 200 ₽/lesson variable cost envelope. |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags (`vitest run`, not `vitest watch`; `playwright test`, not `--ui`)
- [ ] Feedback latency < 30s for unit tier
- [ ] `nyquist_compliant: true` set in frontmatter (after gsd-plan-checker validates)

**Approval:** pending
