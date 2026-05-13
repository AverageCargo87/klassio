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
const useLessonBusEventMock = vi.fn((evt: string) => { subscribedEvents.push(evt) })
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
    const callsAfterFirstRender = useLessonBusEventMock.mock.calls.length
    // Simulate SDK status change: conversation object identity changes but the panel must
    // not redundantly re-register the same event N times. useLessonBusEvent's React
    // deps (event, handler) take care of this — handler must be wrapped in useCallback.
    returnRef = { ...returnRef, status: 'connecting' }
    rerender(React.createElement(VoicePanel, { lessonId: 'L1', topic: 'T', trainerConfig: null } as never))
    returnRef = { ...returnRef, status: 'connected' }
    rerender(React.createElement(VoicePanel, { lessonId: 'L1', topic: 'T', trainerConfig: null } as never))
    // After 2 re-renders the useLessonBusEvent call count should be bounded (= initial + 1 update per event with stable handler refs).
    // Strict invariant: ≤ 2× initial — handler refs must be stable via useCallback.
    expect(useLessonBusEventMock.mock.calls.length).toBeLessThanOrEqual(callsAfterFirstRender * 2)
  })

  it('VoicePanel does NOT add any new useEffect with conversation in deps (regression guard)', async () => {
    // Static check: read the source and ensure no new "useEffect(...[conversation]..." pattern
    const { readFileSync } = await import('node:fs')
    const src = readFileSync(new URL('../voice-panel.tsx', import.meta.url), 'utf8')
    // Allow exactly the latched-ref pattern; disallow [conversation] (object) in any other useEffect.
    const occurrences = (src.match(/\}, \[conversation\]\)/g) || []).length
    expect(occurrences).toBe(0)
  })
})
