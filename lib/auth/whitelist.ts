// Source: RESEARCH § Pattern 2 (whitelist callback) — extracted from auth.ts inline callback
// for testability. The signIn callback in auth.ts wraps this helper.
// T-01-01 mitigation: always issues a single indexed DB query regardless of result (constant shape).
// T-01-05 mitigation: lowercases + trims email before query — case normalization prevents enumeration by case variation.
//
// Connection strategy: uses the shared Drizzle db instance (drizzle-orm/node-postgres + pg Pool
// with DATABASE_URL_DIRECT). This shares the pool with the DrizzleAdapter used in auth.ts,
// avoiding the "Connection terminated unexpectedly" that occurred when isEmailWhitelisted opened
// a separate pg.Client connection during the auth callback sequence (Plan 06 debugging).
// All queries in the auth callback flow use the same pg Pool, keeping the connection alive.
import { eq } from 'drizzle-orm'
import { db, schema } from '@/lib/db'

export async function isEmailWhitelisted(email: string | undefined | null): Promise<boolean> {
  if (!email) return false
  const normalized = email.trim().toLowerCase()
  if (!normalized) return false
  // T-01-01: single constant-shape query regardless of result (no early-exit branching).
  const rows = await db
    .select({ id: schema.allowedEmails.id })
    .from(schema.allowedEmails)
    .where(eq(schema.allowedEmails.email, normalized))
    .limit(1)
  return rows.length > 0
}
