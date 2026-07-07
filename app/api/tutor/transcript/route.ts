// POST /api/tutor/transcript — дописать БАТЧ реплик в запись урока.
// Клиент копит реплики и флашит пачками (периодически + на завершении/уходе),
// чтобы не делать запрос на каждую реплику. Ownership — через appendTranscript.
import { NextRequest } from 'next/server'
import { z } from 'zod'
import { getUserId, json } from '@/lib/tutor/http'
import { appendTranscript } from '@/lib/tutor'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const Body = z.object({
  sessionId: z.string().uuid(),
  lines: z
    .array(
      z.object({
        role: z.enum(['agent', 'child']),
        text: z.string().min(1).max(4000),
        seq: z.number().int().nonnegative(),
        // Событие ленты урока (доска/ошибка/верно/награда/имя). Отсутствует у реплик.
        kind: z.enum(['tool', 'wrong', 'solve', 'reward', 'name']).optional(),
        // Кап на размер: meta — служебные крохи (board/taskId), а не свалка.
        meta: z
          .record(z.string(), z.unknown())
          .optional()
          .refine((m) => m === undefined || JSON.stringify(m).length <= 2048, 'meta слишком большой'),
      }),
    )
    .min(1)
    .max(200),
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
    const written = await appendTranscript({ sessionId: body.sessionId, userId, lines: body.lines })
    if (written < 0) return json({ error: 'Этот урок не ваш' }, 403)
    return json({ ok: true, written })
  } catch (err) {
    console.error('[tutor/transcript] failed:', err)
    return json({ error: 'Не удалось сохранить запись' }, 500)
  }
}
