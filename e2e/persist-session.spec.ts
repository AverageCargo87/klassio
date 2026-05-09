// E2E: Session persistence — INV-01 (child opens browser via parent's cookie)
//
// D-04: httpOnly cookie with maxAge 1 year (365 × 24 × 60 × 60 seconds).
// INV-01 invariant: after parent logs in once, the child can open the browser on the same
// device and access /lessons without re-authenticating (cookie persists in the browser profile).
//
// Simulated by: logging in, closing the initial page, opening a new page in the same browser
// context (cookies persist within context), visiting / which redirects to /lessons.
import { test, expect } from '@playwright/test'
import { seedTestUser, resetTestDb, readMagicLinkFor, clearMagicLinkFile, makeTestEmail, closeTestDb } from './fixtures/db-setup'

const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:3000'

test.describe('session persistence (INV-01)', () => {
  test.afterAll(async () => {
    await resetTestDb()
    await closeTestDb()
  })

  test('after login, cookie persists and / redirects to /lessons (D-04, INV-01)', async ({ browser }) => {
    const email = makeTestEmail('persist')
    await seedTestUser(email)

    const ctx = await browser.newContext()
    const page = await ctx.newPage()

    // Log in
    clearMagicLinkFile() // clear stale magic link file from previous tests
    await page.goto('/login')
    await page.getByLabel(/Email родителя/).fill(email)
    await page.getByRole('button', { name: /Отправить ссылку/ }).click()
    await page.waitForURL(/\/login\?sent=1/)

    // Pattern B: get magic link from DB — poll up to 5s for Neon DB lag after cold start
    let magicLink: string | null = null
    for (let i = 0; i < 25; i++) {
      magicLink = await readMagicLinkFor(email, baseURL)
      if (magicLink) break
      await new Promise(r => setTimeout(r, 200))
    }
    expect(magicLink, 'verificationToken row must exist after signIn()').not.toBeNull()

    await page.goto(magicLink!)
    await page.waitForURL(/\/lessons/)

    // D-04 assertion: cookie maxAge must be approximately 1 year (allow ±1 day tolerance)
    const cookies = await ctx.cookies(baseURL)
    // NextAuth sets 'authjs.session-token' in dev; '__Secure-authjs.session-token' in prod
    const sessionCookie = cookies.find(
      c => c.name === 'authjs.session-token' || c.name === '__Secure-authjs.session-token'
    )
    expect(sessionCookie, 'session cookie must exist after login').toBeDefined()

    const oneYearSeconds = 365 * 24 * 60 * 60
    const nowSeconds = Math.floor(Date.now() / 1000)
    const expiresInSeconds = sessionCookie!.expires - nowSeconds

    // Tolerance: ±1 day (86400 seconds) to account for test execution time
    expect(expiresInSeconds).toBeGreaterThan(oneYearSeconds - 24 * 60 * 60) // ≥ ~364 days
    expect(expiresInSeconds).toBeLessThan(oneYearSeconds + 24 * 60 * 60)    // ≤ ~366 days

    // Simulate "child opens browser": close parent's page, open new page in same context
    // (cookies are shared within a browser context — mimics same browser profile)
    await page.close()
    const childPage = await ctx.newPage()

    // Child visits root → should redirect to /lessons (session cookie still valid)
    await childPage.goto('/')
    await childPage.waitForURL(/\/lessons/)
    expect(childPage.url()).toMatch(/\/lessons/)

    // Seed lesson must still be visible
    await expect(childPage.getByText(/E2E тестовый урок/)).toBeVisible()

    await ctx.close()
  })
})
