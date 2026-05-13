'use client'
// VoicePanel — Phase 6 rewrite (D-05/D-06/D-07, VOI-01) + Phase 8 wiring (D-07/D-08/D-10).
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
//
// Phase 8 additions (plan 08-04):
//   - VoicePanelProps.trainerConfig — used for get_lesson_state + mini-recap topic + dynamicVariables.total_tasks (D-10).
//   - clientTools registered via useConversation — 6 tool surface from buildClientTools (D-07).
//   - dynamicVariables on startSession — { lesson_topic, total_tasks } (D-10).
//   - 3 trainer event subscriptions forward to Nataly via sendContextualUpdate (D-08 allow-list):
//       trainer:answer_submitted, trainer:hint_opened, trainer:idle_15s.
//       trainer:task_focused is NOT subscribed (too noisy — D-08 anti-spec).
//   - 3 state refs (currentTaskIdRef, solvedTaskIdsRef, mistakesRef) feed client tool handlers
//     via injected getters, so handlers always read the latest state without re-registering on
//     every render. Pattern: useRef for side-effect state (no visual output) per PATTERNS.md.
//   - convoCmdRef latches conversation.sendContextualUpdate for stable access inside subscription
//     handlers. Separate from the Phase 6.5 cleanup conversationRef (lines below) — DO NOT MERGE.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ConversationProvider, useConversation } from '@elevenlabs/react'
import { Mic } from 'lucide-react'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { useLessonBus, useLessonBusEvent } from '@/lib/lesson-bus'
import { Avatar } from '@/components/avatar/avatar'
import { useAvatarState } from '@/components/avatar/use-avatar-state'
import type { TrainerConfig } from '@/lib/trainer/config-schema'
import { buildClientTools } from '@/lib/client-tools'
import { getLessonStateSnapshot, type LessonMistake } from '@/lib/lesson-state'
import {
  formatAnswerSubmitted,
  formatHintOpened,
  formatIdle15s,
  formatPeriodicCheckpoint,
} from '@/lib/contextual-updates'
import { startPeriodicCheckpoint } from '@/lib/periodic-checkpoint'
import {
  useVisibilityTrigger,
  useConsecutiveMistakesTrigger,
} from '@/lib/proactive-triggers'

