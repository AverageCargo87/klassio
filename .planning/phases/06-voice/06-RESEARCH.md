# Phase 6: Голос — 11labs Conversational AI (Klassio frontend integration) — Research

**Researched:** 2026-05-11
**Domain:** Realtime voice conversational AI integration (browser ↔ 11labs WebSocket/WebRTC via Next.js App Router)
**Confidence:** HIGH

## Summary

Все ключевые внешние артефакты Phase 6 уже залочены и протестированы: 11labs agent `agent_7701kr9c2v7eev3tabzv4f2b0e8b` работает в Test UI с финальным System Prompt, голосом Nataly, Multilingual v2, GPT-4.1 mini через Custom LLM endpoint. Эта фаза — чистая фронтенд-интеграция через официальный SDK `@elevenlabs/react@1.6.0` (опубликован 2026-05-08, 3 дня назад). Канонический поток: server-side route handler `/api/voice/signed-url` дёргает `GET https://api.elevenlabs.io/v1/convai/conversation/get-signed-url?agent_id=...` с `xi-api-key` хедером → клиент получает signed URL (TTL 15 минут) → передаёт в `useConversation().startSession({ signedUrl, connectionType: 'websocket', overrides: { agent: { firstMessage: '...' } } })`. SDK сам управляет mic, audio playback, и эмитит реактивный `status` + `mode` (`'speaking' | 'listening'`) + 13 callbacks. Bus event wiring примитивен: `onConnect → voice:state 'idle'` (mic permission ещё не получен — это не "connected"), `onModeChange({mode:'listening'}) → voice:state 'listening'`, и т.д.

**Primary recommendation:** Используй `@elevenlabs/react@1.6.0` + ConversationProvider в корне LessonShell, `useConversation` в VoicePanel; вызывай `navigator.mediaDevices.getUserMedia({audio:true})` ПЕРЕД `startSession` для явного запроса разрешения; передавай `connectionType: 'websocket'` (signedUrl работает только с WebSocket — для WebRTC нужен другой эндпойнт `/conversation/token`); используй `overrides.agent.firstMessage` для темы урока (НЕ dynamic variables — System Prompt уже finalize и они не настроены в агенте).

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Signed URL generation (11labs API call с API key) | API / Backend (Next.js Route Handler) | — | API key must NEVER reach browser (CON-keys-server-only, D-05) |
| Lesson ownership check | API / Backend | Database | Drizzle query against `lesson` table — same pattern as `/api/draw` |
| Browser mic capture + audio playback | Browser / Client | — | Web Audio API only works browser-side; SDK handles via getUserMedia + AudioContext |
| WebSocket connection management | Browser / Client | — | Signed URL embedded in WS handshake; SDK does it inside |
| Voice state → avatar UI sync | Browser / Client | — | LessonBus pub/sub (Phase 9 contract); no server round-trip needed |
| First message customization (lesson topic) | Browser / Client (sends overrides via SDK) | API / Backend (returns topic in signed-url response) | Override travels in WS conversation_initiation_client_data — set by SDK on `startSession` |

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `@elevenlabs/react` | `^1.6.0` (latest 2026-05-08) | React hook SDK for 11labs Conversational AI agents | Official 11labs package; replaces deprecated `@11labs/react`; re-exports everything from `@elevenlabs/client` |
| (transitive) `@elevenlabs/client` | `1.7.0` (auto-installed) | Core JS SDK + livekit-client for WebRTC | Auto-bundled — DO NOT install separately |

**Verified via `npm view @elevenlabs/react`:**
```
@elevenlabs/react@1.6.0 | MIT | deps: 1 | versions: 56
published 3 days ago by GitHub Actions
dependencies: @elevenlabs/client: 1.7.0
unpackedSize: 252.8 kB
```

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `vitest` | already installed | Unit-mock `@elevenlabs/react` SDK | Wave 0 + every component test |
| `@playwright/test` | `^1.59.1` already | E2E via `window.__lessonBus.emit` (Phase 9 pattern) | E2E spec; SDK is mocked OR network-stubbed |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `@elevenlabs/react` SDK hook | Raw WebSocket to signed URL + manual VAD | `[VERIFIED: github.com/elevenlabs/packages]` SDK handles audio worklet, VAD, AudioContext lifecycle, mic switching, volume control, debug events — re-implementing this is 1000+ lines and brittle. Don't hand-roll. |
| `connectionType: 'webrtc'` (SDK default for voice) | `connectionType: 'websocket'` + signedUrl | `[VERIFIED: docs.elevenlabs.io]` WebRTC default needs `/v1/convai/conversation/token` endpoint (returns `token`, NOT URL); signedUrl works ONLY with WebSocket. We pick **WebSocket+signedUrl** because (1) PHASE-6-SETUP § 7 already configured for signed URL, (2) WebRTC adds complexity for marginal latency benefit, (3) Hetzner WS proxy в Phase 6.5 — это WS-proxy, не WebRTC SFU. |
| `overrides.agent.prompt.prompt` | `dynamicVariables: { lesson_topic: '...' }` | `[CITED: elevenlabs.io/docs dynamic-variables]` Dynamic variables — recommended path for personalization. НО (a) PHASE-6-SETUP финализированный System Prompt не содержит `{{lesson_topic}}` placeholder; (b) Security tab настроена с First message=ON, остальные OFF; (c) меньше площадь атаки для prompt injection. **Используем `overrides.agent.firstMessage`** (D-06). |

**Installation:**
```bash
npm install @elevenlabs/react@^1.6.0
```

(Single dependency — `@elevenlabs/client` and `livekit-client` come transitively.)

## Architecture Patterns

### System Architecture Diagram

```
                ┌──────────────────────────────────────┐
                │  Browser (lesson page)               │
                │                                      │
   user clicks  │  ┌────────────┐                      │
   "Запустить ──┼─►│ VoicePanel │                      │
   голос"       │  │ (Client)   │                      │
                │  └─────┬──────┘                      │
                │        │ 1. getUserMedia({audio})    │
                │        │    [mic permission UX]      │
                │        ▼                             │
                │  ┌────────────────────┐              │
                │  │ fetch              │              │
                │  │ POST /api/voice/   │  ────────┐   │
                │  │      signed-url    │          │   │
                │  └────────────────────┘          │   │
                │                                  │   │
                └──────────────────────────────────┼───┘
                                                   │
                                                   ▼
                ┌──────────────────────────────────────┐
                │  Vercel Edge / Node serverless       │
                │                                      │
                │  ┌────────────────────┐              │
                │  │ /api/voice/        │              │
                │  │ signed-url         │              │
                │  │   - auth() guard   │              │
                │  │   - ownership chk  │              │
                │  │   - read env       │              │
                │  │     ELEVENLABS_*   │              │
                │  └────────┬───────────┘              │
                │           │                          │
                │           │ GET /v1/convai/...       │
                │           │ xi-api-key: sk_...       │
                │           ▼                          │
                └───────────┼──────────────────────────┘
                            │
                            ▼
                ┌──────────────────────────────────────┐
                │ api.elevenlabs.io                    │
                │   - returns { signed_url }           │
                │   - TTL = 15 min                     │
                └──────────────────────────────────────┘
                            │
                            ▼ JSON { signedUrl, topic }
                ┌──────────────────────────────────────┐
                │ Browser — back in VoicePanel         │
                │                                      │
                │  2. conversation.startSession({      │
                │       signedUrl,                     │
                │       connectionType: 'websocket',   │
                │       overrides: {                   │
                │         agent: {                     │
                │           firstMessage: `Привет!     │
                │             Сегодня у нас: ${topic}` │
                │         }                            │
                │       }                              │
                │     })                               │
                │                                      │
                │           ┌───── WebSocket ──────┐   │
                │           │  (signed URL host)   │   │
                │           └──────────┬───────────┘   │
                │                      │               │
                │  3. SDK callbacks ◄──┘               │
                │                                      │
                │     onConnect       → bus.emit       │
                │     onModeChange    →   'voice:state'│
                │     onMessage       →                │
                │     onError         →                │
                │     onDisconnect    →                │
                │                                      │
                │                  ▼                   │
                │           ┌─────────────┐            │
                │           │ LessonBus   │            │
                │           │  voice:state│            │
                │           └──────┬──────┘            │
                │                  │                   │
                │                  ▼                   │
                │           ┌──────────────┐           │
                │           │ Avatar       │           │
                │           │ (Phase 9)    │           │
                │           │ 🙂 👂 🗣️    │           │
                │           └──────────────┘           │
                └──────────────────────────────────────┘
```

