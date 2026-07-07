// /cabinet/lessons/[sessionId] — запись урока: AI-резюме («замечания учителя») +
// полный транскрипт. Фирменный вид Klassio. Показывает, на каком стеке шёл урок.
import { auth } from '@/auth'
import { redirect, notFound } from 'next/navigation'
import Link from 'next/link'
import { getSession, getTranscript } from '@/lib/tutor'
import { lessonTitle } from '@/lib/curriculum'
import { LessonRecordTimeline } from './timeline'

export const dynamic = 'force-dynamic'

const dateFmt = new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Moscow' })

export default async function LessonRecordPage({ params }: { params: Promise<{ sessionId: string }> }) {
  const { sessionId } = await params
  const session = await auth()
  if (!session?.user?.id) redirect('/login')

  // id — Postgres uuid: не-UUID в URL уронил бы запрос 22P02 → 500 вместо 404.
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(sessionId)) notFound()

  const lesson = await getSession(sessionId, session.user.id)
  if (!lesson) notFound()

  const transcript = await getTranscript(sessionId, session.user.id)
  const title = lessonTitle(lesson.subjectId, lesson.lessonSlug)
  const stack = lesson.voiceProvider === 'sber' ? 'Сбер' : lesson.voiceProvider === 'elevenlabs' ? '11labs' : null

  return (
    <main className="kc-shell">
      <div className="kc-top">
        <Link href={`/cabinet/${lesson.subjectId}`} className="kc-back">← Назад</Link>
        {stack && <span className="kc-stack-badge">голос: {stack}</span>}
      </div>

      <header style={{ marginBottom: 22 }}>
        <h1 className="kc-h1">{title}</h1>
        <p className="kc-sub" style={{ fontSize: 14, marginTop: 4 }}>{dateFmt.format(lesson.startedAt)}</p>
      </header>

      {lesson.summary && (
        <section className="kc-section" style={{ marginTop: 0 }}>
          <h2 className="kc-section-title">Замечания учителя</h2>
          <div className="kc-card" style={{ background: 'var(--accent-wash)' }}>
            <p className="kc-kicker" style={{ marginBottom: 8 }}>Аня · по итогам урока</p>
            <div style={{ fontSize: 15, lineHeight: 1.6, whiteSpace: 'pre-line' }}>{lesson.summary}</div>
          </div>
        </section>
      )}

      <section className="kc-section">
        <h2 className="kc-section-title">Запись урока</h2>
        {transcript.length === 0 ? (
          <div className="kc-card-2"><span className="kc-empty">Запись этого урока не сохранилась.</span></div>
        ) : (
          <LessonRecordTimeline lines={transcript} />
        )}
      </section>
    </main>
  )
}
