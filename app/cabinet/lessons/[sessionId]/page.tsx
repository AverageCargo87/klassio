// /cabinet/lessons/[sessionId] — запись урока: AI-резюме («замечания учителя»),
// навыки и полная лента (реплики + события). Дизайн Claude Design v3 (тёмная тема,
// rec-* в /demo/site.css). Данные настоящие: сессия/транскрипт/навыки из БД.
import { Fragment } from 'react'
import { auth } from '@/auth'
import { redirect, notFound } from 'next/navigation'
import { getSession, getTranscript, getSessionSkills, getSessionCorrectCount } from '@/lib/tutor'
import { lessonTitle, resolveLesson } from '@/lib/curriculum'
import { LessonRecordTimeline } from './timeline'

export const dynamic = 'force-dynamic'

const dateFmt = new Intl.DateTimeFormat('ru-RU', {
  day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Moscow',
})
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function ruMinutes(n: number): string {
  const m10 = n % 10, m100 = n % 100
  const w = m10 === 1 && m100 !== 11 ? 'минута' : m10 >= 2 && m10 <= 4 && (m100 < 10 || m100 >= 20) ? 'минуты' : 'минут'
  return `${n} ${w}`
}

export default async function LessonRecordPage({ params }: { params: Promise<{ sessionId: string }> }) {
  const { sessionId } = await params
  const session = await auth()
  if (!session?.user?.id) redirect('/login')
  // id — Postgres uuid: не-UUID уронил бы запрос (22P02) → 500 вместо 404.
  if (!UUID.test(sessionId)) notFound()

  const lesson = await getSession(sessionId, session.user.id)
  if (!lesson) notFound()

  const [transcript, skills, correct] = await Promise.all([
    getTranscript(sessionId, session.user.id),
    getSessionSkills(sessionId, session.user.id),
    getSessionCorrectCount(sessionId, session.user.id),
  ])

  const resolved = resolveLesson(lesson.subjectId, lesson.lessonSlug)
  const title = resolved?.title ?? lessonTitle(lesson.subjectId, lesson.lessonSlug)
  const totalTasks = resolved?.canvas?.totalTasks ?? null
  const isFin = lesson.subjectId === 'fin-gramotnost'

  const metaParts: string[] = []
  if (resolved?.subjectTitle) metaParts.push(resolved.subjectTitle)
  metaParts.push(dateFmt.format(lesson.startedAt))
  if (lesson.durationSec) metaParts.push(ruMinutes(Math.max(1, Math.round(lesson.durationSec / 60))))
  if (totalTasks) metaParts.push(`${correct} из ${totalTasks} заданий`)
  metaParts.push('ведёт Аня')

  return (
    <>
      <link rel="stylesheet" href="/demo/site.css" />
      <section className="screen dk active" data-screen="record">
        <div className="wrap">
          <header className="topbar">
            <a className="brand" href="/" style={{ textDecoration: 'none', color: 'inherit' }}><span className="mark"></span>классио</a>
            <span className="chip chip-top">Кабинет родителя</span>
          </header>

          <a className="rec-back" href="/cabinet" style={{ textDecoration: 'none' }}>
            <svg className="ic-s" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M19 12H5" /><path d="M11 18l-6-6 6-6" />
            </svg>
            Назад в кабинет
          </a>

          <div className="rec-head">
            <h1>
              {title}{' '}
              {isFin && <span className="vtb-badge" style={{ fontSize: 12, padding: '4px 9px' }}>ВТБ</span>}
            </h1>
            <p className="rec-meta">
              {metaParts.map((p, i) => (
                <Fragment key={i}>{i > 0 && <i>·</i>} {p} </Fragment>
              ))}
            </p>
          </div>

          {lesson.summary && (
            <div className="rec-note">
              <span className="orb"></span>
              <div>
                <span className="kicker">Аня · по итогам урока</span>
                <p className="body" style={{ whiteSpace: 'pre-line' }}>{lesson.summary}</p>
              </div>
            </div>
          )}

          {skills.length > 0 && (
            <div className="rec-skills">
              {skills.map((s, i) => (
                <span className="rec-skill" key={i}>
                  {s.label} <span className="ok">✓</span>
                  {s.redo && <> <span className="redo">повторить</span></>}
                </span>
              ))}
            </div>
          )}

          {transcript.length === 0 ? (
            <p className="rec-meta" style={{ marginTop: 24 }}>Запись этого урока не сохранилась.</p>
          ) : (
            <LessonRecordTimeline lines={transcript} />
          )}
        </div>
      </section>
    </>
  )
}
