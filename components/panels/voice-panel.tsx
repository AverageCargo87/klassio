'use client'
// VoicePanel — Phase 6 rewrite (D-05/D-06/D-07, VOI-01).
// Layout: Avatar (top half — Phase 9 contract unchanged) + voice control area (bottom half).
// Bottom half: real mic Start/Stop button + status text + error block.
// Flow: click Start → getUserMedia → POST /api/voice/signed-url → useConversation.startSession.
// SDK callbacks emit 'voice:state' events on the lesson bus (Avatar subscribes via Phase 9 contract).
// window.__lessonBus is exposed by LessonBusProvider in non-prod (Phase 9, D-11) so Playwright
// E2E can simulate SDK callbacks without hitting real 11labs (11labs daily call limit is 100 — D-08).
//
// Per RESEARCH § Pattern 1 + § Pitfall 1/3/4/7 + PHASE-6-SETUP § 12 plan scope.
// Per RESEARCH Open Q3 — onConnect maps to 'idle' (we do NOT extend the voice:state union with 'connected').
// Per RESEARCH Open Q4 — firstMessage uses topic from the route response (server-authoritative),
//   falling back to the prop only if response.topic is empty.
//
// SDK API note (verified against node_modules/@elevenlabs/react@1.6.0 dist on 2026-05-11):
//   useConversation now requires ConversationProvider as an ancestor. startSession/endSession
//   are fire-and-forget (return void). Callback signatures:
//     onConnect    (props: { conversationId: string }) => void
//     onDisconnect (details: DisconnectionDetails)      => void
//     onModeChange (prop:   { mode: 'speaking'|'listening' }) => void
//     onError      (message: string, context?: any)     => void
//   We thread our callbacks through ConversationProvider so they survive across sessions.
import { useCallback, useEffect, useRef, useState } from 'react'
import { ConversationProvider, useConversation } from '@elevenlabs/react'
import { Mic } from 'lucide-react'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { useLessonBus } from '@/lib/lesson-bus'
import { Avatar } from '@/components/avatar/avatar'
import { useAvatarState } from '@/components/avatar/use-avatar-state'

interface VoicePanelProps {
  /** Required as of Phase 6 — lesson page passes it via LessonShell. */
  lessonId: string
  /** Required as of Phase 6 — defense-in-depth fallback for firstMessage if response.topic is empty. */
  topic: string
}

/**
 * Map a `getUserMedia` rejection into a Russian error message (RESEARCH § Pitfall 1).
 * Returns one of 4 distinct messages keyed off DOMException.name.
 */
async function requestMicPermission(): Promise<
  { ok: true } | { ok: false; message: string }
> {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
    // Release the stream — the SDK will request its own when WS opens.
    stream.getTracks().forEach((t) => t.stop())
    return { ok: true }
  } catch (err) {
    const e = err as { name?: string; message?: string }
    if (e?.name === 'NotAllowedError') {
      return {
        ok: false,
        message:
          'Доступ к микрофону запрещён. Разрешите его в настройках браузера и попробуйте снова.',
      }
    }
    if (e?.name === 'NotFoundError') {
      return {
        ok: false,
        message: 'Микрофон не найден. Подключите микрофон и попробуйте снова.',
      }
    }
    if (e?.name === 'NotReadableError') {
      return {
        ok: false,
        message:
          'Микрофон занят другим приложением (Zoom, Discord). Закройте его и попробуйте снова.',
      }
    }
    return {
      ok: false,
      message:
        'Не удалось получить доступ к микрофону. Попробуйте перезагрузить страницу.',
    }
  }
}

/**
 * Inner panel — must live inside ConversationProvider so useConversation works.
 * Holds the Start/Stop button, status text, error block, and SDK plumbing.
 */
