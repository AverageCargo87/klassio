// Phase 8 Wave 0 RED — guard against Phase 6.5 cleanup-bug recurrence when new bus
// subscriptions are added to VoicePanel. The bug: `useEffect` with `[conversation]`
// in deps re-runs on every status/mode update and prematurely tears down WS.
// Fix pattern (locked): useLessonBusEvent for bus subs; useRef for conversation; empty deps.
// Wave 2 plan 08-04 implements the subscriptions safely; this scaffold lands RED until then.
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, cleanup } from '@testing-library/react'
import React from 'react'

const mockSendContextualUpdate = vi.fn()
const mockStartSession = vi.fn()
const mockEndSession = vi.fn()
type ConvRef = {
  status: string;
  mode: string;
  sendContextualUpdate: typeof mockSendContextualUpdate;
  startSession: typeof mockStartSession;
  endSession: typeof mockEndSession;
  isSpeaking: boolean;
  isListening: boolean;
  isMuted: boolean;
}
let returnRef: ConvRef
returnRef = {
  status: 'disconnected', mode: 'listening',
  sendContextualUpdate: mockSendContextualUpdate,
  startSession: mockStartSession, endSession: mockEndSession,
  isSpeaking: false, isListening: false, isMuted: false,
}

vi.mock('@elevenlabs/react', () => ({
  ConversationProvider: ({ children }: { children: React.ReactNode }) => React.createElement(React.Fragment, null, children),
  useConversation: () => returnRef,
}))

const subscribedEvents: string[] = []
// Track unique (event, handler) tuples so duplicate re-invocations with the
// SAME handler ref do NOT inflate the count. This mirrors the real
// `useLessonBusEvent` semantics: its inner useEffect deps are [bus, event, handler],
// so a re-render with stable refs does NOT actually re-subscribe.
const uniqueSubscriptions = new Set<string>()
const subscriptionCallSites: Array<{ evt: string; handler: unknown }> = []
const useLessonBusEventMock = vi.fn((evt: string, handler: unknown) => {
  subscribedEvents.push(evt)
  subscriptionCallSites.push({ evt, handler })
  // Stringify by identity: use a marker map keyed by handler reference.
  // We piggy-back on Set/Map identity semantics: if (evt, handler-ref) was already
  // seen, the corresponding tag is identical and the Set.size stays the same.
  uniqueSubscriptions.add(`${evt}::${handlerIdentity(handler)}`)
})
// Memoise handler-ref → numeric id mapping so we count distinct refs.
const handlerIds = new WeakMap<object, number>()
let nextHandlerId = 0
function handlerIdentity(h: unknown): number {
  if (typeof h !== 'function' && (typeof h !== 'object' || h === null)) return -1
  const key = h as object
  let id = handlerIds.get(key)
  if (id === undefined) {
    id = nextHandlerId++
    handlerIds.set(key, id)
  }
  return id
}
vi.mock('@/lib/lesson-bus', () => ({
  useLessonBus: () => ({ emit: vi.fn(), on: vi.fn(), off: vi.fn() }),
  useLessonBusEvent: useLessonBusEventMock,
}))

vi.mock('@/components/avatar/avatar', () => ({
  Avatar: () => React.createElement('div', null, 'AV'),
}))
vi.mock('@/components/avatar/use-avatar-state', () => ({ useAvatarState: () => 'neutral' }))

const { VoicePanel } = await import('../voice-panel')

beforeEach(() => {
  subscribedEvents.length = 0
  subscriptionCallSites.length = 0
  uniqueSubscriptions.clear()
  useLessonBusEventMock.mockClear()
  cleanup()
})

describe('VoicePanel — Phase 6.5 cleanup-bug guard for Phase 8 subscriptions (PED-02)', () => {
  it('uses useLessonBusEvent (not bare useEffect + bus.on) for trainer event forwarding', () => {
    render(React.createElement(VoicePanel, { lessonId: 'L1', topic: 'T', trainerConfig: null } as never))
    // Three trainer events forwarded per D-08:
    expect(subscribedEvents).toContain('trainer:answer_submitted')
    expect(subscribedEvents).toContain('trainer:hint_opened')
    expect(subscribedEvents).toContain('trainer:idle_15s')
  })

  it('task_focused is NOT subscribed (allow-list discipline per D-08)', () => {
    render(React.createElement(VoicePanel, { lessonId: 'L1', topic: 'T', trainerConfig: null } as never))
    expect(subscribedEvents).not.toContain('trainer:task_focused')
  })

  it('re-rendering with changed conversation status does NOT re-register useLessonBusEvent subscriptions for the same event', () => {
    const { rerender } = render(React.createElement(VoicePanel, { lessonId: 'L1', topic: 'T', trainerConfig: null } as never))
    const uniqueAfterFirstRender = uniqueSubscriptions.size
    // Simulate SDK status change: conversation object identity changes but the panel must
    // not redundantly re-register the same event N times. useLessonBusEvent's React
    // deps (event, handler) take care of this — handler must be wrapped in useCallback.
    returnRef = { ...returnRef, status: 'connecting' }
    rerender(React.createElement(VoicePanel, { lessonId: 'L1', topic: 'T', trainerConfig: null } as never))
    returnRef = { ...returnRef, status: 'connected' }
    rerender(React.createElement(VoicePanel, { lessonId: 'L1', topic: 'T', trainerConfig: null } as never))
    // After 2 re-renders, the count of UNIQUE (event, handler-ref) pairs must
    // not grow — handler refs are wrapped in useCallback with deps that do not
    // change when conversation status flips. If the count grows, handlers are
    // being recreated each render and would cause real useLessonBusEvent's
    // internal useEffect to re-subscribe — that's the Phase 6.5 cleanup-bug
    // failure mode we're guarding against here.
    expect(uniqueSubscriptions.size).toBe(uniqueAfterFirstRender)
  })

  it('VoicePanel does NOT add any new useEffect with conversation in deps (regression guard)', async () => {
    // Static check: read the source and ensure no new "useEffect(...[conversation]..." pattern.
    // This is the Phase 6.5 cleanup-bug failure mode — a useEffect with the
    // SDK's `conversation` object in its deps re-runs on every status change
    // and tears down the WS prematurely.
    //
    // useCallback with [conversation] is SAFE and expected — handleStart/handleStop
    // need the latest endSession reference. Only useEffect is the bug surface.
    const { readFileSync } = await import('node:fs')
    const path = await import('node:path')
    // process.cwd() inside vitest is the project root; resolve relative to repo layout.
    // Avoid `new URL('…', import.meta.url)` — under vitest+happy-dom on Windows,
    // import.meta.url can be a `vite-node://` scheme URL that node:fs rejects.
    const filePath = path.resolve(process.cwd(), 'components/panels/voice-panel.tsx')
    const src = readFileSync(filePath, 'utf8')
    // Match `useEffect(...something...)`-style hook calls where the dep array is
    // exactly `[conversation]`. Multiline-dotall regex catches multi-line bodies.
    // useCallback / useMemo with `[conversation]` are SAFE and intentionally allowed.
    const unsafeUseEffect = /useEffect\s*\([\s\S]*?\}\s*,\s*\[conversation\]\s*\)/g
    const occurrences = (src.match(unsafeUseEffect) || []).length
    expect(occurrences).toBe(0)
  })
})
