// Custom db:push script for Neon Free tier compatibility.
// drizzle-kit push has an introspection query (pg_namespace JOIN pg_user) that causes
// ECONNRESET on Neon Free tier connections. This script:
// 1. Runs `drizzle-kit generate` to produce the SQL migration file
// 2. Applies each SQL statement directly via postgres.js with individual connections
//    (handles Neon's post-DDL ECONNRESET behaviour where DDL succeeds but ack is dropped)
//
// Run via: npm run db:push
// Or:      npx tsx scripts/db-push.ts
import 'dotenv/config'
import { config } from 'dotenv'
import * as fs from 'fs'
import * as path from 'path'
import * as childProcess from 'child_process'
import postgres from 'postgres'

// Load .env.local (Next.js convention)
config({ path: '.env.local' })

const DATABASE_URL_DIRECT = process.env.DATABASE_URL_DIRECT

if (!DATABASE_URL_DIRECT) {
  console.error('[db:push] DATABASE_URL_DIRECT is not set. Set it in .env.local')
  process.exit(1)
}

// Safe assertion: process.exit(1) above ensures we never reach here with undefined
const DB_URL: string = DATABASE_URL_DIRECT as string

async function runStatement(url: string, stmt: string): Promise<{ ok: boolean; error?: string }> {
  const client = postgres(url, { max: 1, idle_timeout: 10, connect_timeout: 20 })
  try {
    await client.unsafe(stmt)
    return { ok: true }
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e)
    return { ok: false, error: msg }
  } finally {
    try { await client.end() } catch (_) { /* Neon may close connection after DDL */ }
  }
}

async function main() {
  console.log('[db:push] Step 1: Generating SQL migration from schema...')
  childProcess.execSync('npx drizzle-kit generate', { stdio: 'inherit' })

  // Find the most recent SQL file in drizzle/
  const drizzleDir = path.join(process.cwd(), 'drizzle')
  const sqlFiles = fs.readdirSync(drizzleDir)
    .filter(f => f.endsWith('.sql'))
    .sort()

  if (sqlFiles.length === 0) {
    console.log('[db:push] No SQL files to apply — schema already up to date.')
    return
  }

  // Apply each SQL file in order
  for (const sqlFile of sqlFiles) {
    const sqlPath = path.join(drizzleDir, sqlFile)
    console.log('[db:push] Step 2: Applying', sqlFile, '...')

    const sqlContent = fs.readFileSync(sqlPath, 'utf8')
    const statements = sqlContent
      .split('--> statement-breakpoint')
      .map(s => s.trim())
      .filter(Boolean)

    console.log('[db:push] Applying', statements.length, 'statements...')

    for (let i = 0; i < statements.length; i++) {
      const stmt = statements[i]
      process.stdout.write(`  [${i + 1}/${statements.length}] ${stmt.substring(0, 60).replace(/\n/g, ' ')}...`)

      const result = await runStatement(DB_URL, stmt)

      if (result.ok) {
        console.log(' OK')
      } else if (
        result.error?.includes('already exists') ||
        result.error?.includes('duplicate') ||
        result.error?.includes('ECONNRESET') // Neon: DDL succeeded, connection closed after ack
      ) {
        console.log(` SKIP (${result.error?.substring(0, 50)})`)
      } else {
        console.log(` FAILED: ${result.error}`)
        throw new Error(`Schema apply failed on statement ${i + 1}: ${result.error}`)
      }
    }
  }

  // Verify
  console.log('[db:push] Step 3: Verifying tables...')
  const verifyClient = postgres(DB_URL, { prepare: false, max: 1 })
  try {
    const tables = await verifyClient`
      SELECT table_name FROM information_schema.tables
      WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
      ORDER BY table_name
    `
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const tableNames = (tables as any[]).map((t: { table_name: string }) => t.table_name as string)
    console.log('[db:push] Tables in DB:', tableNames.join(', '))

    const expected = ['account', 'allowed_email', 'lesson', 'session', 'user', 'verificationToken']
    const missing = expected.filter(e => !tableNames.includes(e))
    if (missing.length > 0) {
      console.error('[db:push] MISSING TABLES:', missing)
      process.exit(1)
    }
    console.log('[db:push] All 6 tables verified. Schema push complete.')
  } finally {
    await verifyClient.end()
  }
}

main().catch(e => {
  console.error('[db:push] FAILED:', e.message)
  process.exit(1)
})