### Recommended Project Structure
```
app/api/voice/
└── signed-url/
    └── route.ts                 # POST — auth + ownership + 11labs API call
                                 #        (NOT GET — we need lessonId in body)
lib/elevenlabs/
├── get-signed-url.ts            # Server util: fetch to api.elevenlabs.io
├── types.ts                     # SDK callback types (Mode, ConversationStatus)
└── __tests__/
    └── get-signed-url.test.ts   # Unit: mock fetch, verify URL + headers
components/panels/
└── voice-panel.tsx              # REWRITE: useConversation + mic button + bus wiring
e2e/
└── voice-flow.spec.ts           # E2E: SDK-mocked (Phase 9 pattern) — bus event flow
```

### Pattern 1: `useConversation` Hook in Client Component
**What:** Single hook providing all conversation state + actions. Returns `status`, `mode`, `isSpeaking`, `startSession`, `endSession`, plus side-effect callbacks.
**When to use:** Any component that owns voice lifecycle (mount/unmount = no auto-cleanup; YOU must call `endSession`).
**Example:**
```tsx
// Source: https://elevenlabs.io/docs/eleven-agents/libraries/react (verified 2026-05-11)
'use client'
import { useConversation } from '@elevenlabs/react'
import { useCallback } from 'react'

export function VoicePanel({ lessonId, topic }: { lessonId: string; topic: string }) {
  const conversation = useConversation({
    onConnect: () => console.log('Connected'),
    onDisconnect: () => console.log('Disconnected'),
    onMessage: (message) => console.log('Message:', message),
    onError: (error) => console.error('Error:', error),
    onModeChange: ({ mode }) => console.log('Mode:', mode), // 'speaking' | 'listening'
  })

  const startConversation = useCallback(async () => {
    try {
      // STEP 1: Request mic permission BEFORE startSession.
      // SDK does NOT do this for you in 1.x — host app must.
      await navigator.mediaDevices.getUserMedia({ audio: true })

      // STEP 2: Fetch signed URL from our backend
      const res = await fetch('/api/voice/signed-url', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lessonId }),
      })
      if (!res.ok) throw new Error('Failed to get signed URL')
      const { signedUrl } = await res.json()

      // STEP 3: Start the session
      await conversation.startSession({
        signedUrl,
        connectionType: 'websocket',  // CRITICAL: signedUrl only works with WebSocket
        overrides: {
          agent: {
            firstMessage: `Привет! Сегодня у нас тема: ${topic}. Тебя как зовут?`,
          },
        },
      })
    } catch (err) {
      console.error('Failed to start conversation:', err)
    }
  }, [conversation, lessonId, topic])

  const stopConversation = useCallback(async () => {
    await conversation.endSession()
  }, [conversation])

  return (
    <div>
      <button onClick={startConversation} disabled={conversation.status === 'connected'}>
        Запустить голос
      </button>
      <button onClick={stopConversation} disabled={conversation.status !== 'connected'}>
        Стоп
      </button>
      <p>Статус: {conversation.status}</p>
    </div>
  )
}
```

### Pattern 2: Server Route Handler for Signed URL
**What:** Standard Next.js App Router Route Handler with auth() guard, ownership check, then upstream fetch to 11labs.
**When to use:** Always — never expose API key to browser.
**Example (copy from /api/draw pattern):**
```typescript
// Source: PHASE-6-SETUP § 12 (specifics) + existing /api/draw pattern (verified)
// app/api/voice/signed-url/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { db } from '@/lib/db'
import { lessons } from '@/lib/db/schema'
import { eq, and } from 'drizzle-orm'
import { getSignedUrl } from '@/lib/elevenlabs/get-signed-url'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  // 1. Auth guard — first, before any body parsing
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Войдите в систему' }, { status: 401 })
  }

  // 2. Parse + validate input
  let lessonId = ''
  try {
    const body = (await req.json()) as { lessonId?: unknown }
    lessonId = typeof body.lessonId === 'string' ? body.lessonId.trim() : ''
  } catch {
    return NextResponse.json({ error: 'Неверный формат запроса' }, { status: 400 })
  }
  if (!lessonId) {
    return NextResponse.json({ error: 'lessonId обязателен' }, { status: 400 })
  }

  // 3. Ownership check (same pattern as /api/draw)
  const rows = await db
    .select({ id: lessons.id, topic: lessons.topic })
    .from(lessons)
    .where(and(eq(lessons.id, lessonId), eq(lessons.userId, session.user.id)))
    .limit(1)
  if (rows.length === 0) {
    return NextResponse.json({ error: 'Этот урок не ваш' }, { status: 403 })
  }
  const lesson = rows[0]

  // 4. Env vars
  const apiKey = process.env.ELEVENLABS_API_KEY
  const agentId = process.env.ELEVENLABS_AGENT_ID
  if (!apiKey || !agentId) {
    return NextResponse.json({ error: 'Voice service не настроен' }, { status: 500 })
  }

  // 5. Generate signed URL
  try {
    const signedUrl = await getSignedUrl(agentId, apiKey)
    return NextResponse.json({ signedUrl, topic: lesson.topic })
  } catch (err) {
    console.error('[/api/voice/signed-url] 11labs error:', err)
    return NextResponse.json({ error: 'Не удалось подключиться к голосовому сервису' }, { status: 502 })
  }
}
```

```typescript
// lib/elevenlabs/get-signed-url.ts
// Source: https://elevenlabs.io/docs/api-reference/conversations/get-signed-url (verified 2026-05-11)
export async function getSignedUrl(agentId: string, apiKey: string): Promise<string> {
  const url = new URL('https://api.elevenlabs.io/v1/convai/conversation/get-signed-url')
  url.searchParams.set('agent_id', agentId)

  const response = await fetch(url.toString(), {
    method: 'GET',
    headers: { 'xi-api-key': apiKey },
    // Note: cache: 'no-store' — signed URLs are single-use freshness-sensitive
    cache: 'no-store',
  })

  if (!response.ok) {
    const text = await response.text().catch(() => '')
    throw new Error(`11labs get-signed-url failed: HTTP ${response.status} ${text}`)
  }
  const data = (await response.json()) as { signed_url: string }
  if (!data.signed_url) throw new Error('11labs response missing signed_url field')
  return data.signed_url
}
```

