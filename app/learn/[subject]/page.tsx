// /learn/[subject] — меню выбора урока (лаунчер). Просто: выбираешь предмет →
// выбираешь урок → начинаешь. Плюс переключатель голоса учителя (Сбер / 11labs).
// Без отчётных деталей — они в кабинете. Стек хранится в ?stack= и уезжает в урок.
import { auth } from '@/auth'
import { redirect, notFound } from 'next/navigation'
import Link from 'next/link'
import { eq, and } from 'drizzle-orm'
import { db } from '@/lib/db'
import { tutorSessions } from '@/lib/db/schema'
import { SUBJECT_LIST, SUBJECTS } from '@/lib/curriculum'

export const dynamic = 'force-dynamic'

function resolveStack(v: string | string[] | undefined): 'sber' | 'elevenlabs' {
  const s = Array.isArray(v) ? v[0] : v
  return s === 'elevenlabs' || s === '11labs' ? 'elevenlabs' : 'sber'
}

export default async function PickerPage({
  params, searchParams,
}: {
  params: Promise<{ subject: string }>
  searchParams: Promise<{ stack?: string | string[] }>
}) {
  const { subject } = await params
  const stack = resolveStack((await searchParams).stack)
  const session = await auth()
  if (!session?.user?.id) redirect('/login')

  const meta = SUBJECTS[subject]
  if (!meta) notFound()

  const completed = await db
    .select({ lessonSlug: tutorSessions.lessonSlug })
    .from(tutorSessions)
    .where(and(eq(tutorSessions.userId, session.user.id), eq(tutorSessions.subjectId, subject), eq(tutorSessions.status, 'completed')))
  const doneSlugs = new Set(completed.map((c) => c.lessonSlug))

  // следующий доступный (не пройденный available) урок — его выделяем кнопкой
  const nextAvailable = meta.lessons.find((l) => l.status === 'available' && !doneSlugs.has(l.slug))

  return (
    <main className="kc-shell">
      <div className="kc-top">
        <div className="kc-brand"><span className="kc-emblem" aria-hidden /> классио</div>
        <Link href="/cabinet" className="kc-back">Кабинет →</Link>
      </div>

      {/* subject tabs */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 18 }}>
        {SUBJECT_LIST.map((s) => (
          <Link
            key={s.id}
            href={`/learn/${s.id}?stack=${stack}`}
            className="kc-chip"
            style={s.id === subject
              ? { background: 'var(--accent)', color: '#fff', fontSize: 14, padding: '8px 16px' }
              : { fontSize: 14, padding: '8px 16px' }}
          >
            {s.emoji} {s.title}
          </Link>
        ))}
      </div>

      <header style={{ marginBottom: 18 }}>
        <p className="kc-kicker">{meta.grade} · программа</p>
        <h1 className="kc-display" style={{ marginTop: 6 }}>{meta.title}</h1>
        <p className="kc-sub" style={{ marginTop: 6 }}>{meta.description}</p>
      </header>

      {/* voice stack switch */}
      <div className="kc-card-2 kc-row" style={{ marginBottom: 18 }}>
        <div>
          <div style={{ fontWeight: 700 }}>Голос учителя</div>
          <div className="kc-empty">Через какую технологию Аня выходит на связь.</div>
        </div>
        <div className="kc-seg">
          <Link href={`/learn/${subject}?stack=sber`} className={stack === 'sber' ? 'kc-on' : ''}>Сбер</Link>
          <Link href={`/learn/${subject}?stack=elevenlabs`} className={stack === 'elevenlabs' ? 'kc-on' : ''}>11labs</Link>
        </div>
      </div>

      {/* lessons */}
      <div className="kc-list">
        {meta.lessons.map((l) => {
          const done = doneSlugs.has(l.slug)
          const isNext = nextAvailable?.slug === l.slug
          const playable = l.status === 'available'
          return (
            <div key={l.slug} className="kc-card-2" style={!playable ? { opacity: 0.65 } : isNext ? { border: '2px solid var(--accent)' } : undefined}>
              <div className="kc-lesson">
                <span className={`kc-lesson-num ${done ? 'kc-done' : isNext ? 'kc-next' : ''}`}>{done ? '✓' : l.number}</span>
                <div style={{ flex: 1 }}>
                  {isNext && <div className="kc-kicker" style={{ marginBottom: 2 }}>Следующий урок</div>}
                  <div style={{ fontWeight: 700 }}>{l.title}</div>
                  <div className="kc-empty">{l.subtitle}</div>
                </div>
                {playable
                  ? <Link href={`/tutor/${subject}/${l.slug}?stack=${stack}`} className="kc-btn kc-btn-sm">{done ? 'Повторить' : 'Начать'}</Link>
                  : <span className="kc-soon">скоро</span>}
              </div>
            </div>
          )
        })}
      </div>
    </main>
  )
}