interface VoicePanelProps {
  /** Required as of Phase 6 — lesson page passes it via LessonShell. */
  lessonId: string
  /** Required as of Phase 6 — defense-in-depth fallback for firstMessage if response.topic is empty. */
  topic: string
  /** Phase 8 (D-10 + OQ-4): used for get_lesson_state task topics + dynamicVariables total_tasks.
   *  Null/undefined when the lesson has no trainer config — total_tasks falls back to 0. */
  trainerConfig?: TrainerConfig | null
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
function VoicePanelInner({ lessonId, topic, trainerConfig }: VoicePanelProps) {
  const bus = useLessonBus()
  const [error, setError] = useState<string | null>(null)
  const isStartingRef = useRef(false)

  // ── Phase 8: per-session state refs ─────────────────────────────────────
  // Refs (not state) per PATTERNS.md § useRef for Side-Effect State —
  // no re-renders triggered by mutations; client tool handlers read latest
  // values on each invocation. Source of truth for `get_lesson_state` tool
  // and for the contextual-update formatters reading currentTaskIdRef.
  const currentTaskIdRef = useRef<string>('')
  const solvedTaskIdsRef = useRef<Set<string>>(new Set<string>())
  const mistakesRef = useRef<LessonMistake[]>([])

  // ── Phase 8: latched sendContextualUpdate ref ───────────────────────────
  // Separate from the Phase 6.5 `conversationRef` (cleanup) below — DO NOT MERGE.
  // `conversationRef` is for endSession-on-unmount; `convoCmdRef` is for
  // sendContextualUpdate access inside callbacks. Distinct concerns, distinct
  // refs, so a future maintainer can't collapse one into the other.
  // Seeded with a noop so very first render of useMemo (before useConversation
  // assigns) doesn't crash if Nataly somehow calls a tool synchronously.
  const convoCmdRef = useRef<{ sendContextualUpdate: (text: string) => void }>({
    sendContextualUpdate: () => {},
  })

  // ── Phase 8: trainerConfig-derived helpers ──────────────────────────────
  // Helper: get the canonical task topic string for a given taskId,
  // reading from props. Empty string if unknown — handler falls back to taskId.
  const getTaskTopic = useCallback((taskId: string): string => {
    if (!trainerConfig?.tasks) return ''
    const t = trainerConfig.tasks.find((x) => x.id === taskId)
    return t?.prompt ?? ''
  }, [trainerConfig])

  // Helper: derive task type for contextual-update formatters from taskId.
  // Returns 'numeric-input' as conservative default if unknown.
  const getTaskType = useCallback(
    (taskId: string): 'numeric-input' | 'single-choice' | 'matching' => {
      return trainerConfig?.tasks.find((t) => t.id === taskId)?.type ?? 'numeric-input'
    },
    [trainerConfig],
  )

  // Helper: stringify the correct answer of a given task for the wrong-answer
  // contextual update format. Matching/numeric/choice handled uniformly.
  const getCorrectValue = useCallback(
    (taskId: string): string | undefined => {
      const correct = trainerConfig?.tasks.find((t) => t.id === taskId)?.correct
      if (correct === undefined || correct === null) return undefined
      if (Array.isArray(correct)) return correct.map((p) => p.join('→')).join(',')
      return String(correct)
    },
    [trainerConfig],
  )

  // ── Phase 8: stable client tools ─────────────────────────────────────────
  // Built once via useMemo so the identity stays the same across re-renders.
  // The deps capture only `bus`, `lessonId`, helpers, and trainerConfig.tasks.length
  // (primitive — not the array object, prevents unnecessary re-memoisation).
  // sendContextualUpdate is accessed through the latched convoCmdRef so SDK
  // identity churn doesn't force re-creation.
  const clientTools = useMemo(
    () =>
      buildClientTools({
        bus,
        lessonId,
        sendContextualUpdate: (text: string) => {
          try {
            convoCmdRef.current.sendContextualUpdate(text)
          } catch (err) {
            console.error('[voice-panel] sendContextualUpdate failed:', err)
          }
        },
        getCurrentTaskId: () => currentTaskIdRef.current,
        getSolvedTaskIds: () => solvedTaskIdsRef.current,
        getTaskTopic,
        getState: () =>
          getLessonStateSnapshot(
            currentTaskIdRef.current,
            solvedTaskIdsRef.current,
            mistakesRef.current,
            trainerConfig?.tasks?.length ?? 0,
          ),
      }),
    [bus, lessonId, getTaskTopic, trainerConfig?.tasks?.length],
  )

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

  // Phase 6.5: surface each agent/user message on the bus so TranscriptPanel
  // can show a chat-style log. The SDK's MessagePayload has `role: 'user'|'agent'`
  // (and deprecated `source: 'user'|'ai'`). Empty messages are skipped.
  const handleMessage = useCallback(
    (payload: { message: string; role: 'user' | 'agent' }) => {
      const text = (payload?.message ?? '').trim()
      if (!text) return
      bus.emit('voice:transcript', { text, role: payload.role, timestamp: Date.now() })
    },
    [bus],
  )

  // ── The SDK hook — useConversation auto-registers our callbacks with the
  //    surrounding ConversationProvider (see SDK comment "Callbacks ... are also
  //    registered with the provider so they stay up-to-date across re-renders").
  //    We re-pass the same stable refs here so the test mock captures them.
  //    Phase 8: clientTools passes the 6-tool surface — IDs must match the
  //    agent config in scripts/restore-agent-config-body.mjs PHASE_8_TOOLS.
  const conversation = useConversation({
    clientTools, // Phase 8 D-07 — 6 client tools registered with the SDK
    onConnect: handleConnect,
    onDisconnect: handleDisconnect,
    onModeChange: handleModeChange,
    onMessage: handleMessage,
    onError: handleError,
  })

  // Latch latest conversation.sendContextualUpdate for use inside bus subscription
  // handlers. Runs on every render — `convoCmdRef.current` is a value swap, not
  // a re-subscribe, so it does NOT trigger the Phase 6.5 cleanup-bug pattern.
  convoCmdRef.current = conversation as unknown as {
    sendContextualUpdate: (text: string) => void
  }

  // Avatar consumes bus state via Phase 9 contract — call AFTER the SDK hook
  // so the bus is wired by the time the avatar starts observing it.
  const avatarState = useAvatarState()

  // ── Phase 8 D-08: trainer event forwarding to Nataly via sendContextualUpdate ──
  // Allow-list (3 events): answer_submitted, hint_opened, idle_15s.
  // NOT subscribing to task_focused per D-08 — too noisy (each click would fire).
  // useLessonBusEvent (Phase 7 hook) wraps useEffect cleanly with deps [bus, event, handler];
  // useCallback keeps handler identities stable so re-renders do not re-subscribe.

  const handleAnswerSubmitted = useCallback(
    ({ taskId, value, correct }: { taskId: string; value: string; correct: boolean }) => {
      currentTaskIdRef.current = taskId
      const taskType = getTaskType(taskId)
      if (correct) {
        // Promote into solved set (idempotent on duplicate emits).
        solvedTaskIdsRef.current.add(taskId)
        try {
          convoCmdRef.current.sendContextualUpdate(
            formatAnswerSubmitted({ taskId, value, correct: true }, taskType),
          )
        } catch (err) {
          console.error('[voice-panel] forward answer (ok):', err)
        }
      } else {
        const correctValue = getCorrectValue(taskId)
        mistakesRef.current.push({ taskId, value, correct: correctValue ?? '?' })
        // Trim to last 10 — formatter further trims to last 3, but keep
        // the ref bounded to avoid unbounded growth across a 45-min lesson.
        if (mistakesRef.current.length > 10) {
          mistakesRef.current.splice(0, mistakesRef.current.length - 10)
        }
        try {
          convoCmdRef.current.sendContextualUpdate(
            formatAnswerSubmitted(
              { taskId, value, correct: false },
              taskType,
              { correctValue },
            ),
          )
        } catch (err) {
          console.error('[voice-panel] forward answer (wrong):', err)
        }
      }
    },
    [getTaskType, getCorrectValue],
  )
  useLessonBusEvent('trainer:answer_submitted', handleAnswerSubmitted)

  const handleHintOpened = useCallback(
    ({ taskId, hintLevel }: { taskId: string; hintLevel: number }) => {
      try {
        convoCmdRef.current.sendContextualUpdate(
          formatHintOpened({ taskId, hintLevel }),
        )
      } catch (err) {
        console.error('[voice-panel] forward hint_opened:', err)
      }
    },
    [],
  )
  useLessonBusEvent('trainer:hint_opened', handleHintOpened)

  const handleIdle15s = useCallback(() => {
    const taskId = currentTaskIdRef.current || '(start)'
    try {
      convoCmdRef.current.sendContextualUpdate(formatIdle15s({ taskId }))
    } catch (err) {
      console.error('[voice-panel] forward idle_15s:', err)
    }
  }, [])
  useLessonBusEvent('trainer:idle_15s', handleIdle15s)

  // ── Phase 8 D-03 channel #4: periodic checkpoint every ~10 minutes ──────
  // Anchors fresh state at the tail of Nataly's context window. Runs only
  // while the session is active — starts on 'connected', clears on disconnect.
  //
  // SAFETY: dep is conversation.STATUS (string primitive — 'disconnected' |
  // 'connecting' | 'connected' | 'disconnecting'), NOT conversation (object).
  // This is the ONLY useEffect in this file with conversation-derived deps;
  // it is safe because string identity changes only on actual transitions,
  // not on every SDK mode-change. Phase 6.5 cleanup-bug pattern preserved.
  //
  // The first tick fires at T+10min (NOT T+0) — no spammy welcome update.
  // Reads from refs INSIDE the tick so latest counts are always seen
  // (refs are reference-stable; closure captures the ref itself, not its value).
  useEffect(() => {
    if (conversation.status !== 'connected') return
    const cleanup = startPeriodicCheckpoint(({ elapsedMinutes }) => {
      try {
        const totalTasks = trainerConfig?.tasks?.length ?? 0
        const solvedCount = solvedTaskIdsRef.current.size
        const mistakeCount = mistakesRef.current.length
        convoCmdRef.current.sendContextualUpdate(
          formatPeriodicCheckpoint({ elapsedMinutes, solvedCount, totalTasks, mistakeCount }),
        )
      } catch (err) {
        console.error('[voice-panel] periodic checkpoint failed:', err)
      }
    })
    return cleanup
  }, [conversation.status, trainerConfig?.tasks?.length])

  // ── Phase 8 PED-02: proactive trigger #1 — page-visibility change ────────
  // Child switches tabs, minimises, or locks the screen → visibilityState
  // becomes 'hidden'. We forward this to Nataly via sendContextualUpdate so
  // she can call him back when she next reasons about her turn. Hook is
  // mount-scoped (empty-deps useEffect inside the lib hook); fires regardless
  // of conversation status. If the session is disconnected, the latched
  // convoCmdRef.current.sendContextualUpdate is the seeded noop until SDK
  // assigns the real fn — try/catch swallows any transient errors.
  //
  // Russian payload string matches the system-prompt addendum from plan 08-03
  // § 9.5 verbatim — any drift means Nataly's behavioral rule won't match.
  const handleVisibilityHidden = useCallback(() => {
    try {
      convoCmdRef.current.sendContextualUpdate('Ребёнок переключился на другую вкладку')
    } catch (err) {
      console.error('[voice-panel] visibility trigger:', err)
    }
  }, [])
  useVisibilityTrigger(handleVisibilityHidden)

  // ── Phase 8 PED-02: proactive trigger #2 — consecutive wrong answers ─────
  // REQUIREMENTS.md PED-02 acceptance #1 item 3: "неправильные ответы подряд
  // (≥ 2)". Hook subscribes to trainer:answer_submitted and tracks the streak
  // per taskId via useRef. Fires ONCE per fresh threshold hit (latch flag
  // inside the lib hook); resets on correct answer or task switch.
  //
  // Russian payload string matches plan 08-03 § 9.5 addendum verbatim: the
  // double ✗✗ marker + "ошибки подряд" tells Nataly this is the 2-mistakes
  // proactive trigger, distinct from the single-wrong-answer sendContextual
  // forwarder above (which uses single ✗).
  const handleMistakeStreak = useCallback(
    ({ taskId, count }: { taskId: string; count: number }) => {
      try {
        convoCmdRef.current.sendContextualUpdate(`✗✗ ${taskId}: ${count} ошибки подряд`)
      } catch (err) {
        console.error('[voice-panel] mistake-streak trigger:', err)
      }
    },
    [],
  )
  useConsecutiveMistakesTrigger(handleMistakeStreak)

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
        dynamicVariables: {
          // D-10: only lesson_topic + total_tasks for v1. task_summaries deferred.
          // child_name explicitly excluded per D-10 (whitelist model — no PII in v1).
          lesson_topic: data.topic || topic,
          total_tasks: trainerConfig?.tasks?.length ?? 0,
        },
      })
    } catch (err) {
      console.error('[voice-panel] start failed:', err)
      setError('Ошибка голосового сервиса. Попробуйте снова.')
    } finally {
      isStartingRef.current = false
    }
  }, [conversation, lessonId, topic, trainerConfig])

  // ── Stop handler ────────────────────────────────────────────────────────
  const handleStop = useCallback(() => {
    try {
      conversation.endSession()
    } catch (err) {
      console.error('[voice-panel] stop failed:', err)
    }
  }, [conversation])

  // ── Cleanup effect (Pitfall 7 — mic indicator stays red on unmount) ─────
  // Phase 6.5 bugfix: previously this effect had `[conversation]` in its deps.
  // `conversation` is a React object whose identity changes on EVERY status/mode
  // update from the SDK. So the moment SDK fires onConnect → status flips
  // 'connecting' → 'connected', React detects a new `conversation` reference,
  // runs the PRIOR cleanup (which sees status==='connecting'/'connected') and
  // immediately calls endSession() — killing the WS ~625ms after open. The bug
  // existed since Phase 6 but stayed invisible because Cloudflare cut the WS
  // before onConnect ever fired. With the proxy in place we finally see it.
  //
  // Fix: latch the latest conversation into a ref and run cleanup ONLY on real
  // unmount with empty deps. The ref dodges the stale-closure trap.
  //
  // DO NOT TOUCH — this is the locked latched-ref pattern from Phase 6.5.
  // Phase 8 added a SEPARATE convoCmdRef for sendContextualUpdate access in
  // callbacks (above) — distinct concerns, distinct refs.
  const conversationRef = useRef(conversation)
  conversationRef.current = conversation
  useEffect(() => {
    return () => {
      const c = conversationRef.current
      if (c.status === 'connected' || c.status === 'connecting') {
        try {
          c.endSession()
        } catch (err) {
          console.error('[voice-panel] cleanup endSession:', err)
        }
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

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
export function VoicePanel({ lessonId, topic, trainerConfig }: VoicePanelProps) {
  return (
    <ConversationProvider>
      <VoicePanelInner lessonId={lessonId} topic={topic} trainerConfig={trainerConfig} />
    </ConversationProvider>
  )
}
