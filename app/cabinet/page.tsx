// /cabinet — Личный кабинет landing. Subject selector.
// Auth-protected via middleware.ts matcher `/cabinet/:path*`.
// belt-and-suspenders: also checks session here.

import { auth } from '@/auth'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'

interface Subject {
  id: string
  title: string
  grade: string
  description: string
  href: string
  emoji: string
}

const SUBJECTS: Subject[] = [
  {
    id: 'matematika-5',
    title: 'Математика',
    grade: '5 класс',
    description: 'Сложение и вычитание в столбик. Уроки 45 минут с AI-учителем и интерактивной доской.',
    href: '/lessons',
    emoji: '🧮',
  },
  {
    id: 'okr-mir-4',
    title: 'Окружающий мир',
    grade: '4 класс',
    description: 'Раздел «Земля и человечество» — астрономия, Солнечная система, звёздное небо.',
    href: '/cabinet/okr-mir-4',
    emoji: '🪐',
  },
]

export default async function CabinetPage() {
  const session = await auth()
  if (!session?.user) redirect('/login')

  const displayName = session.user.childName || session.user.name || 'друг'

  return (
    <main className="container mx-auto p-6 max-w-3xl">
      <header className="mb-8">
        <p className="text-sm text-muted-foreground mb-1">Привет, {displayName}!</p>
        <h1 className="text-2xl font-semibold">Выбери предмет</h1>
      </header>

      <div className="grid gap-4 sm:grid-cols-2">
        {SUBJECTS.map((s) => (
          <Card key={s.id} className="overflow-hidden">
            <CardHeader>
              <div className="flex items-center gap-3 mb-2">
                <span className="text-3xl" aria-hidden>{s.emoji}</span>
                <div>
                  <CardTitle className="text-lg">{s.title}</CardTitle>
                  <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider">{s.grade}</p>
                </div>
              </div>
              <CardDescription className="text-sm leading-snug">{s.description}</CardDescription>
            </CardHeader>
            <CardContent>
              <Link href={s.href}>
                <Button className="w-full">Перейти</Button>
              </Link>
            </CardContent>
          </Card>
        ))}
      </div>
    </main>
  )
}
