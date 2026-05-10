// TODO: Phase 8 — add E2E spec asserting trainer:answer_submitted appears in bus log after bot voice reaction.
//
// E2E: Trainer panel — TRN-01
// Verifies: TrainerPanel renders with trainer config loaded from DB, task elements visible,
// placeholder mode when no config set, TrainerPanel card always visible.
//
// Session strategy: login once in beforeAll, save cookies, inject per test.
// Lesson strategy:
//   - Spec 1 & 2: lesson with html_trainer_path = 'sample-column-addition.json' (5 tasks, in_progress)
//   - Spec 3: lesson WITHOUT html_trainer_path (placeholder mode)
//
// Auth: follows board-panel.spec.ts magic-link pattern.
// Does NOT assert visual canvas content (only DOM structure).
// Does NOT test bus commands via window.__lessonBus (not exposed in current provider);
//   see Phase 8 TODO above.
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
 * Seed a user + an 'in_progress' lesson with trainer config linked.
 * html_trainer_path = 'sample-column-addition.json' (5 tasks, validated in Task 2).
 */
async function seedTrainerPanelUser(
  email: string,
  withTrainerConfig: boolean = true,
): Promise<{ userId: string; lessonId: string }> {
  const lower = email.toLowerCase()

  await pgQuery(
    'INSERT INTO allowed_email (email, notes) VALUES ($1, $2) ON CONFLICT (email) DO NOTHING',
    [lower, 'e2e trainer-panel test'],
  )

  const userRows = await pgQuery<{ id: string }>(
    `INSERT INTO "user" (id, email, child_name, child_age, created_at)
     VALUES (gen_random_uuid()::text, $1, 'E2E-тренажёр', 10, now())
     ON CONFLICT (email) DO UPDATE SET child_name = 'E2E-тренажёр', child_age = 10
     RETURNING id`,
    [lower],
  )
  const userId = userRows[0].id

  // Lesson scheduled 2 minutes ago → canStartLesson() = true; status already in_progress
  const twoMinAgo = new Date(Date.now() - 2 * 60 * 1000)
  const htmlTrainerPath = withTrainerConfig ? 'sample-column-addition.json' : null

  const lessonRows = await pgQuery<{ id: string }>(
    `INSERT INTO lesson (user_id, scheduled_at, topic, duration_min, html_trainer_path, status, actual_start_at)
     VALUES ($1, $2, 'E2E тест тренажёра', 45, $3, 'in_progress', now())
     RETURNING id`,
    [userId, twoMinAgo.toISOString(), htmlTrainerPath],
  )
  const lessonId = lessonRows[0].id

  return { userId, lessonId }
}

// Session cookies + lesson IDs for each describe block
let savedCookies: BrowserContext['cookies'] extends () => Promise<infer R> ? R : never = []
let lessonWithConfig: string
let lessonWithoutConfig: string

const email = makeTestEmail('trainer-panel')

test.describe('TrainerPanel (TRN-01)', () => {
  test.beforeAll(async () => {
    // 1. Seed user + 2 lessons (one with trainer config, one without)
    const seeded = await seedTrainerPanelUser(email, true)
    lessonWithConfig = seeded.lessonId

    // Seed a second lesson for the same user without trainer config
    const twoMinAgo = new Date(Date.now() - 2 * 60 * 1000)
    const noConfigRows = await pgQuery<{ id: string }>(
      `INSERT INTO lesson (user_id, scheduled_at, topic, duration_min, html_trainer_path, status, actual_start_at)
       VALUES ($1, $2, 'E2E без тренажёра', 45, null, 'in_progress', now())
       RETURNING id`,
      [seeded.userId, twoMinAgo.toISOString()],
    )
    lessonWithoutConfig = noConfigRows[0].id

    // 2. Login once and save session cookies
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
   * Navigate to the lesson page. Injects saved session cookies + warms up Neon DB.
   */
  async function goToLesson(
    page: import('@playwright/test').Page,
    lessonId: string,
  ): Promise<void> {
    await page.context().addCookies(savedCookies)

    // Warm up Neon DB connection (mirrors board-panel.spec.ts pattern)
    for (let i = 0; i < 3; i++) {
      try {
        const resp = await page.request.get(`${BASE_URL}/api/auth/session`)
        if (resp.ok()) break
      } catch {
        // ignore
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

  test('trainer panel Card header Тренажёр is visible on lesson page', async ({ page }) => {
    await goToLesson(page, lessonWithConfig)
    // TrainerPanel always renders the "Тренажёр" card title regardless of config state
    await expect(page.getByText('Тренажёр').first()).toBeVisible({ timeout: 10_000 })
  })

  test('trainer panel renders tasks when config is loaded (data-block=trainer)', async ({ page }) => {
    await goToLesson(page, lessonWithConfig)
    // Wait for the lesson shell to hydrate (tldraw loads asynchronously)
    await page.locator('.tl-canvas').first().waitFor({ timeout: 15_000 }).catch(() => {})
    // TrainerRenderer renders with data-block="trainer" when config is loaded
    // The 5-task sample-column-addition.json should render 5 [data-task-id] elements
    const trainerBlock = page.locator('[data-block="trainer"]').first()
    await expect(trainerBlock).toBeVisible({ timeout: 10_000 })
    // Verify at least one task is rendered (data-task-id present)
    const taskElements = page.locator('[data-task-id]')
    await expect(taskElements.first()).toBeVisible({ timeout: 5_000 })
  })

  test('trainer panel shows placeholder when no config is set', async ({ page }) => {
    await goToLesson(page, lessonWithoutConfig)
    // Without html_trainer_path, TrainerPanel shows placeholder text
    await expect(
      page.getByText(/Тренажёр для этого урока ещё не настроен/).first()
    ).toBeVisible({ timeout: 10_000 })
    // TrainerRenderer should NOT be present (no data-block="trainer")
    await expect(page.locator('[data-block="trainer"]')).toHaveCount(0)
  })
})
