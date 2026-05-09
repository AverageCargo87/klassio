// E2E test fixture — direct Neon DB access for setup/cleanup before each test.
// Uses DATABASE_URL_DIRECT (port 5432, Simple Query Protocol via pg Client) to avoid Neon
// Free-tier ECONNRESET that occurs with postgres-js Extended Query Protocol
// (established in Plan 03 deviation, verified in lib/auth/__tests__/whitelist.integration.test.ts).
//
// Uses a new Client() per query (like whitelist.integration.test.ts) rather than a Pool,
// because Neon Free tier autosuspends and pool connections go stale between queries.
//
// Pattern A (magic link interception): playwright.config.ts sets NODE_ENV=test and
// AUTH_RESEND_OVERRIDE_FILE on the webServer. email-template.ts writes the magic link URL
// to this file (guarded by NODE_ENV=test) instead of calling Resend. Tests read the file.
// Pattern A was chosen over Pattern B because Auth.js stores the HASHED token in the DB,
// making Pattern B unusable for constructing the raw callback URL.
//
// All E2E test emails use the 'e2e-test+' prefix for reliable cleanup matching.
import { config as loadDotenv } from 'dotenv'
import { resolve } from 'path'
import { readFileSync, existsSync, unlinkSync } from 'fs'
import pkg from 'pg'

const { Client } = pkg

// Load .env.local from project root (Next.js convention; dotenv/config defaults to .env)
// process.cwd() is the Klassio project root when Playwright is invoked via npm run test:e2e
loadDotenv({ path: resolve(process.cwd(), '.env.local') })

const TEST_EMAIL_PREFIX = 'e2e-test+'

// Path to the file where email-template.ts writes the magic link URL (Pattern A)
// Must match the AUTH_RESEND_OVERRIDE_FILE env var set in playwright.config.ts webServer.env
const MAGIC_LINK_FILE =
  process.platform === 'win32'
    ? `${process.env.TEMP ?? 'C:/Windows/Temp'}/klassio-magic-link.txt`
    : '/tmp/klassio-magic-link.txt'

function getConnectionString(): string {
  const url = process.env.DATABASE_URL_DIRECT
  if (!url) throw new Error('DATABASE_URL_DIRECT required for E2E tests')
  return url
}

/**
 * Execute a single SQL statement with a fresh Client connection.
 * New Client per query avoids stale-connection errors on Neon Free tier autosuspend.
 */
async function pgQuery<T extends object>(sql: string, params: unknown[] = []): Promise<T[]> {
  const client = new Client({
    connectionString: getConnectionString(),
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

/** No-op: each query creates and destroys its own Client. Nothing to close globally. */
export async function closeTestDb(): Promise<void> {
  // intentional no-op — per-query Client lifecycle
}

/**
 * Insert (or upsert) the seed test user + at least one upcoming lesson + whitelist the email.
 * Idempotent — safe to call multiple times for same email.
 */
export async function seedTestUser(email: string): Promise<{ userId: string; lessonId: string }> {
  const lower = email.toLowerCase()

  // Ensure whitelist entry exists
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

  // Create a fresh upcoming lesson for predictable card render
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
 * Matches emails with the 'e2e-test+' prefix — never touches seed admin rows.
 */
export async function resetTestDb(): Promise<void> {
  // Find all E2E test user IDs
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

  // Clean up the magic link file if it exists
  clearMagicLinkFile()
}

/**
 * Generate a unique E2E test email with timestamp suffix to prevent collisions across specs.
 */
export function makeTestEmail(suffix: string): string {
  return `${TEST_EMAIL_PREFIX}${suffix}-${Date.now()}@example.com`
}

/**
 * Clear the magic link file before a form submission (to detect stale values).
 */
export function clearMagicLinkFile(): void {
  if (existsSync(MAGIC_LINK_FILE)) {
    try {
      unlinkSync(MAGIC_LINK_FILE)
    } catch {
      // ignore
    }
  }
}

/**
 * Pattern A: Read the magic link URL from the file written by email-template.ts.
 *
 * The webServer in playwright.config.ts sets NODE_ENV=test + AUTH_RESEND_OVERRIDE_FILE,
 * causing email-template.ts to write "email|url" to the file instead of calling Resend.
 * Returns the URL for the expected email, or null if not written yet.
 *
 * Call this in a polling loop after form submission (the Server Action is async).
 */
export async function readMagicLinkFor(email: string, _baseURL: string): Promise<string | null> {
  if (!existsSync(MAGIC_LINK_FILE)) return null

  try {
    const content = readFileSync(MAGIC_LINK_FILE, 'utf-8').trim()
    if (!content) return null

    // Format: "email|url" (written by email-template.ts)
    const pipeIdx = content.indexOf('|')
    if (pipeIdx === -1) return null

    const fileEmail = content.substring(0, pipeIdx).toLowerCase()
    const url = content.substring(pipeIdx + 1)

    // Verify the email matches what we expect (in case of stale files from other tests)
    if (fileEmail !== email.toLowerCase()) return null

    return url
  } catch {
    return null
  }
}
