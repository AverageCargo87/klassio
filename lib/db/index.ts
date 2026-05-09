// DB client using drizzle-orm/neon-http + @neondatabase/serverless neon() HTTP function.
//
// Connection strategy (resolved after Plan 06 E2E testing):
//
// Full diagnosis history:
// - postgres-js: ECONNRESET with Neon direct URL. Uses Extended Query Protocol.
// - @neondatabase/serverless Pool (WebSocket mode) + drizzle-orm/neon-serverless:
//   NeonPreparedQuery.queryWithCache failed for isEmailWhitelisted. The neon-serverless
//   Pool uses WebSockets; each query goes through the same WebSocket connection.
//   The failure was in the PgPreparedQuery.queryWithCache error-wrapping layer.
//   Root cause: the underlying WebSocket/HTTP error was wrapped and lost.
// - pg Pool with DATABASE_URL_DIRECT: works individually but fails during auth callback
//   sequence with "Connection terminated unexpectedly" — Neon Free tier terminates idle
//   TCP connections between consecutive auth adapter operations.
//
// FINAL RESOLUTION: neon() HTTP function + drizzle-orm/neon-http.
// - Each query is a fresh HTTP request to Neon's serverless HTTP endpoint.
// - No persistent TCP connection → no "Connection terminated unexpectedly" on cold start.
// - No WebSocket → simpler, more reliable in Next.js RSC / route handler contexts.
// - Works with @auth/drizzle-adapter: is(db, PgDatabase) uses entityKind symbol → true.
// - Edge-runtime compatible (HTTP, no native Node.js modules).
//
// Uses DATABASE_URL (the pooler URL) as recommended by Neon for HTTP mode.
// The pooler URL is used by neon() internally; HTTP bypasses PgBouncer's named-statement
// restrictions (HTTP mode uses simple wire protocol under the hood).
//
// Used by Server Components, route handlers, and DrizzleAdapter in auth.ts (Plans 04, 05, 06).
// NOT used by drizzle-kit (which uses DATABASE_URL_DIRECT via direct TCP for migrations).
import { drizzle } from 'drizzle-orm/neon-http'
import { neon } from '@neondatabase/serverless'
import * as schema from './schema'
import { env } from '@/lib/env'

// neon() HTTP client — makes one HTTP request per query, stateless.
// Uses DATABASE_URL (Neon pooler URL) as recommended by Neon for the HTTP endpoint.
const sql = neon(env.DATABASE_URL)

export const db = drizzle({ client: sql, schema })
export { schema }
