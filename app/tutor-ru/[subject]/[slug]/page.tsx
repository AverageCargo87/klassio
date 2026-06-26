// /tutor-ru/[subject]/[slug] — AI-репетитор на RU-стеке (Sber), июнь 2026.
// КЛОН app/tutor/[subject]/[slug]/page.tsx — тот же auth → curriculum →
// tutor_session → dynamic variables; меняется только клиентский компонент:
// TutorLessonRu (голос через Sber-оркестратор вместо 11labs). Старый /tutor
// не тронут — это отдельная ссылка для сравнения стеков.
import { redirect, notFound } from 'next/navigation'
import { eq } from 'drizzle-orm'
import { db } from '@/lib/db'
import { users } from '@/lib/db/schema'
import { resolveLesson } from '@/lib/curriculum'
import { getOrStartSession, buildTutorDynamicVariables } from '@/lib/tutor'
import { getUserId } from '@/lib/tutor/http'
import { TutorLessonRu } from '@/components/tutor/tutor-lesson-ru'

export const dynamic = 'force-dynamic'

export default async function TutorLessonRuRoute({
  params,
}: {
  params: Promise<{ subject: string; slug: string }>
}) {
  const { subject, slug } = await params

  const userId = await getUserId()
  if (!userId) redirect('/login')

  const lesson = resolveLesson(subject, slug)
  if (!lesson) notFound()

  const start = await getOrStartSession({
    userId,
    subjectId: subject,
    lessonSlug: slug,
  })

  const [u] = await db
    .select({ childName: users.childName })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1)

  const dynamicVariables = buildTutorDynamicVariables({
    childName: u?.childName,
    lessonSlug: slug,
    lessonTitle: lesson.title,
    lessonTopic: lesson.subtitle,
    isFirstEver: start.isFirstEver,
    priorLessonsDone: start.priorLessonsDone,
    attemptNumber: start.attemptNumber,
  })

  return (
    <TutorLessonRu
      sessionId={start.sessionId}
      lessonTitle={lesson.title}
      lessonSubtitle={lesson.subtitle}
      dynamicVariables={dynamicVariables}
      canvas={lesson.canvas}
    />
  )
}
