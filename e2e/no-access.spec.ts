// E2E: /no-access page renders neutral Russian copy — D-18
// No auth required — this page is publicly accessible but shows no actionable info.
// Text verified against app/no-access/page.tsx Russian copy.
import { test, expect } from '@playwright/test'

test('/no-access shows neutral Russian message (D-18)', async ({ page }) => {
  await page.goto('/no-access')
  await expect(page.getByRole('heading', { name: /Доступ не предоставлен/ })).toBeVisible()
  await expect(page.getByText(/Обратитесь к репетитору/)).toBeVisible()
  // Also ensure there's a link back to /login
  await expect(page.getByRole('link', { name: /Запросить ссылку для входа/ })).toBeVisible()
})