### Pattern 3: SDK Callback → Bus Event Wiring
**What:** Map each SDK callback to a `voice:state` bus emit. Phase 9 avatar already subscribes.
**When to use:** Inside `useConversation` options at hook init — callbacks fire on the SDK lifecycle.
**Example:**
```tsx
// Map ALL SDK callbacks to bus events. Use stable references via useCallback.
const handleConnect = useCallback(() => {
  bus.emit('voice:state', { state: 'idle' })  // 'idle' until first mode change
}, [bus])

const handleModeChange = useCallback(({ mode }: { mode: 'speaking' | 'listening' }) => {
  bus.emit('voice:state', { state: mode })    // 'speaking' or 'listening' — direct mapping
}, [bus])

const handleDisconnect = useCallback(() => {
  bus.emit('voice:state', { state: 'idle' })
}, [bus])

const handleError = useCallback((err: unknown) => {
  console.error('[voice]', err)
  bus.emit('voice:state', { state: 'idle' })   // fail-safe — return avatar to idle
  setError(typeof err === 'string' ? err : 'Ошибка голосового сервиса')
}, [bus])

const conversation = useConversation({
  onConnect: handleConnect,
  onDisconnect: handleDisconnect,
  onModeChange: handleModeChange,
  onError: handleError,
})
```

### Anti-Patterns to Avoid
- **Calling `startSession` without `await getUserMedia`**: SDK in 1.x does NOT auto-request mic — silent fail or browser-default prompt in middle of session. Always prompt explicitly.
- **Putting `ELEVENLABS_API_KEY` in `NEXT_PUBLIC_*`**: Leaks key to client bundle (visible in DevTools / page source). D-05 locks key as server-only.
- **Using `signedUrl` with `connectionType: 'webrtc'`**: signedUrl is WebSocket-only — WebRTC needs `/conversation/token` (different endpoint, different field name `token`). The SDK voice default is `webrtc` so you MUST pass `connectionType: 'websocket'` explicitly.
- **Enabling allowlist AND signed URL together**: 11labs docs say "Do not configure signed URLs and allowlists together on the same agent." PHASE-6-SETUP has BOTH ON — this is potentially conflicting (see Open Questions below).
- **Forgetting to call `endSession` on unmount**: SDK keeps WebSocket + AudioContext alive across React unmount — memory leak. Use `useEffect` cleanup or "Стоп" button.
- **Hand-rolling WebSocket** for 11labs voice: SDK does AudioWorklet (PCM 16k encoding), VAD, interruption detection, audio resampling. Don't.
- **Letting `onMessage` write to React state without batching**: It can fire dozens of times per second during streaming transcript — debounce or use ref.
- **Storing `signedUrl` for reuse across reconnects**: TTL 15 min — fetch fresh on every `startSession`.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| WebSocket connection + reconnect logic | Custom WS client with auto-retry, ping/pong, backoff | `@elevenlabs/react` `useConversation` | SDK does livekit-client-grade reconnect, signed URL refresh, audio reordering |
| Mic capture + PCM16k encoding | AudioContext + ScriptProcessor + manual resampling | SDK (it spawns AudioWorklet internally) | Worklet runs in audio thread — main-thread fallback drops frames; resampling math is error-prone |
| VAD (voice activity detection) | RMS thresholding in JS | SDK + 11labs server-side VAD | Local VAD ≠ agent VAD; double-detection causes turn-taking glitches |
| Mic permission denial UX | Generic "permission denied" toast | Specific check: `getUserMedia({audio}).catch(e => switch(e.name))` | 3 distinct failure modes: `NotAllowedError` (user denied), `NotFoundError` (no mic), `NotReadableError` (mic in use) — each needs different copy |
| Audio playback queue | Buffer PCM chunks + manual AudioBufferSourceNode scheduling | SDK output worklet | SDK handles interruption (agent_response_correction event) — manual playback breaks on interrupt |
| Signed URL TTL tracking | Refresh-before-expiry timer | Fresh fetch on every startSession | TTL 15 min, sessions can exceed 15 min — URL only needs to be valid at handshake. SDK keeps session alive via internal protocol. |
| `voice:state` bus contract | New event types | EXISTING `voice:state` (Phase 9, lib/lesson-bus/events.ts) — variants `'idle' | 'listening' | 'speaking' | 'thinking'` already defined | Avatar already subscribed; CONTEXT.md mentions adding `'connected'` BUT existing union already has 4 states sufficient for Phase 6 (note: `'connected'` is NOT in existing union — see Open Q3) |

**Key insight:** SDK is 250kB unpacked and handles all the hard parts. Our value is in **UX glue**: mic permission UI in Russian, error toast in Russian, bus → avatar sync, signed URL fetch with auth.

## Runtime State Inventory

This is a greenfield-component phase (no existing voice subsystem). Nonetheless:

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| Stored data | None — 11labs stores its own conversation transcripts (30-day retention per PHASE-6-SETUP § 6 Privacy); Klassio DB is untouched in Phase 6 (recording = Phase 10) | None |
| Live service config | 11labs agent `agent_7701kr9c2v7eev3tabzv4f2b0e8b` configuration lives in 11labs UI, NOT in git — captured snapshot in `.planning/PHASE-6-SETUP-2026-05-10.md`. Changes to System Prompt, voice settings, Security tab must be reproduced manually. | Treat PHASE-6-SETUP.md as source of truth; do not assume agent config is mutable from code. |
| OS-registered state | None — no scheduled tasks, no native processes | None |
| Secrets/env vars | `ELEVENLABS_API_KEY`, `ELEVENLABS_AGENT_ID` — must be added to Vercel production env (MANUAL-ACTIONS.md tracks). API key rotation pending after first prod deploy (it was pasted into chat logs 2026-05-10) | Plan tasks must verify `.env.local` has both; add to Vercel via MANUAL-ACTIONS.md |
| Build artifacts | New `node_modules/@elevenlabs/react/` after install — about 252 kB unpacked. No stale state to clean. | npm install in Wave 1 task |

## Common Pitfalls

### Pitfall 1: Mic permission denial halts everything silently
**What goes wrong:** User clicks "Запустить голос", browser shows mic prompt, user clicks "Block" → `getUserMedia` rejects with `NotAllowedError` → `startSession` never called → UI shows nothing happened, no feedback.
**Why it happens:** SDK has no built-in mic permission UX. Host app owns the prompt.
**How to avoid:** Wrap `getUserMedia` in try/catch, surface specific error message:
```typescript
try {
  await navigator.mediaDevices.getUserMedia({ audio: true })
} catch (err) {
  const e = err as DOMException
  if (e.name === 'NotAllowedError') {
    setError('Доступ к микрофону запрещён. Разрешите его в настройках браузера и попробуйте снова.')
  } else if (e.name === 'NotFoundError') {
    setError('Микрофон не найден. Подключите микрофон и попробуйте снова.')
  } else if (e.name === 'NotReadableError') {
    setError('Микрофон занят другим приложением (Zoom, Discord). Закройте его и попробуйте снова.')
  } else {
    setError('Не удалось получить доступ к микрофону. Попробуйте перезагрузить страницу.')
  }
  return
}
```
**Warning signs:** Console shows "DOMException: Permission denied" but UI unchanged.

### Pitfall 2: Signed URL TTL exceeded on slow networks
**What goes wrong:** Backend generates signed URL → user network is slow → 15 min pass → `startSession` fails with WS handshake error.
**Why it happens:** TTL is 15 min from generation. If `/api/voice/signed-url` returns fast but user clicks Start much later, or page idles, URL is stale.
**How to avoid:** Fetch signed URL inside the click handler, RIGHT BEFORE `startSession`. Don't pre-fetch on page load.
**Warning signs:** First connection works on page reload but fails after tab idle.