function VoicePanelInner({ lessonId, topic }: VoicePanelProps) {
  const bus = useLessonBus()
  const [error, setError] = useState<string | null>(null)
  const isStartingRef = useRef(false)

  // ── Stable SDK callbacks (Pitfall 4 — prevents stale closures) ──────────
  // bus.emit is the only dep; bus itself is from React context (stable).
  const handleConnect = useCallback(() => {
    // RESEARCH Open Q3 — emit 'idle' until first onModeChange fires.
    bus.emit('voice:state', { state: 'idle' })
  }, [bus])

  const handleModeChange = useCallback(
    ({ mode }: { mode: 'speaking' | 'listening' }) => {
      bus.emit('voice:state', { state: mode })
    },
    [bus],
  )

  const handleDisconnect = useCallback(() => {
    bus.emit('voice:state', { state: 'idle' })
  }, [bus])

  const handleError = useCallback(
    (message: string, _context?: unknown) => {
      console.error('[voice-panel] SDK error:', message, _context)
      bus.emit('voice:state', { state: 'idle' }) // fail-safe — avatar back to 🙂
      setError('Ошибка голосового сервиса. Попробуйте снова.')
    },
    [bus],
  )

  // ── The SDK hook — useConversation auto-registers our callbacks with the
  //    surrounding ConversationProvider (see SDK comment "Callbacks ... are also
  //    registered with the provider so they stay up-to-date across re-renders").
  //    We re-pass the same stable refs here so the test mock captures them.
  const conversation = useConversation({
    onConnect: handleConnect,
    onDisconnect: handleDisconnect,
    onModeChange: handleModeChange,
    onError: handleError,
  })

  // Avatar consumes bus state via Phase 9 contract — call AFTER the SDK hook
  // so the bus is wired by the time the avatar starts observing it.
  const avatarState = useAvatarState()

  // ── Start handler ───────────────────────────────────────────────────────
  const handleStart = useCallback(async () => {
    if (isStartingRef.current) return
    isStartingRef.current = true
    setError(null)
    try {
      // STEP 1: mic permission BEFORE anything else (RESEARCH Pitfall 1).
      const mic = await requestMicPermission()
      if (!mic.ok) {
        setError(mic.message)
        return
      }
      // STEP 2: fresh signed URL (Pitfall 2 — 15-min TTL).
      const res = await fetch('/api/voice/signed-url', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lessonId }),
      })
      if (!res.ok) {
        setError('Не удалось получить ссылку. Попробуйте снова.')
        return
      }
      const data = (await res.json()) as { signedUrl: string; topic: string }
      // STEP 3: start the session. firstMessage override is intentionally
      // omitted — Phase 6 UAT (2026-05-11) showed empty `agent: {}` override
      // is fine and the agent's built-in First Message kicks in. Topic
      // injection — Phase 6.5 follow-up after Hetzner proxy unblocks UAT.
      void topic
      void data.topic
      conversation.startSession({
        signedUrl: data.signedUrl,
        connectionType: 'websocket', // CRITICAL — RESEARCH Pitfall 3
      })
    } catch (err) {
      console.error('[voice-panel] start failed:', err)
      setError('Ошибка голосового сервиса. Попробуйте снова.')
    } finally {
      isStartingRef.current = false
    }
  }, [conversation, lessonId, topic])

  // ── Stop handler ────────────────────────────────────────────────────────
  const handleStop = useCallback(() => {
    try {
      conversation.endSession()
    } catch (err) {
      console.error('[voice-panel] stop failed:', err)
    }
  }, [conversation])

  // ── Cleanup effect (Pitfall 7 — mic indicator stays red on unmount) ─────
  useEffect(() => {
    return () => {
      if (
        conversation.status === 'connected' ||
        conversation.status === 'connecting'
      ) {
        try {
          conversation.endSession()
        } catch (err) {
          console.error('[voice-panel] cleanup endSession:', err)
        }
      }
    }
  }, [conversation])

  // ── Derive UI state ─────────────────────────────────────────────────────
  const isActive =
    conversation.status === 'connected' || conversation.status === 'connecting'
  const statusText =
    conversation.status === 'connecting'
      ? 'Подключаемся…'
      : conversation.status === 'connected' && conversation.mode === 'speaking'
        ? 'Говорю…'
        : conversation.status === 'connected' && conversation.mode === 'listening'
          ? 'Слушаю…'
          : 'Готов к запуску'

  return (
    <Card className="h-full flex flex-col">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base font-medium">
          <Mic className="h-4 w-4" />
          Голос
        </CardTitle>
      </CardHeader>

      <CardContent className="flex-1 flex flex-col gap-2 min-h-0 overflow-hidden">
        {/* TOP HALF — Avatar (Phase 9 contract unchanged) */}
        <div className="flex-1 min-h-0 flex items-center justify-center">
          <Avatar state={avatarState} />
        </div>

        {/* BOTTOM HALF — Voice controls. shrink-0 prevents Avatar (flex-1) from
            squashing them to 0 height when the right column is short (Phase 6 fix). */}
        <div className="flex flex-col items-center gap-2 pb-2 shrink-0">
          <span className="text-xs text-muted-foreground">{statusText}</span>

          {!isActive && (
            <Button size="sm" onClick={handleStart}>
              <Mic className="h-4 w-4 mr-1" />
              Запустить голос
            </Button>
          )}

          {isActive && (
            <Button size="sm" variant="outline" onClick={handleStop}>
              Стоп
            </Button>
          )}

          {error && (
            <div className="rounded border border-destructive/50 bg-destructive/10 px-2.5 py-1.5 text-xs text-destructive max-w-full text-center">
              <span className="font-semibold">Ошибка: </span>
              {error}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  )
}

/**
 * VoicePanel — public component. Wraps inner panel in ConversationProvider so
 * useConversation has the required context.
 */
export function VoicePanel({ lessonId, topic }: VoicePanelProps) {
  return (
    <ConversationProvider>
      <VoicePanelInner lessonId={lessonId} topic={topic} />
    </ConversationProvider>
  )
}
