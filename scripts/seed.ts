// Source: RESEARCH § Code Example 7 (drizzle docs + custom).
// Run via: npm run db:seed (defined in package.json from Plan 01).
// Uses DATABASE_URL_DIRECT (non-pooler) — seed inserts run in single connection.
// Idempotent: re-runs do not duplicate rows (onConflictDoNothing for unique columns).
//
// Implementation note: Uses node-postgres (`pg`) instead of postgres-js for DML operations.
// postgres-js sends parameterized queries via Extended Query Protocol which Neon Free tier
// resets with ECONNRESET. node-postgres (`pg`) handles the same scenario correctly.
// drizzle-kit push avoidance: see scripts/db-push.ts for the same issue with DDL.
import { config } from 'dotenv'
// Load .env.local first (Next.js convention), then fall back to .env
config({ path: '.env.local' })
config()

import { Client } from 'pg'

const ADMIN_EMAIL = (process.env.SEED_ADMIN_EMAIL ?? 'kratov.gr@gmail.com').toLowerCase()

async function withClient<T>(fn: (client: Client) => Promise<T>): Promise<T> {
  const client = new Client({ connectionString: process.env.DATABASE_URL_DIRECT })
  await client.connect()
  try {
    return await fn(client)
  } finally {
    await client.end()
  }
}

export default async function main() {
  if (!process.env.DATABASE_URL_DIRECT) {
    throw new Error('DATABASE_URL_DIRECT is required for seed (use direct connection, NOT pooler — Pitfall 3)')
  }

  console.log(`[seed] 1. Adding admin email "${ADMIN_EMAIL}" to allowed_email whitelist...`)
  await withClient(async (client) => {
    await client.query(
      'INSERT INTO allowed_email (email, notes) VALUES ($1, $2) ON CONFLICT (email) DO NOTHING',
      [ADMIN_EMAIL, 'admin (seed)']
    )
  })
  console.log(`[seed]    allowed_email insert done`)

  console.log('[seed] 2. Creating admin user (or updating childName/childAge if exists)...')
  const userResult = await withClient(async (client) => {
    const r = await client.query(
      `INSERT INTO "user" (id, email, child_name, child_age)
       VALUES (gen_random_uuid()::text, $1, $2, $3)
       ON CONFLICT (email) DO UPDATE
         SET child_name = EXCLUDED.child_name,
             child_age  = EXCLUDED.child_age
       RETURNING id`,
      [ADMIN_EMAIL, 'Тест-ребёнок', 10]
    )
    return r.rows[0] as { id: string }
  })
  const userId = userResult.id
  console.log(`[seed]    user.id = ${userId}`)

  console.log('[seed] 3. Ensuring at least one upcoming test lesson...')
  const existingResult = await withClient(async (client) => {
    const r = await client.query(
      'SELECT id FROM lesson WHERE user_id = $1 LIMIT 50',
      [userId]
    )
    return r.rows as { id: string }[]
  })

  if (existingResult.length === 0) {
    const oneHourLater = new Date(Date.now() + 60 * 60 * 1000)
    await withClient(async (client) => {
      await client.query(
        `INSERT INTO lesson (id, user_id, scheduled_at, topic, duration_min, status)
         VALUES (gen_random_uuid(), $1, $2, $3, $4, 'scheduled')`,
        [userId, oneHourLater.toISOString(), 'Сложение в столбик', 45]
      )
    })
    console.log(`[seed]    new lesson scheduled for ${oneHourLater.toISOString()}`)
  } else {
    console.log(`[seed]    user has ${existingResult.length} existing lesson(s); skipping insert (idempotent)`)
  }

  console.log(`[seed] Seed complete. Admin email: ${ADMIN_EMAIL}`)
}

// Allow direct execution: `tsx scripts/seed.ts`
// We must keep the default export so unit tests can import without triggering the call.
if (process.argv[1]?.endsWith('seed.ts') || process.argv[1]?.endsWith('seed')) {
  main().catch((e) => {
    console.error('[seed] FAILED:', e)
    process.exit(1)
  })
}
