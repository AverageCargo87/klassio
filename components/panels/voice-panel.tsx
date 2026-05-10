'use client'
// Voice placeholder panel — Mic icon + bus test button (D-18, D-20).
// D-18: "Тест шины" button emits lesson:test with incrementing counter.
// D-20: Button visible when NEXT_PUBLIC_LESSON_BUS_TEST !== 'false' (default: visible).
// Will be replaced with real voice+avatar in Phase 6.
import { useState } from 'react'
import { Mic } from 'lucide-react'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { useLessonBus } from '@/lib/lesson-bus'

// Check at module load time — env var is frozen in Next.js bundle at build time
const SHOW_TEST_BUTTON = process.env.NEXT_PUBLIC_LESSON_BUS_TEST !== 'false'

interface VoicePanelProps {
  lessonId?: string // Optional — Phase 6 voice integration will use this
}

export function VoicePanel({ lessonId: _lessonId }: VoicePanelProps = {}) {
  const bus = useLessonBus()
  const [counter, setCounter] = useState(0)

  function handleTestBus() {
    const next = counter + 1
    setCounter(next)
    bus.emit('lesson:test', { source: 'voice', counter: next })
  }

  return (
    <Card className="h-full flex flex-col">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base font-medium">
          <Mic className="h-4 w-4" />
          Голос
        </CardTitle>
      </CardHeader>
      <CardContent className="flex-1 flex flex-col items-center justify-center gap-3 text-muted-foreground">
        <Mic className="h-10 w-10 opacity-20" />
        <p className="text-sm text-center">
          Голос и аватар появятся в Phase 6
        </p>
        {SHOW_TEST_BUTTON && (
          <Button size="sm" variant="outline" onClick={handleTestBus}>
            Тест шины
          </Button>
        )}
      </CardContent>
    </Card>
  )
}
