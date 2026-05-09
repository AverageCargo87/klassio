// Source: RESEARCH § Code Example 3 + Pitfall 3 (DATABASE_URL_DIRECT, NOT pooler).
// drizzle-kit migrations create/alter schema — long-running, requires prepared statements.
// Neon/PgBouncer transaction pooler does NOT support this; must use direct connection.
import 'dotenv/config'
import { defineConfig } from 'drizzle-kit'

export default defineConfig({
  out: './drizzle',
  schema: './lib/db/schema.ts',
  dialect: 'postgresql',
  dbCredentials: {
    // DATABASE_URL_DIRECT: Neon non-pooler endpoint — required for drizzle-kit push/migrate.
    // Pooler URL (DATABASE_URL) must NOT be used here: migrations use prepared statements
    // that PgBouncer transaction mode drops between transactions (Pitfall 3).
    url: process.env.DATABASE_URL_DIRECT!,
  },
  verbose: true,
  strict: true,
})
