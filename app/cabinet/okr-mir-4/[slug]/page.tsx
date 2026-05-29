// /cabinet/okr-mir-4/[slug] — per-lesson stub for Окружающий мир 4 кл.
// Until the lesson trainer is built, shows a "в разработке" placeholder.
// When ready, swap to redirect to the actual trainer route based on slug.

import { auth } from '@/auth'
import { redirect, notFound } from 'next/navigation'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card'
import { getLessonBySlug } from '@/lib/curriculum/okr-mir-4'

interface PageProps {
  params: Promise<{ slug: string }>
}

export default async function OkrMir4LessonStub({ params }: PageProps) {
  const session = await auth()
  if (!session?.user) redirect('/login')

  const { slug } = await params
  const lesson = getLessonBySlug(slug)
  if (!lesson) notFound()

  // If lesson becomes available, route to trainer instead of showing stub.
  if (lesson.status === 'available' && lesson.href) {
    redirect(lesson.href)
  }

  return (
    <main className="container mx-auto p-6 max-w-2xl">
      <nav className="text-xs text-muted-foreground mb-3 flex items-center gap-2">
        <Link href="/cabinet" className="hover:text-foreground">ЛК</Link>
        <span>›</span>
        <Link href="/cabinet/okr-mir-4" className="hover:text-foreground">Окружающий мир 4 кл</Link>
        <span>›</span>
        <span className="text-foreground">Урок {lesson.number}</span>
      </nav>

      <header className="mb-6">
        <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider mb-1">
          Урок {lesson.number}
        </p>
        <h1 className="text-2xl font-semibold">{lesson.title}</h1>
        <p className="text-sm text-muted-foreground mt-1">{lesson.subtitle}</p>
      </header>

      <Card>
        <CardHeader>
          <div className="text-4xl mb-3" aria-hidden>🛠</div>
          <CardTitle className="text-lg">Урок в разработке</CardTitle>
          <CardDescription className="text-sm leading-snug">
            Содержание урока готовим прямо сейчас. Открой проверь чуть позже — придёт уведомление, когда будет готов.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Link href="/cabinet/okr-mir-4">
            <Button variant="outline">К списку уроков</Button>
          </Link>
        </CardContent>
      </Card>
    </main>
  )
}
