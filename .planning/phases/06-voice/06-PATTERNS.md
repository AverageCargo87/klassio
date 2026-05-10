# Phase 06: voice — Pattern Map

**Mapped:** 2026-05-11
**Files analyzed:** 9 (7 NEW + 2 MODIFY)
**Analogs found:** 9 / 9 (all in-repo)

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `app/api/voice/signed-url/route.ts` | route handler (POST) | request-response (JSON) | `app/api/draw/route.ts` | role-match (SSE vs JSON, but same auth + ownership shape) |
| `lib/elevenlabs/get-signed-url.ts` | server util (HTTP client) | request-response | `lib/auth/whitelist.ts` (small server util shape) + `lib/board/executor.ts` (throws + narrow result) | partial — no existing `lib/{service}/` HTTP wrapper |
| `lib/elevenlabs/types.ts` | TS types (barrel) | n/a | `lib/board/scenes/types.ts` + `lib/lesson-bus/events.ts` (discriminated unions) | role-match |
| `components/panels/voice-panel.tsx` (MODIFY) | client component (panel) | event-driven (SDK callbacks → bus) + request-response (fetch signed-url) | `components/panels/board-panel.tsx` | exact (panel pattern: fetch + SSE/SDK + bus emit + error UI) |
| `lib/lesson-bus/events.ts` (MODIFY — narrower than CONTEXT.md "types.ts") | TS types (discriminated union) | n/a | itself (already has `voice:state` union — verify) | exact |
| `package.json` (MODIFY) | manifest | n/a | itself | exact |
| `components/panels/__tests__/voice-panel.test.tsx` (**directory does not yet exist**) | unit test (component) | n/a | `components/avatar/__tests__/avatar.test.tsx` + `lib/trainer/__tests__/use-trainer-idle.test.ts` (bus mock) | role-match (no existing panel test) |
| `app/api/voice/signed-url/__tests__/route.test.ts` | unit test (route) | n/a | `app/api/draw/__tests__/route.test.ts` | exact |
| `lib/elevenlabs/__tests__/get-signed-url.test.ts` | unit test (fetch util) | n/a | `lib/auth/__tests__/whitelist.test.ts` (mock pattern) + `lib/__tests__/env.test.ts` (env injection) | role-match (no existing fetch-mock test) |
| `e2e/voice-flow.spec.ts` | E2E (Playwright) | event-driven + network-stub | `e2e/avatar.spec.ts` + `e2e/board-panel.spec.ts` | exact (same login + cookie + bus injection pattern) |

---

## Pattern Assignments

### `app/api/voice/signed-url/route.ts` (route, request-response)

**Analog:** `app/api/draw/route.ts`
**Why analog:** Same Phase 4 route-handler shape — `auth()` guard, JSON body parse, Drizzle ownership check, server-side env read, Russian error messages. Only the response shape differs (SSE in draw → plain JSON here). Both run on `runtime = 'nodejs'`.

**Imports pattern** (`app/api/draw/route.ts` lines 13-23):
```typescript
import { NextRequest } from 'next/server'
import { auth } from '@/auth'
import { db } from '@/lib/db'
import { lessons } from '@/lib/db/schema'
import { eq, and } from 'drizzle-orm'
```
> **Key:** `auth` is imported from `@/auth` (project root), NOT `@/lib/auth`. Confirmed in `auth.ts` line 15 (`export const { handlers, auth, signIn, signOut } = NextAuth({...})`). `lessons` table is imported by name (lowercase plural) directly from `@/lib/db/schema`.

**Runtime + dynamic flags** (`app/api/draw/route.ts` lines 44-45):
```typescript
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
```
> **Apply unchanged** — signed-url route also needs nodejs (`auth()` + Drizzle pool) + force-dynamic (no caching).

**Auth guard — must be first** (`app/api/draw/route.ts` lines 153-163):
```typescript
export async function POST(req: NextRequest) {
  console.log('[draw] Request received')

  // ── T-04-02-01: Auth guard — must be first, before any body parsing ─────
  const session = await auth()
  if (!session?.user?.id) {
    return new Response(
      JSON.stringify({ error: 'Войдите в систему' }),
      { status: 401, headers: { 'Content-Type': 'application/json' } },
    )
  }
```
> **Copy verbatim.** Russian message `'Войдите в систему'` is the project convention.

**Zod-free input validation** (`app/api/draw/route.ts` lines 165-190):
```typescript
  // ── Input validation ────────────────────────────────────────────────────
  let prompt = ''
  let lessonId = ''
  try {
    const body = (await req.json()) as { prompt?: unknown; lessonId?: unknown }
    prompt = typeof body.prompt === 'string' ? body.prompt.trim() : ''
    lessonId = typeof body.lessonId === 'string' ? body.lessonId.trim() : ''
  } catch {
    return new Response(
      JSON.stringify({ error: 'Неверный формат запроса' }),
      { status: 400, headers: { 'Content-Type': 'application/json' } },
    )
  }

  if (!lessonId) {
    return new Response(
      JSON.stringify({ error: 'lessonId обязателен' }),
      { status: 400, headers: { 'Content-Type': 'application/json' } },
    )
  }
```
> **Adapt:** signed-url only needs `lessonId` (drop `prompt`). Keep the `typeof === 'string' ? trim() : ''` defensive pattern and the manual 400 returns — NO zod here (project convention for route validation; zod reserved for `lib/env.ts` + `lib/trainer/config-schema.ts`).

**Ownership check** (`app/api/draw/route.ts` lines 192-204):
```typescript
  // ── T-04-02-02: Ownership check — lessonId must belong to session.user.id ─
  const lessonRow = await db
    .select({ id: lessons.id })
    .from(lessons)
    .where(and(eq(lessons.id, lessonId), eq(lessons.userId, session.user.id)))
    .limit(1)

  if (lessonRow.length === 0) {
    return new Response(
      JSON.stringify({ error: 'Этот урок не ваш' }),
      { status: 403, headers: { 'Content-Type': 'application/json' } },
    )
  }
```
> **Adapt:** select `{ id: lessons.id, topic: lessons.topic }` so the route can return `topic` in the JSON response (the client needs it for `firstMessage` override per D-06 / RESEARCH § Pattern 2). All else stays.

