// E2E: Magic link single-use enforcement — T-01-02
//
// Security requirement: verificationToken is deleted after the first successful callback
// (default Auth.js Drizzle adapter behavior — see RESEARCH § Don't Hand-Roll).
// A replayed token must NOT grant access. ASVS V3.5.1.
//
// SECURITY NOTE from lib/auth/__tests__/whitelist.integration.test.ts:
//   First click → token deleted by NextAuth → second click → NextAuth error → pages.error = /no-access
//
// Test uses two separate browser contexts to ensure no shared cookies between attempts.
import { test, expect } from '@playwright/test'
import { seedTestUser, resetTestDb, readMagicLinkFor, clearMagicLinkFile, makeTestEmail, closeTestDb } from './fixtures/db-setup'

const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:3000'

test.describe('magic link single-use (T-01-02)', () => {
  test.afterAll(async () => {
    await resetTestDb()
    await closeTestDb()
  })

  test('first click → /lessons; second click (replay) → /no-access or /login (NOT /lessons)', async ({ browser }) => {
    const email = makeTestEmail('replay')
    await seedTestUser(email)

    // Context 1: submit form, read magic link, follow it successfully
    clearMagicLinkFile() // clear stale magic link file from previous tests
    const ctx1 = await browser.newContext()
    const page1 = await ctx1.newPage()

    await page1.goto('/login')
    await page1.getByLabel(/Email родителя/).fill(email)
    await page1.getByRole('button', { name: /Отправить ссылку/ }).click()
    await page1.waitForURL(/\/login\?sent=1/)

    // Pattern B: read token from DB — poll up to 5s for Neon DB lag after cold start
    let magicLink: string | null = null
    for (let i = 0; i < 25; i++) {
      magicLink = await readMagicLinkFor(email, baseURL)
      if (magicLink) break
      await new Promise(r => setTimeout(r, 200))
    }
    expect(magicLink, 'verificationToken row must exist after signIn()').not.toBeNull()

    // First use — must succeed and land on /lessons
    await page1.goto(magicLink!)
    await page1.waitForURL(/\/lessons/)
    expect(page1.url()).toMatch(/\/lessons/)
    await ctx1.close() // closes all cookies for ctx1

    // Context 2: fresh context (no session cookie), replay the same magic link
    // NextAuth deletes the verificationToken row after first successful use.
    // Second attempt → callback finds no row → Auth.js error → pages.error = /no-access
    const ctx2 = await browser.newContext()
    const page2 = await ctx2.newPage()

    await page2.goto(magicLink!)
    // Must NOT reach /lessons
    await page2.waitForURL(/(\/no-access|\/login)/, { timeout: 15_000 })
    expect(page2.url()).not.toMatch(/\/lessons/)
    // Should land on /no-access (the configured pages.error value) or /login (fallback)
    expect(page2.url()).toMatch(/(\/no-access|\/login)/)

    await ctx2.close()
  })
})
