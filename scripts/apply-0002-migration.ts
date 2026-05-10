#!/usr/bin/env tsx
// One-shot migration runner for Neon Free tier.
// Applies Phase 3 schema migration: actual_start_at + actual_end_at on lesson table.
// Uses pg (node-postgres) with DATABASE_URL_DIRECT to avoid postgres-js ECONNRESET.
// Safe to run multiple times — all DDL uses IF NOT EXISTS.
import { config } from 'dotenv'
import { resolve } from 'path'
import { Client } from 'pg'

config({ path: resolve(process.cwd(), '.env.local') })
config()

async function applyMigration() {
  const connectionString = process.env.DATABASE_URL_DIRECT
  if (!connectionString) {
    throw new Error('DATABASE_URL_DIRECT is required')
  }

  const client = new Client({
    connectionString,
    ssl: { rejectUnauthorized: false },
  })
  await client.connect()

  try {
    console.log('Applying migration 0002: actual_start_at + actual_end_at on lesson table...')

    const stmts = [
      'ALTER TABLE lesson ADD COLUMN IF NOT EXISTS actual_start_at timestamp',
      'ALTER TABLE lesson ADD COLUMN IF NOT EXISTS actual_end_at timestamp',
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
    const result = await client.query<{ column_name: string }>(
      `SELECT column_name FROM information_schema.columns
       WHERE table_name = 'lesson'
         AND column_name IN ('actual_start_at', 'actual_end_at')
       ORDER BY column_name`
    )
    const cols = result.rows.map((r) => r.column_name)
    console.log('[migration] Columns confirmed in DB:', cols.join(', '))

    if (!cols.includes('actual_start_at') || !cols.includes('actual_end_at')) {
      throw new Error('Migration verify failed — columns not found after ALTER')
    }

    console.log('[migration] Migration 0002 applied successfully.')
  } finally {
    await client.end()
  }
}

// Guard: only run when invoked directly (not imported)
const scriptPath = process.argv[1] ?? ''
if (scriptPath.endsWith('apply-0002-migration.ts') || scriptPath.endsWith('apply-0002-migration.js')) {
  applyMigration().catch((err) => {
    console.error('[migration] FAILED:', err instanceof Error ? err.message : String(err))
    process.exit(1)
  })
}