**Env var guard** (`app/api/draw/route.ts` lines 206-212):
```typescript
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) {
    return new Response(
      JSON.stringify({ error: 'Ошибка сервера. Попробуйте позже.' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } },
    )
  }
```
> **Adapt:** read **two** envs (`ELEVENLABS_API_KEY` + `ELEVENLABS_AGENT_ID`); use CONTEXT.md message `'Voice service не настроен'`; do NOT add these to `lib/env.ts` zod schema (the route guards per-request — same as `OPENAI_API_KEY` which is intentionally optional in `lib/env.ts` line 24 for CI/test).

**Differences from analog:**
- Response shape: `NextResponse.json({ signedUrl, topic })` (single shot) instead of `new Response(stream, { headers: { 'Content-Type': 'text/event-stream' } })`.
- No OpenAI agent loop, no SSE, no scene expansion. After ownership check, do `await getSignedUrl(agentId, apiKey)` and return JSON.
- Add a 502 catch around the 11labs call (analog is fail-soft inside the stream; route handler can hard-fail upstream errors).

---

### `lib/elevenlabs/get-signed-url.ts` (server util)

**Analog:** No existing `lib/{service}/` HTTP wrapper in repo. Closest is `lib/auth/whitelist.ts` (small pure async function with narrow signature). Style for "throw on failure" comes from `lib/auth/whitelist.ts` + `lib/__tests__/env.test.ts`.

**Function shape from whitelist** (`lib/auth/whitelist.ts` lines 14-25):
```typescript
import { eq } from 'drizzle-orm'
import { db, schema } from '@/lib/db'

export async function isEmailWhitelisted(email: string | undefined | null): Promise<boolean> {
  if (!email) return false
  const normalized = email.trim().toLowerCase()
  if (!normalized) return false
  const rows = await db
    .select({ id: schema.allowedEmails.id })
    .from(schema.allowedEmails)
    .where(eq(schema.allowedEmails.email, normalized))
    .limit(1)
  return rows.length > 0
}
```
> **Apply shape:**
> - Single named export, async function, narrow positional params (no options object), single-line return type.
> - Function lives in its own file (one util per file).
> - File header comment explaining what + why (project convention — every lib file has one; see `lib/auth/whitelist.ts` lines 1-10).

**Throw-on-non-ok pattern** (from RESEARCH § Pattern 2 lines 302-320, no in-repo analog for `fetch` wrapper):
```typescript
// lib/elevenlabs/get-signed-url.ts
export async function getSignedUrl(agentId: string, apiKey: string): Promise<string> {
  const url = new URL('https://api.elevenlabs.io/v1/convai/conversation/get-signed-url')
  url.searchParams.set('agent_id', agentId)

  const response = await fetch(url.toString(), {
    method: 'GET',
    headers: { 'xi-api-key': apiKey },
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
> Caller (`route.ts`) wraps in try/catch and returns 502 JSON on throw — matches `app/api/draw/route.ts` lines 386-390 (`catch (err) { console.error('[draw] ...', err); send({ type: 'error', error: 'Ошибка сервера...' }) }`).

**Differences from analog:**
- No DB access — pure HTTP wrapper around 11labs REST.
- Throws on failure (route does HTTP status translation). `whitelist.ts` returns boolean — we return string-or-throw because empty signed URL is a hard error, not a normal branch.
- File header should call out: server-only (uses `xi-api-key`); never imported by client code (anything in `'use client'` would leak the dependency boundary — TS will flag if it's imported into a `'use client'` component because `fetch` against api.elevenlabs.io with this key would expose it).

---

### `lib/elevenlabs/types.ts` (TS types)

**Analog:** `lib/lesson-bus/events.ts` (discriminated unions + named payload types) and `lib/board/scenes/types.ts` (small barrel of types for one subsystem).

**Naming pattern** (`lib/lesson-bus/events.ts` lines 8-30):
```typescript
export type LessonTestPayload  = { source: string; counter: number }
export type LessonStartPayload = { lessonId: string; at: Date }
// ...
export type VoiceStatePayload  = { state: 'idle' | 'listening' | 'speaking' | 'thinking' }
export type AvatarEmotionPayload = { emotion: 'neutral' | 'happy' | 'sad' | 'thinking' }
```
> **Apply:** PascalCase type names, no `I`-prefix, named string-literal unions inline (not separate enum).

**For Phase 6 — SDK callback types.** `@elevenlabs/react` 1.6.0 exports types we can re-export to keep import paths local:
```typescript
// lib/elevenlabs/types.ts
// Re-exports from @elevenlabs/react SDK callbacks so consumers in components/
// don't import directly from the SDK and we can swap implementations later.
export type ConversationMode = 'speaking' | 'listening'
export type ConversationStatus = 'connected' | 'connecting' | 'disconnected' | 'disconnecting'

// Our domain wrapper around the SDK's onError callback signature.
export type VoiceErrorKind =
  | 'mic_denied'      // NotAllowedError from getUserMedia
  | 'mic_not_found'   // NotFoundError
  | 'mic_busy'        // NotReadableError
  | 'signed_url_fetch' // POST /api/voice/signed-url failed
  | 'sdk'             // SDK onError
