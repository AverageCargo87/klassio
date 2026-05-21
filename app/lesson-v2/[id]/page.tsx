// app/lesson-v2/[id]/page.tsx
// Phase 8.7 — Claude Design integrated lesson page (v2 layout).
// Server Component — mirrors auth/canStart/auto-transition flow from
// app/lesson/[id]/page.tsx, but renders LessonPageV2 (Duolingo-style layout).
//
// Crucially keeps the OLD route /lesson/[id]/page.tsx untouched as fallback.
// Switch is made by updating links (currently both routes coexist).

import { auth } from '@/auth'
import { redirect, notFound } from 'next/navigation'
import { db, schema } from '@/lib/db'
import { eq, and } from 'drizzle-orm'
import { canStartLesson } from '@/app/lessons/can-start'
import { loadTrainerConfig } from '@/lib/trainer/config-loader'
import { Button } from '@/components/ui/button'
import { LessonPageV2 } from '@/components/lesson-v2/lesson-page'
import pkg from 'pg'

const { Client } = pkg

async function withPg<T>(fn: (client: InstanceType<typeof Client>) => Promise<T>): Promise<T> {
  const connectionString = process.env.DATABASE_URL_DIRECT
  if (!connectionString) throw new Error('DATABASE_URL_DIRECT required')
  const client = new Client({ connectionString, ssl: { rejectUnauthorized: false } })
  await client.connect()
  try {
    return await fn(client)
  } finally {
    await client.end()
  }
}

export default async function LessonPageV2Route({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ test?: string }>
}) {
  const { id } = await params
  const { test } = await searchParams

  // 1. Auth (T-03-03-01)
  const session = await auth()
  if (!session?.user?.id) redirect('/login')

  // Admin test bypass — same as old /lesson/[id]
  const isAdminTestBypass =
    test === '1' && session.user.email === process.env.SEED_ADMIN_EMAIL

  // 2. Ownership check (T-03-03-02)
  const rows = await db
    .select()
    .from(schema.lessons)
    .where(and(eq(schema.lessons.id, id), eq(schema.lessons.userId, session.user.id)))

  if (!rows.length) notFound()
  const lesson = rows[0]

  // 3. Terminal status
  if (!isAdminTestBypass && (lesson.status === 'completed' || lesson.status === 'cancelled')) {
    const endDate = lesson.actualEndAt
      ? new Intl.DateTimeFormat('ru-RU', {
          day: 'numeric',
          month: 'long',
          year: 'numeric',
        }).format(lesson.actualEndAt)
      : 'ранее'

    return (
      <main className="container mx-auto p-6 max-w-xl flex flex-col items-center justify-center min-h-screen gap-4">
        <h1 className="text-xl font-semibold">Урок завершён</h1>
        <p className="text-muted-foreground text-center">
          Урок проведён {endDate}. Запись появится в Phase 10.
        </p>
        <a href="/lessons">
          <Button variant="outline">← Вернуться в расписание</Button>
        </a>
      </main>
    )
  }

  const now = new Date()

  // 4. canStart guard
  if (
    !isAdminTestBypass &&
    lesson.status === 'scheduled' &&
    !canStartLesson(lesson.scheduledAt, lesson.durationMin, now)
  ) {
    const opensAt = new Intl.DateTimeFormat('ru-RU', {
      hour: '2-digit',
      minute: '2-digit',
      day: 'numeric',
      month: 'long',
    }).format(new Date(lesson.scheduledAt.getTime() - 5 * 60_000))

    return (
      <main className="container mx-auto p-6 max-w-xl flex flex-col items-center justify-center min-h-screen gap-4">
        <h1 className="text-xl font-semibold">Урок ещё не начался</h1>
        <p className="text-muted-foreground text-center">
          Кнопка «Начать урок» станет активной в {opensAt}.
        </p>
        <a href="/lessons">
          <Button variant="outline">← Вернуться в расписание</Button>
        </a>
      </main>
    )
  }

  // 5. Auto-transition scheduled → in_progress
  if (lesson.status === 'scheduled') {
    await withPg(async (client) => {
      await client.query(
        `UPDATE lesson
           SET status = 'in_progress',
               actual_start_at = COALESCE(actual_start_at, now())
         WHERE id = $1
           AND status IN ('scheduled', 'in_progress')`,
        [lesson.id],
      )
    })
  }

  // 6. Load trainer config — for v2 we PREFER lesson-column-addition.json
  //    (the new 20-task + 3-intro file) over the lesson's htmlTrainerPath which
  //    might still point to the old 5-task sample. If lesson has its own path,
  //    use it; else fall back to the v2 default.
  //
  //    NOTE: this is a Stage-1 convenience. In production both paths should be
  //    valid JSON for the schema and we'd use whichever the admin set.
  const trainerConfigPath = lesson.htmlTrainerPath || 'lesson-column-addition.json'
  const trainerConfig = await loadTrainerConfig(trainerConfigPath).catch((err) => {
    console.error('[LessonPageV2] Failed to load trainer config:', err)
    return null
  })

  if (!trainerConfig) {
    return (
      <main className="container mx-auto p-6 max-w-xl flex flex-col items-center justify-center min-h-screen gap-4">
        <h1 className="text-xl font-semibold">У этого урока нет тренажёра</h1>
        <p className="text-muted-foreground text-center">
          Тренажёр для этого урока ещё не настроен. Свяжись с репетитором.
        </p>
        <a href="/lessons">
          <Button variant="outline">← Вернуться в расписание</Button>
        </a>
      </main>
    )
  }

  return <LessonPageV2 lessonId={lesson.id} topic={lesson.topic} trainerConfig={trainerConfig} />
}
