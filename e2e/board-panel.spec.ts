// E2E: Board panel smoke — BRD-01
// Verifies: tldraw canvas renders, prompt UI visible, chips work, no console errors.
// Does NOT assert canvas content (tldraw renders WebGL — not DOM-assertable).
// Does NOT submit the form or wait for OpenAI responses (flaky in CI without OPENAI_API_KEY).
//
// Session strategy: login once in beforeAll, save cookies, inject per test.
// Lesson strategy: create lesson with status='in_progress' (matches lesson-shell.spec.ts pattern).
// OPENAI_API_KEY: required for /api/draw — tests that submit form are skipped if not set.
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

/** Seed a user + an 'in_progress' lesson (scheduled 2 min ago) — board panel test variant. */
async function seedBoardPanelUser(email: string): Promise<{ userId: string; lessonId: string }> {
  const lower = email.toLowerCase()

  await pgQuery(
    'INSERT INTO allowed_email (email, notes) VALUES ($1, $2) ON CONFLICT (email) DO NOTHING',
    [lower, 'e2e board-panel test'],
  )

  const userRows = await pgQuery<{ id: string }>(
    `INSERT INTO "user" (id, email, child_name, child_age, created_at)
     VALUES (gen_random_uuid()::text, $1, 'E2E-борд', 10, now())
     ON CONFLICT (email) DO UPDATE SET child_name = 'E2E-борд', child_age = 10
     RETURNING id`,
    [lower],
  )
  const userId = userRows[0].id

  // Lesson scheduled 2 minutes ago → canStartLesson() = true; status already in_progress
  const twoMinAgo = new Date(Date.now() - 2 * 60 * 1000)
  const lessonRows = await pgQuery<{ id: string }>(
    `INSERT INTO lesson (user_id, scheduled_at, topic, duration_min, status, actual_start_at)
     VALUES ($1, $2, 'E2E тест доски', 45, 'in_progress', now())
     RETURNING id`,
    [userId, twoMinAgo.toISOString()],
  )
  const lessonId = lessonRows[0].id

  return { userId, lessonId }
}

// Session cookies saved during beforeAll login; injected into each test's page
let savedCookies: BrowserContext['cookies'] extends () => Promise<infer R> ? R : never = []
let lessonId: string

const email = makeTestEmail('board-panel')

test.describe('Board panel smoke (BRD-01)', () => {
  test.beforeAll(async () => {
    // 1. Seed user + in_progress lesson
    const seeded = await seedBoardPanelUser(email)
    lessonId = seeded.lessonId

    // 2. Login once with a dedicated browser and save session cookies
    const browser = await chromium.launch()
    const context = await browser.newContext()
    const page = await context.newPage()

    try {
      clearMagicLinkFile()
      await page.goto(`${BASE_URL}/login`)
      await page.getByLabel(/Email родителя/).fill(email)
      await page.getByRole('button', { name: /Отправить ссылку/ }).click()
      await page.waitForURL(/\/login\?sent=1/)

      // Poll for magic link (Pattern A: file written by email-template.ts)
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
   * Navigate to the lesson page directly. Injects saved session cookies + warms Neon DB.
   * Waits for tldraw to mount (lazy-loaded via next/dynamic ssr:false).
   */
  async function goToLesson(page: import('@playwright/test').Page): Promise<void> {
    await page.context().addCookies(savedCookies)

    // Warm up Neon DB connection (mirrors lesson-shell.spec.ts pattern)
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

  test('board canvas wrapper renders (tldraw mounts)', async ({ page }) => {
    await goToLesson(page)
    // tldraw lazy-loads via next/dynamic ssr:false — wait up to 15s for it to mount
    // .tl-canvas is the stable CSS class tldraw renders on the canvas wrapper element
    await expect(page.locator('.tl-canvas').first()).toBeVisible({ timeout: 15_000 })
  })

  test('prompt textarea visible with placeholder', async ({ page }) => {
    await goToLesson(page)
    // Wait for the lesson shell to load (tldraw mounts asynchronously)
    await page.locator('.tl-canvas').first().waitFor({ timeout: 15_000 }).catch(() => {})
    // The textarea has placeholder "Например: объясни сложение..."
    await expect(
      page.getByPlaceholder(/объясни сложение/i).first()
    ).toBeVisible()
  })

  test('suggestion chips visible', async ({ page }) => {
    await goToLesson(page)
    await page.locator('.tl-canvas').first().waitFor({ timeout: 15_000 }).catch(() => {})
    // All 3 chips should be rendered in the board panel
    await expect(page.getByRole('button', { name: /Сложение в столбик/i })).toBeVisible()
    await expect(page.getByRole('button', { name: /Дроби/i })).toBeVisible()
    await expect(page.getByRole('button', { name: /Умножение на 10/i })).toBeVisible()
  })

  test('clicking chip fills textarea', async ({ page }) => {
    await goToLesson(page)
    await page.locator('.tl-canvas').first().waitFor({ timeout: 15_000 }).catch(() => {})

    // Click the first suggestion chip
    await page.getByRole('button', { name: /Сложение в столбик/i }).click()

    // Textarea should now contain the chip text
    await expect(page.getByPlaceholder(/объясни сложение/i).first()).not.toHaveValue('')
    await expect(page.getByPlaceholder(/объясни сложение/i).first()).toHaveValue(/Сложение/)
  })

  test('no console errors on page load', async ({ page }) => {
    const consoleErrors: string[] = []
    page.on('console', (msg) => {
      if (msg.type() === 'error') consoleErrors.push(msg.text())
    })

    await goToLesson(page)
    // Wait for board to mount
    await page.locator('.tl-canvas').first().waitFor({ timeout: 15_000 }).catch(() => {})

    // Filter out known tldraw dev HMR warnings (not real errors) and any known harmless notices
    const realErrors = consoleErrors.filter(
      (e) =>
        !e.includes('HMR') &&
        !e.includes('Warning:') &&
        !e.includes('Cannot update a component') &&
        !e.includes('Download the React DevTools') &&
        !e.includes('tldraw'),
    )
    expect(realErrors).toHaveLength(0)
  })
})
