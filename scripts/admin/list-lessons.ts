// Admin CLI: List all lessons with user email, topic, scheduled time, status.
// Usage: npm run admin:list-lessons
//
// Shows: ID (first 8 chars), Email, Topic, Scheduled At, Duration, Status
// Uses node-postgres (pg) for reliable Neon Free tier connection.

import { config } from 'dotenv'
config({ path: '.env.local' })
config()

import { Client } from 'pg'

interface LessonRow {
  id: string
  email: string | null
  topic: string
  scheduled_at: Date
  duration_min: number
  status: string
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

function padEnd(str: string, len: number): string {
  return str.length >= len ? str.substring(0, len) : str + ' '.repeat(len - str.length)
}

function formatDate(d: Date): string {
  return d.toLocaleString('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

async function main() {
  const rows = await withClient(async (client) => {
    const r = await client.query<LessonRow>(
      `SELECT l.id, u.email, l.topic, l.scheduled_at, l.duration_min, l.status
       FROM lesson l
       JOIN "user" u ON u.id = l.user_id
       ORDER BY l.scheduled_at DESC`
    )
    return r.rows
  })

  if (rows.length === 0) {
    console.log('No lessons found. Run: npm run admin:create-lesson -- --email <email> --date <YYYY-MM-DD>')
    return
  }

  // Table header
  const COL = { id: 10, email: 32, topic: 24, scheduled: 18, duration: 10, status: 12 }
  const header =
    padEnd('ID', COL.id) + ' | ' +
    padEnd('Email', COL.email) + ' | ' +
    padEnd('Topic', COL.topic) + ' | ' +
    padEnd('Scheduled', COL.scheduled) + ' | ' +
    padEnd('Duration', COL.duration) + ' | ' +
    padEnd('Status', COL.status)

  const separator = '-'.repeat(header.length)

  console.log(`\nLessons (${rows.length} total)`)
  console.log(separator)
  console.log(header)
  console.log(separator)

  for (const row of rows) {
    const line =
      padEnd(row.id.substring(0, COL.id), COL.id) + ' | ' +
      padEnd(row.email ?? '-', COL.email) + ' | ' +
      padEnd(row.topic, COL.topic) + ' | ' +
      padEnd(formatDate(row.scheduled_at), COL.scheduled) + ' | ' +
      padEnd(`${row.duration_min} мин`, COL.duration) + ' | ' +
      padEnd(row.status, COL.status)
    console.log(line)
  }
  console.log(separator)
}

if (process.argv[1]?.endsWith('list-lessons.ts') || process.argv[1]?.endsWith('list-lessons')) {
  main().catch((e) => {
    console.error('✗ FAILED:', e instanceof Error ? e.message : String(e))
    process.exit(1)
  })
}
