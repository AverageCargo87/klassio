'use client'
// VoicePanel — Phase 9 rewrite (D-07).
// Layout: Avatar (top half) + voice control area (bottom half).
// Voice controls are placeholders for Phase 6 real mic integration.
// Test bus button kept behind NEXT_PUBLIC_LESSON_BUS_TEST flag (D-07 compat).
//
// window.__lessonBus is exposed by LessonBusProvider in non-prod (A4, D-11)
// so Playwright E2E can emit events without clicking the UI button.
import { useState } from 'react'
import { Mic } from 'lucide-react'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { useLessonBus } from '@/lib/lesson-bus'
import { Avatar } from '@/components/avatar/avatar'
import { useAvatarState } from '@/components/avatar/use-avatar-state'

// Check at module load time — env var is frozen in Next.js bundle at build time
const SHOW_TEST_BUTTON = process.env.NEXT_PUBLIC_LESSON_BUS_TEST !== 'false'

interface VoicePanelProps {
  lessonId?: string // Optional — Phase 6 voice integration will use this
}

export function VoicePanel({ lessonId: _lessonId }: VoicePanelProps = {}) {
  const bus = useLessonBus()
  const [counter, setCounter] = useState(0)
  const avatarState = useAvatarState()

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

      <CardContent className="flex-1 flex flex-col gap-4 min-h-0">
        {/* TOP HALF — Avatar */}
        <div className="flex-1 flex items-center justify-center">
          <Avatar state={avatarState} />
        </div>

        {/* BOTTOM HALF — Voice controls (Phase 6 placeholder) */}
        <div className="flex flex-col items-center gap-2 pb-2">
          {/* TODO Phase 6: replace with real mic button + voice status indicator */}
          <div className="flex items-center gap-2 text-muted-foreground">
            <Mic className="h-5 w-5 opacity-30" />
            <span className="text-xs">Голосовой агент появится в Phase 6</span>
          </div>

          {SHOW_TEST_BUTTON && (
            <Button size="sm" variant="outline" onClick={handleTestBus}>
              Тест шины
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
