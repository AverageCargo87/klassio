// /cabinet/okr-mir-4 — lesson list for Окружающий мир 4 кл.
// Static curriculum from lib/curriculum/okr-mir-4.ts.

import { auth } from '@/auth'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { OKR_MIR_4_LESSONS } from '@/lib/curriculum/okr-mir-4'

export default async function OkrMir4Page() {
  const session = await auth()
  if (!session?.user) redirect('/login')

  return (
    <main className="container mx-auto p-6 max-w-3xl">
      <nav className="text-xs text-muted-foreground mb-3">
        <Link href="/cabinet" className="hover:text-foreground">← Все предметы</Link>
      </nav>

      <header className="mb-6">
        <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider mb-1">
          Окружающий мир · 4 класс
        </p>
        <h1 className="text-2xl font-semibold">Земля и человечество</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Три урока по астрономии по учебнику Плешакова (стр. 3-21).
        </p>
      </header>

      <div className="flex flex-col gap-3">
        {OKR_MIR_4_LESSONS.map((lesson) => {
          const isAvailable = lesson.status === 'available'
          const href = isAvailable && lesson.href ? lesson.href : `/cabinet/okr-mir-4/${lesson.slug}`
          return (
            <Card key={lesson.slug}>
              <CardHeader>
                <div className="flex items-start justify-between gap-3 mb-1">
                  <CardTitle className="text-base">
                    Урок {lesson.number}. {lesson.title}
                  </CardTitle>
                  {!isAvailable && (
                    <span className="shrink-0 text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full bg-muted text-muted-foreground">
                      Скоро
                    </span>
                  )}
                </div>
                <CardDescription className="text-sm leading-snug">{lesson.subtitle}</CardDescription>
              </CardHeader>
              <CardContent>
                <Link href={href}>
                  <Button variant={isAvailable ? 'default' : 'outline'}>
                    {isAvailable ? 'Начать урок' : 'Подробнее'}
                  </Button>
                </Link>
              </CardContent>
            </Card>
          )
        })}
      </div>
    </main>
  )
}
