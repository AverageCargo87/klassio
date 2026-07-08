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
import { resolveLesson, ASTRONOM_MIRO_CANVAS } from '@/lib/curriculum'
import { getOrStartSession, buildTutorDynamicVariables } from '@/lib/tutor'
import { getUserId } from '@/lib/tutor/http'
import { TutorLesson } from '@/components/tutor/tutor-lesson'
import { TutorLessonRu } from '@/components/tutor/tutor-lesson-ru'

export const dynamic = 'force-dynamic'

// Голосовой стек выбирается в меню выбора урока и приходит как ?stack=sber|elevenlabs.
// Дефолт — Sber (RU-стек). Один и тот же урок (контент/auth/трекинг) рендерится
// либо через TutorLesson (11labs), либо TutorLessonRu (Sber) — отличается только хук.
function resolveStack(v: string | string[] | undefined): 'sber' | 'elevenlabs' {
  const s = Array.isArray(v) ? v[0] : v
  return s === 'elevenlabs' || s === '11labs' ? 'elevenlabs' : 'sber'
}

// ?shell=miro — альтернативная оболочка того же урока (Miro-режим: карта на
// tldraw-холсте). Оболочка чисто клиентская: контент, промпт Ани на VPS,
// трекинг и все пейсинг-гейты не меняются. Сейчас есть только у астронома.
function resolveShellCanvas(
  v: string | string[] | undefined,
  subject: string,
  slug: string,
): typeof ASTRONOM_MIRO_CANVAS | undefined {
  const s = Array.isArray(v) ? v[0] : v
  if (s === 'miro' && subject === 'okr-mir-4' && slug === 'astronom') return ASTRONOM_MIRO_CANVAS
  return undefined
}

export default async function TutorLessonRoute({
  params,
  searchParams,
}: {
  params: Promise<{ subject: string; slug: string }>
  searchParams: Promise<{ stack?: string | string[]; shell?: string | string[] }>
}) {
  const { subject, slug } = await params
  const sp = await searchParams
  const stack = resolveStack(sp.stack)
  const shellCanvas = resolveShellCanvas(sp.shell, subject, slug)

  const userId = await getUserId()
  if (!userId) redirect('/login')

  const lesson = resolveLesson(subject, slug)
  if (!lesson) notFound()

  const start = await getOrStartSession({
    userId,
    subjectId: subject,
    lessonSlug: slug,
    voiceProvider: stack,
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

  const canvas = shellCanvas ?? lesson.canvas

  if (stack === 'elevenlabs') {
    return (
      <TutorLesson
        sessionId={start.sessionId}
        lessonTitle={lesson.title}
        lessonSubtitle={lesson.subtitle}
        dynamicVariables={dynamicVariables}
        canvas={canvas}
      />
    )
  }
  return (
    <TutorLessonRu
      sessionId={start.sessionId}
      lessonTitle={lesson.title}
      lessonSubtitle={lesson.subtitle}
      dynamicVariables={dynamicVariables}
      canvas={canvas}
    />
  )
}
