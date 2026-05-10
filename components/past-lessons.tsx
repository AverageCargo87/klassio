'use client'

import { useState } from 'react'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { Card, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { ChevronDown, ChevronRight } from 'lucide-react'

// ISO string representation — Date objects cannot cross the RSC→Client boundary
export type SerializedLesson = {
  id: string
  topic: string
  scheduledAt: string // ISO string serialized from server
  status: string
}

const STATUS_LABELS: Record<string, string> = {
  completed: 'Проведён',
  cancelled: 'Отменён',
  missed: 'Пропущен',
  in_progress: 'Идёт',
  scheduled: 'Запланирован',
}

export function PastLessons({ lessons }: { lessons: SerializedLesson[] }) {
  // D-05: collapsed by default
  const [open, setOpen] = useState(false)

  if (lessons.length === 0) {
    return (
      <section className="mt-8">
        <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wide mb-3">
          Прошедшие уроки
        </h2>
        <p className="text-muted-foreground text-sm">Прошедших уроков пока нет.</p>
      </section>
    )
  }

  return (
    <section className="mt-8">
      <Collapsible open={open} onOpenChange={(nextOpen) => setOpen(nextOpen)}>
        <CollapsibleTrigger
          className="flex items-center gap-2 text-sm font-medium text-muted-foreground uppercase tracking-wide mb-3 hover:text-foreground transition-colors w-full text-left bg-transparent border-0 cursor-pointer p-0"
        >
          {open ? (
            <ChevronDown className="h-4 w-4" />
          ) : (
            <ChevronRight className="h-4 w-4" />
          )}
          Прошедшие уроки ({lessons.length})
        </CollapsibleTrigger>
        <CollapsibleContent>
          {lessons.map((lesson) => (
            <Card key={lesson.id} className="mb-3 opacity-70">
              <CardHeader>
                <CardTitle>{lesson.topic}</CardTitle>
                <CardDescription>
                  {new Date(lesson.scheduledAt).toLocaleString('ru-RU', {
                    dateStyle: 'long',
                    timeStyle: 'short',
                  })}
                  {' · '}
                  {STATUS_LABELS[lesson.status] ?? lesson.status}
                </CardDescription>
              </CardHeader>
              <div className="px-6 pb-4">
                <p className="text-xs text-muted-foreground italic">
                  Запись урока появится в будущем обновлении.
                </p>
              </div>
            </Card>
          ))}
        </CollapsibleContent>
      </Collapsible>
    </section>
  )
}
