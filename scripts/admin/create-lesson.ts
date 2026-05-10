// Admin CLI: Create a new lesson for an existing user.
// Usage: npm run admin:create-lesson -- --email kid@example.ru --topic "Дроби" --date 2026-06-15 --time 16:00
//
// Note: create-lesson always inserts a new row (no natural unique key per plan spec).
// Running twice creates 2 lessons — this is intentional for scheduling flexibility.
//
// Uses node-postgres (pg) NOT postgres-js — avoids ECONNRESET on Neon Free tier (D-09).

import { config } from 'dotenv'
config({ path: '.env.local' })
config()

import { Client } from 'pg'

// Inline parseArgs (same implementation as create-user.ts — keeps each script self-contained)
function parseArgs(argv: string[]): Record<string, string | true> {
  const out: Record<string, string | true> = {}
  for (let i = 0; i < argv.length; i++) {
    if (argv[i].startsWith('--')) {
      const key = argv[i].slice(2)
      if (i + 1 < argv.length && !argv[i + 1].startsWith('--')) {
        out[key] = argv[i + 1]
        i++
      } else {
        out[key] = true
      }
    }
  }
  return out
}

async function withClient<T>(fn: (client: Client) => Promise<T>): Promise<T> {
  const connectionString = process.env.DATABASE_URL_DIRECT
  if (!connectionString) {
    console.error('✗ DATABASE_URL_DIRECT is not set. Add it to .env.local')
    process.exit(1)
  }
  const client = new Client({ connectionString })
  await client.connect()
  try {
    return await fn(client)
  } finally {
    await client.end()
  }
}

// Validate --date is YYYY-MM-DD format (T-02-04 mitigation)
function validateDateFormat(date: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(date)
}

// Validate --time is HH:mm format
function validateTimeFormat(time: string): boolean {
  return /^\d{2}:\d{2}$/.test(time)
}

async function main() {
  const args = parseArgs(process.argv.slice(2))

  const email = typeof args['email'] === 'string' ? args['email'].toLowerCase().trim() : null
  const topic = typeof args['topic'] === 'string' ? args['topic'] : 'Тестовый урок'
  const date = typeof args['date'] === 'string' ? args['date'] : null
  const time = typeof args['time'] === 'string' ? args['time'] : '10:00'
  const duration = typeof args['duration'] === 'string' ? parseInt(args['duration'], 10) : 45
  const trainer = typeof args['trainer'] === 'string' ? args['trainer'] : null
  const status = typeof args['status'] === 'string' ? args['status'] : 'scheduled'

  // Validation
  if (!email) {
    console.error('✗ Missing required argument: --email')
    console.error('')
    console.error('Usage: npm run admin:create-lesson -- --email <email> --date <YYYY-MM-DD> [options]')
    console.error('Options:')
    console.error('  --topic <text>     Lesson topic (default: "Тестовый урок")')
    console.error('  --date <YYYY-MM-DD> Scheduled date (required)')
    console.error('  --time <HH:mm>     Scheduled time (default: 10:00)')
    console.error('  --duration <min>   Duration in minutes (default: 45)')
    console.error('  --trainer <path>   HTML trainer path (optional)')
    console.error('  --status <value>   Status: scheduled|in_progress|completed|cancelled (default: scheduled)')
    process.exit(1)
  }

  if (!date) {
    console.error('✗ Missing required argument: --date (format: YYYY-MM-DD)')
    process.exit(1)
  }

  // T-02-04: Validate date format before using in timestamp (prevent invalid timestamps)
  if (!validateDateFormat(date)) {
    console.error(`✗ Invalid --date format: "${date}". Expected YYYY-MM-DD (e.g. 2026-06-15)`)
    process.exit(1)
  }

  if (!validateTimeFormat(time)) {
    console.error(`✗ Invalid --time format: "${time}". Expected HH:mm (e.g. 16:00)`)
    process.exit(1)
  }

  if (isNaN(duration) || duration < 1 || duration > 480) {
    console.error(`✗ Invalid --duration "${args['duration']}". Must be a number between 1 and 480 minutes.`)
    process.exit(1)
  }

  const validStatuses = ['scheduled', 'in_progress', 'completed', 'cancelled']
  if (!validStatuses.includes(status)) {
    console.error(`✗ Invalid --status "${status}". Must be one of: ${validStatuses.join(', ')}`)
    process.exit(1)
  }

  // Parse scheduled timestamp (local time)
  const scheduledAt = new Date(`${date}T${time}:00`)
  if (isNaN(scheduledAt.getTime())) {
    console.error(`✗ Cannot parse scheduled time from --date "${date}" and --time "${time}"`)
    process.exit(1)
  }

  // Step 1: Resolve user ID from email
  const userRow = await withClient(async (client) => {
    const r = await client.query(
      'SELECT id FROM "user" WHERE email = $1',
      [email]
    )
    return r.rows[0] as { id: string } | undefined
  })

  if (!userRow) {
    console.error(`✗ User not found for email: ${email}`)
    console.error(`  Hint: Run 'npm run admin:create-user -- --email ${email}' first.`)
    process.exit(1)
  }

  const userId = userRow.id

  // Step 2: Insert lesson
  const lessonRow = await withClient(async (client) => {
    const r = await client.query(
      `INSERT INTO lesson (id, user_id, scheduled_at, topic, duration_min, html_trainer_path, status)
       VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6)
       RETURNING id`,
      [userId, scheduledAt.toISOString(), topic, duration, trainer, status]
    )
    return r.rows[0] as { id: string }
  })

  // Format scheduled time for output (RU locale)
  const formattedDate = scheduledAt.toLocaleString('ru-RU', {
    weekday: 'short',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })

  console.log(`✓ Lesson created (id: ${lessonRow.id})`)
  console.log(`  Topic: ${topic}`)
  console.log(`  Scheduled: ${formattedDate} (local time)`)
  console.log(`  User: ${email}`)
  if (trainer) {
    console.log(`  Trainer: ${trainer}`)
  }
  console.log(`  Note: re-running this command creates a NEW lesson (by design).`)
}

if (process.argv[1]?.endsWith('create-lesson.ts') || process.argv[1]?.endsWith('create-lesson')) {
  main().catch((e) => {
    console.error('✗ FAILED:', e instanceof Error ? e.message : String(e))
    process.exit(1)
  })
}
