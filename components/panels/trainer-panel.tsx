'use client'
// Trainer placeholder panel — BookOpen icon + bus event counter (D-19).
// D-19: Listens to lesson:test events from VoicePanel (or any emitter) and shows counter.
// Proves cross-panel communication via bus (emit in voice → handler in trainer).
// Will be replaced with real HTML trainer in Phase 7.
import { useState } from 'react'
import { BookOpen } from 'lucide-react'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { useLessonBusEvent } from '@/lib/lesson-bus'

interface TrainerPanelProps {
  lessonId?: string // Optional — Phase 7 trainer integration will use this
}

export function TrainerPanel({ lessonId: _lessonId }: TrainerPanelProps = {}) {
  const [received, setReceived] = useState(0)

  // D-19: listen to lesson:test events from VoicePanel (or any emitter)
  useLessonBusEvent('lesson:test', (_payload) => {
    setReceived((n) => n + 1)
  })

  return (
    <Card className="h-full flex flex-col">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base font-medium">
          <BookOpen className="h-4 w-4" />
          Тренажёр
        </CardTitle>
      </CardHeader>
      <CardContent className="flex-1 flex flex-col items-center justify-center gap-2 text-muted-foreground">
        <BookOpen className="h-10 w-10 opacity-20" />
        <p className="text-sm text-center">
          Тренажёр появится в Phase 7
        </p>
        <p className="text-xs font-medium tabular-nums" aria-live="polite">
          Получено {received} тестовых событий
        </p>
      </CardContent>
    </Card>
  )
}
