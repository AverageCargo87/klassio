// POST /api/tutor/phase — transition the lesson state-machine phase
// (LESSON-FLOW §4). setPhase enforces ownership (returns false if the session
// isn't this user's) and logs a phase_change event.
import { NextRequest } from 'next/server'
import { z } from 'zod'
import { getUserId, json } from '@/lib/tutor/http'
import { setPhase } from '@/lib/tutor'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const Body = z.object({
  sessionId: z.string().uuid(),
  phase: z.enum([
    'connecting',
    'warmup',
    'diagnostic',
    'bridge',
    'cycle',
    'pause',
    'summary',
    'farewell',
  ]),
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

  try {
    const ok = await setPhase({ sessionId: body.sessionId, userId, phase: body.phase })
    if (!ok) return json({ error: 'Этот урок не ваш' }, 403)
    return json({ ok: true })
  } catch (err) {
    console.error('[tutor/phase] failed:', err)
    return json({ error: 'Не удалось обновить фазу' }, 500)
  }
}
