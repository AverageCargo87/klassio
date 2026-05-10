// One-shot script to apply the 0001 migration (3 new lesson columns) using pg (not postgres-js)
// Run: npx tsx --env-file=.env.local scripts/apply-0001-migration.ts
import { config } from 'dotenv'
config({ path: '.env.local' })
config()

import { Client } from 'pg'

async function main() {
  const url = process.env.DATABASE_URL_DIRECT
  if (!url) {
    console.error('DATABASE_URL_DIRECT not set')
    process.exit(1)
  }

  const client = new Client({ connectionString: url })
  await client.connect()

  try {
    const stmts = [
      'ALTER TABLE lesson ADD COLUMN IF NOT EXISTS recording_url text',
      'ALTER TABLE lesson ADD COLUMN IF NOT EXISTS transcript_url text',
      'ALTER TABLE lesson ADD COLUMN IF NOT EXISTS html_trainer_path text',
    ]

    for (const stmt of stmts) {
      try {
        await client.query(stmt)
        console.log('[migration] OK:', stmt)
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e)
        console.log('[migration] SKIP:', msg.substring(0, 80))
      }
    }

    // Verify columns exist
    const r = await client.query(
      `SELECT column_name FROM information_schema.columns
       WHERE table_name = 'lesson'
       ORDER BY ordinal_position`
    )
    const cols = (r.rows as { column_name: string }[]).map(row => row.column_name)
    console.log('[migration] lesson columns:', cols.join(', '))

    const required = ['recording_url', 'transcript_url', 'html_trainer_path']
    const missing = required.filter(c => !cols.includes(c))
    if (missing.length > 0) {
      console.error('[migration] MISSING COLUMNS:', missing)
      process.exit(1)
    }
    console.log('[migration] All 3 Phase 2 columns present. Migration complete.')
  } finally {
    await client.end()
  }
}

main().catch(e => {
  console.error('[migration] FAILED:', e instanceof Error ? e.message : String(e))
  process.exit(1)
})
