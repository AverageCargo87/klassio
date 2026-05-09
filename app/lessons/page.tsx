import { auth } from '@/auth'
import { redirect } from 'next/navigation'
import { db, schema } from '@/lib/db'
import { eq, asc } from 'drizzle-orm'
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { canStartLesson } from './can-start'

export default async function LessonsPage() {
  const session = await auth()
  if (!session?.user?.id) redirect('/login') // belt-and-suspenders; middleware already protects

  const userLessons = await db
    .select()
    .from(schema.lessons)
    .where(eq(schema.lessons.userId, session.user.id))
    .orderBy(asc(schema.lessons.scheduledAt))

  const now = new Date()
  const upcoming = userLessons.filter(
    (l) => l.scheduledAt.getTime() + l.durationMin * 60_000 >= now.getTime(),
  )
  const past = userLessons.filter(
    (l) => l.scheduledAt.getTime() + l.durationMin * 60_000 < now.getTime(),
  )

  return (
    <main className="container mx-auto p-6 max-w-3xl">
      <h1 className="text-2xl font-semibold mb-6">Уроки</h1>

      {upcoming.length === 0 && past.length === 0 && (
        <p className="text-muted-foreground">Пока уроков нет. Репетитор добавит их позже.</p>
      )}

      {upcoming.length > 0 && (
        <section className="mb-8">
          <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wide mb-3">
            Запланированные
          </h2>
          {upcoming.map((lesson) => {
            const enabled = canStartLesson(lesson.scheduledAt, lesson.durationMin, now)
            return (
              <Card key={lesson.id} className="mb-3">
                <CardHeader>
                  <CardTitle>{lesson.topic}</CardTitle>
                  <CardDescription>
                    {lesson.scheduledAt.toLocaleString('ru-RU', {
                      dateStyle: 'long',
                      timeStyle: 'short',
                    })}
                    {' · '}
                    {lesson.durationMin} мин
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {enabled ? (
                    <a href={`/lesson/${lesson.id}`}>
                      <Button>Начать урок</Button>
                    </a>
                  ) : (
                    <Button disabled>Начать урок</Button>
                  )}
                </CardContent>
              </Card>
            )
          })}
        </section>
      )}

      {past.length > 0 && (
        <section>
          <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wide mb-3">
            Прошедшие уроки
          </h2>
          {past.map((lesson) => (
            <Card key={lesson.id} className="mb-3 opacity-70">
              <CardHeader>
                <CardTitle>{lesson.topic}</CardTitle>
                <CardDescription>
                  {lesson.scheduledAt.toLocaleString('ru-RU', {
                    dateStyle: 'long',
                    timeStyle: 'short',
                  })}
                </CardDescription>
              </CardHeader>
            </Card>
          ))}
        </section>
      )}
    </main>
  )
}
