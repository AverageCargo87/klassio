// Tiny shared helpers for the /api/tutor route handlers. Server-only.
import { auth } from '@/auth'

/** JSON Response with the given status (mirrors app/api/voice/signed-url style). */
export function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

/** Authenticated user id, or null when not signed in. */
export async function getUserId(): Promise<string | null> {
  const session = await auth()
  if (session?.user?.id) return session.user.id
  // Preview convenience (operator: «надоело логиниться по почте»): when
  // KLASSIO_DEV_USER_ID is set, skip the magic-link login and act as that user.
  // ONLY set this on the Vercel-SSO-protected preview — NEVER on production.
  const devUser = process.env.KLASSIO_DEV_USER_ID
  if (devUser) return devUser
  return null
}
