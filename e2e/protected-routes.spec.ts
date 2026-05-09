// E2E: Protected route middleware — INV-01
// Verifies that middleware.ts blocks unauthenticated access to /lessons and /lesson/*
// and redirects to /login. No DB setup needed — pure routing check.
import { test, expect } from '@playwright/test'

test.describe('protected routes (INV-01)', () => {
  test('GET /lessons unauthenticated → redirect to /login', async ({ page }) => {
    // waitUntil: 'commit' — follow redirects but don't wait for full page load
    await page.goto('/lessons', { waitUntil: 'commit' })
    await page.waitForURL(/\/login/)
    expect(page.url()).toMatch(/\/login(\?|$)/)
  })

  test('GET /lesson/[id] unauthenticated → redirect to /login', async ({ page }) => {
    await page.goto('/lesson/00000000-0000-0000-0000-000000000010', { waitUntil: 'commit' })
    await page.waitForURL(/\/login/)
    expect(page.url()).toMatch(/\/login(\?|$)/)
  })
})
