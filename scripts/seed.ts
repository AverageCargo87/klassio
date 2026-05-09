// Source: RESEARCH § Code Example 7 (drizzle docs + custom).
// Run via: npm run db:seed (defined in package.json from Plan 01).
// Uses DATABASE_URL_DIRECT (non-pooler) — seed inserts run in single connection, no PgBouncer quirks.
// Idempotent: re-runs do not duplicate rows (onConflictDoNothing for unique columns).
import 'dotenv/config'
import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import { eq } from 'drizzle-orm'
import * as schema from '../lib/db/schema'

const ADMIN_EMAIL = (process.env.SEED_ADMIN_EMAIL ?? 'kratov.gr@gmail.com').toLowerCase()

export default async function main() {
  if (!process.env.DATABASE_URL_DIRECT) {
    throw new Error('DATABASE_URL_DIRECT is required for seed (use direct connection, NOT pooler — Pitfall 3)')
  }

  const client = postgres(process.env.DATABASE_URL_DIRECT, { prepare: false, max: 1 })
  const db = drizzle({ client, schema })

  try {
    console.log(`[seed] 1. Adding admin email "${ADMIN_EMAIL}" to allowed_email whitelist...`)
    await db.insert(schema.allowedEmails)
      .values({ email: ADMIN_EMAIL, notes: 'admin (seed)' })
      .onConflictDoNothing()

    console.log('[seed] 2. Creating admin user (or updating childName/childAge if exists)...')
    const [user] = await db.insert(schema.users)
      .values({
        email: ADMIN_EMAIL,
        childName: 'Тест-ребёнок',
        childAge: 10,
      })
      .onConflictDoUpdate({
        target: schema.users.email,
        set: { childName: 'Тест-ребёнок', childAge: 10 },
      })
      .returning()

    console.log(`[seed]    user.id = ${user.id}`)

    console.log('[seed] 3. Ensuring at least one upcoming test lesson...')
    // Idempotency: only insert if no lesson exists for this user
    const existing = await db.select({ id: schema.lessons.id })
      .from(schema.lessons)
      .where(eq(schema.lessons.userId, user.id))
      .limit(50)

    const hasUpcoming = existing.length > 0
    if (!hasUpcoming) {
      const oneHourLater = new Date(Date.now() + 60 * 60 * 1000)
      await db.insert(schema.lessons).values({
        userId: user.id,
        scheduledAt: oneHourLater,
        topic: 'Сложение в столбик',
        durationMin: 45,
        status: 'scheduled',
      })
      console.log(`[seed]    new lesson scheduled for ${oneHourLater.toISOString()}`)
    } else {
      console.log(`[seed]    user has ${existing.length} existing lesson(s); skipping insert (idempotent)`)
    }

    console.log(`[seed] Seed complete. Admin email: ${ADMIN_EMAIL}`)
  } finally {
    await client.end()
  }
}

// Allow direct execution: `tsx scripts/seed.ts`
// We must keep the default export so unit tests can import without triggering the call.
if (process.argv[1]?.endsWith('seed.ts') || process.argv[1]?.endsWith('seed')) {
  main().catch((e) => {
    console.error('[seed] FAILED:', e)
    process.exit(1)
  })
}
