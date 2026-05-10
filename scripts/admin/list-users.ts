// Admin CLI: List all users in a table format.
// Usage: npm run admin:list-users
//
// Shows: ID (first 8 chars), Email, Child Name, Child Age, Created At, Last Login
// Uses node-postgres (pg) for reliable Neon Free tier connection.

import { config } from 'dotenv'
config({ path: '.env.local' })
config()

import { Client } from 'pg'

interface UserRow {
  id: string
  email: string | null
  child_name: string | null
  child_age: number | null
  created_at: Date | null
  last_login_at: Date | null
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

// Simple column formatter for aligned table output
function padEnd(str: string, len: number): string {
  return str.length >= len ? str.substring(0, len) : str + ' '.repeat(len - str.length)
}

function formatDate(d: Date | null): string {
  if (!d) return '-'
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
    const r = await client.query<UserRow>(
      `SELECT u.id, u.email, u.child_name, u.child_age, u.created_at, u.last_login_at
       FROM "user" u
       ORDER BY u.created_at DESC`
    )
    return r.rows
  })

  if (rows.length === 0) {
    console.log('No users found. Run: npm run admin:create-user -- --email <email>')
    return
  }

  // Table header
  const COL = { id: 10, email: 32, child: 20, age: 5, created: 18, lastLogin: 18 }
  const header =
    padEnd('ID', COL.id) + ' | ' +
    padEnd('Email', COL.email) + ' | ' +
    padEnd('Child', COL.child) + ' | ' +
    padEnd('Age', COL.age) + ' | ' +
    padEnd('Created', COL.created) + ' | ' +
    padEnd('Last Login', COL.lastLogin)

  const separator = '-'.repeat(header.length)

  console.log(`\nUsers (${rows.length} total)`)
  console.log(separator)
  console.log(header)
  console.log(separator)

  for (const row of rows) {
    const line =
      padEnd(row.id.substring(0, COL.id), COL.id) + ' | ' +
      padEnd(row.email ?? '-', COL.email) + ' | ' +
      padEnd(row.child_name ?? '-', COL.child) + ' | ' +
      padEnd(String(row.child_age ?? '-'), COL.age) + ' | ' +
      padEnd(formatDate(row.created_at), COL.created) + ' | ' +
      padEnd(formatDate(row.last_login_at), COL.lastLogin)
    console.log(line)
  }
  console.log(separator)
}

if (process.argv[1]?.endsWith('list-users.ts') || process.argv[1]?.endsWith('list-users')) {
  main().catch((e) => {
    console.error('✗ FAILED:', e instanceof Error ? e.message : String(e))
    process.exit(1)
  })
}