### Pitfall 3: WebSocket vs WebRTC mismatch
**What goes wrong:** Pass `signedUrl` without `connectionType: 'websocket'` → SDK defaults to `webrtc` for voice mode → SDK tries to use `signedUrl` as livekit URL → silent fail or cryptic error.
**Why it happens:** Default `connectionType` is inferred from voice/text mode: voice = WebRTC, text-only = WebSocket. Override required.
**How to avoid:** Always pass `connectionType: 'websocket'` explicitly when using `signedUrl`. (`agentId` for public agents also defaults to WebRTC, which is fine, but we use signedUrl.)
**Warning signs:** `onError` fires with `MediaError` or `IceConnectionFailed`.

### Pitfall 4: Stale closures in callbacks
**What goes wrong:** Inline callbacks `{ onMessage: msg => setState(...) }` re-create every render → SDK swaps handlers → first-render state is captured forever in initial callback.
**Why it happens:** React closures + SDK keeping internal ref to first-registered callbacks.
**How to avoid:** Wrap each callback in `useCallback` with proper deps; or set callbacks via `ConversationProvider` once at top of LessonShell.
**Warning signs:** "Bus emit not working" / "state not updating" — but only after re-render.

### Pitfall 5: iOS Safari 18+ ConversationProvider bug (Issue #663)
**What goes wrong:** On iOS Safari 18.7, ConversationProvider state machine breaks: `status` flashes 'connected' then reverts to 'disconnected' in ~1ms, `isSpeaking` never updates, client tools don't fire. Open issue dated April 2026, no confirmed fix in 1.6.0.
**Why it happens:** Promise chain / state machine race condition in provider.
**How to avoid:** For Phase 6, dev is on Chrome via VPN — not an immediate blocker. But: do NOT rely on ConversationProvider hooks; pass options directly to `useConversation` in VoicePanel (no provider needed unless multiple components consume hooks). Document iOS as known issue in UAT criteria — flag for Phase 6.5 mobile QA.
**Warning signs:** Works in Chrome desktop, broken in Mobile Safari iOS 18+.

### Pitfall 6: Russian text in `firstMessage` override gets garbled in WS frame
**What goes wrong:** Pass `firstMessage: 'Привет! Сегодня...'` → 11labs API treats it as ASCII → mojibake.
**Why it happens:** Almost never (the SDK serializes via JSON.stringify which handles UTF-16/UTF-8 correctly), but watch for any double-encoding in fetch handlers.
**How to avoid:** Don't manually URL-encode the override field — pass it as a plain string in JS object; SDK does the right thing. Verify in WS frame inspector (DevTools Network → WS tab → `conversation_initiation_client_data` payload).
**Warning signs:** Agent's first response references gibberish instead of the topic.

### Pitfall 7: Forgetting cleanup on unmount → memory leak + mic stays on
**What goes wrong:** User navigates away mid-session → component unmounts → `endSession` not called → WebSocket persists, AudioContext + MediaStream stay alive → red mic indicator in browser tab even after leaving lesson page.
**Why it happens:** SDK doesn't tie its lifecycle to React unmount.
**How to avoid:** `useEffect(() => { return () => { conversation.endSession() } }, [conversation])` — but careful: `conversation` ref changes every render unless stable. Better: have explicit Stop on navigation, AND cleanup in effect. Also consider intercepting `lesson:end` bus event from "Завершить урок" button (Phase 3 contract).
**Warning signs:** Mic icon stays red after leaving lesson page.

### Pitfall 8: 11labs free-tier rate limit (Daily call limit 100 in PHASE-6-SETUP)
**What goes wrong:** Many E2E test runs in CI hit 100 calls/day → real sessions blocked.
**Why it happens:** Daily call limit set to 100 in agent Security tab (per PHASE-6-SETUP § 7).
**How to avoid:** E2E tests MUST mock the SDK, NEVER hit real 11labs. Manual UAT only.
**Warning signs:** HTTP 429 from `/v1/convai/conversation/get-signed-url`.

## Code Examples

### Vitest mock pattern for `@elevenlabs/react`
```typescript
// Source: pattern derived from app/api/draw/__tests__/route.test.ts (verified in codebase)
// components/panels/__tests__/voice-panel.test.tsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

// Mock the SDK module. Capture the options passed to useConversation
// so tests can fire callbacks synchronously.
let capturedOptions: any = null
const mockStartSession = vi.fn().mockResolvedValue('conv_test_123')
const mockEndSession = vi.fn().mockResolvedValue(undefined)

vi.mock('@elevenlabs/react', () => ({
  useConversation: (options: any) => {
    capturedOptions = options
    return {
      status: 'disconnected',
      mode: 'listening',
      isSpeaking: false,
      isListening: false,
      isMuted: false,
      startSession: mockStartSession,
      endSession: mockEndSession,
    }
  },
}))

// Mock fetch for /api/voice/signed-url
global.fetch = vi.fn()

// Mock getUserMedia
Object.defineProperty(global.navigator, 'mediaDevices', {
  value: { getUserMedia: vi.fn().mockResolvedValue({}) },
  writable: true,
})

// ... test that clicking Start triggers fetch + startSession with correct overrides
// ... test that capturedOptions.onModeChange({ mode: 'listening' }) emits voice:state listening on bus
```

### Playwright E2E pattern (using existing bus injection from Phase 9)
```typescript
// Source: e2e/avatar.spec.ts pattern + adapted for voice flow
// e2e/voice-flow.spec.ts
import { test, expect } from '@playwright/test'

test.describe('Voice flow E2E (VOI-01)', () => {
  test('mic button triggers fetch + bus emits voice:state', async ({ page }) => {
    // 1. Mock /api/voice/signed-url at network layer — never hit real 11labs
    await page.route('**/api/voice/signed-url', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ signedUrl: 'wss://mock.local/agent_test', topic: 'Тест' }),
      }),
    )

    // 2. Stub @elevenlabs/react via window.__elevenlabsMock BEFORE first React render.
    //    Pattern: addInitScript injects script that monkey-patches before module eval.
    //    Alternative: webpack module replacement in test build — but simplest is
    //    a feature flag NEXT_PUBLIC_E2E_MOCK_VOICE that swaps the import.
    await page.addInitScript(() => {
      ;(window as any).__elevenlabsMock = true
    })

    // 3. Navigate to lesson page (session injected via cookies from beforeAll login)
    await page.goto(`/lesson/${lessonId}`)

    // 4. Click Start button
    await page.getByRole('button', { name: /Запустить голос/i }).click()

    // 5. Simulate SDK callback by emitting on the exposed bus
    //    (Phase 9 exposes window.__lessonBus in non-prod — A4)
    await page.evaluate(() => {
      ;(window as any).__lessonBus.emit('voice:state', { state: 'listening' })
    })

    // 6. Assert avatar transitions to listening
    const avatar = page.locator('[data-avatar-state]').first()
    await expect(avatar).toHaveAttribute('data-avatar-state', 'listening', { timeout: 2000 })
  })
})
```

### Common Operation: Volume control
```typescript
// Source: https://elevenlabs.io/docs/eleven-agents/libraries/react § setVolume
// (NOT needed for Phase 6, but documented for follow-up)
await conversation.setVolume({ volume: 0.5 })  // 0-1 scale
```

