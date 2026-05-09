// E2E: Whitelist uniform response — T-01-01, T-01-05
//
// Security requirement: whitelisted and non-whitelisted email submissions MUST produce
// identical user-visible responses. If they differ (different redirect target, different
// banner text), an attacker can enumerate valid emails (OWASP ASVS V3.2.1).
//
// D-02 / A1 silent-drop decision (01-CONTEXT.md): non-whitelisted email → /login?sent=1
// (same as whitelisted), NOT /no-access. loginAction catches AccessDeniedError and silently
// redirects to the same page. This is asserted explicitly here.
import { test, expect } from '@playwright/test'
import { seedTestUser, resetTestDb, makeTestEmail, closeTestDb, clearMagicLinkFile } from './fixtures/db-setup'

test.describe('whitelist uniform response (T-01-01, T-01-05)', () => {
  test.afterAll(async () => {
    await resetTestDb()
    await closeTestDb()
  })

  test('whitelisted email → /login?sent=1 with standard banner', async ({ page }) => {
    const email = makeTestEmail('whitelisted')
    await seedTestUser(email)

    clearMagicLinkFile()
    await page.goto('/login')
    await page.getByLabel(/Email родителя/).fill(email)
    await page.getByRole('button', { name: /Отправить ссылку/ }).click()

    await page.waitForURL(/\/login\?sent=1/)
    await expect(
      page.getByText(/Если ваш email в нашем списке, мы отправили ссылку. Проверьте почту./)
    ).toBeVisible()
    expect(page.url()).not.toMatch(/\/no-access/)
  })

  test('NON-whitelisted email → SAME /login?sent=1 with SAME banner (T-01-01 mitigation)', async ({ page }) => {
    // Deliberately NOT calling seedTestUser → email not in allowed_email → signIn callback returns false
    // loginAction must catch AccessDeniedError and redirect identically (A1 silent-drop)
    const email = `e2e-test+notwhitelisted-${Date.now()}@example.com`

    clearMagicLinkFile()
    await page.goto('/login')
    await page.getByLabel(/Email родителя/).fill(email)
    await page.getByRole('button', { name: /Отправить ссылку/ }).click()

    // Critical T-01-01 assertion: SAME redirect target as whitelisted case
    await page.waitForURL(/\/login\?sent=1/)
    await expect(
      page.getByText(/Если ваш email в нашем списке, мы отправили ссылку. Проверьте почту./)
    ).toBeVisible()

    // Critical regression check: must NOT land on /no-access (old pre-A1 behavior)
    expect(page.url()).not.toMatch(/\/no-access/)
  })
})
