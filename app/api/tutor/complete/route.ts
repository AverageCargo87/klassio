// POST /api/tutor/complete — mark the lesson finished. Server computes duration
// and logs session_completed. Ownership enforced by completeSession.
import { NextRequest } from 'next/server'
import { z } from 'zod'
import { getUserId, json } from '@/lib/tutor/http'
import { completeSession, generateLessonSummary } from '@/lib/tutor'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// Client flushes the transcript BEFORE calling complete, so the AI summary has
// something to read. The summary call adds a few seconds — we await it (the
// client fires complete-and-forget, so this latency is invisible to the UI) so
// the serverless function isn't killed mid-generation. Summary failure never
// blocks completion: the lesson is already marked done.
const Body = z.object({ sessionId: z.string().uuid() })

export async function POST(req: NextRequest) {
  const userId = await getUserId()
  if (!userId) return json({ error: 'Войдите в систему' }, 401)

  let body: z.infer<typeof Body>
  try {
    body = Body.parse(await req.json())
  } catch {
    return json({ error: 'Неверный формат запроса' }, 400)
  }

  try {
    const ok = await completeSession({ sessionId: body.sessionId, userId })
    if (!ok) return json({ error: 'Этот урок не ваш' }, 403)
    const summary = await generateLessonSummary(body.sessionId, userId).catch(() => null)
    return json({ ok: true, summary: summary ?? null })
  } catch (err) {
    console.error('[tutor/complete] failed:', err)
    return json({ error: 'Не удалось завершить урок' }, 500)
  }
}