```
> **Why a domain wrapper:** RESEARCH § Pitfall 1 (lines 393-414) shows 3 distinct mic failure modes, each with its own Russian error message. Tagging them in our types lets the panel switch on a stable union rather than the raw DOMException name.

**Differences from analog:**
- No discriminated union with a `type` discriminator (the SDK shape doesn't need it). Just named unions of string literals.
- Single file in `lib/elevenlabs/` next to `get-signed-url.ts` — same module-folder convention as `lib/lesson-bus/`, `lib/board/`, `lib/trainer/`.

---

### `components/panels/voice-panel.tsx` (MODIFY — client component, event-driven)

**Analog:** `components/panels/board-panel.tsx`
**Why analog:** Same shape — `'use client'` panel that (1) fetches a server route in a click handler, (2) wires a streaming/event source to React state, (3) emits/consumes lesson-bus events, (4) renders shadcn `Card` + `Button` + lucide icon, (5) shows a Russian error block when something fails. The dynamic-import-of-heavy-lib pattern (`tldraw`) parallels our `@elevenlabs/react` situation — except SDK is small enough we don't need `dynamic()`.

**`'use client'` + import block** (`components/panels/board-panel.tsx` lines 1-18):
```typescript
'use client'
// BoardPanel — full tldraw integration ported from tldraw-test/app/page.tsx.
// Phase 4: real canvas + prompt UI + SSE processing + narration panel.
// ...
import dynamic from 'next/dynamic'
import { useCallback, useEffect, useRef, useState } from 'react'
import 'tldraw/tldraw.css'
import type { Editor } from 'tldraw'
import { executeToolCall } from '@/lib/board'
import { useLessonBus } from '@/lib/lesson-bus'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Loader2, Eraser } from 'lucide-react'
```
> **Apply:** keep `'use client'` (required — uses `useState` + browser-only APIs), keep the file header comment, import `useConversation` from `@elevenlabs/react`, keep `useLessonBus`, swap Eraser→Mic icon, drop Textarea (no prompt UI).

**Current voice-panel.tsx imports to preserve** (`components/panels/voice-panel.tsx` lines 9-15):
```typescript
import { useState } from 'react'
import { Mic } from 'lucide-react'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { useLessonBus } from '@/lib/lesson-bus'
import { Avatar } from '@/components/avatar/avatar'
import { useAvatarState } from '@/components/avatar/use-avatar-state'
```
> **Preserve unchanged.** Avatar + useAvatarState wiring is Phase 9 contract — don't touch it. Voice changes happen below the Avatar in the bottom half.

**Props shape — extend, don't replace** (`components/panels/voice-panel.tsx` lines 20-24):
```typescript
interface VoicePanelProps {
  lessonId?: string // Optional — Phase 6 voice integration will use this
}

export function VoicePanel({ lessonId: _lessonId }: VoicePanelProps = {}) {
```
> **Adapt:** make `lessonId: string` REQUIRED (no longer optional — Phase 6 always has it from `LessonShell`); add `topic: string` for `firstMessage` override. The parent `components/lesson-shell.tsx` line 117 already passes `lessonId={lessonId}` and has `topic` in scope (line 32 + 68) — must also be passed to `<VoicePanel topic={topic} ...>`.

**Click handler pattern: fetch route then start session** (analog: `board-panel.tsx` lines 105-120):
```typescript
  setRunning(true)
  setError(null)
  // ...
  try {
    const res = await fetch('/api/draw', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt: userPrompt, lessonId }),
    })

    if (!res.ok) {
      const text = await res.text().catch(() => '')
      throw new Error(text || `HTTP ${res.status}`)
    }
```
> **Apply same fetch + check ok + extract text shape.** Replace url with `/api/voice/signed-url`, body with `{ lessonId }`, parse JSON result `{ signedUrl, topic }` (no streaming reader needed — single JSON response). On `res.ok === false`, surface the message in `setError` exactly like board-panel does.

**Error display block** (`components/panels/board-panel.tsx` lines 319-324):
```tsx
          {/* Error display */}
          {error && (
            <div className="rounded border border-destructive/50 bg-destructive/10 px-2.5 py-1.5 text-xs text-destructive">
              <span className="font-semibold">Ошибка: </span>
              {error}
            </div>
          )}
```
> **Copy unchanged** for VoicePanel error UI. Russian `Ошибка:` prefix is project convention.

**Bus emit pattern + cleanup pattern** (from `components/avatar/use-avatar-state.ts` lines 73-78 + `lib/trainer/use-trainer-idle.ts`):
```typescript
  // Cleanup reset timer on unmount
  useEffect(() => {
    return () => {
      if (resetTimerRef.current) clearTimeout(resetTimerRef.current)
    }
  }, [])
```
> **Apply pattern:** add a `useEffect` cleanup that calls `conversation.endSession()` if `conversation.status === 'connected'` on unmount — fixes RESEARCH Pitfall 7 (mic stays red after navigation).

**`useCallback`-wrapped SDK callbacks** (RESEARCH § Pattern 3 lines 329-353, no in-repo analog because no SDK callback subscriber exists — but pattern matches `use-avatar-state.ts` lines 34-67 which wraps bus event handlers in `useCallback`):
```typescript
// From components/avatar/use-avatar-state.ts lines 34-50:
const handleVoiceState = useCallback(
  (payload: EventPayload<'voice:state'>) => {
    dispatch({ type: 'voice', state: payload.state })
    scheduleReset()
  },
  [scheduleReset],
)
```
> **Apply same shape** for `onConnect`, `onDisconnect`, `onModeChange`, `onError` passed to `useConversation` — stable refs prevent RESEARCH Pitfall 4 (stale closures).

**`SHOW_TEST_BUTTON` pattern to preserve** (`components/panels/voice-panel.tsx` lines 18 + 58-62):
```typescript
const SHOW_TEST_BUTTON = process.env.NEXT_PUBLIC_LESSON_BUS_TEST !== 'false'
// ...
{SHOW_TEST_BUTTON && (
  <Button size="sm" variant="outline" onClick={handleTestBus}>
    Тест шины
  </Button>
)}
```
> **Decision for plan:** drop the test button (Phase 6 puts a real button there) OR keep it inside a `<details>` debug section — recommend drop. The bus already has Avatar consuming `voice:state` so it'll be exercised in real flow.

**Differences from analog:**
- No SSE reader loop — single-shot fetch + JSON parse + `startSession({ signedUrl, connectionType: 'websocket', overrides: { agent: { firstMessage: ... } } })`.
- Adds `getUserMedia({ audio: true })` BEFORE `startSession` (RESEARCH § Pattern 1 + Pitfall 1 — SDK 1.x does not request mic).
- Two buttons (Start/Stop) instead of one (Объяснить + Очистить); button state driven by `conversation.status` (from SDK hook), not local `running` boolean.
- Layout preservation: top half Avatar stays untouched; only the bottom half (lines 50-63) is rewritten.

---

### `lib/lesson-bus/events.ts` (MODIFY — types)

**Analog:** itself.

**Current `voice:state` union** (`lib/lesson-bus/events.ts` line 28):
```typescript
export type VoiceStatePayload  = { state: 'idle' | 'listening' | 'speaking' | 'thinking' }
```

**Already-existing variants cover 4 of 5 SDK states.** CONTEXT.md D-07 mentions adding `'connected'`, but:
- RESEARCH § Open Q3 (line 621) flags that `'connected'` is NOT in the current union.
- RESEARCH § Pattern 3 line 330 maps `onConnect → bus.emit('voice:state', { state: 'idle' })` (use existing `'idle'` until first mode change).
- CONTEXT § specifics (line 169) acknowledges both options exist.

**Recommended decision for plan:** **DO NOT modify** this file. Map `onConnect → 'idle'` (avatar already at 🙂 after connection — semantically identical until SDK fires first `onModeChange`). Adding `'connected'` would also require updates to `lib/avatar/state-machine.ts` to handle it.

> **Note for planner:** CONTEXT.md `<specifics>` says "Currently has: `idle | listening | speaking`. Add: `connected`. Already has full discriminated union shape — just add to union." But CONTEXT.md is WRONG about the current union — it also has `'thinking'`. And RESEARCH § Open Q3 explicitly recommends the no-modify path. **Plan should choose Option B (no modify)** and document the deviation.

**If plan chooses Option A (add `connected`):**
- Line 28 becomes: `{ state: 'idle' | 'connected' | 'listening' | 'speaking' | 'thinking' }`
- Then `lib/avatar/state-machine.ts` reducer needs a case for `'connected'` — probably maps to `'idle'` anyway (no animation distinction).

---

### `package.json` (MODIFY — add SDK dep)

**Analog:** itself (already lists `tldraw`, `openai`, `next-auth`, etc.).

**Pattern from current `dependencies`** (`package.json` lines 24-49):
```json
    "openai": "6.37.0",
    "pg": "^8.20.0",
    "postgres": "^3.4.9",
    "react": "18.3.1",
    "react-dom": "18.3.1",
    "resend": "^6.12.3",
    ...
    "tldraw": "3.15.6",
