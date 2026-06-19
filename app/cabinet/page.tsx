// /cabinet — главная кабинета РОДИТЕЛЯ. Карточки предметов с уведомлениями
// (домашка / замечания / идёт урок). Клик → страница предмета. Без общих сумм.
import { auth } from '@/auth'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { getCabinetHome } from '@/lib/tutor'

export const dynamic = 'force-dynamic'

export default async function CabinetHome() {
  const session = await auth()
  if (!session?.user?.id) redirect('/login')

  const childName = session.user.childName || 'ребёнка'
  const subjects = await getCabinetHome(session.user.id)

  return (
    <main className="kc-shell">
      <div className="kc-top">
        <div className="kc-brand"><span className="kc-emblem" aria-hidden /> классио</div>
        <span className="kc-who">Кабинет родителя</span>
      </div>

      <header style={{ marginBottom: 26 }}>
        <p className="kc-kicker">Кабинет родителя</p>
        <h1 className="kc-display" style={{ marginTop: 6 }}>Учёба {childName}</h1>
        <p className="kc-sub" style={{ marginTop: 6 }}>Выбери предмет, чтобы посмотреть подробности.</p>
      </header>

      <div className="kc-grid">
        {subjects.map((s) => {
          const hasChips = s.hasActiveLesson || s.homeworkDue > 0 || s.unreadNotices > 0
          return (
            <Link key={s.id} href={`/cabinet/${s.id}`} className="kc-subject">
              <div className="kc-subject-ico" aria-hidden>{s.emoji}</div>
              <div className="kc-subject-name">{s.title}</div>
              <div className="kc-subject-grade">{s.grade}</div>
              {s.nextLessonTitle && (
                <div className="kc-subject-next">Следующий урок: {s.nextLessonTitle}</div>
              )}
              <div className="kc-chips">
                {s.hasActiveLesson && <span className="kc-chip">Урок идёт</span>}
                {s.homeworkDue > 0 && (
                  <span className="kc-chip">{s.homeworkDue} {plural(s.homeworkDue, 'домашка', 'домашки', 'домашек')}</span>
                )}
                {s.unreadNotices > 0 && (
                  <span className="kc-chip kc-chip--mod">{s.unreadNotices} {plural(s.unreadNotices, 'замечание', 'замечания', 'замечаний')}</span>
                )}
                {!hasChips && <span className="kc-chip kc-chip--calm">Всё спокойно</span>}
              </div>
            </Link>
          )
        })}
      </div>
    </main>
  )
}

// ru pluralization: 1 урок / 2 урока / 5 уроков
function plural(n: number, one: string, few: string, many: string): string {
  const m10 = n % 10, m100 = n % 100
  if (m10 === 1 && m100 !== 11) return one
  if (m10 >= 2 && m10 <= 4 && (m100 < 10 || m100 >= 20)) return few
  return many
}
