// /cabinet/[subject] — всё по одному предмету: цифры, идущий урок, домашка,
// программа (пройденные + предстоящие), поведение, навыки. Данные фильтруются
// по subjectId (общие суммы по предметам не складываем).
import { auth } from '@/auth'
import { redirect, notFound } from 'next/navigation'
import Link from 'next/link'
import { getSubjectReport } from '@/lib/tutor'
import { completeHomeworkAction, ackNoticeAction } from './actions'

export const dynamic = 'force-dynamic'

const dateFmt = new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'long' })
const fmtPct = (a: number | null) => (a == null ? '—' : `${Math.round(a * 100)}%`)
const fmtMin = (s: number | null) => (s == null ? '—' : s < 60 ? '<1 мин' : `${Math.round(s / 60)} мин`)
const NOTICE_LABEL: Record<string, string> = {
  moderation_warning: 'Отвлёкся / нарушил правила урока',
  moderation_escalation: 'Повторно — мы вам сообщили',
}

export default async function SubjectPage({ params }: { params: Promise<{ subject: string }> }) {
  const { subject } = await params
  const session = await auth()
  if (!session?.user?.id) redirect('/login')

  const r = await getSubjectReport(session.user.id, subject)
  if (!r) notFound()

  return (
    <main className="kc-shell">
      <div className="kc-top">
        <Link href="/cabinet" className="kc-back">← Все предметы</Link>
        <span className="kc-who">{r.emoji} {r.title}</span>
      </div>

      <header style={{ marginBottom: 22 }}>
        <p className="kc-kicker">{r.grade} · предмет</p>
        <h1 className="kc-display" style={{ marginTop: 6 }}>{r.title}</h1>
      </header>

      {/* per-subject stats */}
      <div className="kc-stats">
        <div className="kc-stat"><div className="kc-stat-n">{r.lessonsCompleted}</div><div className="kc-stat-l">уроков пройдено</div></div>
        <div className="kc-stat"><div className="kc-stat-n kc-accent">{fmtPct(r.accuracy)}</div><div className="kc-stat-l">точность</div></div>
        <div className="kc-stat"><div className="kc-stat-n">{r.skills.length}</div><div className="kc-stat-l">тем затронуто</div></div>
      </div>

      {/* active lesson */}
      {r.activeLesson && (
        <section className="kc-section">
          <div className="kc-card kc-hero">
            <p className="kc-kicker">Незаконченный урок</p>
            <div className="kc-row" style={{ marginTop: 10 }}>
              <div>
                <div className="kc-h2">{r.activeLesson.lessonTitle}</div>
                <div className="kc-sub" style={{ fontSize: 14 }}>начат {dateFmt.format(r.activeLesson.startedAt)}</div>
              </div>
              <Link href={`/learn/${r.subjectId}`} className="kc-btn">Продолжить</Link>
            </div>
          </div>
        </section>
      )}

      {/* start a lesson */}
      <section className="kc-section">
        <div className="kc-card kc-row">
          <div>
            <div className="kc-h2">Заниматься</div>
            <div className="kc-sub" style={{ fontSize: 14 }}>Выбрать урок и голос учителя.</div>
          </div>
          <Link href={`/learn/${r.subjectId}`} className="kc-btn">Начать занятие</Link>
        </div>
      </section>

      {/* homework */}
      {r.homework.length > 0 && (
        <section className="kc-section">
          <h2 className="kc-section-title">Домашняя работа</h2>
          <div className="kc-list">
            {r.homework.map((h) => (
              <div key={h.id} className="kc-card-2" style={h.status === 'done' ? { opacity: 0.6 } : undefined}>
                <div className="kc-row" style={{ marginBottom: 6 }}>
                  <div className="kc-h2" style={{ fontSize: 17 }}>{h.title}</div>
                  {h.status === 'done' ? (
                    <span className="kc-empty">✓ выполнено</span>
                  ) : (
                    <form action={completeHomeworkAction}>
                      <input type="hidden" name="homeworkId" value={h.id} />
                      <input type="hidden" name="subjectId" value={r.subjectId} />
                      <button type="submit" className="kc-btn kc-btn-ghost kc-btn-sm">Отметить выполненным</button>
                    </form>
                  )}
                </div>
                <ul style={{ paddingLeft: 18, color: 'var(--ink-soft)', fontSize: 14 }}>
                  {h.items.slice(0, 5).map((it, i) => <li key={i}>{it.q}</li>)}
                </ul>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* program: past + upcoming */}
      <section className="kc-section">
        <h2 className="kc-section-title">Уроки</h2>
        {r.pastLessons.length === 0 && <p className="kc-empty" style={{ marginBottom: 10 }}>Пройденных уроков ещё нет.</p>}
        <div className="kc-list">
          {r.pastLessons.map((l) => (
            <div key={l.id} className="kc-card-2">
              <div className="kc-row">
                <div className="kc-lesson">
                  <span className="kc-lesson-num kc-done">✓</span>
                  <div>
                    <div style={{ fontWeight: 700 }}>{l.lessonTitle}</div>
                    <div className="kc-empty">{dateFmt.format(l.startedAt)} · {l.tasksCorrect}/{l.tasksTotal} · {fmtMin(l.durationSec)}{l.voiceProvider ? ` · ${l.voiceProvider === 'sber' ? 'Сбер' : '11labs'}` : ''}</div>
                  </div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontWeight: 700, color: 'var(--accent)' }}>{fmtPct(l.accuracy)}</div>
                  {(l.summary || l.hasTranscript) && (
                    <Link href={`/cabinet/lessons/${l.id}`} style={{ fontSize: 13, color: 'var(--accent-deep)', textDecoration: 'none' }}>запись →</Link>
                  )}
                </div>
              </div>
            </div>
          ))}
          {r.upcoming.map((l) => (
            <div key={l.slug} className="kc-card-2" style={{ opacity: 0.7 }}>
              <div className="kc-lesson">
                <span className="kc-lesson-num">{l.number}</span>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 700 }}>{l.title}</div>
                  <div className="kc-empty">{l.subtitle}</div>
                </div>
                <span className="kc-soon">{l.status === 'available' ? 'доступен' : 'скоро'}</span>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* behaviour */}
      <section className="kc-section">
        <h2 className="kc-section-title">Поведение</h2>
        {r.notices.length === 0 ? (
          <div className="kc-card-2"><span className="kc-empty">Всё спокойно — замечаний по этому предмету нет.</span></div>
        ) : (
          <div className="kc-list">
            {r.notices.map((n) => (
              <div key={n.id} className="kc-card-2" style={!n.acknowledgedAt ? { borderLeft: '3px solid var(--error)' } : { opacity: 0.6 }}>
                <div className="kc-row">
                  <div>
                    <div style={{ fontWeight: 600 }}>{NOTICE_LABEL[n.type] ?? n.type}</div>
                    <div className="kc-empty">{dateFmt.format(n.createdAt)}</div>
                    {n.sessionId && (
                      <Link href={`/cabinet/lessons/${n.sessionId}`} style={{ fontSize: 13, color: 'var(--accent-deep)', textDecoration: 'none' }}>Открыть момент в записи →</Link>
                    )}
                  </div>
                  {n.acknowledgedAt ? (
                    <span className="kc-empty">✓ прочитано</span>
                  ) : (
                    <form action={ackNoticeAction}>
                      <input type="hidden" name="eventId" value={n.id} />
                      <input type="hidden" name="subjectId" value={r.subjectId} />
                      <button type="submit" className="kc-btn kc-btn-ghost kc-btn-sm">Ясно</button>
                    </form>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* skills */}
      {r.skills.length > 0 && (
        <section className="kc-section">
          <h2 className="kc-section-title">Темы и навыки</h2>
          <div className="kc-card">
            <p className="kc-empty" style={{ marginBottom: 14 }}>Сверху — что стоит повторить.</p>
            <div className="kc-list">
              {r.skills.map((k) => (
                <div key={k.skillTag}>
                  <div className="kc-row" style={{ marginBottom: 5, fontSize: 14 }}>
                    <span>{k.skillTag}</span>
                    <span style={{ color: 'var(--ink-soft)' }}>{Math.round(k.masteryLevel * 100)}%</span>
                  </div>
                  <div className="kc-bar"><i style={{ width: `${Math.round(Math.min(1, Math.max(0, k.masteryLevel)) * 100)}%` }} /></div>
                </div>
              ))}
            </div>
          </div>
        </section>
      )}
    </main>
  )
}