```
> **Apply:** add `"@elevenlabs/react": "^1.6.0"` to `dependencies`. Use caret range (matches `^6.12.3`, `^8.20.0` for libs in active development). Pin-exact (no caret) is only used for `tldraw 3.15.6`, `openai 6.37.0`, `next 15.5.18`, `react 18.3.1`, `next-auth 5.0.0-beta.31` — these are libs where minor bumps have broken builds. `@elevenlabs/react` published 3 days ago (per RESEARCH line 9) — caret is correct.

**Install command per project script convention** (`package.json` lines 5-10):
```
"dev": "next dev",
"test": "vitest run --reporter=verbose",
"test:e2e": "playwright test --project=chromium",
```
> No special add-script — plan should call `npm install @elevenlabs/react@^1.6.0` (RESEARCH line 54). Single dep, brings `@elevenlabs/client@1.7.0` + `livekit-client` transitively.

---

### `components/panels/__tests__/voice-panel.test.tsx` (NEW unit test)

**Analog:** `components/avatar/__tests__/avatar.test.tsx` (vitest + testing-library render) + `lib/trainer/__tests__/use-trainer-idle.test.ts` (vi.mock for `@/lib/lesson-bus` + manual handler trigger) + RESEARCH § Code Examples lines 460-500 (vi.mock for `@elevenlabs/react` capturing options).

> ⚠️ **Directory does not yet exist.** Confirmed by `ls components/panels/__tests__/ → No such file or directory`. Plan must create the `__tests__` folder. This matches the project convention seen in `components/avatar/__tests__/` and `lib/*/__tests__/`.

**vitest header + render setup** (`components/avatar/__tests__/avatar.test.tsx` lines 1-8):
```typescript
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import React from 'react'

// No bus dependency needed — Avatar is a controlled component
const { Avatar } = await import('../avatar')

describe('Avatar component', () => {
  it('renders idle emoji and data-avatar-state="idle" by default', () => {
    render(React.createElement(Avatar, { state: 'idle' }))
```
> **Apply:** same imports. `React.createElement(...)` rather than JSX is the project convention in test files. Use top-level `await import('../voice-panel')` AFTER vi.mock blocks so mocks register before the module evaluates (same as draw-route.test.ts line 58).

**Mock `@/lib/lesson-bus` pattern** (`lib/trainer/__tests__/use-trainer-idle.test.ts` lines 7-30):
```typescript
const mockEmit = vi.fn()
const mockOn = vi.fn()
const mockOff = vi.fn()
const subscriptions: Map<string, Array<(payload: unknown) => void>> = new Map()

vi.mock('@/lib/lesson-bus', () => ({
  useLessonBus: () => ({
    emit: mockEmit,
    on: mockOn,
    off: mockOff,
  }),
  useLessonBusEvent: (
    event: string,
    handler: (payload: unknown) => void,
  ) => {
    if (!subscriptions.has(event)) subscriptions.set(event, [])
    subscriptions.get(event)!.push(handler)
  },
}))
```
> **Copy verbatim** — gives the test (a) `mockEmit` to assert bus emits, (b) `subscriptions` map to drive handlers for components that subscribe.

**Mock `@elevenlabs/react` pattern** (from RESEARCH § Code Examples lines 460-490, no in-repo SDK analog):
```typescript
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
```
> **Pattern:** module-level mutable `capturedOptions` so individual tests can fire `capturedOptions.onModeChange({ mode: 'listening' })` and assert `mockEmit` was called with `('voice:state', { state: 'listening' })`. Same shape as `_streamFactory` in `app/api/draw/__tests__/route.test.ts` line 25.

**Mock `fetch` + `getUserMedia`** (from RESEARCH § Code Examples lines 489-496):
```typescript
global.fetch = vi.fn()

Object.defineProperty(global.navigator, 'mediaDevices', {
  value: { getUserMedia: vi.fn().mockResolvedValue({}) },
  writable: true,
})
```
> Project test environment is happy-dom (`vitest.config.ts` line 8) which has navigator but no MediaDevices — this stub is required.

**Mock `Avatar` + `useAvatarState`** — recommend:
```typescript
vi.mock('@/components/avatar/avatar', () => ({
  Avatar: ({ state }: { state: string }) =>
    React.createElement('div', { 'data-avatar-state': state }, 'AVATAR'),
}))
vi.mock('@/components/avatar/use-avatar-state', () => ({
  useAvatarState: () => 'idle',
}))
```
> So the VoicePanel test doesn't pull in the avatar state machine + bus reducer in a unit test — keep it focused on Voice behavior.

**Test cases to write** (mirror `app/api/draw/__tests__/route.test.ts` style + Phase 9 avatar style):
1. renders «Запустить голос» button on initial mount (status: 'disconnected')
2. click calls `getUserMedia` then `fetch('/api/voice/signed-url', ...)` then `startSession(...)`
3. when fetch fails (`res.ok === false`), error block appears with Russian message; `startSession` not called
4. when `getUserMedia` rejects with `NotAllowedError`, specific Russian message shown (per RESEARCH § Pitfall 1)
5. firing captured `onModeChange({ mode: 'speaking' })` causes `mockEmit('voice:state', { state: 'speaking' })`
6. firing captured `onModeChange({ mode: 'listening' })` causes `mockEmit('voice:state', { state: 'listening' })`
7. firing captured `onDisconnect()` causes `mockEmit('voice:state', { state: 'idle' })`
8. clicking Stop calls `endSession`

**Differences from analog:**
- `avatar.test.tsx` is a controlled-component test (props in, DOM out). `voice-panel.test.tsx` is an integration-shaped unit test — multiple mocks (SDK + bus + fetch + getUserMedia) because the panel is the integration point.

---

### `app/api/voice/signed-url/__tests__/route.test.ts` (NEW unit test)

**Analog:** `app/api/draw/__tests__/route.test.ts` — **exact match**, route-handler test with auth mock + drizzle chain mock.

**Mock setup** (`app/api/draw/__tests__/route.test.ts` lines 1-22):
```typescript
import { describe, it, expect, vi, beforeEach, beforeAll } from 'vitest'
import { NextRequest } from 'next/server'

// ─── Mock auth ─────────────────────────────────────────────────────────────
vi.mock('@/auth', () => ({
  auth: vi.fn(),
}))

// ─── Mock DB (drizzle chain: select().from().where().limit()) ───────────────
vi.mock('@/lib/db', () => ({
  db: {
    select: vi.fn(),
  },
}))
vi.mock('@/lib/db/schema', () => ({
  lessons: { id: 'id', userId: 'user_id' },
}))
vi.mock('drizzle-orm', () => ({
  eq: vi.fn((a: unknown, b: unknown) => ({ field: a, value: b })),
  and: vi.fn((...args: unknown[]) => args),
}))
```
> **Copy verbatim**. Note `vi.mock('@/lib/db/schema', ...)` needs `lessons: { id: 'id', userId: 'user_id', topic: 'topic' }` because the signed-url route also selects `topic`.

**Request factory + drizzle chain factory** (`app/api/draw/__tests__/route.test.ts` lines 63-78):
```typescript
function makeRequest(body: unknown): NextRequest {
  return new NextRequest('http://localhost/api/draw', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

/** Build a db.select chain mock that resolves with `rows` at .limit() */
function makeDbChain(rows: unknown[]) {
  return {
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    limit: vi.fn().mockResolvedValue(rows),
  }
}
```
> **Adapt:** change url to `'http://localhost/api/voice/signed-url'`. `makeDbChain` reusable as-is.

**Per-test env injection** (`app/api/draw/__tests__/route.test.ts` lines 189-197):
```typescript
  it('returns 200 with text/event-stream when auth + lessonId are valid', async () => {
    process.env.OPENAI_API_KEY = 'sk-test-key-for-unit-tests'
    vi.mocked(auth).mockResolvedValue({ user: { id: 'user-1' } } as never)
    vi.mocked(db.select).mockReturnValue(makeDbChain([{ id: 'uuid-1' }]) as never)

    const res = await POST(makeRequest({ prompt: 'объясни 245+874 в столбик', lessonId: 'uuid-1' }))
    expect(res.status).toBe(200)
    expect(res.headers.get('Content-Type')).toContain('text/event-stream')
    delete process.env.OPENAI_API_KEY
  })
