// POST /api/tutor/event — append a progress-firehose event (tool use, fatigue,
// pause, reward, diagnostic). The event types here are the CLIENT-safe subset:
// session_started/completed, phase_change, task_*, and moderation_* are NOT
// accepted (they have dedicated, server-authoritative routes) so a client can't
// forge a "behaviour was clean" or "lesson completed" record.
import { NextRequest } from 'next/server'
import { z } from 'zod'
import { getUserId, json } from '@/lib/tutor/http'
import { getSession, recordEvent } from '@/lib/tutor'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const CLIENT_EVENT_TYPES = [
  'tool_used',
  'hint_shown',
  'fatigue_signal',
  'pause_started',
  'pause_ended',
  'reward_given',
  'diagnostic_result',
] as const

const Body = z.object({
  sessionId: z.string().uuid(),
  eventType: z.enum(CLIENT_EVENT_TYPES),
  payload: z.record(z.string(), z.unknown()).optional(),
})

export async function POST(req: NextRequest) {
  const userId = await getUserId()
  if (!userId) return json({ error: 'Войдите в систему' }, 401)

  let body: z.infer<typeof Body>
  try {
    body = Body.parse(await req.json())
  } catch {
    return json({ error: 'Неверный формат запроса' }, 400)
  }

  const session = await getSession(body.sessionId, userId)
  if (!session) return json({ error: 'Этот урок не ваш' }, 403)

  try {
    await recordEvent({
      sessionId: body.sessionId,
      userId,
      eventType: body.eventType,
      payload: body.payload ?? null,
    })
    return json({ ok: true })
  } catch (err) {
    console.error('[tutor/event] failed:', err)
    return json({ error: 'Не удалось сохранить событие' }, 500)
  }
}
