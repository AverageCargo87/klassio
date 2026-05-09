// E2E: Root URL auto-redirect — D-16
// Unauthenticated GET / → /login (no landing page in v1).
// Authenticated case is tested transitively in persist-session.spec.ts
// (same context, opens new page, visits /, asserts /lessons).
import { test, expect } from '@playwright/test'

test('GET / unauthenticated → /login (D-16)', async ({ page }) => {
  await page.goto('/', { waitUntil: 'commit' })
  await page.waitForURL(/\/login/)
  expect(page.url()).toMatch(/\/login(\?|$)/)
})
