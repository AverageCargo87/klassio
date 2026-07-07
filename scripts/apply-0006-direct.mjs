// Применяет миграцию 0006 (kind/meta в lesson_transcript) напрямую через pg,
// идемпотентно (IF NOT EXISTS). Схему здесь исторически вели через db:push, а не
// drizzle-kit migrate, поэтому journal-путь ненадёжен — применяем ALTER напрямую.
import { config } from 'dotenv'
config({ path: '.env.local' })
config()

import pg from 'pg'

const url = process.env.DATABASE_URL_DIRECT
if (!url) { console.error('need DATABASE_URL_DIRECT'); process.exit(1) }
const client = new pg.Client({ connectionString: url })
await client.connect()
try {
  await client.query(`ALTER TABLE "lesson_transcript" ADD COLUMN IF NOT EXISTS "kind" text`)
  await client.query(`ALTER TABLE "lesson_transcript" ADD COLUMN IF NOT EXISTS "meta" jsonb`)
  const r = await client.query(
    `SELECT column_name FROM information_schema.columns WHERE table_name='lesson_transcript' ORDER BY ordinal_position`,
  )
  console.log('[0006] columns:', r.rows.map((x) => x.column_name).join(', '))
} finally {
  await client.end()
}
