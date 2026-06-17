// POST /api/tutor/homework/done — отметить домашку выполненной.
import { NextRequest } from 'next/server'
import { z } from 'zod'
import { getUserId, json } from '@/lib/tutor/http'
import { markHomeworkDone } from '@/lib/tutor'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const Body = z.object({ homeworkId: z.string().uuid() })

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
    const ok = await markHomeworkDone({ homeworkId: body.homeworkId, userId })
    if (!ok) return json({ error: 'Домашка не найдена' }, 404)
    return json({ ok: true })
  } catch (err) {
    console.error('[tutor/homework/done] failed:', err)
    return json({ error: 'Не удалось обновить домашку' }, 500)
  }
}
