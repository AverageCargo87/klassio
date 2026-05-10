// app/lesson/[id]/page.tsx
// Server Component — auth, ownership check, canStart guard, status auto-transition.
// Per D-11: all server-side logic here; delegates rendering to LessonShell (client).
// Per D-14: status transition is idempotent (COALESCE pattern).
// Per threat model T-03-03-01: auth() defensive check (middleware already protects).
// Per threat model T-03-03-02: Drizzle query includes userId = session.user.id; row not found → notFound().
import { auth } from '@/auth'
import { redirect, notFound } from 'next/navigation'
import { db, schema } from '@/lib/db'
import { eq, and } from 'drizzle-orm'
import { canStartLesson } from '@/app/lessons/can-start'
import { LessonShell } from '@/components/lesson-shell'
import { Button } from '@/components/ui/button'
import pkg from 'pg'

const { Client } = pkg

// DML helper: pg for Neon-safe status transition (matches Phase 2 admin CLI pattern, D-12)
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

export default async function LessonPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params

  // 1. Auth — middleware already protects, but defensive double-check per pattern (T-03-03-01)
  const session = await auth()
  if (!session?.user?.id) redirect('/login')

  // 2. Ownership check (T-03-03-02, D-11 step 2)
  const rows = await db
    .select()
    .from(schema.lessons)
    .where(and(eq(schema.lessons.id, id), eq(schema.lessons.userId, session.user.id)))

  if (!rows.length) notFound()
  const lesson = rows[0]

  // 3. Terminal status — lesson already over (D-11 step 4)
  if (lesson.status === 'completed' || lesson.status === 'cancelled') {
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

  // 4. canStart guard (D-11 step 5) — lesson not yet openable
  if (lesson.status === 'scheduled' && !canStartLesson(lesson.scheduledAt, lesson.durationMin, now)) {
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

  // 5. Auto-transition scheduled → in_progress (D-11 step 6, D-14)
  // Idempotent: COALESCE preserves first actual_start_at; WHERE status IN (...) prevents double-apply.
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

  // 6. Render lesson shell — pass serialized primitives only (RSC→Client boundary)
  //    Per D-11 step 7: if status was in_progress, render directly without re-fetch.
  return (
    <LessonShell
      lessonId={lesson.id}
      topic={lesson.topic}
    />
  )
}
