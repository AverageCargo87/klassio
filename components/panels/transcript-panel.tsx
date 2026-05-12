'use client'
// TranscriptPanel — Phase 6.5 chat-style transcript of the voice conversation.
//
// Subscribes to `voice:transcript` events on the lesson bus (emitted by
// VoicePanel on every SDK onMessage callback) and renders them as a scrolling
// chat log. Teacher messages on the left, user (child) messages on the right.
//
// Resets on lesson change (lessonId prop). Within one lesson the list grows
// for the whole session. Auto-scrolls to the latest message on each update.
import { useEffect, useRef, useState } from 'react'
import { MessageSquareText } from 'lucide-react'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { useLessonBus } from '@/lib/lesson-bus'
import type { VoiceTranscriptPayload } from '@/lib/lesson-bus/events'

interface TranscriptEntry extends VoiceTranscriptPayload {
  /** Stable React key — bus payload timestamps can collide if two events fire in the same ms. */
  id: string
}

interface TranscriptPanelProps {
  /** Lesson scope — used as a reset key so transcripts don't bleed between lessons. */
  lessonId: string
}

export function TranscriptPanel({ lessonId }: TranscriptPanelProps) {
  const bus = useLessonBus()
  const [entries, setEntries] = useState<TranscriptEntry[]>([])
  const endRef = useRef<HTMLDivElement | null>(null)
  const counterRef = useRef(0)

  // Reset transcript when lessonId changes (different lesson loaded).
  useEffect(() => {
    setEntries([])
    counterRef.current = 0
  }, [lessonId])

  // Subscribe to voice:transcript events.
  useEffect(() => {
    return bus.on('voice:transcript', (payload) => {
      counterRef.current += 1
      const id = `${payload.timestamp}-${counterRef.current}`
      setEntries((prev) => [...prev, { ...payload, id }])
    })
  }, [bus])

  // Auto-scroll to bottom on new message.
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
  }, [entries.length])

  return (
    <Card className="h-full flex flex-col overflow-hidden">
      <CardHeader className="pb-2 shrink-0">
        <CardTitle className="flex items-center gap-2 text-base font-medium">
          <MessageSquareText className="h-4 w-4" />
          Чат
          {entries.length > 0 && (
            <span className="text-xs font-normal text-muted-foreground ml-auto">
              {entries.length} реплик
            </span>
          )}
        </CardTitle>
      </CardHeader>

      <CardContent className="flex-1 min-h-0 overflow-y-auto px-3 pb-3 pt-0">
        {entries.length === 0 ? (
          <div className="flex h-full items-center justify-center">
            <p className="text-xs text-muted-foreground text-center px-4">
              Когда учитель и ты заговорите, реплики будут появляться тут.
            </p>
          </div>
        ) : (
          <ol className="flex flex-col gap-1.5 text-sm leading-snug">
            {entries.map((e) => {
              // SDK uses 'agent' for the teacher voice; 'user' for the child speaking.
              const isUser = e.role === 'user'
              return (
                <li
                  key={e.id}
                  className={
                    isUser
                      ? 'self-end max-w-[85%] rounded-lg bg-primary/10 px-2.5 py-1.5 text-foreground'
                      : 'self-start max-w-[85%] rounded-lg bg-muted px-2.5 py-1.5 text-foreground'
                  }
                  title={new Date(e.timestamp).toLocaleTimeString('ru-RU')}
                >
                  <span
                    className={
                      'block text-[10px] font-medium mb-0.5 ' +
                      (isUser ? 'text-primary' : 'text-muted-foreground')
                    }
                  >
                    {isUser ? 'Ты' : 'Учитель'}
                  </span>
                  {e.text}
                </li>
              )
            })}
            <div ref={endRef} />
          </ol>
        )}
      </CardContent>
    </Card>
  )
}
