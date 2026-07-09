// /cabinet — главная кабинета РОДИТЕЛЯ, вёрстка = экран 03 Claude Design прототипа
// (cb-*/vtb-* классы в /demo/site.css): тёплый Klassio + синий партнёрский блок
// «Финансовая грамотность · при поддержке ВТБ». Данные настоящие: имя ребёнка из БД,
// записи занятий из tutor_session. Подстраницы (/cabinet/[subject], записи) — kc-стиль.
import type { CSSProperties } from 'react'
import { auth } from '@/auth'
import { redirect } from 'next/navigation'
import { eq } from 'drizzle-orm'
import { db, schema } from '@/lib/db'
import { getRecentRecords, type RecentRecord } from '@/lib/tutor'
import { logoutAction } from './actions'

export const dynamic = 'force-dynamic'

// Родительный падеж имени («Учёба Миши») — портировано из Claude Design прототипа.
// Женские имена на «-ь» склоняются иначе мужских («Любовь → Любови», но
// «Игорь → Игоря») — эвристика пол не знает, держим словарик частых исключений.
const FEM_SOFT = new Set(['любовь', 'нинель', 'адель', 'асель', 'гузель', 'айгуль'])
function genitive(n: string): string {
  n = (n || '').trim()
  if (n.length < 2) return 'ребёнка'
  const low = n.toLowerCase()
  const last = low.slice(-1)
  const pre = low.slice(-2, -1)
  if (last === 'а') return n.slice(0, -1) + ('гкхжчшщ'.includes(pre) ? 'и' : 'ы')
  if (last === 'я') return n.slice(0, -1) + 'и'
  if (last === 'ь' && FEM_SOFT.has(low)) return n.slice(0, -1) + 'и'
  if (last === 'й' || last === 'ь') return n.slice(0, -1) + 'я'
  if ('бвгджзклмнпрстфхцчшщ'.includes(last)) return n + 'а'
  return n
}

