import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: './e2e',
  globalSetup: './e2e/global-setup.ts', // warms up Neon DB before suite starts
  fullyParallel: false,           // serial — auth tests share DB state
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,                     // single worker — auth flows mutate shared state
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:3000',
    trace: 'on-first-retry',
    headless: true,
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
  ],
  webServer: process.env.PLAYWRIGHT_BASE_URL ? undefined : {
    command: 'npm run dev',
    url: 'http://localhost:3000',
    reuseExistingServer: false, // Always start fresh to ensure NODE_ENV=test env is set
    timeout: 120_000,
    // AUTH_RESEND_OVERRIDE_FILE enables Pattern A: email-template.ts writes magic link URL
    // to this file instead of calling Resend. Avoids Resend 403 with unverified domains.
    // NODE_ENV is NOT set to 'test' — Next.js skips .env.local loading for NODE_ENV=test,
    // which would break env validation. The AUTH_RESEND_OVERRIDE_FILE guard is sufficient.
    env: {
      ...process.env as Record<string, string>,
      AUTH_RESEND_OVERRIDE_FILE: process.platform === 'win32'
        ? `${process.env.TEMP ?? 'C:/Windows/Temp'}/klassio-magic-link.txt`
        : '/tmp/klassio-magic-link.txt',
    },
  },
})
