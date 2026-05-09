// E2E test fixture — direct Neon DB access for setup/cleanup before each test.
// Uses DATABASE_URL_DIRECT (port 5432, Simple Query Protocol via pg) to avoid Neon
// Free-tier ECONNRESET that occurs with postgres-js Extended Query Protocol
// (established in Plan 03 deviation, used in lib/auth/__tests__/whitelist.integration.test.ts).
//
// All E2E test emails use the 'e2e-test+' prefix for reliable cleanup matching.
// Pattern B (DB token read) — construct magic link from verificationToken table
// immediately after signIn() call, before Resend delivers the actual email.
import 'dotenv/config'
import pkg from 'pg'

const { Pool } = pkg

const TEST_EMAIL_PREFIX = 'e2e-test+'

let _pool: InstanceType<typeof Pool> | null = null

function getPool(): InstanceType<typeof Pool> {
  if (!_pool) {
    if (!process.env.DATABASE_URL_DIRECT) {
      throw new Error('DATABASE_URL_DIRECT required for E2E tests')
    }
    _pool = new Pool({
      connectionString: process.env.DATABASE_URL_DIRECT,
      ssl: { rejectUnauthorized: false },
      max: 1,
    })
  }
  return _pool
}

async function pgQuery<T extends object>(sql: string, params: unknown[] = []): Promise<T[]> {
  const pool = getPool()
  const result = await pool.query<T>(sql, params)
  return result.rows
}

export async function closeTestDb(): Promise<void> {
  if (_pool) {
    await _pool.end()
    _pool = null
  }
}

/**
 * Insert (or upsert) the seed test user + at least one upcoming lesson + whitelist the email.
 * Idempotent — safe to call multiple times for same email.
 */
export async function seedTestUser(email: string): Promise<{ userId: string; lessonId: string }> {
  const lower = email.toLowerCase()

  // Ensure whitelist entry
  await pgQuery(
    'INSERT INTO allowed_email (email, notes) VALUES ($1, $2) ON CONFLICT (email) DO NOTHING',
    [lower, `e2e test ${new Date().toISOString()}`]
  )

  // Upsert user (Auth.js adapter requires the "user" table)
  const userRows = await pgQuery<{ id: string }>(
    `INSERT INTO "user" (id, email, child_name, child_age, created_at)
     VALUES (gen_random_uuid()::text, $1, 'E2E-ребёнок', 10, now())
     ON CONFLICT (email) DO UPDATE SET child_name = 'E2E-ребёнок', child_age = 10
     RETURNING id`,
    [lower]
  )
  const userId = userRows[0].id

  // Always create a fresh upcoming lesson for predictable card render
  const oneHourLater = new Date(Date.now() + 60 * 60 * 1000)
  const lessonRows = await pgQuery<{ id: string }>(
    `INSERT INTO lesson (user_id, scheduled_at, topic, duration_min, status)
     VALUES ($1, $2, 'E2E тестовый урок', 45, 'scheduled')
     RETURNING id`,
    [userId, oneHourLater.toISOString()]
  )
  const lessonId = lessonRows[0].id

  return { userId, lessonId }
}

/**
 * Remove all E2E test artifacts. Run in test.afterAll().
 * Matches emails with 'e2e-test+' prefix.
 */
export async function resetTestDb(): Promise<void> {
  // Get test user IDs
  const testUsers = await pgQuery<{ id: string }>(
    `SELECT id FROM "user" WHERE email LIKE $1`,
    [`${TEST_EMAIL_PREFIX}%`]
  )

  for (const u of testUsers) {
    await pgQuery('DELETE FROM lesson WHERE user_id = $1', [u.id])
    await pgQuery('DELETE FROM account WHERE "userId" = $1', [u.id])
    await pgQuery('DELETE FROM session WHERE "userId" = $1', [u.id])
    await pgQuery('DELETE FROM "user" WHERE id = $1', [u.id])
  }

  await pgQuery(`DELETE FROM allowed_email WHERE email LIKE $1`, [`${TEST_EMAIL_PREFIX}%`])
  await pgQuery(`DELETE FROM "verificationToken" WHERE identifier LIKE $1`, [`${TEST_EMAIL_PREFIX}%`])
}

/**
 * Generate a unique E2E test email with timestamp suffix to prevent collisions.
 */
export function makeTestEmail(suffix: string): string {
  return `${TEST_EMAIL_PREFIX}${suffix}-${Date.now()}@example.com`
}

/**
 * Pattern B: Read the magic link URL from verificationToken table for a given email.
 *
 * NextAuth inserts the verificationToken row BEFORE calling Resend.
 * We read it directly from the DB and construct the callback URL — no email needed.
 *
 * URL format: {baseURL}/api/auth/callback/resend?token=...&email=...
 */
export async function readMagicLinkFor(email: string, baseURL: string): Promise<string | null> {
  const lower = email.toLowerCase()
  const rows = await pgQuery<{ token: string; identifier: string }>(
    `SELECT token, identifier FROM "verificationToken" WHERE identifier = $1 LIMIT 1`,
    [lower]
  )

  if (rows.length === 0) return null
  const { token, identifier } = rows[0]
  return `${baseURL}/api/auth/callback/resend?token=${encodeURIComponent(token)}&email=${encodeURIComponent(identifier)}`
}
