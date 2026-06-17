// /cabinet/lessons/[sessionId] — запись прошедшего урока: AI-резюме («замечания
// учителя») + полный транскрипт диалога. Только для владельца сессии.
import { auth } from '@/auth'
import { redirect, notFound } from 'next/navigation'
import Link from 'next/link'
import { Card, CardContent } from '@/components/ui/card'
import { getSession, getTranscript } from '@/lib/tutor'
import { lessonTitle } from '@/lib/curriculum'

export const dynamic = 'force-dynamic'

const dateFmt = new Intl.DateTimeFormat('ru-RU', {
  day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit',
})

export default async function LessonRecordPage({
  params,
}: {
  params: Promise<{ sessionId: string }>
}) {
  const { sessionId } = await params
  const session = await auth()
  if (!session?.user?.id) redirect('/login')

  const lesson = await getSession(sessionId, session.user.id)
  if (!lesson) notFound()

  const transcript = await getTranscript(sessionId, session.user.id)
  const title = lessonTitle(lesson.subjectId, lesson.lessonSlug)

  return (
    <main className="container mx-auto p-6 max-w-3xl">
      <div className="mb-6">
        <Link href="/cabinet/reports" className="text-sm text-muted-foreground hover:underline">
          ← К отчётам
        </Link>
      </div>

      <header className="mb-6">
        <h1 className="text-2xl font-semibold">{title}</h1>
        <p className="text-sm text-muted-foreground mt-1">{dateFmt.format(lesson.startedAt)}</p>
      </header>

      {/* AI-резюме урока («замечания учителя») */}
      {lesson.summary && (
        <section className="mb-8">
          <h2 className="text-lg font-medium mb-3">Замечания учителя</h2>
          <Card className="bg-primary/5 border-primary/20">
            <CardContent className="py-4 text-sm leading-relaxed whitespace-pre-line">
              {lesson.summary}
            </CardContent>
          </Card>
        </section>
      )}

      {/* Полный транскрипт */}
      <section>
        <h2 className="text-lg font-medium mb-3">Запись урока</h2>
        {transcript.length === 0 ? (
          <p className="text-sm text-muted-foreground">Запись этого урока не сохранилась.</p>
        ) : (
          <div className="space-y-2">
            {transcript.map((line, i) => (
              <div
                key={i}
                className={
                  line.role === 'agent'
                    ? 'rounded-lg bg-muted px-3 py-2 text-sm'
                    : 'rounded-lg bg-primary/10 px-3 py-2 text-sm ml-8'
                }
              >
                <span className="text-xs text-muted-foreground block mb-0.5">
                  {line.role === 'agent' ? 'Учитель' : 'Ребёнок'}
                </span>
                {line.text}
              </div>
            ))}
          </div>
        )}
      </section>
    </main>
  )
}
