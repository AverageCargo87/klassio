import { auth } from '@/auth'
import { redirect } from 'next/navigation'
import { db, schema } from '@/lib/db'
import { eq, asc } from 'drizzle-orm'
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { canStartLesson } from './can-start'
import { groupByWeek } from './week-grouping'
import { formatSmartDate } from './smart-date'
import { PastLessons } from '@/components/past-lessons'

export default async function LessonsPage() {
  const session = await auth()
  if (!session?.user?.id) redirect('/login') // belt-and-suspenders; middleware already protects

  const userLessons = await db
    .select()
    .from(schema.lessons)
    .where(eq(schema.lessons.userId, session.user.id))
    .orderBy(asc(schema.lessons.scheduledAt))

  const now = new Date()

  // Upcoming: lesson window hasn't expired yet (scheduledAt + duration >= now)
  // AND status is active (scheduled or in_progress)
  const upcoming = userLessons.filter(
    (l) =>
      l.scheduledAt.getTime() + l.durationMin * 60_000 >= now.getTime() &&
      (l.status === 'scheduled' || l.status === 'in_progress'),
  )

  // Past: lesson window has ended OR status is terminal (completed, cancelled)
  const past = userLessons.filter(
    (l) =>
      l.scheduledAt.getTime() + l.durationMin * 60_000 < now.getTime() ||
      l.status === 'completed' ||
      l.status === 'cancelled',
  )

  // Group upcoming by calendar week (D-03: 4-week horizon, Mon-Sun RU weeks)
  const upcomingBuckets = groupByWeek(upcoming, now)

  return (
    <main className="container mx-auto p-6 max-w-3xl">
      <h1 className="text-2xl font-semibold mb-6">Расписание</h1>

      {/* D-02: Empty state for upcoming section */}
      {upcomingBuckets.length === 0 && (
        <p className="text-muted-foreground mb-8">
          Уроков на ближайшие 4 недели не запланировано. Свяжитесь с репетитором.
        </p>
      )}

      {/* D-03: Week buckets with Russian headers */}
      {upcomingBuckets.map((bucket) => (
        <section key={bucket.weekIndex} className="mb-8">
          <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wide mb-3">
            {bucket.label}
          </h2>
          {bucket.lessons.map((lesson) => {
            const enabled = canStartLesson(lesson.scheduledAt, lesson.durationMin, now)
            // D-04: smart-relative date formatting
            const smartDate = formatSmartDate(lesson.scheduledAt, now)
            return (
              <Card key={lesson.id} className="mb-3">
                <CardHeader>
                  {/* D-12: show topic in card */}
                  <CardTitle>{lesson.topic}</CardTitle>
                  <CardDescription>
                    {smartDate} · {lesson.durationMin} мин
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
      ))}

      {/* D-05: Past lessons in collapsible client component */}
      <PastLessons
        lessons={past.map((l) => ({
          id: l.id,
          topic: l.topic ?? '',
          scheduledAt: l.scheduledAt.toISOString(), // serialize Date for RSC→Client boundary
          status: l.status,
        }))}
      />
    </main>
  )
}