const msk = new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'long', timeZone: 'Europe/Moscow' })
const mskTime = new Intl.DateTimeFormat('ru-RU', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Moscow' })
function recDate(d: Date): string {
  const dayMsk = (x: Date) => new Intl.DateTimeFormat('en-CA', { dateStyle: 'short', timeZone: 'Europe/Moscow' }).format(x)
  const today = dayMsk(new Date())
  const yesterday = dayMsk(new Date(Date.now() - 86400_000))
  const day = dayMsk(d)
  const prefix = day === today ? 'сегодня' : day === yesterday ? 'вчера' : msk.format(d)
  return `${prefix}, ${mskTime.format(d)}`
}
// «1 минута / 3 минуты / 7 минут»
function ruMinutes(n: number): string {
  const m10 = n % 10, m100 = n % 100
  const word = m10 === 1 && m100 !== 11 ? 'минута' : m10 >= 2 && m10 <= 4 && (m100 < 10 || m100 >= 20) ? 'минуты' : 'минут'
  return `${n} ${word}`
}
function recMeta(r: RecentRecord): string {
  const parts = [recDate(r.startedAt)]
  if (r.durationSec) parts.push(ruMinutes(Math.max(1, Math.round(r.durationSec / 60))))
  if (r.totalTasks) parts.push(`${r.tasksCorrect}/${r.totalTasks} заданий`)
  parts.push(r.finished ? 'ведёт Аня' : 'не завершён')
  return parts.join(' · ')
}

const d = (v: string): CSSProperties => ({ ['--d' as string]: v } as CSSProperties)
const plainLink: CSSProperties = { textDecoration: 'none', color: 'inherit' }

export default async function CabinetHome() {
  const session = await auth()
  if (!session?.user?.id) redirect('/login')

  const [userRow, records] = await Promise.all([
    db.select({ childName: schema.users.childName }).from(schema.users).where(eq(schema.users.id, session.user.id)).limit(1),
    getRecentRecords(session.user.id),
  ])
  const childName = userRow[0]?.childName || ''
  const invRecord = records.find((r) => r.lessonSlug === 'investicii')

  return (
    <>
      <link rel="stylesheet" href="/demo/site.css" />
      <section className="screen dk active" data-screen="cabinet">
        <div className="wrap">
          <header className="topbar rise" style={d('0s')}>
            <a className="brand" href="/" style={plainLink}><span className="mark"></span>классио</a>
            <span style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <span className="chip chip-top">Кабинет родителя</span>
              <form action={logoutAction} style={{ display: 'inline' }}>
                <button className="chip chip-top" type="submit" style={{ cursor: 'pointer', font: 'inherit' }}>Выйти</button>
              </form>
            </span>
          </header>

          <div className="cb-hello rise" style={d('.05s')}>
            <span className="kicker">Кабинет родителя</span>
            <h1>Учёба <span id="cb-name">{genitive(childName) || 'ребёнка'}</span></h1>
            <p className="sub">Выберите предмет — внутри уроки и записи занятий.</p>
          </div>

          {/* предметы */}
          <div className="cb-grid">
            <div className="cb-subj rise" style={d('.1s')}>
              <span className="icopad">
                <svg className="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M5 12h14" /><circle cx="12" cy="6.5" r="1.6" fill="currentColor" stroke="none" /><circle cx="12" cy="17.5" r="1.6" fill="currentColor" stroke="none" />
                </svg>
              </span>
              <div><h3>Математика</h3><p className="meta">5 класс</p></div>
              <div className="foot"><span className="chip chip-mute">2 урока · скоро</span></div>
            </div>

            <a className="cb-subj rise" style={{ ...plainLink, ...d('.15s') }} href="/cabinet/okr-mir-4">
              <span className="icopad">
                <svg className="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="5" /><path d="M3.6 14.8c-1.1-.9-1.7-1.8-1.5-2.6.4-1.7 4.3-2.4 9.9-1.2 5.6 1.2 10.1 3.2 9.7 4.9-.2.9-1.5 1.4-3.5 1.5" transform="rotate(-14 12 12)" />
                </svg>
              </span>
              <div><h3>Окружающий мир</h3><p className="meta">4 класс</p></div>
              <div className="row"><span className="dot-ok"></span>«Мир глазами астронома» — доступен</div>
              <div className="foot"><span className="chip chip-mute">ещё 2 · скоро</span></div>
            </a>

            <a className="cb-subj vtb rise" style={{ ...plainLink, ...d('.2s') }} href="#cb-fin" title="Открыть трек">
              <span className="icopad">
                <svg className="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="5.5" width="18" height="13" rx="3" /><path d="M3 10h18" /><path d="M7 15h4" />
                </svg>
              </span>
              <div><h3 style={{ color: '#fff' }}>Финансовая грамотность</h3><p className="meta">7–11 лет</p></div>
              <div className="foot">
                <span className="vtb-tag">при поддержке ВТБ</span>
                <span className="vtb-tag hot">1 новый урок</span>
              </div>
            </a>
          </div>

          {/* финансовый трек · раскрытая партнёрская секция */}
          <div className="cb-sec vtb rise" style={d('.25s')} id="cb-fin">
            <div className="vtb-panel">
              <div className="vtb-head">
                <span className="vtb-mark"></span>
                <span className="vtb-title">Финансовая грамотность</span>
                <span className="vtb-chip">при поддержке ВТБ</span>
              </div>
              <div className="cb-fin-list">
                <div className="cb-done">
                  {invRecord ? (
                    <>
                      <div className="t"><b>Инвестиции для начинающих</b><span>{recMeta(invRecord)}</span></div>
                      <span className="st">пройден ✓</span>
                      <a className="btn-vtb-soft" style={plainLink} href={`/cabinet/lessons/${invRecord.sessionId}`}>Смотреть запись</a>
                    </>
                  ) : (
                    <>
                      <div className="t"><b>Инвестиции для начинающих</b><span>≈16 минут · инфляция, акции и сила времени</span></div>
                      <span className="st">доступен</span>
                      <a className="btn-vtb-soft" style={plainLink} href="/tutor/fin-gramotnost/investicii">Открыть урок</a>
                    </>
                  )}
                </div>
                <div className="vtb-lesson cb-hero">
                  <div>
                    <span className="vtb-tag hot">Новый урок</span>
                    <h3 style={{ fontSize: 23 }}>Твоя первая банковская карта</h3>
                    <p className="sub">Что умеет детская карта: оплата, приложение, безопасность и кешбэк.</p>
                    <a className="btn-vtb" style={{ ...plainLink, marginTop: 18, display: 'inline-block' }} href="/tutor/fin-gramotnost/detskaya-karta">Начать урок</a>
                  </div>
                  <div className="cb-hero-art">
                    <div className="kcard kfloat" style={{ width: 196, height: 122, fontSize: 59 }}>
                      <span className="kchip"></span>
                      <span className="bank">ВТБ</span>
                      <span className="cat"><span className="face"><span className="ear l"></span><span className="ear r"></span><span className="eye l"></span><span className="eye r"></span><span className="nose"></span><span className="mouth"></span><span className="wh wl1"></span><span className="wh wl2"></span><span className="wh wr1"></span><span className="wh wr2"></span></span></span>
                      <span className="num">0000 1111 2222 3333</span>
                      <span className="nm">{childName ? childName.toUpperCase() : 'MISHA'}</span>
                      <span className="mir">МИР</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* записи занятий (тёплый мир) */}
          <div className="cb-sec rise" style={d('.3s')}>
            <span className="kicker">Записи занятий</span>
            <h2>Прошедшие уроки</h2>
            {records.length === 0 ? (
              <div className="cb-rec">
                <div className="t">
                  <div className="nm">Здесь появится запись первого урока</div>
                  <div className="meta">полный диалог с Аней, ошибки и разбор — сразу после занятия</div>
                </div>
              </div>
            ) : (
              records.map((r) => (
                <div className="cb-rec" key={r.sessionId} style={{ marginBottom: 12 }}>
                  <div className="t">
                    <div className="nm">
                      {r.lessonTitle}
                      {r.subjectId === 'fin-gramotnost' && <> <span className="vtb-badge">ВТБ</span></>}
                    </div>
                    <div className="meta">{recMeta(r)}</div>
                  </div>
                  <a className="btn btn-wash" style={plainLink} href={`/cabinet/lessons/${r.sessionId}`}>Открыть запись</a>
                </div>
              ))
            )}
          </div>
        </div>
      </section>
    </>
  )
}
