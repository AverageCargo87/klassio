// E2E: Voice flow — VOI-01-S (UI + bus + click) and VOI-01-T (no client bundle leak).
//
// Pattern A (signed-URL): page.route stubs /api/voice/signed-url so we never hit
// real 11labs (RESEARCH Pitfall 8 — 100 calls/day budget for the agent).
// Pattern B (mic): addInitScript stubs navigator.mediaDevices.getUserMedia so the
// browser does not show a real permission prompt that hangs the test.
// Pattern C (bus drive): page.evaluate emits voice:state via window.__lessonBus
// (exposed by LessonBusProvider in non-prod, Phase 9 D-11) so we can verify the
// Avatar transitions through 🙂 → 👂 → 🗣️ without the SDK ever connecting.
// Pattern D (bundle leak): page.content() + script-chunk fetches are grepped for
// ELEVENLABS_API_KEY / ELEVENLABS_AGENT_ID / the literal agent id / sk_-prefixed
// keys (T-06-02-01/02 mitigations; D-09 step 10).
//
// Session strategy: copy from e2e/avatar.spec.ts — login once in beforeAll,
// save cookies, inject per test. seedVoiceUser uses notes='e2e voice test' and
// lesson.topic='E2E голос'.
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

/** Seed a user + an 'in_progress' lesson — voice flow test variant. */
async function seedVoiceUser(email: string): Promise<{ userId: string; lessonId: string }> {
  const lower = email.toLowerCase()

  await pgQuery(
    'INSERT INTO allowed_email (email, notes) VALUES ($1, $2) ON CONFLICT (email) DO NOTHING',
    [lower, 'e2e voice test'],
  )

  const userRows = await pgQuery<{ id: string }>(
    `INSERT INTO "user" (id, email, child_name, child_age, created_at)
     VALUES (gen_random_uuid()::text, $1, 'E2E-голос', 10, now())
     ON CONFLICT (email) DO UPDATE SET child_name = 'E2E-голос', child_age = 10
     RETURNING id`,
    [lower],
  )
  const userId = userRows[0].id

  // Lesson scheduled 2 minutes ago → canStartLesson() = true.
  const twoMinAgo = new Date(Date.now() - 2 * 60 * 1000)
  const lessonRows = await pgQuery<{ id: string }>(
    `INSERT INTO lesson (user_id, scheduled_at, topic, duration_min, status, actual_start_at)
     VALUES ($1, $2, 'E2E голос', 45, 'in_progress', now())
     RETURNING id`,
    [userId, twoMinAgo.toISOString()],
  )
  const lessonId = lessonRows[0].id

  return { userId, lessonId }
}

let savedCookies: BrowserContext['cookies'] extends () => Promise<infer R> ? R : never = []
let lessonId: string

const email = makeTestEmail('voice')

