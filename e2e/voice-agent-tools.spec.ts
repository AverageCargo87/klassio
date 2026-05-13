// E2E for Phase 8 — exercises the full client-tool / contextual-update loop without
// touching real 11labs. Pattern follows e2e/voice-flow.spec.ts:
//   1. addInitScript stubs @elevenlabs/react so useConversation returns spies
//   2. Stubbed clientTools are exposed on window.__voiceClientTools (test escape hatch)
//   3. window.__lessonBus is already exposed by LessonBusProvider in non-prod (Phase 9 D-11)
//
// All tests are test.fixme() RED stubs — Wave 5 plan 08-08 implements the SDK stubbing
// harness and flips them GREEN. Covers LLM-01 + PED-02 + HTM-01 voice-agent-tools flow.
import { test, expect, chromium } from '@playwright/test'
import type { BrowserContext } from '@playwright/test'
import { makeTestEmail, resetTestDb, readMagicLinkFor, clearMagicLinkFile } from './fixtures/db-setup'

const BASE_URL = process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:3000'

test.describe('Voice agent tools — LLM-01 + PED-02 + HTM-01', () => {
  let context: BrowserContext | undefined

  test.beforeAll(async () => {
    test.fixme(true, 'Wave 5 plan 08-08 implements the SDK stubbing harness; RED until then')
    // Real setup (login once + seed lesson with trainerConfig) will land in plan 08-08.
    // The unused imports above (chromium, BrowserContext, db-setup helpers, BASE_URL) document
    // the eventual seeding/login pattern from e2e/voice-flow.spec.ts.
    void chromium; void makeTestEmail; void resetTestDb; void readMagicLinkFor; void clearMagicLinkFile; void BASE_URL
  })

  test.afterAll(async () => { await context?.close() })

  test('client tool → bus event → trainer UI reacts (LLM-01)', async () => {
    expect(true).toBe(false) // RED stub — checkmark ✓ format documented
  })

  test('trainer answer → sendContextualUpdate called with "✓ task-N (numeric, ok)" (PED-02)', async () => {
    expect(true).toBe(false) // RED stub — ✓ / ✗ format documented
  })

  test('startSession dynamicVariables include lesson_topic + total_tasks (LLM-01 + D-10)', async () => {
    expect(true).toBe(false) // RED stub
  })

  test('mini-recap is sent before goto_trainer_task emits (HTM-01 + D-03)', async () => {
    expect(true).toBe(false) // RED stub
  })

  test('idle_15s event triggers sendContextualUpdate with task name (PED-02)', async () => {
    expect(true).toBe(false) // RED stub
  })
})