```
> **Adapt:** set BOTH `process.env.ELEVENLABS_API_KEY = 'sk_test_xxx'` and `process.env.ELEVENLABS_AGENT_ID = 'agent_test'`, delete both in cleanup. Body is just `{ lessonId }`. Mock `getSignedUrl` from `@/lib/elevenlabs/get-signed-url` to return `'wss://mock.elevenlabs.io/signed-url-test'`.

**Mock the local SDK util** — add to mocks block:
```typescript
vi.mock('@/lib/elevenlabs/get-signed-url', () => ({
  getSignedUrl: vi.fn().mockResolvedValue('wss://mock.elevenlabs.io/signed-url-test'),
}))
```
> This isolates the route test from `lib/elevenlabs/get-signed-url.test.ts` which separately tests the fetch wrapper.

**Test cases — same matrix as draw:**
1. **401:** auth() returns null → 401, Russian message `'Войдите в систему'`
2. **401:** session without user.id → 401
3. **400:** lessonId missing from body → 400, message `'lessonId обязателен'`
4. **400:** body is not valid JSON → 400, message `'Неверный формат запроса'`
5. **403:** lesson not owned (db returns `[]`) → 403, message `'Этот урок не ваш'`
6. **500:** ELEVENLABS_API_KEY missing → 500, message `'Voice service не настроен'`
7. **500:** ELEVENLABS_AGENT_ID missing → 500
8. **200:** happy path → JSON body `{ signedUrl: 'wss://...', topic: 'тема' }` (`topic` from mocked db row)
9. **502:** `getSignedUrl` throws → 502, generic message
10. response `Content-Type` is `application/json` (not `text/event-stream`)

**Differences from analog:**
- No SSE assertion helpers needed (no `readSSEEvents` function from draw test).
- No OpenAI SDK mock needed; the `getSignedUrl` mock replaces it.
- Adds a 502-on-upstream-error case that the draw route doesn't have (draw stream sends `{ type: 'error' }` inside the stream — here we hard-fail before opening any stream).

---

### `lib/elevenlabs/__tests__/get-signed-url.test.ts` (NEW unit test)

**Analog:** `lib/auth/__tests__/whitelist.test.ts` (mocking dependencies + asserting calls) + `lib/__tests__/env.test.ts` (`vi.stubGlobal`-equivalent via `process.env` mutation).

**No in-repo `fetch`-mock test exists.** Use `vi.stubGlobal('fetch', ...)` pattern (vitest standard) — closest in-repo signal is `lib/__tests__/env.test.ts` lines 8-28 (per-test mutate-then-restore of `process.env`).

**Setup + teardown shape** (`lib/__tests__/env.test.ts` lines 1-28):
```typescript
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

