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
  return session?.user?.id ?? null
}
