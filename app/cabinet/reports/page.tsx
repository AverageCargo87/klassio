// /cabinet/reports — parent dashboard (LESSON-FLOW §2 + §7).
// Server Component: per-lesson results, skill mastery (weak spots first), and
// behaviour-moderation notices the parent can acknowledge. Auth-protected via
// middleware + belt-and-suspenders session check.
import { auth } from '@/auth'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { getChildReport, listHomework } from '@/lib/tutor'
import { ackModeration, completeHomework } from './actions'

export const dynamic = 'force-dynamic'

const dateFmt = new Intl.DateTimeFormat('ru-RU', {
  day: 'numeric',
  month: 'long',
  hour: '2-digit',
  minute: '2-digit',
})

function fmtDuration(sec: number | null): string {
  if (sec == null) return '—'
  const m = Math.round(sec / 60)
  return m < 1 ? '<1 мин' : `${m} мин`
}
function fmtAccuracy(a: number | null): string {
  return a == null ? '—' : `${Math.round(a * 100)}%`
}
function fmtPct(x: number): string {
  return `${Math.round(x * 100)}%`
}

const STATUS_LABEL: Record<string, string> = {
  in_progress: 'идёт',
  completed: 'завершён',
  abandoned: 'не закончен',
}

const MOD_LABEL: Record<string, string> = {
  moderation_warning: 'Предупреждение о поведении',
  moderation_escalation: 'Повторная грубость — мы вам сообщили',
}

