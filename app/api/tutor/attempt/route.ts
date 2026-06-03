// POST /api/tutor/attempt — record one graded answer (LESSON-FLOW §7 Трекинг).
// Ownership-checked via getSession; subjectId is derived server-side from the
// session (not trusted from the client) so skill_mastery rows are attributed
// correctly.
import { NextRequest } from 'next/server'
import { z } from 'zod'
import { getUserId, json } from '@/lib/tutor/http'
import { getSession, recordAttempt } from '@/lib/tutor'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const Body = z.object({
  sessionId: z.string().uuid(),
  taskId: z.string().min(1).max(64),
  correct: z.boolean(),
  skillTag: z.string().min(1).max(64).optional(),
  reactionMs: z.number().int().nonnegative().max(600_000).optional(),
  hintsUsed: z.number().int().nonnegative().max(20).optional(),
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
    await recordAttempt({
      sessionId: body.sessionId,
      userId,
      subjectId: session.subjectId,
      taskId: body.taskId,
      correct: body.correct,
      skillTag: body.skillTag ?? null,
      reactionMs: body.reactionMs ?? null,
      hintsUsed: body.hintsUsed ?? 0,
    })
    return json({ ok: true })
  } catch (err) {
    console.error('[tutor/attempt] failed:', err)
    return json({ error: 'Не удалось сохранить ответ' }, 500)
  }
}
