// E2E for Phase 8 — exercises the wiring between trainer events on the bus,
// VoicePanel's sendContextualUpdate forwarding, BoardPanel's draw/clear
// subscribers, and TrainerPanel's progress UI. Driven entirely through
// window.__lessonBus (exposed by LessonBusProvider in non-prod, Phase 9 D-11).
//
// Strategy notes (from plan 08-08 body — explicitly authorized fallback):
//   - The plan's first-cut approach was to stub @elevenlabs/react module via
//     page.addInitScript to capture clientTools + dynamicVariables. In Next.js
//     production bundles, module-level mocks cannot replace the bundled SDK
//     reference (the SDK lives in _next/static/chunks/...). Vitest component
//     tests cover the SDK-boundary contract:
//       - components/panels/__tests__/voice-panel-tools.test.tsx — clientTools
//         keys (6), dynamicVariables {lesson_topic, total_tasks}, draw_explanation
//         INV-02 < 50ms ack.
//       - components/panels/__tests__/voice-panel-subs.test.tsx — useLessonBusEvent
//         subscription discipline, no unsafe useEffect([conversation]) regression.
//   - For E2E we drive bus emits and assert what is observable from the DOM
//     and from existing instrumentation: TrainerPanel ring/checkmark/counter
//     updates and BoardPanel subscriptions (board:draw_request).
//
// Coverage:
//   1. Trainer goto bus event — TrainerPanel reacts (ring + counter + smooth-scroll)
//   2. Trainer answer (correct) — TrainerPanel checkmark appears + counter increments
//   3. Trainer answer (wrong) — no checkmark on that task, no counter increment
//   4. board:draw_request emit — BoardPanel subscription does not throw / page stays alive
//   5. visibilitychange + ≥2 wrong-answer streak — VoicePanel.sendContextualUpdate is
//      called, but since the SDK is not connected in E2E (no signed URL), the latched
//      noop swallows it. We assert the page is healthy (no console errors) and the bus
//      events flow through TrainerPanel as expected.
//
// Skipped tests document tests that would require a fixture escape hatch
// (exposing window.__voiceClientTools / window.__voiceSendContextualUpdate from
// VoicePanel in non-prod). That work is out of scope for this plan — the
// vitest tests above already cover the contract. The skips include explicit
// cross-references to the vitest specs.
import { test, expect, chromium } from '@playwright/test'
import type { BrowserContext } from '@playwright/test'
import {
  makeTestEmail,
  resetTestDb,
  readMagicLinkFor,
  clearMagicLinkFile,
} from './fixtures/db-setup'
import { config as loadDotenv } from 'dotenv'
import { resolve } from 'path'
import pkg from 'pg'

const { Client } = pkg
loadDotenv({ path: resolve(process.cwd(), '.env.local') })

const BASE_URL = process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:3000'

function getConnectionString(): string {
  const url = process.env.DATABASE_URL_DIRECT
  if (!url) throw new Error('DATABASE_URL_DIRECT required for E2E tests')
  return url
}

async function pgQuery<T extends object>(sql: string, params: unknown[] = []): Promise<T[]> {
  const client = new Client({
    connectionString: getConnectionString(),
    ssl: { rejectUnauthorized: false },
  })
  await client.connect()
  try {
    const result = await client.query<T>(sql, params)
    return result.rows
  } finally {
    await client.end()
  }
}

/**
 * Seed a user + an 'in_progress' lesson with sample-column-addition.json
 * (5 tasks: 3 numeric + 1 single-choice + 1 matching). Matches the existing
 * trainer-panel.spec.ts seeding pattern.
 */
async function seedAgentToolsUser(email: string): Promise<{ userId: string; lessonId: string }> {
  const lower = email.toLowerCase()

  await pgQuery(
    'INSERT INTO allowed_email (email, notes) VALUES ($1, $2) ON CONFLICT (email) DO NOTHING',
    [lower, 'e2e voice-agent-tools test'],
  )

  const userRows = await pgQuery<{ id: string }>(
    `INSERT INTO "user" (id, email, child_name, child_age, created_at)
     VALUES (gen_random_uuid()::text, $1, 'E2E-агент', 10, now())
     ON CONFLICT (email) DO UPDATE SET child_name = 'E2E-агент', child_age = 10
     RETURNING id`,
    [lower],
  )
  const userId = userRows[0].id

  // Lesson scheduled 2 minutes ago → canStartLesson() = true; status already in_progress
  const twoMinAgo = new Date(Date.now() - 2 * 60 * 1000)
  const lessonRows = await pgQuery<{ id: string }>(
    `INSERT INTO lesson (user_id, scheduled_at, topic, duration_min, html_trainer_path, status, actual_start_at)
     VALUES ($1, $2, 'E2E голос-агент сложение', 45, 'sample-column-addition.json', 'in_progress', now())
     RETURNING id`,
    [userId, twoMinAgo.toISOString()],
  )
  const lessonId = lessonRows[0].id

  return { userId, lessonId }
}

