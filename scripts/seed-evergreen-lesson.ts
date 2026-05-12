// scripts/seed-evergreen-lesson.ts
// Creates ONE permanent "evergreen" test lesson with a fixed UUID and a date far
// in the future (year 2099). Always openable via ?test=1 admin bypass.
//
// Usage:
//   npx tsx scripts/seed-evergreen-lesson.ts
//
// Idempotent: re-running does NOT duplicate. ON CONFLICT UPDATE refreshes topic
// and scheduledAt but preserves the lesson row.
//
// After running:
//   1. Open https://klassio-one.vercel.app/lesson/eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee?test=1
//   2. Save as bookmark — works forever.
//
// The ?test=1 bypass works only for SEED_ADMIN_EMAIL (kratov.gr@gmail.com),
// and bypasses both terminal-status guard and canStart 5-min window.
// (see app/lesson/[id]/page.tsx lines 46-51)

import { config } from 'dotenv'
config({ path: '.env.local' })
config()

import { Client } from 'pg'

const ADMIN_EMAIL = (process.env.SEED_ADMIN_EMAIL ?? 'kratov.gr@gmail.com').toLowerCase()

// Memorable fixed UUID — "all e's" — easy to recognise in URLs/logs.
const EVERGREEN_LESSON_ID = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee'

// Far-future date: 2099-12-31 23:00 UTC. Will never appear in "ближайшие 4 недели"
// schedule view, and canStart window will never naturally activate.
const EVERGREEN_SCHEDULED_AT = '2099-12-31T23:00:00.000Z'

const EVERGREEN_TOPIC = 'Evergreen test lesson (admin only)'
const EVERGREEN_DURATION_MIN = 45
const EVERGREEN_TRAINER_PATH = 'sample-column-addition.json'

async function withClient<T>(fn: (client: Client) => Promise<T>): Promise<T> {
  const conn = process.env.DATABASE_URL_DIRECT
  if (!conn) throw new Error('DATABASE_URL_DIRECT is required (use direct, non-pooler URL)')
  const client = new Client({ connectionString: conn, ssl: { rejectUnauthorized: false } })
  await client.connect()
  try {
    return await fn(client)
  } finally {
    await client.end()
  }
}

async function main() {
  console.log(`[evergreen] Admin email: ${ADMIN_EMAIL}`)
  console.log(`[evergreen] Fixed lesson UUID: ${EVERGREEN_LESSON_ID}`)

  // 1. Look up admin user.id by email — must exist (seeded by scripts/seed.ts).
  const userId = await withClient(async (client) => {
    const r = await client.query(
      'SELECT id FROM "user" WHERE email = $1 LIMIT 1',
      [ADMIN_EMAIL],
    )
    if (!r.rows.length) {
      throw new Error(
        `Admin user "${ADMIN_EMAIL}" not found. Run "npm run db:seed" first.`,
      )
    }
    return (r.rows[0] as { id: string }).id
  })
  console.log(`[evergreen] Admin user.id = ${userId}`)

  // 2. Upsert evergreen lesson. Reset status to 'scheduled' on every run so
  //    the bookmark stays in a known initial state even if the previous test
  //    session left it as in_progress / completed.
  await withClient(async (client) => {
    await client.query(
      `INSERT INTO lesson
         (id, user_id, scheduled_at, topic, duration_min, html_trainer_path, status,
          actual_start_at, actual_end_at)
       VALUES ($1, $2, $3, $4, $5, $6, 'scheduled', NULL, NULL)
       ON CONFLICT (id) DO UPDATE
         SET user_id = EXCLUDED.user_id,
             scheduled_at = EXCLUDED.scheduled_at,
             topic = EXCLUDED.topic,
             duration_min = EXCLUDED.duration_min,
             html_trainer_path = EXCLUDED.html_trainer_path,
             status = 'scheduled',
             actual_start_at = NULL,
             actual_end_at = NULL`,
      [
        EVERGREEN_LESSON_ID,
        userId,
        EVERGREEN_SCHEDULED_AT,
        EVERGREEN_TOPIC,
        EVERGREEN_DURATION_MIN,
        EVERGREEN_TRAINER_PATH,
      ],
    )
  })

  console.log('')
  console.log('[evergreen] ✅ Done. Permanent test lesson is ready.')
  console.log('')
  console.log('  Production URL:')
  console.log(`    https://klassio-one.vercel.app/lesson/${EVERGREEN_LESSON_ID}?test=1`)
  console.log('')
  console.log('  Local URL:')
  console.log(`    http://localhost:3000/lesson/${EVERGREEN_LESSON_ID}?test=1`)
  console.log('')
  console.log('  Bookmark either of those — they always work (admin-only).')
}

main().catch((e) => {
  console.error('[evergreen] FAILED:', e)
  process.exit(1)
})