test.describe('Voice flow (VOI-01)', () => {
  test.beforeAll(async () => {
    // 1. Seed user + in_progress lesson
    const seeded = await seedVoiceUser(email)
    lessonId = seeded.lessonId

    // 2. Login once in a dedicated browser and save session cookies
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

  /**
   * Navigate to the lesson page directly.
   * Injects saved cookies + warms up Neon DB + retries 3× on transient errors
   * (copied verbatim from e2e/avatar.spec.ts for parity).
   */
  async function goToLesson(page: import('@playwright/test').Page): Promise<void> {
    await page.context().addCookies(savedCookies)

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
        await page.goto(`${BASE_URL}/lesson/${lessonId}`, { timeout: 10_000 })
        await page.waitForURL(`**/lesson/${lessonId}`, { timeout: 8_000 })
        return
      } catch (err) {
        if (attempt === 3) throw err
        await new Promise((r) => setTimeout(r, 2500))
      }
    }
  }

  /** Stub mic permission so click Start does not show a real OS prompt that hangs. */
  async function stubMicPermission(page: import('@playwright/test').Page): Promise<void> {
    await page.addInitScript(() => {
      Object.defineProperty(navigator, 'mediaDevices', {
        configurable: true,
        value: {
          getUserMedia: async () => ({
            getTracks: () => [{ stop: () => {} }],
          }),
        },
      })
    })
  }

  /** Stub the signed-URL endpoint so E2E NEVER hits real 11labs (Pitfall 8). */
  async function stubSignedUrl(
    page: import('@playwright/test').Page,
    body: object = { signedUrl: 'wss://mock.local/test', topic: 'E2E голос' },
    status = 200,
  ): Promise<{ getCalls: () => number }> {
    let calls = 0
    await page.route('**/api/voice/signed-url', (route) => {
      calls += 1
      return route.fulfill({
        status,
        contentType: 'application/json',
        body: JSON.stringify(body),
      })
    })
    return { getCalls: () => calls }
  }

  // ── VOI-01-S #1: Start button visible ──────────────────────────────────
  test('VOI-01-S #1: «Запустить голос» button is visible after lesson load', async ({ page }) => {
    await stubMicPermission(page)
    await stubSignedUrl(page)
    await goToLesson(page)

    const startBtn = page.getByRole('button', { name: /Запустить голос/ })
    await expect(startBtn).toBeVisible({ timeout: 10_000 })
  })

  // ── VOI-01-S #2: signed-url stub fires on click ────────────────────────
  test('VOI-01-S #2: clicking Start POSTs to /api/voice/signed-url (network stub fires)', async ({
    page,
  }) => {
    await stubMicPermission(page)
    const stub = await stubSignedUrl(page)
    await goToLesson(page)

    const startBtn = page.getByRole('button', { name: /Запустить голос/ })
    await expect(startBtn).toBeVisible({ timeout: 10_000 })
    await startBtn.click()

    // Allow click + fetch microtask cycle
    await page.waitForTimeout(800)
    expect(stub.getCalls()).toBeGreaterThanOrEqual(1)
  })

  // ── VOI-01-S #3: window.__lessonBus drives avatar to listening ─────────
  test('VOI-01-S #3: window.__lessonBus emit voice:state.listening → data-avatar-state=listening', async ({
    page,
  }) => {
    await stubMicPermission(page)
    await stubSignedUrl(page)
    await goToLesson(page)

    const avatar = page.locator('[data-avatar-state]').first()
    await expect(avatar).toBeVisible({ timeout: 10_000 })

    await page.evaluate(() => {
      if (!window.__lessonBus) throw new Error('window.__lessonBus not available')
      window.__lessonBus.emit('voice:state', { state: 'listening' })
    })

    await expect(avatar).toHaveAttribute('data-avatar-state', 'listening', { timeout: 2_000 })
  })

  // ── VOI-01-S #4: window.__lessonBus drives avatar to speaking ──────────
  test('VOI-01-S #4: window.__lessonBus emit voice:state.speaking → data-avatar-state=speaking', async ({
    page,
  }) => {
    await stubMicPermission(page)
    await stubSignedUrl(page)
    await goToLesson(page)

    const avatar = page.locator('[data-avatar-state]').first()
    await expect(avatar).toBeVisible({ timeout: 10_000 })

    await page.evaluate(() => {
      if (!window.__lessonBus) throw new Error('window.__lessonBus not available')
      window.__lessonBus.emit('voice:state', { state: 'speaking' })
    })

    await expect(avatar).toHaveAttribute('data-avatar-state', 'speaking', { timeout: 2_000 })
  })

  // ── VOI-01-S #5: window.__lessonBus drives avatar to idle ──────────────
  test('VOI-01-S #5: emit voice:state.speaking then idle → avatar returns to idle', async ({
    page,
  }) => {
    await stubMicPermission(page)
    await stubSignedUrl(page)
    await goToLesson(page)

    const avatar = page.locator('[data-avatar-state]').first()
    await expect(avatar).toBeVisible({ timeout: 10_000 })

    // First go speaking
    await page.evaluate(() => {
      if (!window.__lessonBus) throw new Error('window.__lessonBus not available')
      window.__lessonBus.emit('voice:state', { state: 'speaking' })
    })
    await expect(avatar).toHaveAttribute('data-avatar-state', 'speaking', { timeout: 2_000 })

    // Then emit idle — avatar reducer returns to idle
    await page.evaluate(() => {
      window.__lessonBus!.emit('voice:state', { state: 'idle' })
    })
    await expect(avatar).toHaveAttribute('data-avatar-state', 'idle', { timeout: 2_000 })
  })

  // ── Russian error UI when fetch fails ──────────────────────────────────
  test('clicking Start with failed /api/voice/signed-url shows «Не удалось получить ссылку»', async ({
    page,
  }) => {
    await stubMicPermission(page)
    await stubSignedUrl(page, { error: 'Voice service не настроен' }, 500)
    await goToLesson(page)

    const startBtn = page.getByRole('button', { name: /Запустить голос/ })
    await expect(startBtn).toBeVisible({ timeout: 10_000 })
    await startBtn.click()

    // Error block appears
    await expect(page.getByText(/Не удалось получить ссылку/)).toBeVisible({ timeout: 5_000 })
  })

  // ── VOI-01-T #1: page HTML — ELEVENLABS_API_KEY absent ─────────────────
  test('VOI-01-T #1: ELEVENLABS_API_KEY literal NOT present in page HTML', async ({ page }) => {
    await stubMicPermission(page)
    await stubSignedUrl(page)
    await goToLesson(page)

    const html = await page.content()
    expect(html).not.toContain('ELEVENLABS_API_KEY')
  })

  // ── VOI-01-T #2: page HTML — ELEVENLABS_AGENT_ID absent ────────────────
  test('VOI-01-T #2: ELEVENLABS_AGENT_ID literal NOT present in page HTML', async ({ page }) => {
    await stubMicPermission(page)
    await stubSignedUrl(page)
    await goToLesson(page)

    const html = await page.content()
    expect(html).not.toContain('ELEVENLABS_AGENT_ID')
  })

  // ── VOI-01-T #3: page HTML — literal agent ID absent ───────────────────
  test('VOI-01-T #3: literal agent_7701kr9c2v7eev3tabzv4f2b0e8b NOT present in page HTML', async ({
    page,
  }) => {
    await stubMicPermission(page)
    await stubSignedUrl(page)
    await goToLesson(page)

    const html = await page.content()
    expect(html).not.toContain('agent_7701kr9c2v7eev3tabzv4f2b0e8b')
  })

  // ── VOI-01-T #4: page HTML — no sk_-prefixed long key in quotes ────────
  test('VOI-01-T #4: page HTML does NOT contain a quoted sk_*-prefixed long secret', async ({
    page,
  }) => {
    await stubMicPermission(page)
    await stubSignedUrl(page)
    await goToLesson(page)

    const html = await page.content()
    // Strict: quoted sk_ followed by 20+ url-safe alphanum/_/-/.
    expect(html).not.toMatch(/['"]sk_[A-Za-z0-9_-]{20,}['"]/)
  })

  // ── VOI-01-T #5: JS chunks — ELEVENLABS_API_KEY + agent id absent ──────
  test('VOI-01-T #5: ELEVENLABS_API_KEY + agent id absent from /_next/static/chunks/ JS', async ({
    page,
  }) => {
    await stubMicPermission(page)
    await stubSignedUrl(page)
    await goToLesson(page)

    const scriptSrcs = await page.locator('script[src]').evaluateAll((els) =>
      (els as HTMLScriptElement[]).map((el) => el.src),
    )
    const chunkUrls = scriptSrcs.filter((u) => u.includes('/_next/static/chunks/'))
    expect(chunkUrls.length).toBeGreaterThan(0)

    for (const url of chunkUrls) {
      const resp = await page.context().request.get(url)
      const body = await resp.text()
      expect(
        body,
        `chunk ${url} contains ELEVENLABS_API_KEY literal`,
      ).not.toContain('ELEVENLABS_API_KEY')
      expect(
        body,
        `chunk ${url} contains the literal agent id`,
      ).not.toContain('agent_7701kr9c2v7eev3tabzv4f2b0e8b')
    }
  })
})