describe('lib/env', () => {
  const savedEnv: Record<string, string | undefined> = {}
  const managedKeys = ['DATABASE_URL', /* ... */]

  beforeEach(() => {
    for (const key of managedKeys) {
      savedEnv[key] = process.env[key]
      delete process.env[key]
    }
    vi.resetModules()
  })

  afterEach(() => {
    for (const key of managedKeys) {
      if (savedEnv[key] !== undefined) {
        process.env[key] = savedEnv[key]
      } else {
        delete process.env[key]
      }
    }
    vi.resetModules()
  })
```
> **Don't apply env shape** — `getSignedUrl` takes `apiKey` as a function parameter, not from env. But the save/restore pattern is useful if any test wants to check that the function does NOT read env (negative test).

**Mock fetch pattern** (project convention from how `whitelist.test.ts` mocks db lines 4-7):
```typescript
const { fetchMock } = vi.hoisted(() => {
  const fetchMock = vi.fn()
  return { fetchMock }
})

vi.stubGlobal('fetch', fetchMock)

beforeEach(() => {
  fetchMock.mockReset()
})
```
> Use `vi.hoisted` + `vi.stubGlobal` (vitest 3+ idiom). Same `vi.hoisted` pattern as `whitelist.test.ts` line 4.

**Test cases:**
1. **Happy path:** fetch resolves `{ ok: true, json: () => ({ signed_url: 'wss://x' }) }` → function returns `'wss://x'`; assert `fetchMock` called once with URL containing `agent_id=agent_test` and `headers: { 'xi-api-key': 'sk_test' }`.
2. **Non-200:** fetch resolves `{ ok: false, status: 401, text: () => 'unauthorized' }` → throws `Error` whose message contains `HTTP 401` and `unauthorized`.
3. **Missing signed_url field:** `{ ok: true, json: () => ({}) }` → throws `'missing signed_url field'`.
4. **Cache header:** assert `fetch` called with `cache: 'no-store'` (RESEARCH line 310 — single-use freshness).
5. **No API key in URL:** assert URL string does NOT contain `'sk_'` substring (defensive — the API key should travel only in the header, never the URL).

**Differences from analog:**
- Mocks `global.fetch` instead of `@/lib/db`. Otherwise identical Vitest+vi shape to `whitelist.test.ts`.
- No need to mock auth/session — pure function with no implicit context.

---

### `e2e/voice-flow.spec.ts` (NEW Playwright)

**Analog:** `e2e/avatar.spec.ts` (bus injection via `window.__lessonBus`) + `e2e/board-panel.spec.ts` (full session login + cookie injection + lesson seed).

**Imports + base URL** (`e2e/avatar.spec.ts` lines 9-24):
```typescript
import { test, expect, chromium } from '@playwright/test'
import type { BrowserContext } from '@playwright/test'
import {
  makeTestEmail,
  resetTestDb,
  readMagicLinkFor,
  clearMagicLinkFile,
} from './fixtures/db-setup'
import { config as loadDotenv } from 'dotenv'
import { resolve } from 'path'
import pkg from 'pg'

const { Client } = pkg
loadDotenv({ path: resolve(process.cwd(), '.env.local') })

const BASE_URL = process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:3000'
```
> **Copy verbatim.** Same fixture imports, same dotenv loading, same `BASE_URL` derivation.

**Seed helper** (`e2e/avatar.spec.ts` lines 47-75):
```typescript
async function seedAvatarUser(email: string): Promise<{ userId: string; lessonId: string }> {
  const lower = email.toLowerCase()

  await pgQuery(
    'INSERT INTO allowed_email (email, notes) VALUES ($1, $2) ON CONFLICT (email) DO NOTHING',
    [lower, 'e2e avatar test'],
  )
  // ... upsert user ...
  // ... insert in_progress lesson ...
  return { userId, lessonId }
}
```
> **Adapt:** rename to `seedVoiceUser`, change notes string to `'e2e voice test'`, change topic to `'E2E голос'` (so we can later assert on it in the `firstMessage` payload if needed).

**beforeAll login + cookie save** (`e2e/avatar.spec.ts` lines 82-117):
```typescript
test.describe('Avatar panel (AVT-01)', () => {
  test.beforeAll(async () => {
    const seeded = await seedAvatarUser(email)
    lessonId = seeded.lessonId

    const browser = await chromium.launch()
    const context = await browser.newContext()
    const page = await context.newPage()

    try {
      clearMagicLinkFile()
      await page.goto(`${BASE_URL}/login`)
      await page.getByLabel(/Email родителя/).fill(email)
      await page.getByRole('button', { name: /Отправить ссылку/ }).click()
      await page.waitForURL(/\/login\?sent=1/)
      // ... poll for magic link, click, save cookies ...
      savedCookies = await context.cookies()
    } finally {
      await browser.close()
    }
  })

  test.afterAll(async () => {
    await resetTestDb()
  })
```
> **Copy verbatim.** Same login dance, same cookie persistence across tests.

**Network stub for /api/voice/signed-url** (from RESEARCH § Code Examples lines 511-517):
```typescript
await page.route('**/api/voice/signed-url', (route) =>
  route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ signedUrl: 'wss://mock.local/agent_test', topic: 'Тест' }),
  }),
)
```
> Critical — RESEARCH Pitfall 8 (lines 452-456): "E2E tests MUST mock the SDK, NEVER hit real 11labs. Daily call limit 100." Stubbing at network layer is the project pattern; no in-repo precedent for `page.route` but it's a standard Playwright API.

**Bus injection pattern** (`e2e/avatar.spec.ts` lines 161-176):
```typescript
test('avatar changes state to "speaking" when voice:state.speaking emitted via window.__lessonBus', async ({
  page,
}) => {
  await goToLesson(page)
  const avatar = page.locator('[data-avatar-state]').first()
  await expect(avatar).toBeVisible({ timeout: 10_000 })

  await page.evaluate(() => {
    if (!window.__lessonBus) throw new Error('window.__lessonBus not available')
    window.__lessonBus.emit('voice:state', { state: 'speaking' })
  })

  await expect(avatar).toHaveAttribute('data-avatar-state', 'speaking', { timeout: 2_000 })
})
```
> **Copy verbatim** for the avatar-side assertions in voice-flow.spec.ts.

**Test cases to write** (combining avatar pattern + voice flow):
1. **Mic button visible:** lesson page loads, `getByRole('button', { name: /Запустить голос/ })` is visible.
2. **Click triggers fetch + avatar listening:** click button → `page.route` mock confirms call was made → emit `window.__lessonBus.emit('voice:state', { state: 'listening' })` to simulate SDK callback → assert avatar `[data-avatar-state="listening"]`.
3. **Speaking transition:** emit `'voice:state' { state: 'speaking' }` → avatar `[data-avatar-state="speaking"]`.
4. **Stop returns to idle:** emit `'voice:state' { state: 'idle' }` → avatar `[data-avatar-state="idle"]`.
5. **Fetch failure shows Russian error:** override `page.route` to return 500 → click → error block visible with `Ошибка:` prefix.
6. **No `ELEVENLABS_*` in client bundle** (UAT criterion D-09 step 10): `page.evaluate(() => Object.keys(window).filter(k => k.includes('ELEVENLABS')))` → empty array; also check `page.content()` does not contain `'sk_'` or `'agent_7701'`.

**`goToLesson` helper** (`e2e/avatar.spec.ts` lines 127-151) — copy verbatim. Same Neon warm-up + 3-retry pattern.

**Differences from analog:**
- Adds `page.route('**/api/voice/signed-url', ...)` network stub (avatar.spec.ts doesn't stub anything because it only fires bus events).
- Does NOT need to wait for tldraw mount (.tl-canvas) — VoicePanel renders immediately. Wait for the button locator instead.
- Asserts on Russian button text + error text (avatar.spec.ts asserts only on emoji + state attribute).

---

## Shared Patterns

### Authentication (`auth()` from project root)

**Source:** `auth.ts` line 15 (`export const { handlers, auth, signIn, signOut } = NextAuth({...})`)
**Import:** `import { auth } from '@/auth'` (NOT `@/lib/auth` — verified in `app/api/draw/route.ts` line 19 and `app/lesson/[id]/page.tsx` line 7)
**Apply to:** `app/api/voice/signed-url/route.ts` + (mock) `app/api/voice/signed-url/__tests__/route.test.ts`

```typescript
const session = await auth()
if (!session?.user?.id) {
  return new Response(
    JSON.stringify({ error: 'Войдите в систему' }),
    { status: 401, headers: { 'Content-Type': 'application/json' } },
  )
}
```

### Drizzle Ownership Check Pattern (lesson belongs to user)

**Source:** `app/api/draw/route.ts` lines 192-204, also `app/lesson/[id]/page.tsx` lines 44-49.
**Apply to:** `app/api/voice/signed-url/route.ts`

```typescript
import { db } from '@/lib/db'
import { lessons } from '@/lib/db/schema'
import { eq, and } from 'drizzle-orm'

