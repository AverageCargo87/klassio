// E2E: Lesson shell — LES-01
// Verifies: 3-panel layout visible, event bus works (cross-panel counter),
// end-lesson flow (AlertDialog → /lessons redirect).
//
// Session strategy: login once in beforeAll, save cookies, inject per test.
// Lesson strategy: create lesson with status='in_progress' (scheduled 2 min ago)
//   so canStartLesson() is true and no auto-transition DML occurs on page load.
// Direct navigation: go to /lesson/{id} directly (not via /lessons Start button)
//   since Desktop Chrome viewport renders the full lesson shell.
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

/** Seed a user + an 'in_progress' lesson (scheduled 2 min ago). */
async function seedLessonShellUser(
  email: string,
): Promise<{ userId: string; lessonId: string }> {
  const lower = email.toLowerCase()

  await pgQuery(
    'INSERT INTO allowed_email (email, notes) VALUES ($1, $2) ON CONFLICT (email) DO NOTHING',
    [lower, 'e2e lesson-shell test'],
  )

  const userRows = await pgQuery<{ id: string }>(
    `INSERT INTO "user" (id, email, child_name, child_age, created_at)
     VALUES (gen_random_uuid()::text, $1, 'E2E-ребёнок', 10, now())
     ON CONFLICT (email) DO UPDATE SET child_name = 'E2E-ребёнок', child_age = 10
     RETURNING id`,
    [lower],
  )
  const userId = userRows[0].id

  // Lesson scheduled 2 minutes ago → canStartLesson() = true; status already in_progress
  const twoMinAgo = new Date(Date.now() - 2 * 60 * 1000)
  const lessonRows = await pgQuery<{ id: string }>(
    `INSERT INTO lesson (user_id, scheduled_at, topic, duration_min, status, actual_start_at)
     VALUES ($1, $2, 'E2E тест шины', 45, 'in_progress', now())
     RETURNING id`,
    [userId, twoMinAgo.toISOString()],
  )
  const lessonId = lessonRows[0].id

  return { userId, lessonId }
}

// Session cookies saved during beforeAll login; injected into each test's page
let savedCookies: BrowserContext['cookies'] extends () => Promise<infer R> ? R : never = []
let lessonId: string

const email = makeTestEmail('lesson-shell')

test.describe('Lesson shell (LES-01)', () => {
  test.beforeAll(async () => {
    // 1. Seed user + in_progress lesson
    const seeded = await seedLessonShellUser(email)
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
   * Navigate to the lesson page directly (no /lessons → Start button flow).
   * Injects saved session cookies + warms up Neon DB before loading.
   */
  async function goToLesson(page: import('@playwright/test').Page): Promise<void> {
    await page.context().addCookies(savedCookies)

    // Warm up Neon DB connection (mirrors global-setup.ts + schedule-grouping.spec.ts)
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

  test('shows 3 panel headings — Доска, Голос, Тренажёр', async ({ page }) => {
    await goToLesson(page)
    // Desktop Chrome (≥1024px) renders the CSS Grid layout (hidden md:flex → hidden lg:grid)
    // All 3 panels are present in the DOM (CSS hides/shows based on viewport)
    await expect(page.getByText('Доска').first()).toBeVisible()
    await expect(page.getByText('Голос').first()).toBeVisible()
    await expect(page.getByText('Тренажёр').first()).toBeVisible()
  })

  test('trainer panel shows placeholder when no config is set', async ({ page }) => {
    await goToLesson(page)
    // Phase 7: TrainerPanel shows placeholder when lesson has no htmlTrainerPath.
    // The seed lesson in this spec does NOT set html_trainer_path, so placeholder is shown.
    await expect(page.getByText(/Тренажёр для этого урока ещё не настроен/).first()).toBeVisible()
  })

  test('trainer card heading Тренажёр is visible', async ({ page }) => {
    await goToLesson(page)
    // Phase 7: TrainerPanel always renders the Тренажёр card heading.
    await expect(page.getByText('Тренажёр').first()).toBeVisible()
  })

  test('Завершить урок shows AlertDialog confirm', async ({ page }) => {
    await goToLesson(page)
    // Click the "Завершить урок" trigger button in the header
    await page.getByText(/Завершить урок/).first().click()
    // AlertDialog opens with confirmation text
    await expect(page.getByText(/Точно завершить урок/)).toBeVisible()
    await expect(page.getByRole('button', { name: /Отмена/ })).toBeVisible()
    // Dismiss dialog so it doesn't affect afterAll cleanup
    await page.getByRole('button', { name: /Отмена/ }).click()
  })

  test('confirming end-lesson redirects to /lessons', async ({ page }) => {
    // Reset lesson status to in_progress in case a previous test ended it
    await pgQuery(
      `UPDATE lesson SET status = 'in_progress', actual_end_at = null WHERE id = $1`,
      [lessonId],
    )

    await goToLesson(page)
    // Click the "Завершить урок" trigger
    await page.getByText(/Завершить урок/).first().click()
    // Wait for AlertDialog to appear then confirm
    await expect(page.getByText(/Точно завершить урок/)).toBeVisible()
    await page.getByRole('button', { name: /^Завершить$/ }).click()
    // Server action: UPDATE + redirect('/lessons')
    await page.waitForURL(/\/lessons/, { timeout: 15_000 })
    await expect(page.url()).toMatch(/\/lessons/)
  })
})