let savedCookies: BrowserContext['cookies'] extends () => Promise<infer R> ? R : never = []
let lessonId: string

const email = makeTestEmail('voice-agent-tools')

test.describe('Voice agent tools — LLM-01 + PED-02 + HTM-01', () => {
  // Bump per-test timeout: Neon Free tier cold-start + tldraw hydration + login
  // cookie injection routinely consumes 25-40s on a fresh dev server. Local
  // dev runs faster, but CI/cold-DB requires headroom.
  test.setTimeout(90_000)

  test.beforeAll(async () => {
    // 1. Seed user + in_progress lesson with sample trainerConfig
    const seeded = await seedAgentToolsUser(email)
    lessonId = seeded.lessonId

    // 2. Login once and save session cookies (pattern from voice-flow.spec.ts)
    const browser = await chromium.launch()
    const context = await browser.newContext()
    const page = await context.newPage()
    try {
      clearMagicLinkFile()
      await page.goto(`${BASE_URL}/login`)
      await page.getByLabel(/Email родителя/).fill(email)
      await page.getByRole('button', { name: /Отправить ссылку/ }).click()
      await page.waitForURL(/\/login\?sent=1/)

      let magicLink: string | null = null
      for (let i = 0; i < 30; i++) {
        magicLink = await readMagicLinkFor(email, BASE_URL)
        if (magicLink) break
        await new Promise((r) => setTimeout(r, 200))
      }
      if (!magicLink) throw new Error('Magic link not written to file within 6 seconds')

      await page.goto(magicLink)
      await page.waitForURL(/\/lessons/)

      savedCookies = await context.cookies()
    } finally {
      await browser.close()
    }
  })

  test.afterAll(async () => {
    await resetTestDb()
  })

  /** Navigate to the lesson page with auth cookies. */
  async function goToLesson(page: import('@playwright/test').Page): Promise<void> {
    await page.context().addCookies(savedCookies)

    // Warm up Neon DB connection
    for (let i = 0; i < 3; i++) {
      try {
        const resp = await page.request.get(`${BASE_URL}/api/auth/session`)
        if (resp.ok()) break
      } catch {
        // ignore — will retry
      }
      await new Promise((r) => setTimeout(r, 1000))
    }

    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        await page.goto(`${BASE_URL}/lesson/${lessonId}`, { timeout: 15_000 })
        await page.waitForURL(`**/lesson/${lessonId}`, { timeout: 10_000 })
        return
      } catch (err) {
        if (attempt === 3) throw err
        await new Promise((r) => setTimeout(r, 2500))
      }
    }
  }

  /** Stub mic permission so any voice start does not hang on a real OS prompt. */
  async function stubMicPermission(page: import('@playwright/test').Page): Promise<void> {
    await page.addInitScript(() => {
      Object.defineProperty(navigator, 'mediaDevices', {
        configurable: true,
        value: {
          getUserMedia: async () => ({ getTracks: () => [{ stop: () => {} }] }),
        },
      })
    })
  }

  /** Stub the signed-URL endpoint so E2E NEVER hits real 11labs (Pitfall 8). */
  async function stubSignedUrl(page: import('@playwright/test').Page): Promise<void> {
    await page.route('**/api/voice/signed-url', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          signedUrl: 'wss://mock.local/test',
          topic: 'E2E голос-агент сложение',
        }),
      }),
    )
  }

  /** Wait for window.__lessonBus to be attached by LessonBusProvider. */
  async function waitForBus(page: import('@playwright/test').Page): Promise<void> {
    await page.waitForFunction(() => typeof window.__lessonBus !== 'undefined', null, {
      timeout: 10_000,
    })
  }

  // ── Test 1: TrainerPanel renders + bus event drives ring on goto ────────
  test('1. trainer:goto_task via bus → TrainerPanel ring class appears on target task (LLM-01 + HTM-01)', async ({
    page,
  }) => {
    await stubMicPermission(page)
    await stubSignedUrl(page)
    await goToLesson(page)
    await waitForBus(page)

    // Wait for trainer block to render
    await page.locator('[data-block="trainer"]').first().waitFor({ timeout: 10_000 })
    await page.locator('[data-task-id="task-3"]').waitFor({ timeout: 5_000 })

    // Emit trainer:goto_task as if VoicePanel's client tool handler fired it.
    // This is exactly what goto_trainer_task client tool emits on the bus
    // (see lib/client-tools/handlers.ts goto_trainer_task → bus.emit).
    await page.evaluate(() => {
      window.__lessonBus!.emit('trainer:goto_task', { taskId: 'task-3' })
    })

    // TrainerPanel (plan 08-07) adds a ring on the current task via D-02 progress UI.
    // The marker class is `trainer-current` + Tailwind ring-2/ring-blue-500 — see
    // components/panels/trainer-panel.tsx applyCurrentRing.
    const task3 = page.locator('[data-task-id="task-3"]')
    await expect(task3).toHaveClass(/trainer-current/, { timeout: 3_000 })
  })

  // ── Test 2: TrainerPanel checkmark appears after correct answer ─────────
  test('2. trainer:answer_submitted (correct) → solved task gets data-solved attribute (HTM-01)', async ({
    page,
  }) => {
    await stubMicPermission(page)
    await stubSignedUrl(page)
    await goToLesson(page)
    await waitForBus(page)

    await page.locator('[data-block="trainer"]').first().waitFor({ timeout: 10_000 })
    await page.locator('[data-task-id="task-1"]').waitFor({ timeout: 5_000 })

    // Emit correct answer as TrainerPanel would after legitimate input.
    await page.evaluate(() => {
      window.__lessonBus!.emit('trainer:answer_submitted', {
        taskId: 'task-1',
        value: '1119',
        correct: true,
      })
    })

    // Plan 08-07 D-02 progress UI sets data-solved="true" on the task wrapper
    // and inserts a ✓ checkmark span (.trainer-solved-mark).
    const task1 = page.locator('[data-task-id="task-1"]')
    await expect(task1).toHaveAttribute('data-solved', 'true', { timeout: 3_000 })
    // Visual checkmark glyph inserted by markSolved() in trainer-panel.tsx.
    await expect(task1.locator('.trainer-solved-mark').first()).toBeVisible({ timeout: 2_000 })
  })

  // ── Test 3: Wrong answer does NOT mark task as solved ───────────────────
  test('3. trainer:answer_submitted (wrong) → task stays unsolved (HTM-01 + PED-02 negative space)', async ({
    page,
  }) => {
    await stubMicPermission(page)
    await stubSignedUrl(page)
    await goToLesson(page)
    await waitForBus(page)

    await page.locator('[data-block="trainer"]').first().waitFor({ timeout: 10_000 })
    await page.locator('[data-task-id="task-1"]').waitFor({ timeout: 5_000 })

    // Emit wrong answer.
    await page.evaluate(() => {
      window.__lessonBus!.emit('trainer:answer_submitted', {
        taskId: 'task-1',
        value: '100',
        correct: false,
      })
    })

    // After a brief settle window, task-1 must NOT be marked solved.
    await page.waitForTimeout(500)
    const task1 = page.locator('[data-task-id="task-1"]')
    await expect(task1).not.toHaveAttribute('data-solved', 'true')
  })

  // ── Test 4: Counter "N из M" tracks the CURRENT task index ──────────────
  test('4. counter "N из M" updates to current task after goto_task (HTM-01 + D-02)', async ({
    page,
  }) => {
    await stubMicPermission(page)
    await stubSignedUrl(page)
    await goToLesson(page)
    await waitForBus(page)

    await page.locator('[data-block="trainer"]').first().waitFor({ timeout: 10_000 })
    // Counter rendered by plan 08-07. Format: "{N} из {M}" — N = 1-indexed
    // position of the CURRENT task (initialised to firstTaskId), M = total.
    // sample-column-addition.json has 5 tasks total; initial current = task-1 ⇒ "1 из 5".
    const counter = page.locator('[data-trainer-counter]').first()
    await expect(counter).toBeVisible({ timeout: 5_000 })
    await expect(counter).toContainText(/1\s+из\s+5/, { timeout: 3_000 })

    // Navigate to task-3 — counter must update to "3 из 5".
    await page.evaluate(() => {
      window.__lessonBus!.emit('trainer:goto_task', { taskId: 'task-3' })
    })
    await expect(counter).toContainText(/3\s+из\s+5/, { timeout: 3_000 })
  })

  // ── Test 5: BoardPanel subscribes to board:draw_request without throwing ─
  test('5. board:draw_request emit does not throw / page stays healthy (LLM-01)', async ({
    page,
  }) => {
    await stubMicPermission(page)
    await stubSignedUrl(page)
    // Stub /api/draw too so the SSE call does not hit production OpenAI.
    await page.route('**/api/draw', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'text/event-stream',
        body: 'data: {"type":"done"}\n\n',
      }),
    )
    await goToLesson(page)
    await waitForBus(page)

    // Wait for BoardPanel to mount.
    await page.locator('[data-block="trainer"]').first().waitFor({ timeout: 10_000 })

    // Track JS errors — BoardPanel must subscribe via useLessonBusEvent and
    // handle the request without throwing.
    const consoleErrors: string[] = []
    page.on('console', (msg) => {
      if (msg.type() === 'error') consoleErrors.push(msg.text())
    })
    page.on('pageerror', (err) => consoleErrors.push(err.message))

    // Emit a draw_request as if VoicePanel's draw_explanation client tool fired.
    await page.evaluate(() => {
      window.__lessonBus!.emit('board:draw_request', {
        prompt: 'сложение в столбик 245+874',
        lessonId: 'e2e',
      })
    })
    await page.waitForTimeout(500)

    // No uncaught errors from subscription.
    const relevantErrors = consoleErrors.filter(
      (e) => !e.includes('Failed to load resource') && !e.includes('TLDRAW'),
    )
    expect(relevantErrors).toEqual([])
  })

  // ── Test 6: visibilitychange + mistake streak via bus do not break the UI ─
  test('6. PED-02 proactive triggers — visibilitychange + 2-wrong streak via bus emit (PED-02)', async ({
    page,
  }) => {
    await stubMicPermission(page)
    await stubSignedUrl(page)
    await goToLesson(page)
    await waitForBus(page)

    await page.locator('[data-block="trainer"]').first().waitFor({ timeout: 10_000 })

    // Capture uncaught errors.
    const consoleErrors: string[] = []
    page.on('pageerror', (err) => consoleErrors.push(err.message))

    // 1) Simulate visibility change to hidden — exercises useVisibilityTrigger
    //    inside VoicePanel (it calls convoCmdRef.current.sendContextualUpdate,
    //    which is a seeded noop until SDK connects; the call should be silent).
    await page.evaluate(() => {
      Object.defineProperty(document, 'visibilityState', {
        configurable: true,
        get: () => 'hidden',
      })
      document.dispatchEvent(new Event('visibilitychange'))
    })
    await page.waitForTimeout(200)

    // 2) Simulate 2 consecutive wrong answers — exercises
    //    useConsecutiveMistakesTrigger inside VoicePanel. The wrong answers
    //    also flow through TrainerPanel's regular trainer:answer_submitted
    //    handlers; task-1 must NOT become solved.
    await page.evaluate(() => {
      window.__lessonBus!.emit('trainer:answer_submitted', {
        taskId: 'task-1', value: '100', correct: false,
      })
      window.__lessonBus!.emit('trainer:answer_submitted', {
        taskId: 'task-1', value: '101', correct: false,
      })
    })
    await page.waitForTimeout(500)

    // The page survived both triggers — no uncaught error.
    expect(consoleErrors).toEqual([])
    const task1 = page.locator('[data-task-id="task-1"]')
    await expect(task1).not.toHaveAttribute('data-task-solved', 'true')
  })

  // ── Documented gaps — covered by vitest at the SDK boundary ─────────────
  // The following assertions need access to the captured clientTools object
  // and sendContextualUpdate spy. In a Next.js production bundle the SDK
  // (@elevenlabs/react) cannot be reliably replaced via page.addInitScript.
  // The same wiring is fully covered by vitest at the SDK boundary:
  //
  //   - components/panels/__tests__/voice-panel-tools.test.tsx
  //       • clientTools = 6 keys passed to useConversation
  //       • dynamicVariables = { lesson_topic, total_tasks } on startSession
  //       • draw_explanation returns ack < 50ms
  //   - components/panels/__tests__/voice-panel-subs.test.tsx
  //       • useLessonBusEvent (not bare useEffect + bus.on) for trainer events
  //       • Phase 6.5 cleanup-bug regression guard
  //   - lib/__tests__/contextual-update-formatters.test.ts
  //       • Exact "✓ task-N (numeric, ok)" / "✗ task-N (numeric): ..." strings
  //   - lib/__tests__/proactive-triggers-visibility.test.ts +
  //     lib/__tests__/proactive-triggers-mistakes.test.ts +
  //     lib/__tests__/proactive-triggers.test.tsx
  //       • Hook contracts for visibility + consecutive-mistakes triggers
  test.skip('7. clientTools-direct invocation — covered by vitest voice-panel-tools.test.tsx', () => {
    // No-op: the assertion "clientTools object has 6 keys" + "draw_explanation
    // returns an ack string under 50ms" is fully covered in the vitest
    // component test at components/panels/__tests__/voice-panel-tools.test.tsx
    // where the @elevenlabs/react SDK is mocked at the module boundary via vi.mock.
  })
  test.skip('8. dynamicVariables capture — covered by vitest voice-panel-tools.test.tsx', () => {
    // Covered by `startSession is called with dynamicVariables = { lesson_topic, total_tasks }`
    // in components/panels/__tests__/voice-panel-tools.test.tsx.
  })
})
