// Playwright global setup: warms up the Neon DB before any tests run.
//
// Neon Free tier autosuspends after 5 minutes of inactivity. The first postgres-js
// connection after resumption can fail with ECONNRESET (known behavior — first TCP
// packet on a cold compute node). This setup sends a warmup HTTP request to the
// Next.js dev server before the test suite begins, ensuring the connection pool is
// established and stable before form submissions hit the DB.
//
// The HTTP request to /api/auth/session triggers the Next.js app to initialize
// its postgres-js client and establish a connection to Neon. If it fails the first
// time (cold start), we retry. By the time E2E tests run, the pool is warm.
import { chromium } from '@playwright/test'

const BASE_URL = process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:3000'
const MAX_RETRIES = 5
const RETRY_DELAY_MS = 2000

export default async function globalSetup() {
  const browser = await chromium.launch()
  const page = await browser.newPage()

  for (let i = 0; i < MAX_RETRIES; i++) {
    try {
      // /api/auth/session is a lightweight NextAuth endpoint that queries the DB
      // (checks session table) — sufficient to warm up the postgres-js connection pool
      const response = await page.request.get(`${BASE_URL}/api/auth/session`)
      if (response.ok() || response.status() === 200) {
        console.log('[global-setup] DB connection warm (status:', response.status(), ')')
        break
      }
    } catch {
      // ignore connection errors during warmup — will retry
    }
    console.log(`[global-setup] Waiting for Neon DB to warm up (attempt ${i + 1}/${MAX_RETRIES})...`)
    await new Promise(r => setTimeout(r, RETRY_DELAY_MS))
  }

  await browser.close()
}
