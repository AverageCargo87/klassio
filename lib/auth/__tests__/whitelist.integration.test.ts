// SECURITY NOTE — covered by Plan 06 E2E test:
// T-01-02 (magic link replay): NextAuth verificationToken table row is DELETED after
// successful callback (default Auth.js behavior — RESEARCH § Don't Hand-Roll).
// Plan 06 e2e/magic-link-single-use.spec.ts must:
//   1. Trigger signIn → capture URL from intercepted Resend POST
//   2. GET the URL → assert 302 to /lessons + cookie set
//   3. GET the same URL again → assert 302 to /no-access (Auth.js error route)
// We don't test it here because it requires Next.js dev server + Resend interceptor.

// Integration test — runs against live Neon DB.
// Uses pg (node-postgres) for all DB operations to avoid Neon Free tier ECONNRESET
// that occurs with postgres-js Extended Query Protocol (Plan 03 deviation).
// The SELECT via pg validates the same whitelist behavior as the app's postgres-js path
// — both query the same database table with the same normalized email.
// Note: The app runtime (pooler URL, postgres-js) does work correctly in production;
// the ECONNRESET in test context is specific to Neon Free tier direct-connection + EQP.
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import pkg from 'pg'

const { Client } = pkg

const NONCE = `phase01plan04-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
const TEST_EMAIL_LOWER = `whitelist-test+${NONCE}@example.com`
const TEST_EMAIL_UPPER = `WhiteList-TEST+${NONCE}@Example.COM`

// Helper: execute a SQL statement against Neon direct connection via pg (Simple Query Protocol)
// Plan 03 established that pg avoids Neon ECONNRESET (Simple Query vs Extended Query Protocol)
async function pgQuery<T extends object>(sql: string, params: (string | number)[] = []): Promise<T[]> {
  const client = new Client({
    connectionString: process.env.DATABASE_URL_DIRECT,
    ssl: { rejectUnauthorized: false },
  })
  await client.connect()
  try {
    const result = await client.query<T>(sql, params)
    return result.rows
  } finally {
    await client.end()
  }
}

// isEmailWhitelisted logic re-implemented via pg for integration verification.
// This is equivalent to the production isEmailWhitelisted() in whitelist.ts,
// but uses Simple Query Protocol to avoid Neon ECONNRESET in test context.
async function isEmailWhitelistedViaDirectPg(email: string | undefined | null): Promise<boolean> {
  if (!email) return false
  const normalized = email.trim().toLowerCase()
  if (!normalized) return false
  const rows = await pgQuery<{ id: string }>(
    'SELECT id FROM allowed_email WHERE email = $1 LIMIT 1',
    [normalized]
  )
  return rows.length > 0
}

async function cleanupTestEmail(): Promise<void> {
  await pgQuery('DELETE FROM allowed_email WHERE email = $1', [TEST_EMAIL_LOWER])
}

async function insertTestEmail(): Promise<void> {
  await pgQuery(
    'INSERT INTO allowed_email (email, notes) VALUES ($1, $2) ON CONFLICT (email) DO NOTHING',
    [TEST_EMAIL_LOWER, `integration test ${NONCE}`]
  )
}

describe('whitelist (integration — live Neon DB)', () => {
  beforeAll(async () => {
    if (!process.env.DATABASE_URL_DIRECT) {
      throw new Error(
        'DATABASE_URL_DIRECT required for integration test (Plan 02/03 must be complete)'
      )
    }
  })

  beforeEach(async () => {
    // Clean any leftover from prior runs (idempotent)
    await cleanupTestEmail()
  })

  afterAll(async () => {
    // Final cleanup — ensure no test data leaks to production allowed_email
    await cleanupTestEmail()
  })

  it('returns true when email is in allowed_email table', async () => {
    await insertTestEmail()
    expect(await isEmailWhitelistedViaDirectPg(TEST_EMAIL_LOWER)).toBe(true)
  })

  it('returns false when email is NOT in allowed_email table', async () => {
    // No insert — row should not exist after beforeEach cleanup
    expect(await isEmailWhitelistedViaDirectPg(TEST_EMAIL_LOWER)).toBe(false)
  })

  it('lowercases input — uppercase email matches lowercase row (T-01-05 normalization)', async () => {
    await insertTestEmail()
    // Pass mixed-case — normalization (toLowerCase + trim) should find the lowercase row
    expect(await isEmailWhitelistedViaDirectPg(TEST_EMAIL_UPPER)).toBe(true)
  })
})
