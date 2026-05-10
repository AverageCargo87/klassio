// Admin CLI: Create or update a user + whitelist their email.
// Usage: npm run admin:create-user -- --email kid@example.ru --child-name "Маша" --child-age 10
//
// Idempotent: running twice with the same email updates child_name/child_age (no duplicate).
// Whitelisting is also idempotent (ON CONFLICT DO NOTHING on allowed_email.email).
//
// Uses node-postgres (pg) NOT postgres-js — avoids ECONNRESET on Neon Free tier (D-09).
// Loads DATABASE_URL_DIRECT (direct non-pooler connection) from .env.local.

import { config } from 'dotenv'
// Load .env.local first (Next.js convention), then .env fallback
config({ path: '.env.local' })
config()

import { Client } from 'pg'

// ─── Shared argument parser (D-10: native process.argv, no yargs/commander) ─────
// Exported for unit testing in scripts/admin/__tests__/parse-args.test.ts.

export function parseArgs(argv: string[]): Record<string, string | true> {
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

// ─── DB helper (matches scripts/seed.ts pattern) ─────────────────────────────

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

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const args = parseArgs(process.argv.slice(2))

  const email = typeof args['email'] === 'string' ? args['email'].toLowerCase().trim() : null
  const childName = typeof args['child-name'] === 'string' ? args['child-name'] : 'Ребёнок'
  const childAge = typeof args['child-age'] === 'string' ? parseInt(args['child-age'], 10) : 10

  if (!email) {
    console.error('✗ Missing required argument: --email')
    console.error('')
    console.error('Usage: npm run admin:create-user -- --email <email> [--child-name <name>] [--child-age <age>]')
    console.error('Example: npm run admin:create-user -- --email kid@example.ru --child-name "Маша" --child-age 10')
    process.exit(1)
  }

  if (isNaN(childAge) || childAge < 1 || childAge > 99) {
    console.error(`✗ Invalid --child-age "${args['child-age']}". Must be a number between 1 and 99.`)
    process.exit(1)
  }

  // Step 1: Whitelist the email (D-08: admin CLI auto-whitelists)
  await withClient(async (client) => {
    await client.query(
      'INSERT INTO allowed_email (email, notes) VALUES ($1, $2) ON CONFLICT (email) DO NOTHING',
      [email, 'admin:create-user CLI']
    )
  })
  console.log(`✓ Whitelisted email ${email}`)

  // Step 2: Upsert the user row
  const userResult = await withClient(async (client) => {
    const r = await client.query(
      `INSERT INTO "user" (id, email, child_name, child_age)
       VALUES (gen_random_uuid()::text, $1, $2, $3)
       ON CONFLICT (email) DO UPDATE
         SET child_name = EXCLUDED.child_name,
             child_age  = EXCLUDED.child_age
       RETURNING id`,
      [email, childName, childAge]
    )
    return r.rows[0] as { id: string }
  })

  console.log(`✓ Created/updated user (email: ${email}, child: ${childName}, age: ${childAge})`)
  console.log(`  User ID: ${userResult.id}`)
  console.log(`✓ Magic link: visit /login and enter this email to receive a login link`)
}

// ESM-compatible entrypoint guard (matches scripts/seed.ts pattern)
if (process.argv[1]?.endsWith('create-user.ts') || process.argv[1]?.endsWith('create-user')) {
  main().catch((e) => {
    console.error('✗ FAILED:', e instanceof Error ? e.message : String(e))
    process.exit(1)
  })
}
