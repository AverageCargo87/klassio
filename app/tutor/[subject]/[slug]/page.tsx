// /tutor/[subject]/[slug] — AI-репетитор lesson entry (June 2026 pivot).
// Server Component: auth → resolve the static curriculum lesson → start/resume
// a tutor_session → build the 11labs dynamic variables → hand off to the client
// TutorLesson. Old routes (/lesson, /lesson-v2, /lessons) are untouched.
//
// NOTE: this page is a FUNCTIONAL integration harness for the tutor backend
// (voice + tools + moderation + tracking). The rich Claude-Design visual port
// (.tmp/sketches/tutor/anya-tutor-clean.html) layers on top of this wiring.
import { redirect, notFound } from 'next/navigation'
import { eq } from 'drizzle-orm'
import { db } from '@/lib/db'
import { users } from '@/lib/db/schema'
import { resolveLesson } from '@/lib/curriculum'
import { getOrStartSession, buildTutorDynamicVariables } from '@/lib/tutor'
import { getUserId } from '@/lib/tutor/http'
import { TutorLesson } from '@/components/tutor/tutor-lesson'

export const dynamic = 'force-dynamic'

export default async function TutorLessonRoute({
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
    lessonTitle: lesson.title,
    lessonTopic: lesson.subtitle,
    isFirstEver: start.isFirstEver,
    priorLessonsDone: start.priorLessonsDone,
    attemptNumber: start.attemptNumber,
  })

  return (
    <TutorLesson
      sessionId={start.sessionId}
      lessonTitle={lesson.title}
      lessonSubtitle={lesson.subtitle}
      dynamicVariables={dynamicVariables}
    />
  )
}
