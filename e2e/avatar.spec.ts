// E2E: Avatar panel — AVT-01 (Phase 9, D-11)
// Verifies: avatar element visible on lesson page, data-avatar-state="idle" initially,
// state changes via window.__lessonBus.emit (exposed in non-prod by LessonBusProvider),
// auto-reset to idle after 3s of no events.
//
// Session strategy: login once in beforeAll, save cookies, inject per test.
// Lesson strategy: in_progress lesson (no trainer config needed).
// window.__lessonBus available in test/dev (NODE_ENV !== 'production') — A4.
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

/** Seed a user + an 'in_progress' lesson (no trainer config needed for avatar tests). */
async function seedAvatarUser(email: string): Promise<{ userId: string; lessonId: string }> {
  const lower = email.toLowerCase()

  await pgQuery(
    'INSERT INTO allowed_email (email, notes) VALUES ($1, $2) ON CONFLICT (email) DO NOTHING',
    [lower, 'e2e avatar test'],
  )

  const userRows = await pgQuery<{ id: string }>(
    `INSERT INTO "user" (id, email, child_name, child_age, created_at)
     VALUES (gen_random_uuid()::text, $1, 'E2E-аватар', 10, now())
     ON CONFLICT (email) DO UPDATE SET child_name = 'E2E-аватар', child_age = 10
     RETURNING id`,
    [lower],
  )
  const userId = userRows[0].id

  // Lesson scheduled 2 minutes ago → canStartLesson() = true
  const twoMinAgo = new Date(Date.now() - 2 * 60 * 1000)
  const lessonRows = await pgQuery<{ id: string }>(
    `INSERT INTO lesson (user_id, scheduled_at, topic, duration_min, status, actual_start_at)
     VALUES ($1, $2, 'E2E аватар', 45, 'in_progress', now())
     RETURNING id`,
    [userId, twoMinAgo.toISOString()],
  )
  const lessonId = lessonRows[0].id

  return { userId, lessonId }
}

// Session cookies saved during beforeAll login; injected into each test's page
let savedCookies: BrowserContext['cookies'] extends () => Promise<infer R> ? R : never = []
let lessonId: string

const email = makeTestEmail('avatar')

test.describe('Avatar panel (AVT-01)', () => {
  test.beforeAll(async () => {
    // 1. Seed user + in_progress lesson
    const seeded = await seedAvatarUser(email)
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

      // Poll for magic link
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
   * Injects saved session cookies + warms up Neon DB before loading.
   */
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
        await page.goto(`${BASE_URL}/lesson/${lessonId}`, { timeout: 10_000 })
        await page.waitForURL(`**/lesson/${lessonId}`, { timeout: 8_000 })
        return
      } catch (err) {
        if (attempt === 3) throw err
        await new Promise((r) => setTimeout(r, 2500))
      }
    }
  }

  test('avatar element is visible with data-avatar-state="idle" on load', async ({ page }) => {
    await goToLesson(page)
    // Avatar component renders with data-avatar-state="idle" by default
    const avatar = page.locator('[data-avatar-state]').first()
    await expect(avatar).toBeVisible({ timeout: 10_000 })
    expect(await avatar.getAttribute('data-avatar-state')).toBe('idle')
  })

  test('avatar changes state to "speaking" when voice:state.speaking emitted via window.__lessonBus', async ({
    page,
  }) => {
    await goToLesson(page)
    // Wait for avatar to be visible first
    const avatar = page.locator('[data-avatar-state]').first()
    await expect(avatar).toBeVisible({ timeout: 10_000 })

    // Emit voice:state.speaking via the exposed bus
    await page.evaluate(() => {
      if (!window.__lessonBus) throw new Error('window.__lessonBus not available')
      window.__lessonBus.emit('voice:state', { state: 'speaking' })
    })

    // Avatar should transition to speaking
    await expect(avatar).toHaveAttribute('data-avatar-state', 'speaking', { timeout: 2_000 })
  })

  test('avatar auto-resets to "idle" after 3s of no events', async ({ page }) => {
    await goToLesson(page)
    const avatar = page.locator('[data-avatar-state]').first()
    await expect(avatar).toBeVisible({ timeout: 10_000 })

    // Emit speaking state
    await page.evaluate(() => {
      if (!window.__lessonBus) throw new Error('window.__lessonBus not available')
      window.__lessonBus.emit('voice:state', { state: 'speaking' })
    })

    // Verify it's speaking
    await expect(avatar).toHaveAttribute('data-avatar-state', 'speaking', { timeout: 2_000 })

    // Wait 3.5 seconds — auto-reset timer fires at 3s
    await page.waitForTimeout(3_500)

    // Should be back to idle
    await expect(avatar).toHaveAttribute('data-avatar-state', 'idle', { timeout: 2_000 })
  })
})
