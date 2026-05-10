// E2E: Login happy path — ACC-01
// Full magic link round-trip: parent submits whitelisted email → form shows banner →
// Pattern B reads verificationToken from DB → visits magic link URL → lands on /lessons
// with seed lesson card visible.
//
// Pattern B: no email interception needed — NextAuth inserts verificationToken row
// BEFORE calling Resend. We query DB directly for the token and construct the callback URL.
import { test, expect } from '@playwright/test'
import { seedTestUser, resetTestDb, readMagicLinkFor, clearMagicLinkFile, makeTestEmail, closeTestDb } from './fixtures/db-setup'

const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:3000'

test.describe('login happy path (ACC-01)', () => {
  test.afterAll(async () => {
    await resetTestDb()
    await closeTestDb()
  })

  test('whitelisted email → magic link → /lessons with seed lesson visible', async ({ page }) => {
    const email = makeTestEmail('happy')
    await seedTestUser(email)

    // 1. Submit login form
    clearMagicLinkFile() // clear stale magic link file from previous tests
    await page.goto('/login')
    await page.getByLabel(/Email родителя/).fill(email)
    await page.getByRole('button', { name: /Отправить ссылку/ }).click()

    // 2. Should land on /login?sent=1 with uniform banner (T-01-01 UX)
    await page.waitForURL(/\/login\?sent=1/)
    await expect(page.getByText(/Если ваш email в нашем списке/)).toBeVisible()

    // 3. Pattern B: read verificationToken from DB (NextAuth writes it before Resend send)
    // Poll for up to 5 seconds — Neon DB may have a brief lag after cold start
    let magicLink: string | null = null
    for (let i = 0; i < 25; i++) {
      magicLink = await readMagicLinkFor(email, baseURL)
      if (magicLink) break
      await new Promise(r => setTimeout(r, 200))
    }
    expect(magicLink, 'verificationToken row must exist after signIn()').not.toBeNull()

    // 4. Visit the magic link → NextAuth verifies token, sets session cookie, redirects
    await page.goto(magicLink!)
    await page.waitForURL(/\/lessons/)
    expect(page.url()).toMatch(/\/lessons/)

    // 5. Seed lesson card must be visible on /lessons (ACC-02 partial verification)
    // Heading changed from "Уроки" → "Расписание" in Plan 02-02 schedule refactor
    await expect(page.getByRole('heading', { name: /Расписание/ })).toBeVisible()
    await expect(page.getByText(/E2E тестовый урок/)).toBeVisible()
  })
})