### Common Operation: Mute mic without ending session
```typescript
// Source: https://elevenlabs.io/docs/eleven-agents/libraries/react § setMuted
const { isMuted, setMuted } = conversation
setMuted(true)   // stop sending audio, keep WS open
setMuted(false)  // resume
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `@11labs/react` package | `@elevenlabs/react` package | Late 2025 (rebrand) | `[VERIFIED: npm registry]` `@11labs/react` still exists but **no longer maintained**; PHASE-6-SETUP correctly says `@elevenlabs/react`. Some older blog tutorials still reference `@11labs` — ignore them. |
| `Conversation` class with `new Conversation(...)` | `Conversation` namespace + `useConversation` hook | SDK 1.0 (late 2025) | Class is removed. `useConversation` is the only React entry point. |
| Default `connectionType: 'websocket'` everywhere | Default = WebRTC for voice, WebSocket for text-only | SDK 1.0 (late 2025) | Voice apps using only `agentId` (public agents) now go via WebRTC by default — fine for us since we use signedUrl + override |
| `conversation.output.gain.gain.value = v` | `conversation.setVolume({ volume: v })` | SDK 1.0 | Direct gain manipulation removed |
| `Input` / `Output` classes | `InputController` / `OutputController` interfaces + new conversation methods (`setMicMuted`, `getInputByteFrequencyData`) | SDK 1.0 | Public API simpler; only matters if you build visualizations |
| TTS Eleven Multilingual v3 Conversational Alpha | Eleven Multilingual v2 (back-port) | 2026-05-10 (Klassio-specific) | v3 Alpha had русский глюки (повторы, "инопланетный язык") — PHASE-6-SETUP § 3 locked v2 |
| GPT-4.1 Nano via Custom LLM | GPT-4.1 mini via Custom LLM | 2026-05-10 (Klassio-specific) | Nano галлюцинировал на арифметике — PHASE-6-SETUP § 2 locked mini |

**Deprecated/outdated:**
- Any tutorial mentioning `@11labs/react` — outdated, use `@elevenlabs/react`
- Any code showing `new Conversation(...)` class instantiation — removed in SDK 1.0
- Audio tags `[warmly]` / `[excitedly]` in System Prompt — only v3 Alpha supports them; we use v2 which would speak them literally. **Already removed from finalized System Prompt.**

## Project Constraints (from CLAUDE.md)

`./CLAUDE.md` does not exist in working directory. No additional project directives to enforce beyond CONTEXT.md decisions and `.planning/intel/constraints.md` (CON-runtime-versions, CON-openai-rf-block).

## User Constraints (from CONTEXT.md)

### Locked Decisions

**D-01 — 11labs subscription tier: Creator $22** (was Pro $99 in original draft)
- Creator achieves Custom LLM endpoint feature.
- Saved $77/мес (~6 160 ₽/мес) vs original Pro recommendation.
- Phase 6 watermark в COSTS.md обновлён (commit 79c5791).

**D-02 — Hetzner WS proxy: DEFERRED to Phase 6.5**
- Не нужен для dev (VPN handles `openai.com`/`elevenlabs.io` блок).
- Поставим перед: (a) первый РФ-юзер без VPN, (b) public beta launch.
- Klassio frontend в этой фазе подключается **напрямую** к 11labs WebSocket (signed URL).

**D-03 — LLM model: GPT-4.1 mini** (was GPT-4.1 Nano in early test)
- Nano галлюцинировал на двузначной арифметике (подтвердил 25+48=70). Mini fixes.
- Cost ~150 ₽/мес для 6 уроков (vs 39 ₽ Nano) — копейки vs honest math.
- Connected through 11labs Custom LLM endpoint, наш `OPENAI_API_KEY`.

**D-04 — TTS / Voice**
- **Voice**: Nataly (Youthful, Gentle and Soft) — молодой женский, мягкий
- **TTS family**: Eleven Multilingual v2 (rock-solid для русского)
  - **NOT v3 Conversational Alpha** — глючил на русском (повторы, «инопланетный язык»). Audio tags `[warmly]` убраны из промпта.
- Voice settings в 11labs UI: Stability 0.30, Similarity 0.75, Style 0.40, Speed 1.05
- voice_id **не нужен в коде** — голос привязан к Agent ID на 11labs стороне.

**D-05 — Server-only env vars (no client exposure)**
- `ELEVENLABS_API_KEY` — server-side, для `getSignedUrl` API call
- `ELEVENLABS_AGENT_ID` — server-side, передаётся в `getSignedUrl(agentId, apiKey)`
- Клиент НИКОГДА не видит ни ключ ни Agent ID
- Authentication=ON на агенте + signed URL — единственный валидный путь подключения

**D-06 — Override policy**
- ✅ Разрешено override: `first_message` (для передачи `lesson_topic` + (когда добавим в БД) `child_name`)
- ❌ НЕ разрешено override: `system_prompt`, `LLM`, `voice` (security)
- Override настроен в 11labs Security tab: только First message ON

**D-07 — Bus events**
- Phase 9 уже создал contract: `voice:state` (`idle | connected | listening | speaking`) и `avatar:emotion` (`happy | sad | thinking | neutral`)
  - **Research note (Open Q3):** existing `lib/lesson-bus/events.ts` defines union as `'idle' | 'listening' | 'speaking' | 'thinking'` — there is **no `'connected'`** variant. Plan should either (a) add `'connected'` to the union OR (b) use existing variants only (preferred — less surface area).
- 11labs SDK callbacks → bus events:
  - `onConnect` → `voice:state` `connected` (or `'idle'` until first mode change — see Open Q3)
  - `onModeChange({mode:'listening'})` → `voice:state` `listening` (avatar listens 👂)
  - `onModeChange({mode:'speaking'})` → `voice:state` `speaking` (avatar speaks 🗣️)
  - `onDisconnect` → `voice:state` `idle`
  - `onError(err)` → toast + log
- `board:say` event (Phase 4 stub) — пока **не подключаем** к voice TTS. Phase 8 wire это вместе с Pedagogical LLM.

**D-08 — Out of scope for Phase 6 (defer)**
- ❌ Custom tools (`trigger_board_scene`, `highlight_trainer_task`, `get_lesson_state`, `praise_or_redirect`) — Phase 8
- ❌ Audio recording (152-ФЗ согласие, S3 storage) — Phase 10
- ❌ Hetzner WS proxy — Phase 6.5
- ❌ Pedagogical LLM tier (slow GPT-4o for proactive triggers) — Phase 8
- ❌ Real Russian beta-user smoke test без VPN — после Hetzner unblock

**D-09 — UAT-критерий для Phase 6**
Dev успешно проходит:
1. Логинится в Klassio через magic link
2. Открывает lesson page
3. Жмёт «Запустить голос» в VoicePanel
4. Браузер запрашивает доступ к микрофону (mic permission flow)
5. Говорит в микрофон → бот отвечает голосом по-русски (Nataly через Multilingual v2)
6. Avatar в VoicePanel реагирует: 👂 когда юзер говорит, 🗣️ когда бот говорит, 🙂 в idle
7. Тема урока (из БД, передаётся через first_message override) фигурирует в greeting агента
8. Жмёт «Stop» → conversation корректно завершается, avatar → idle
9. Reload page → можно начать заново
10. DevTools Network: `ELEVENLABS_API_KEY` отсутствует в client bundle/network requests; signed URL в WS-handshake содержит signature но не сам ключ

### Claude's Discretion

- Specific UI copy for mic permission errors (Pitfall 1 in this document recommends 4 distinct messages — NotAllowedError / NotFoundError / NotReadableError / generic)
- Whether to use ConversationProvider at LessonShell root or just `useConversation` in VoicePanel — research recommends **NO provider** (simpler, avoids iOS Safari Issue #663 known bug surface)
- Whether to add `'connected'` to `voice:state` variant union (Open Q3) — research recommends keeping existing 4 variants
- Vitest mock strategy for SDK — `vi.mock('@elevenlabs/react')` returning a stub object (pattern documented above)
- E2E mock strategy — `page.route('**/api/voice/signed-url')` + `addInitScript` flag + bus emit (Phase 9 pattern reused)

### Deferred Ideas (OUT OF SCOPE)

- ❌ Hetzner WS proxy — Phase 6.5
- ❌ Custom tools `trigger_board_scene` etc. — Phase 8
- ❌ Audio recording / 152-ФЗ — Phase 10
- ❌ Pedagogical LLM (slow proactive tier) — Phase 8
- ❌ `child_gender` in DB + override — Phase 6.5 or follow-up (currently using gender-neutral в System Prompt)
- ❌ Latency optimization (Eagerness=High, Turbo v2.5) — measure first после frontend integration, оптимизировать в follow-up
- ❌ Hetzner WS proxy РФ smoke test — после 6.5
- ❌ API key ротация — manual user action после первого prod deploy (recorded in MANUAL-ACTIONS.md)

## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| **VOI-01** | 11labs Agents с Custom LLM endpoint (двусторонний голос с прерываниями); API-ключи только на сервере; voice = русский (Multilingual v2 confirmed); 6.5 deferred for Hetzner WS proxy | This research covers: `@elevenlabs/react@1.6.0` SDK integration pattern (Pattern 1), server-side signed URL generation (Pattern 2), bus wiring (Pattern 3), mic permission UX (Pitfall 1), SDK→bus callback contract (D-07). Hetzner proxy explicitly DEFERRED to Phase 6.5 per D-02; "function calling" portion explicitly DEFERRED to Phase 8 per D-08. Phase 6 satisfies VOI-01 minus the РФ-без-VPN clause (which requires Phase 6.5). |

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | Next.js runtime | ✓ | ≥20 (per CON-runtime-versions) | — |
| `npm` package registry connectivity | install `@elevenlabs/react` | ✓ (verified `npm view` works) | n/a | — |
| 11labs API (`api.elevenlabs.io`) reachable from dev machine | server-side signed URL generation | ✓ (assumed — Klassio dev is on VPN per CON-openai-rf-block) | n/a | If blocked: VPN required (dev) or Hetzner proxy (Phase 6.5 for prod РФ-юзеров) |
| 11labs WebSocket (`wss://api.elevenlabs.io/v1/convai/...`) reachable from browser | client WS handshake | ✓ for Chrome+VPN; ✗ for РФ browsers without VPN | n/a | Phase 6.5 Hetzner WS proxy |
| Browser mic device | mic capture | ✓ (dev's Windows machine) | n/a | App must surface NotFoundError message |
| `ELEVENLABS_API_KEY` env var | signed URL fetch | ✓ in `.env.local` (per STATE.md 2026-05-10 entry); pending Vercel prod env via MANUAL-ACTIONS.md | n/a | Plan must include Vercel env setup task |
| `ELEVENLABS_AGENT_ID` env var | signed URL fetch | ✓ in `.env.local` (`agent_7701kr9c2v7eev3tabzv4f2b0e8b`) | n/a | Plan must include Vercel env setup task |
| `OPENAI_API_KEY` (for 11labs Custom LLM endpoint) | already-configured in 11labs agent dashboard, NOT in Klassio Next.js — Klassio doesn't use it for voice | ✓ (server-side, used by /api/draw, not relevant for voice path) | n/a | — |

**Missing dependencies with no fallback:** None at dev time.
**Missing dependencies with fallback:** Hetzner WS proxy for РФ prod users — explicitly deferred to Phase 6.5 (D-02).

## Validation Architecture

> Including this section because `.planning/config.json` does not have `workflow.nyquist_validation: false` set (the key is absent, so default = enabled).

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest 3.x (happy-dom env) + Playwright 1.59.1 (chromium project) |
| Config file | `vitest.config.ts` + `playwright.config.ts` |
| Quick run command | `npm test` (vitest run) |
| Full suite command | `npm test && npm run test:e2e` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| VOI-01-A | `getSignedUrl(agentId, apiKey)` calls correct URL with `xi-api-key` header and parses `signed_url` field | unit | `npx vitest run lib/elevenlabs/__tests__/get-signed-url.test.ts` | ❌ Wave 0 |
| VOI-01-B | `getSignedUrl` throws on non-200 with informative error message | unit | (same file) | ❌ Wave 0 |
| VOI-01-C | `getSignedUrl` throws when `signed_url` field missing in response | unit | (same file) | ❌ Wave 0 |
| VOI-01-D | `/api/voice/signed-url` returns 401 when not authenticated | unit (route handler test, drizzle+auth mocked) | `npx vitest run app/api/voice/signed-url/__tests__/route.test.ts` | ❌ Wave 0 |
| VOI-01-E | `/api/voice/signed-url` returns 400 when lessonId missing | unit | (same file) | ❌ Wave 0 |
| VOI-01-F | `/api/voice/signed-url` returns 403 when lesson not owned by session user | unit | (same file) | ❌ Wave 0 |
| VOI-01-G | `/api/voice/signed-url` returns 500 when env vars missing | unit | (same file) | ❌ Wave 0 |
| VOI-01-H | `/api/voice/signed-url` happy path returns `{ signedUrl, topic }` JSON | unit (mock `getSignedUrl`) | (same file) | ❌ Wave 0 |
| VOI-01-I | VoicePanel click "Запустить голос" → calls `getUserMedia({audio:true})` first | component | `npx vitest run components/panels/__tests__/voice-panel.test.tsx` | ❌ Wave 0 (existing voice-panel.tsx is placeholder — no test) |
| VOI-01-J | VoicePanel after mic granted → fetch `/api/voice/signed-url` with `{lessonId}` body | component | (same file) | ❌ Wave 0 |
| VOI-01-K | VoicePanel after fetch success → `conversation.startSession` called with `{signedUrl, connectionType:'websocket', overrides:{agent:{firstMessage:topic-injected-text}}}` | component | (same file) | ❌ Wave 0 |
| VOI-01-L | SDK `onModeChange({mode:'listening'})` → bus emits `voice:state` with `state:'listening'` | component | (same file) | ❌ Wave 0 |
| VOI-01-M | SDK `onModeChange({mode:'speaking'})` → bus emits `voice:state` with `state:'speaking'` | component | (same file) | ❌ Wave 0 |
| VOI-01-N | SDK `onDisconnect` → bus emits `voice:state` with `state:'idle'` | component | (same file) | ❌ Wave 0 |
| VOI-01-O | SDK `onError(err)` → error displayed in Russian; bus emits `state:'idle'` | component | (same file) | ❌ Wave 0 |
| VOI-01-P | Mic permission `NotAllowedError` → Russian error message displayed | component | (same file) | ❌ Wave 0 |
| VOI-01-Q | Mic permission `NotFoundError` → Russian error message displayed | component | (same file) | ❌ Wave 0 |
| VOI-01-R | "Stop" button → `conversation.endSession()` called | component | (same file) | ❌ Wave 0 |
| VOI-01-S | E2E: lesson page → click Start → fetch stub returns signed URL → SDK is mocked → bus emit listening → avatar state `listening` | E2E (Playwright, SDK + fetch stubbed) | `npx playwright test e2e/voice-flow.spec.ts` | ❌ Wave 0 |
| VOI-01-T | E2E: bundle does NOT contain `ELEVENLABS_API_KEY` or `ELEVENLABS_AGENT_ID` literal strings | E2E (smoke check on page source) | (same file or new bundle-leak.spec.ts) | ❌ Wave 0 |
| VOI-01-U | Manual UAT — real 11labs connection in dev (VPN required) — captured in PHASE-6-SETUP § 11 + D-09 | manual-only | (no automation — see D-09 checklist) | n/a |

### Sampling Rate
- **Per task commit:** `npm test -- voice-panel` (faster — single file)
- **Per wave merge:** `npm test && npm run test:e2e -- voice-flow.spec.ts`
- **Phase gate:** Full suite green (`npm test && npm run build && npm run test:e2e`) before `/gsd-verify-work`

### Wave 0 Gaps
- [ ] `lib/elevenlabs/__tests__/get-signed-url.test.ts` — covers VOI-01-A/B/C
- [ ] `app/api/voice/signed-url/__tests__/route.test.ts` — covers VOI-01-D through VOI-01-H
- [ ] `components/panels/__tests__/voice-panel.test.tsx` — covers VOI-01-I through VOI-01-R
- [ ] `e2e/voice-flow.spec.ts` — covers VOI-01-S, VOI-01-T
- [ ] Install `@elevenlabs/react@^1.6.0` via `npm install` — Wave 1 Task 1 (BEFORE any test that mocks it)
- [ ] Optional: a feature flag `NEXT_PUBLIC_E2E_MOCK_VOICE` or equivalent for E2E to short-circuit SDK loading. **Recommendation: don't add — use Playwright `page.route` to stub the API + `addInitScript` to install bus emit helpers; SDK can be `vi.mock`-ed at component-test level which is sufficient.**

## Security Domain

> `.planning/config.json` does not set `security_enforcement: false`, so this section is required.

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | yes | NextAuth v5 — existing `auth()` guard in `/api/voice/signed-url` (same pattern as `/api/draw`) |
| V3 Session Management | yes | NextAuth session cookie (HttpOnly, SameSite=Lax) — already configured (Phase 1) |
| V4 Access Control | yes | Drizzle ownership check `WHERE lesson.id = ? AND lesson.userId = session.user.id` → 403 if mismatch (same as `/api/draw`) |
| V5 Input Validation | yes | `lessonId` validation (string non-empty) in route handler before DB query |
| V6 Cryptography | yes (indirect) | 11labs handles WS TLS + signed URL HMAC — Klassio NEVER computes signatures itself; only forwards. **Don't hand-roll signing.** |
| V8 Data Protection | yes | `ELEVENLABS_API_KEY` is server-side env var; `process.env.ELEVENLABS_API_KEY` not exposed to client; verified by VOI-01-T bundle test |
| V13 API + Web Service | yes | POST `/api/voice/signed-url` is JSON-only; rate-limited indirectly by 11labs daily call limit (100/day per PHASE-6-SETUP § 7) |
| V14 Configuration | yes | `process.env.ELEVENLABS_*` are required env vars; route returns 500 if missing — fail-closed |

### Known Threat Patterns for Klassio voice tier

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| API key leakage via client bundle | Information disclosure | Server-only env var (no `NEXT_PUBLIC_*` prefix); test asserts key absent from bundle (VOI-01-T) |
| Lesson ID enumeration | Information disclosure | Ownership check returns same 403 for "not yours" and "not exists" (no oracle) |
| Mass signed-URL generation by authenticated user | Denial of service ($) | 11labs daily call limit 100 (server-side, configured in agent); per-user rate limit can be added in Phase 6.5 if abused |
| Prompt injection via lesson topic field | Tampering | `firstMessage` override is just a greeting prefix; System Prompt is locked (NOT overridable per D-06); 11labs Security tab has only First message=ON |
| Replay of intercepted signed URL | Spoofing | TTL 15 min limits window; single-use if `include_conversation_id=true` (not used in our case — we let the URL be reused for the session) |
| MITM on WebSocket | Information disclosure | WSS only (TLS); 11labs cert pinned by browser |
| Browser tab hijack reuses mic | Tampering | Mic permission is per-origin per session; user can revoke via browser UI |
| Cross-site signed-URL request (CSRF) | Spoofing | POST `/api/voice/signed-url` requires NextAuth cookie (SameSite=Lax means safe from cross-site POST) |
| Cost amplification by sending huge `firstMessage` | Denial of service ($) | First message is one TTS synthesis; bounded by 11labs daily call limit. We can add length cap (e.g. 200 chars) as defensive measure. |

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Signed URL TTL is 15 minutes for the signed URL itself, but conversations can exceed 15 min once handshake succeeds | Pattern 1 + Common Pitfalls #2 | `[VERIFIED: docs.elevenlabs.io agents-platform/customization/authentication via WebSearch result 2026-05-11]` — But: behavior of "URL valid for 15 min, session can last longer" is documented; we don't have direct test. **If wrong**: long sessions could die mid-conversation. **Mitigation**: PHASE-6-SETUP § 6 sets Max conversation duration 3600s = within 11labs's spec; signed URL not re-validated by SDK after handshake. Risk: LOW. |
| A2 | Default `connectionType` for voice mode is `'webrtc'`, so we MUST pass `connectionType: 'websocket'` explicitly with signedUrl | Pattern 1, Anti-patterns | `[CITED: WebSearch result 2026-05-11, multiple sources]` — Need to verify against SDK 1.6.0 release notes specifically. **If wrong**: signedUrl might Just Work without the flag. **Mitigation**: passing it explicitly is safe either way. Risk: LOW. |
| A3 | `overrides.agent.firstMessage` REPLACES the agent's default first_message (not appends) | Pattern 1 | `[VERIFIED: docs.elevenlabs.io eleven-agents/customization/personalization/overrides via WebSearch 2026-05-11]` — "Overrides completely override the agent's default values". **If wrong**: greeting might double up. Risk: LOW. |
| A4 | iOS Safari 18+ bug (Issue #663) is NOT fixed in 1.6.0 | Pitfall 5 | `[CITED: WebFetch GitHub Issue #663 — no fix comment visible]` — Repo issue is open as of April 2026. **If wrong**: better mobile UX. **Mitigation**: Phase 6 dev target is Chrome desktop only — flag iOS for Phase 6.5 QA. Risk: LOW for Phase 6 scope. |
| A5 | Allowlist + Signed URL configured together "should not be" used but isn't enforced to fail — it's a recommendation, not a hard error | Anti-patterns + Open Q1 | `[CITED: docs.elevenlabs.io — "Do not configure signed URLs and allowlists together"]` — PHASE-6-SETUP has BOTH ON. Risk: signed URL might fail if requesting origin not in allowlist. **Mitigation**: Open Q1 below; need to confirm with 11labs whether allowlist gates `getSignedUrl` API call OR only direct browser-to-11labs (non-signed) connections. Risk: MEDIUM — could block prod connection. |
| A6 | The lesson `topic` field can be safely interpolated into `firstMessage` without sanitization (no injection vector) | Pattern 2 | `[ASSUMED]` — `firstMessage` is sent to TTS pipeline, not LLM; even if user could control topic field (they can't — admin CLI writes it), worst case is weird TTS output, not prompt injection. **If wrong**: prompt injection. **Mitigation**: lesson topic is set by admin CLI only (Phase 2) — no user input path. Risk: LOW. |
| A7 | Calling `endSession` is idempotent (safe to call multiple times) | Common Pitfalls #7 | `[ASSUMED]` — SDK source-code-level guarantee not verified. **If wrong**: second call throws. **Mitigation**: wrap in try/catch in cleanup. Risk: LOW. |
| A8 | `@elevenlabs/react` peer dependency requires React 18 or 19 compatible — we have React 18.3.1 which works | Standard Stack | `[ASSUMED]` — npm view didn't print peerDependencies in this query. **If wrong**: install fails or runtime crash. **Mitigation**: run `npm install` early in Wave 1 Task 1, capture failure if any. Risk: LOW. |

## Open Questions

### Open Q1 — Allowlist + Signed URL conflict
**What we know:** 11labs docs explicitly say "Do not configure signed URLs and allowlists together on the same agent." PHASE-6-SETUP § 7 has Authentication=ON (signed URL) AND Allowlist=`klassio-one.vercel.app, localhost:3000`.
**What's unclear:** Whether the allowlist is silently ignored when signed URL is in use, OR whether it gates the API call to `/v1/convai/conversation/get-signed-url` (which is server-to-server — no browser origin involved). Likely **only browser-origin checks** are gated by allowlist — i.e., this conflict may be benign in practice.
**Recommendation:** Plan should include a Wave 1 manual smoke test: actually fetch a signed URL from local dev and connect via SDK — if it works on `localhost:3000` (which is in allowlist) AND `127.0.0.1:3000` (which is NOT) we know allowlist is being enforced; if both work, allowlist is ignored. If conflict is real, **remove allowlist** in 11labs UI and document in MANUAL-ACTIONS.md.

### Open Q2 — Should we use `ConversationProvider` at LessonShell root or just `useConversation` in VoicePanel?
**What we know:** SDK supports both. Only VoicePanel needs the voice state, so a provider is overkill. Provider has the iOS Safari Issue #663 bug.
**What's unclear:** Nothing meaningful.
**Recommendation:** Use `useConversation` directly in VoicePanel. No provider. Simpler, no provider bug surface.

### Open Q3 — Add `'connected'` to `voice:state` union, or use existing 4 variants?
**What we know:** `lib/lesson-bus/events.ts` has `VoiceStatePayload = { state: 'idle' | 'listening' | 'speaking' | 'thinking' }`. CONTEXT.md mentions adding `'connected'`. SDK has 3 status values (`disconnected`, `connecting`, `connected`) AND 2 mode values (`speaking`, `listening`).
**What's unclear:** Whether the avatar UI needs a distinct "connected, waiting for first turn" state vs "idle".
**Recommendation:** Keep existing 4 variants. Map:
- `onConnect` → `voice:state` `'idle'` (transitional — until first `onModeChange`)
- `onModeChange({ mode: 'listening' })` → `voice:state` `'listening'`
- `onModeChange({ mode: 'speaking' })` → `voice:state` `'speaking'`
- `onDisconnect` → `voice:state` `'idle'`
- (Phase 8 will emit `'thinking'` from Pedagogical LLM — Phase 6 leaves this alone)

This means the avatar shows 🙂 idle when the WS first connects (no audio yet) — a perfectly acceptable UX. Avoids schema migration.

### Open Q4 — Where does the `topic` value flow from?
**What we know:** Lesson page (RSC) already loads the lesson row from DB including `topic` (string). It's passed to LessonShell via prop, then to panels. CONTEXT.md says `firstMessage` override receives the topic.
**What's unclear:** Should VoicePanel receive `topic` as a prop from LessonShell, OR should `/api/voice/signed-url` return it in the JSON response (server is the source of truth)?
**Recommendation:** **Both** — RSC passes topic to VoicePanel as a prop (already wired for other panels), and `/api/voice/signed-url` ALSO returns it in JSON (defense-in-depth, in case props are stale due to navigation; matches the existing `/api/draw` pattern where lessonId comes from prop but is re-validated server-side). VoicePanel uses the topic from the response, not from prop, to construct `firstMessage`.

### Open Q5 — Should client tools (`onUnhandledClientToolCall`) be considered now?
**What we know:** PHASE-6-SETUP § 5 says NO custom tools in Phase 6. Phase 8 will add them.
**What's unclear:** If agent somehow calls a tool (it shouldn't — no tools registered in agent config), what happens?
**Recommendation:** Set `onUnhandledClientToolCall` to a no-op that logs a warning. Harmless safety net.

## Sources

### Primary (HIGH confidence)
- `npm view @elevenlabs/react` (executed 2026-05-11) → `1.6.0`, published 2026-05-08, MIT, depends on `@elevenlabs/client@1.7.0`, unpackedSize 252.8 kB
- `npm view @elevenlabs/client` (executed 2026-05-11) → `1.7.0`, dependencies `@elevenlabs/types: 0.13.0`, `livekit-client: ^2.11.4`
- `.planning/PHASE-6-SETUP-2026-05-10.md` — Klassio-finalized agent config (System Prompt, voice, identifiers, integration scope)
- `.planning/phases/06-voice/06-CONTEXT.md` — locked decisions D-01 through D-09
- `.planning/REQUIREMENTS.md § VOI-01` — acceptance criteria
- `lib/lesson-bus/events.ts` (codebase, current main) — existing `voice:state` union
- `components/panels/voice-panel.tsx` (codebase) — Phase 9 placeholder we replace
- `app/api/draw/route.ts` (codebase) — auth + ownership pattern we copy
- `components/avatar/use-avatar-state.ts` (codebase) — Phase 9 contract subscriber
- https://elevenlabs.io/docs/eleven-agents/libraries/react — full React SDK API (callbacks, methods, hooks, overrides shape)
- https://elevenlabs.io/docs/api-reference/conversations/get-signed-url — endpoint URL + query params + response shape

### Secondary (MEDIUM confidence, cross-verified via search)
- https://elevenlabs.io/docs/eleven-agents/guides/quickstarts/next-js — Next.js quickstart with full conversation.tsx + signed-url route code
- https://elevenlabs.io/docs/eleven-agents/customization/personalization/overrides — overrides object shape + "completely replaces" behavior
- https://elevenlabs.io/docs/eleven-agents/customization/personalization/dynamic-variables — dynamic variables `{{var}}` syntax (path NOT chosen for Phase 6 per D-06)
- https://elevenlabs.io/docs/eleven-agents/customization/authentication — Authentication=ON, signed URL flow, allowlist conflict warning
- https://github.com/elevenlabs/packages/issues/663 — iOS Safari 18+ ConversationProvider bug
- WebSearch 2026-05-11 results corroborating: signed URL TTL 15 min, connection types webrtc/websocket default by mode, `@11labs/react` deprecation rename to `@elevenlabs/react`

### Tertiary (LOW confidence — needs validation in execution)
- A8 — exact peerDependencies of `@elevenlabs/react@1.6.0` (we assume React 18 compat). Verified at `npm install` time in Wave 1.
- A1 — exact semantics of "URL valid for 15 min, session can last longer" — verified empirically at first UAT.
- A5 — allowlist+signed-URL interaction — see Open Q1 for the smoke test plan.

## Metadata

**Confidence breakdown:**
- Standard stack: **HIGH** — `@elevenlabs/react@1.6.0` verified directly via npm registry, dependency chain transparent, package 3 days old (current)
- Architecture: **HIGH** — endpoint URL, request shape, response shape, callbacks, override shape all verified against official docs + cross-checked across multiple sources
- Patterns: **HIGH** — `/api/draw` pattern for auth + ownership already proven in production (`a36f87d` deploy commit); SDK pattern matched against official Next.js quickstart
- Pitfalls: **MEDIUM** — distilled from official docs + GitHub Issue #663 + WebSearch corroboration; mic permission UX is widely-known browser behavior
- Test mocking strategy: **HIGH** — derived directly from existing `app/api/draw/__tests__/route.test.ts` and `e2e/avatar.spec.ts` patterns (already in codebase, passing tests)
- iOS Safari known issue: **MEDIUM** — Issue #663 is open as of April 2026, but no later comments visible in the WebFetch — possible silent fix in 1.6.0 not yet confirmed
- Allowlist + signedURL conflict: **MEDIUM** — docs say "do not", PHASE-6-SETUP has both ON, no empirical validation done — Open Q1 calls for smoke test

**Research date:** 2026-05-11
**Valid until:** 2026-06-10 (30 days) for stable docs; 2026-05-25 (14 days) for `@elevenlabs/react` version pin — SDK released 3 days ago and might have minor patches
