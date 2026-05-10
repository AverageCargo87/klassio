// E2E: Schedule grouping UI — ACC-03
// Verifies: /lessons shows weekly grouping, smart-relative dates,
// past-lessons section collapsed by default, expand reveals past lesson cards.
//
// Session strategy: Log in once using a dedicated browser in beforeAll, save cookies,
// then inject saved cookies into each test's page context. Avoids single-use magic link
// problem and avoids storageState file timing issues.
//
// Test data strategy:
// - seedTestUser() creates 1 upcoming lesson (1 hour from now, "E2E тестовый урок")
// - insertPastLesson() inserts 1 completed lesson (yesterday) via pg directly
// - resetTestDb() cleans all e2e-test+ emails in afterAll
import { test, expect, chromium } from '@playwright/test'
import type { BrowserContext } from '@playwright/test'
import {
  seedTestUser,
  resetTestDb,
  makeTestEmail,
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

async function insertPastLesson(userId: string, topic: string): Promise<string> {
  const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000)
  const client = new Client({
    connectionString: getConnectionString(),
    ssl: { rejectUnauthorized: false },
  })
  await client.connect()
  try {
    const result = await client.query<{ id: string }>(
      `INSERT INTO lesson (user_id, scheduled_at, topic, duration_min, status)
       VALUES ($1, $2, $3, 45, 'completed') RETURNING id`,
      [userId, yesterday.toISOString(), topic]
    )
    return result.rows[0].id
  } finally {
    await client.end()
  }
}

// Session cookies saved during beforeAll login; injected into each test's page
let savedCookies: BrowserContext['cookies'] extends () => Promise<infer R> ? R : never = []

const email = makeTestEmail('schedule-grouping')

test.describe('Schedule grouping UI (ACC-03)', () => {
  test.beforeAll(async () => {
    // 1. Seed user + upcoming lesson
    const seeded = await seedTestUser(email)
    const userId = seeded.userId

    // 2. Add a past (completed) lesson so the collapsible section has content
    await insertPastLesson(userId, 'E2E прошедший урок')

    // 3. Log in once with a dedicated browser and save session cookies
    const browser = await chromium.launch()
    const context = await browser.newContext()
    const page = await context.newPage()

    try {
      await page.goto(`${BASE_URL}/login`)
      await page.getByLabel(/Email родителя/).fill(email)
      clearMagicLinkFile()
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

      // Save all cookies from the authenticated context
      savedCookies = await context.cookies()
    } finally {
      await browser.close()
    }
  })

  test.afterAll(async () => {
    await resetTestDb()
  })

  /**
   * Helper: navigate to /lessons as authenticated user by injecting saved cookies.
   * Warms up the Neon DB via /api/auth/session before loading /lessons — same pattern
   * as global-setup.ts — to avoid ECONNRESET on Neon Free tier cold start.
   */
  async function goToLessons(page: import('@playwright/test').Page): Promise<void> {
    await page.context().addCookies(savedCookies)

    // Warm up Neon DB (mirrors global-setup.ts pattern)
    for (let i = 0; i < 3; i++) {
      try {
        const resp = await page.request.get(`${BASE_URL}/api/auth/session`)
        if (resp.ok()) break
      } catch {
        // ignore — will retry
      }
      await new Promise((r) => setTimeout(r, 1000))
    }

    // Navigate to /lessons with retry on transient Neon cold-start failures.
    // Set explicit timeout on goto to avoid hitting Playwright's 30s default test timeout.
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        await page.goto('/lessons', { timeout: 8_000 })
        await page.waitForURL(/\/lessons/, { timeout: 5_000 })
        return // success
      } catch (err) {
        if (attempt === 3) throw err
        // Transient Neon ECONNRESET — give Neon time to wake up before retry
        await new Promise((r) => setTimeout(r, 2500))
      }
    }
  }

  test('shows Расписание heading', async ({ page }) => {
    await goToLessons(page)
    await expect(page.getByRole('heading', { level: 1 })).toContainText('Расписание')
  })

  test('shows at least one week bucket header (Эта неделя)', async ({ page }) => {
    await goToLessons(page)
    // seedTestUser creates 1 lesson 1 hour from now — always in "Эта неделя"
    await expect(page.getByRole('heading', { level: 2 }).first()).toContainText('Эта неделя')
  })

  test('upcoming lesson card shows smart-relative date (Сегодня в)', async ({ page }) => {
    await goToLessons(page)
    // Lesson scheduled 1 hour from now → formatSmartDate returns "Сегодня в HH:mm"
    await expect(page.getByText(/Сегодня в/)).toBeVisible()
  })

  test('past lessons section is collapsed by default', async ({ page }) => {
    await goToLessons(page)
    // Past lesson card text should NOT be visible when section is collapsed
    await expect(page.getByText('E2E прошедший урок')).not.toBeVisible()
    // The toggle trigger must be visible so user can expand the section
    await expect(page.getByRole('button', { name: /Прошедшие уроки/i })).toBeVisible()
  })

  test('clicking past lessons trigger reveals past lesson card with status badge', async ({
    page,
  }) => {
    await goToLessons(page)
    // Expand the collapsible section by clicking the trigger
    await page.getByRole('button', { name: /Прошедшие уроки/i }).click()
    // Past lesson topic should now be visible
    await expect(page.getByText('E2E прошедший урок')).toBeVisible()
    // Status label — lesson inserted with status='completed' → label "Проведён"
    await expect(page.getByText('Проведён')).toBeVisible()
    // Phase 10 recording placeholder (from past-lessons.tsx)
    await expect(page.getByText(/Запись урока появится в будущем обновлении/)).toBeVisible()
  })
})
