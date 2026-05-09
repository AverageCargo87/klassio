import { test, expect } from '@playwright/test'

test('playwright is wired', async () => {
  // Trivial assertion — does NOT start the dev server because it doesn't navigate.
  // Real e2e specs in plan 06 will use page.goto(baseURL).
  expect(true).toBe(true)
})
