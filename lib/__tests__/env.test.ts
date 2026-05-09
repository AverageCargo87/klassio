import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

describe('lib/env', () => {
  // Save original env vars we might modify
  const savedEnv: Record<string, string | undefined> = {}
  const managedKeys = ['DATABASE_URL', 'DATABASE_URL_DIRECT', 'AUTH_SECRET', 'AUTH_RESEND_KEY', 'AUTH_URL', 'SEED_ADMIN_EMAIL']

  beforeEach(() => {
    // Save and delete managed keys so we control exactly what's set
    for (const key of managedKeys) {
      savedEnv[key] = process.env[key]
      delete process.env[key]
    }
    // Reset module cache so env.ts re-evaluates on each import
    vi.resetModules()
  })

  afterEach(() => {
    // Restore saved env vars
    for (const key of managedKeys) {
      if (savedEnv[key] !== undefined) {
        process.env[key] = savedEnv[key]
      } else {
        delete process.env[key]
      }
    }
    vi.resetModules()
  })

  it('throws when DATABASE_URL is missing', async () => {
    process.env.DATABASE_URL_DIRECT = 'postgresql://localhost/test'
    process.env.AUTH_SECRET = 'a'.repeat(32)
    process.env.AUTH_RESEND_KEY = 're_test_xxxx'
    // DATABASE_URL is intentionally NOT set
    await expect(import('@/lib/env')).rejects.toThrow()
  })

  it('throws when AUTH_SECRET is too short', async () => {
    process.env.DATABASE_URL = 'postgresql://localhost/test'
    process.env.DATABASE_URL_DIRECT = 'postgresql://localhost/test'
    process.env.AUTH_SECRET = 'short'  // less than 32 chars
    process.env.AUTH_RESEND_KEY = 're_test_xxxx'
    await expect(import('@/lib/env')).rejects.toThrow()
  })

  it('throws when AUTH_RESEND_KEY is missing', async () => {
    process.env.DATABASE_URL = 'postgresql://localhost/test'
    process.env.DATABASE_URL_DIRECT = 'postgresql://localhost/test'
    process.env.AUTH_SECRET = 'a'.repeat(32)
    // AUTH_RESEND_KEY is intentionally NOT set
    await expect(import('@/lib/env')).rejects.toThrow()
  })

  it('parses successfully with all required vars', async () => {
    process.env.DATABASE_URL = 'postgresql://localhost/test'
    process.env.DATABASE_URL_DIRECT = 'postgresql://localhost/test'
    process.env.AUTH_SECRET = 'a'.repeat(32)
    process.env.AUTH_RESEND_KEY = 're_test_xxxx'
    const mod = await import('@/lib/env')
    expect(mod.env.DATABASE_URL).toBe('postgresql://localhost/test')
    expect(mod.env.AUTH_SECRET.length).toBeGreaterThanOrEqual(32)
    expect(mod.env.NODE_ENV).toBeDefined()
  })
})
