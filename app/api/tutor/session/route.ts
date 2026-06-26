// POST /api/tutor/session — start (or resume) a tutor lesson.
// Returns the sessionId + the «первый урок vs продолжаем» signals and the
// 11labs dynamic variables the client passes to conversation.startSession.
//
// Auth FIRST (T-06-01-03 analog), then validate the lesson exists in the static
// curriculum, then getOrStartSession (ownership is implicit — userId from auth).
import { NextRequest } from 'next/server'
import { z } from 'zod'
import { eq } from 'drizzle-orm'
import { getUserId, json } from '@/lib/tutor/http'
import { getOrStartSession, buildTutorDynamicVariables } from '@/lib/tutor'
import { resolveLesson } from '@/lib/curriculum'
import { db } from '@/lib/db'
import { users } from '@/lib/db/schema'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const Body = z.object({
  subjectId: z.string().min(1).max(64),
  lessonSlug: z.string().min(1).max(64),
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

  const lesson = resolveLesson(body.subjectId, body.lessonSlug)
  if (!lesson) return json({ error: 'Урок не найден' }, 404)

  try {
    const start = await getOrStartSession({
      userId,
      subjectId: body.subjectId,
      lessonSlug: body.lessonSlug,
    })

    const [u] = await db
      .select({ childName: users.childName })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1)

    const dynamicVariables = buildTutorDynamicVariables({
      childName: u?.childName,
      lessonSlug: body.lessonSlug,
      lessonTitle: lesson.title,
      lessonTopic: lesson.subtitle,
      isFirstEver: start.isFirstEver,
      priorLessonsDone: start.priorLessonsDone,
      attemptNumber: start.attemptNumber,
    })

    return json({
      sessionId: start.sessionId,
      attemptNumber: start.attemptNumber,
      isFirstEver: start.isFirstEver,
      priorLessonsDone: start.priorLessonsDone,
      resumed: start.resumed,
      dynamicVariables,
    })
  } catch (err) {
    console.error('[tutor/session] failed:', err)
    return json({ error: 'Не удалось начать урок' }, 500)
  }
}
