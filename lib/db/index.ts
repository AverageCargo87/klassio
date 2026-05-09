// Source: RESEARCH § Code Example 1 + Pitfall 2 (prepare:false for Neon/PgBouncer transaction pooler).
// Used by Server Components and route handlers (Plans 04, 05). NOT used by drizzle-kit (uses DATABASE_URL_DIRECT).
import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import * as schema from './schema'
import { env } from '@/lib/env'

// Pitfall 2: Neon/PgBouncer transaction pooler reuses connections per-transaction;
// prepared statements do NOT survive across transactions. prepare:false is REQUIRED.
const client = postgres(env.DATABASE_URL, { prepare: false })

export const db = drizzle({ client, schema })
export { schema }
