// Source: RESEARCH § Pattern 2 (whitelist callback) — extracted from auth.ts inline callback
// for testability. The signIn callback in auth.ts wraps this helper.
// T-01-01 mitigation: always issues a single indexed DB query regardless of result (constant shape).
// T-01-05 mitigation: lowercases + trims email before query — case normalization prevents enumeration by case variation.
import { eq } from 'drizzle-orm'
import { db, schema } from '@/lib/db'

export async function isEmailWhitelisted(email: string | undefined | null): Promise<boolean> {
  if (!email) return false
  const normalized = email.trim().toLowerCase()
  if (!normalized) return false
  const rows = await db
    .select({ id: schema.allowedEmails.id })
    .from(schema.allowedEmails)
    .where(eq(schema.allowedEmails.email, normalized))
    .limit(1)
  return rows.length > 0
}