export default async function ReportsPage() {
  const session = await auth()
  if (!session?.user?.id) redirect('/login')

  const [report, homework] = await Promise.all([
    getChildReport(session.user.id),
    listHomework(session.user.id),
  ])
  const childName = session.user.childName || 'ребёнка'
  const unackNotices = report.moderation.filter((m) => !m.acknowledgedAt)
  const currentLessons = report.sessions.filter((s) => s.status === 'in_progress')
  const pastLessons = report.sessions.filter((s) => s.status !== 'in_progress')
  const pendingHomework = homework.filter((h) => h.status === 'assigned')

  return (
    <main className="container mx-auto p-6 max-w-3xl">
      <div className="mb-6">
        <Link href="/cabinet" className="text-sm text-muted-foreground hover:underline">
          ← В кабинет
        </Link>
      </div>

      <header className="mb-8">
        <h1 className="text-2xl font-semibold">Отчёты и прогресс</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Как идут занятия у {childName}.
        </p>
      </header>

      {/* Totals */}
      <div className="grid grid-cols-3 gap-3 mb-8">
        <Card>
          <CardContent className="pt-5 text-center">
            <div className="text-2xl font-semibold">{report.totals.lessonsCompleted}</div>
            <div className="text-xs text-muted-foreground mt-1">уроков завершено</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5 text-center">
            <div className="text-2xl font-semibold">
              {report.totals.tasksCorrect}/{report.totals.tasksTotal}
            </div>
            <div className="text-xs text-muted-foreground mt-1">верных заданий</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5 text-center">
            <div className="text-2xl font-semibold">
              {report.totals.tasksTotal > 0
                ? fmtPct(report.totals.tasksCorrect / report.totals.tasksTotal)
                : '—'}
            </div>
            <div className="text-xs text-muted-foreground mt-1">точность</div>
          </CardContent>
        </Card>
      </div>

      {/* Behaviour notices */}
      {report.moderation.length > 0 && (
        <section className="mb-8">
          <h2 className="text-lg font-medium mb-3">
            Поведение
            {unackNotices.length > 0 && (
              <span className="ml-2 inline-flex items-center justify-center rounded-full bg-destructive px-2 py-0.5 text-xs text-destructive-foreground">
                {unackNotices.length} новых
              </span>
            )}
          </h2>
          <div className="space-y-2">
            {report.moderation.map((m) => (
              <Card
                key={m.id}
                className={m.acknowledgedAt ? 'opacity-60' : 'border-destructive/40 bg-destructive/5'}
              >
                <CardContent className="py-3 flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-medium">{MOD_LABEL[m.type] ?? m.type}</p>
                    <p className="text-xs text-muted-foreground">{dateFmt.format(m.createdAt)}</p>
                  </div>
                  {m.acknowledgedAt ? (
                    <span className="text-xs text-muted-foreground shrink-0">просмотрено</span>
                  ) : (
                    <form action={ackModeration}>
                      <input type="hidden" name="eventId" value={m.id} />
                      <Button type="submit" size="sm" variant="outline">
                        Ясно
                      </Button>
                    </form>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        </section>
      )}

      {/* Current lessons (in progress) */}
      {currentLessons.length > 0 && (
        <section className="mb-8">
          <h2 className="text-lg font-medium mb-3">Текущие уроки</h2>
          <div className="space-y-2">
            {currentLessons.map((s) => (
              <Card key={s.id} className="border-primary/30 bg-primary/5">
                <CardContent className="py-3 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">{s.lessonTitle}</p>
                    <p className="text-xs text-muted-foreground">
                      начат {dateFmt.format(s.startedAt)} · идёт
                    </p>
                  </div>
                  <Link href={`/tutor/${s.subjectId}/${s.lessonSlug}`}>
                    <Button size="sm" variant="outline">Продолжить</Button>
                  </Link>
                </CardContent>
              </Card>
            ))}
          </div>
        </section>
      )}

      {/* Homework */}
      {homework.length > 0 && (
        <section className="mb-8">
          <h2 className="text-lg font-medium mb-3">
            Домашняя работа
            {pendingHomework.length > 0 && (
              <span className="ml-2 inline-flex items-center justify-center rounded-full bg-primary px-2 py-0.5 text-xs text-primary-foreground">
                {pendingHomework.length} к выполнению
              </span>
            )}
          </h2>
          <div className="space-y-2">
            {homework.map((h) => (
              <Card key={h.id} className={h.status === 'done' ? 'opacity-60' : ''}>
                <CardContent className="py-3">
                  <div className="flex items-center justify-between gap-3 mb-1">
                    <p className="text-sm font-medium">{h.title}</p>
                    {h.status === 'done' ? (
                      <span className="text-xs text-muted-foreground shrink-0">выполнено</span>
                    ) : (
                      <form action={completeHomework}>
                        <input type="hidden" name="homeworkId" value={h.id} />
                        <Button type="submit" size="sm" variant="outline">Отметить выполненным</Button>
                      </form>
                    )}
                  </div>
                  <ul className="text-xs text-muted-foreground list-disc pl-5 space-y-0.5">
                    {h.items.slice(0, 5).map((it, i) => (
                      <li key={i}>{it.q}</li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
            ))}
          </div>
        </section>
      )}

      {/* Past lessons */}
      <section className="mb-8">
        <h2 className="text-lg font-medium mb-3">Уроки</h2>
        {pastLessons.length === 0 ? (
          <p className="text-sm text-muted-foreground">Завершённых занятий пока нет.</p>
        ) : (
          <div className="space-y-2">
            {pastLessons.map((s) => (
              <Card key={s.id}>
                <CardContent className="py-3">
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">{s.lessonTitle}</p>
                      <p className="text-xs text-muted-foreground">
                        {dateFmt.format(s.startedAt)} · {STATUS_LABEL[s.status] ?? s.status}
                        {s.attemptNumber > 1 ? ` · попытка ${s.attemptNumber}` : ''}
                      </p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-sm font-medium">{fmtAccuracy(s.accuracy)}</p>
                      <p className="text-xs text-muted-foreground">
                        {s.tasksCorrect}/{s.tasksTotal} · {fmtDuration(s.durationSec)}
                      </p>
                    </div>
                  </div>
                  {s.summary && (
                    <p className="text-xs text-muted-foreground mt-2 line-clamp-2 border-t pt-2">
                      {s.summary}
                    </p>
                  )}
                  {(s.summary || s.hasTranscript) && (
                    <Link
                      href={`/cabinet/lessons/${s.id}`}
                      className="text-xs text-primary hover:underline mt-2 inline-block"
                    >
                      Открыть запись урока →
                    </Link>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </section>

      {/* Skills — weakest first */}
      {report.skills.length > 0 && (
        <section>
          <h2 className="text-lg font-medium mb-3">Темы и навыки</h2>
          <Card>
            <CardContent className="py-4 space-y-3">
              {report.skills.map((k) => (
                <div key={k.skillTag}>
                  <div className="flex items-center justify-between text-sm mb-1">
                    <span className="truncate">{k.skillTag}</span>
                    <span className="text-muted-foreground tabular-nums">{fmtPct(k.masteryLevel)}</span>
                  </div>
                  <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
                    <div
                      className="h-full rounded-full bg-primary"
                      style={{ width: `${Math.round(Math.min(1, Math.max(0, k.masteryLevel)) * 100)}%` }}
                    />
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        </section>
      )}
    </main>
  )
}