const rows = await db
  .select({ id: lessons.id, topic: lessons.topic })  // include topic for voice route
  .from(lessons)
  .where(and(eq(lessons.id, lessonId), eq(lessons.userId, session.user.id)))
  .limit(1)

if (rows.length === 0) {
  return new Response(
    JSON.stringify({ error: 'Этот урок не ваш' }),
    { status: 403, headers: { 'Content-Type': 'application/json' } },
  )
}
```

### Russian Error Messages (UI)

**Source:** Project convention across `app/api/draw/route.ts` + `components/panels/board-panel.tsx` + `lib/auth/email-template.ts`.
**Apply to:** Every user-visible error string in this phase.

| Layer | Message |
|-------|---------|
| Route 401 | `'Войдите в систему'` |
| Route 400 (bad JSON) | `'Неверный формат запроса'` |
| Route 400 (missing field) | `'lessonId обязателен'` |
| Route 403 | `'Этот урок не ваш'` |
| Route 500 (env missing) | `'Voice service не настроен'` |
| Route 502 (11labs failure) | `'Не удалось подключиться к голосовому сервису'` |
| Client (mic denied) | `'Доступ к микрофону запрещён. Разрешите его в настройках браузера и попробуйте снова.'` |
| Client (no mic device) | `'Микрофон не найден. Подключите микрофон и попробуйте снова.'` |
| Client (mic busy) | `'Микрофон занят другим приложением (Zoom, Discord). Закройте его и попробуйте снова.'` |
| Client (fetch failed) | `'Не удалось получить ссылку. Попробуйте снова.'` |
| Client (SDK error) | `'Ошибка голосового сервиса. Попробуйте снова.'` |

> Source for mic strings: RESEARCH § Pitfall 1 lines 393-413.

### Lesson Bus Hooks Usage Pattern

**Source:** `components/avatar/use-avatar-state.ts` lines 12-71 (canonical example of how to use `useLessonBus` + `useLessonBusEvent` from a panel).
**Apply to:** `components/panels/voice-panel.tsx`

```typescript
import { useLessonBus } from '@/lib/lesson-bus'
// ...
const bus = useLessonBus()
// In a useCallback (stable ref):
const handleConnect = useCallback(() => {
  bus.emit('voice:state', { state: 'idle' })  // Use 'idle' not 'connected' — see Phase 6 type decision
}, [bus])
```

### Vitest Mock Conventions

**Source:** `app/api/draw/__tests__/route.test.ts` (route tests), `lib/auth/__tests__/whitelist.test.ts` (lib tests), `lib/trainer/__tests__/use-trainer-idle.test.ts` (bus subscriber tests).
**Apply to:** All three test files in this phase.

| Convention | Rule |
|------------|------|
| Mock placement | Top of file, BEFORE `import { POST } from '../route'` etc. — otherwise hoisting breaks |
| Drizzle ORM mock | `vi.mock('drizzle-orm', () => ({ eq: vi.fn(...), and: vi.fn(...) }))` exactly as in draw route test lines 18-21 |
| Schema mock | `vi.mock('@/lib/db/schema', () => ({ lessons: { id: 'id', userId: 'user_id', topic: 'topic' } }))` — string markers, not real Drizzle columns |
| Stable mock factory | Use module-level `let _factoryVar = makeDefault()` pattern (draw test line 25) when tests need to override per-case |
| `vi.hoisted` | Use when test needs a reference variable BEFORE `vi.mock` (whitelist test lines 4-7) |
| Russian assertions | OK in test names (`it('returns 401 when not authenticated...')`) and in test data — match the runtime Russian message exactly |

### E2E Login + Lesson Seed Pattern (full reuse)

**Source:** `e2e/avatar.spec.ts` lines 84-117 + `e2e/board-panel.spec.ts` lines 84-117 (identical shape).
**Apply to:** `e2e/voice-flow.spec.ts`

Steps in order (do not deviate — this is load-bearing for E2E reliability):
1. `test.beforeAll` → seed user + `in_progress` lesson via raw `pg.Client` (not Drizzle — see `e2e/fixtures/db-setup.ts` line 6).
2. Launch standalone chromium, fill login form, poll `readMagicLinkFor(email, BASE_URL)` up to 30 × 200ms, click magic link, wait for `/lessons`.
3. `savedCookies = await context.cookies()` then close browser.
4. Per-test: `await page.context().addCookies(savedCookies)` then `goToLesson(page)` (Neon warm-up + 3-retry navigation).
5. `test.afterAll(resetTestDb)` — cleans by `e2e-test+` prefix.

---

## No Analog Found

None — every file has a strong in-repo analog. Two files lean on RESEARCH.md examples (Russian-text mic-permission UX + the SDK-specific mock shape) because no prior code in the repo deals with `@elevenlabs/react` or `getUserMedia`, but the surrounding scaffolding (vi.mock conventions, bus mock, Card+Button layout, error blocks) all has clear precedent.

| File | Caveat |
|------|--------|
| `lib/elevenlabs/get-signed-url.ts` | No existing `lib/{service}/` HTTP wrapper — combines `whitelist.ts` function shape with new fetch+throw body from RESEARCH § Pattern 2. |
| `components/panels/__tests__/voice-panel.test.tsx` | The `components/panels/__tests__/` directory does not exist yet; plan must create it. Mock pattern combines `avatar.test.tsx` (render+screen) + `use-trainer-idle.test.ts` (bus mock) + RESEARCH § Code Examples (SDK mock). |
| `lib/elevenlabs/__tests__/get-signed-url.test.ts` | No existing `vi.stubGlobal('fetch', ...)` test in repo. Pattern is vitest 3 standard; combine with `vi.hoisted` pattern from `whitelist.test.ts`. |

---

## Metadata

**Analog search scope:**
- `app/api/draw/` (Phase 4 SSE route + tests — closest route analog)
- `app/lesson/[id]/page.tsx` (Server Component auth + ownership precedent)
- `components/panels/` (board-panel, voice-panel current state)
- `components/avatar/` (state hook + component test pattern)
- `lib/auth/` (small server util shape + test)
- `lib/lesson-bus/` (event contract, hook patterns)
- `lib/trainer/__tests__/` (bus-subscriber test mocks)
- `lib/__tests__/env.test.ts` (per-test env mutation)
- `e2e/` (avatar.spec.ts, board-panel.spec.ts, fixtures/db-setup.ts)
- Root `auth.ts`, `package.json`, `vitest.config.ts`, `playwright.config.ts`

**Files read in full or in targeted ranges:**
- `auth.ts` (full, 43 lines)
- `app/api/draw/route.ts` (full, 408 lines)
- `app/api/draw/__tests__/route.test.ts` (full, 322 lines)
- `components/panels/voice-panel.tsx` (full, 67 lines)
- `components/panels/board-panel.tsx` (full, 388 lines)
- `lib/lesson-bus/events.ts` (full, 53 lines)
- `lib/lesson-bus/hooks.ts` (full, 38 lines)
- `lib/lesson-bus/index.ts` (full, 24 lines)
- `lib/env.ts` (full, 30 lines)
- `lib/auth/whitelist.ts` (full, 25 lines)
- `lib/auth/__tests__/whitelist.test.ts` (full, 73 lines)
- `lib/__tests__/env.test.ts` (full, 64 lines)
- `lib/db/schema.ts` (full, 115 lines)
- `lib/trainer/__tests__/use-trainer-idle.test.ts` (first 80 lines for mock pattern)
- `components/avatar/avatar.tsx` (full, 72 lines)
- `components/avatar/use-avatar-state.ts` (full, 81 lines)
- `components/avatar/__tests__/avatar.test.tsx` (full, 69 lines)
- `e2e/avatar.spec.ts` (full, 199 lines)
- `e2e/board-panel.spec.ts` (lines 1-212)
- `e2e/fixtures/db-setup.ts` (full, 176 lines)
- `app/lesson/[id]/page.tsx` (full, 133 lines)
- `.planning/phases/06-voice/06-CONTEXT.md` (full, 211 lines)
- `.planning/phases/06-voice/06-RESEARCH.md` (lines 1-300 + 300-649)
- `.planning/PHASE-6-SETUP-2026-05-10.md` (full, 376 lines)
- `vitest.config.ts` (full, 17 lines)
- `package.json` (lines 1-50)

**Pattern extraction date:** 2026-05-11
