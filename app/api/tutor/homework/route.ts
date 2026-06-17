// /api/tutor/homework — выдать (POST) и получить список (GET) домашек.
// POST зовётся в конце урока (Аня сформировала домашку); GET — личный кабинет.
import { NextRequest } from 'next/server'
import { z } from 'zod'
import { getUserId, json } from '@/lib/tutor/http'
import { createHomework, listHomework } from '@/lib/tutor'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const ItemSchema = z.object({
  q: z.string().min(1).max(500),
  answer: z.string().max(500).optional(),
  options: z.array(z.object({ t: z.string().max(300), correct: z.boolean().optional() })).max(8).optional(),
  skill: z.string().max(80).optional(),
})

const Body = z.object({
  sessionId: z.string().uuid().optional(),
  subjectId: z.string().min(1).max(80),
  lessonSlug: z.string().min(1).max(120),
  title: z.string().min(1).max(200),
  items: z.array(ItemSchema).min(1).max(20),
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
    const id = await createHomework({
      userId,
      sessionId: body.sessionId ?? null,
      subjectId: body.subjectId,
      lessonSlug: body.lessonSlug,
      title: body.title,
      items: body.items,
    })
    return json({ ok: true, id })
  } catch (err) {
    console.error('[tutor/homework] create failed:', err)
    return json({ error: 'Не удалось сохранить домашку' }, 500)
  }
}

export async function GET() {
  const userId = await getUserId()
  if (!userId) return json({ error: 'Войдите в систему' }, 401)
  try {
    const homework = await listHomework(userId)
    return json({ homework })
  } catch (err) {
    console.error('[tutor/homework] list failed:', err)
    return json({ error: 'Не удалось загрузить домашку' }, 500)
  }
}
