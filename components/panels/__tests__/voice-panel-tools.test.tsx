// Phase 8 Wave 0 RED — Wave 2 plan 08-04 wires clientTools + dynamicVariables into VoicePanel.
// This RED scaffold asserts the wiring once the green plan lands.
// Covers LLM-01 (clientTools + dynamicVariables wiring + fire-and-forget INV-02).
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, cleanup, fireEvent, act } from '@testing-library/react'
import React from 'react'

// Capture clientTools + dynamicVariables from the SDK boundary
let capturedClientTools: Record<string, (p: unknown) => unknown> | undefined
let capturedDynamicVariables: Record<string, string | number | boolean> | undefined

const mockStartSession = vi.fn((opts: { dynamicVariables?: Record<string, string | number | boolean> }) => {
  capturedDynamicVariables = opts?.dynamicVariables
})
const mockEndSession = vi.fn()
const mockSendContextualUpdate = vi.fn()
const baseReturn = {
  status: 'disconnected' as const,
  mode: 'listening' as const,
  isSpeaking: false, isListening: false, isMuted: false,
  startSession: mockStartSession,
  endSession: mockEndSession,
  sendContextualUpdate: mockSendContextualUpdate,
}
const capturedReturn = { ...baseReturn }

vi.mock('@elevenlabs/react', () => ({
  ConversationProvider: ({ children, ...options }: { children: React.ReactNode; clientTools?: Record<string, (p: unknown) => unknown> }) => {
    if (options?.clientTools) capturedClientTools = options.clientTools
    return React.createElement(React.Fragment, null, children)
  },
  useConversation: (options: { clientTools?: Record<string, (p: unknown) => unknown> }) => {
    if (options?.clientTools) capturedClientTools = options.clientTools
    return capturedReturn
  },
}))

const mockEmit = vi.fn()
const stableBus = { emit: mockEmit, on: vi.fn(), off: vi.fn() }
vi.mock('@/lib/lesson-bus', () => ({
  useLessonBus: () => stableBus,
  useLessonBusEvent: vi.fn(),
  LessonBusProvider: ({ children }: { children: React.ReactNode }) => React.createElement(React.Fragment, null, children),
}))

vi.mock('@/components/avatar/avatar', () => ({
  Avatar: ({ state }: { state: string }) => React.createElement('div', { 'data-avatar-state': state }, 'AVATAR'),
}))
vi.mock('@/components/avatar/use-avatar-state', () => ({ useAvatarState: () => 'neutral' }))

const fetchMock = vi.hoisted(() => vi.fn())
vi.stubGlobal('fetch', fetchMock)
Object.defineProperty(global.navigator, 'mediaDevices', {
  value: { getUserMedia: vi.fn().mockResolvedValue({ getTracks: () => [{ stop: vi.fn() }] }) },
  writable: true,
  configurable: true,
})

const { VoicePanel } = await import('../voice-panel')

const SAMPLE_CONFIG = {
  title: 'Сложение',
  tasks: [
    { id: 'task-1', type: 'numeric-input' as const, prompt: 'p', correct: 1 },
    { id: 'task-2', type: 'numeric-input' as const, prompt: 'p', correct: 2 },
    { id: 'task-3', type: 'single-choice' as const, prompt: 'p', correct: 0, options: ['a','b'] },
  ],
}

beforeEach(() => {
  capturedClientTools = undefined
  capturedDynamicVariables = undefined
  mockStartSession.mockClear()
  mockEmit.mockClear()
  fetchMock.mockReset()
  cleanup()
})

describe('VoicePanel — Phase 8 clientTools + dynamicVariables wiring (LLM-01)', () => {
  it('passes clientTools with 6 keys to ConversationProvider or useConversation', () => {
    // RED — VoicePanel does not yet accept trainerConfig prop or pass clientTools.
    // Wave 2 plan 08-04 adds this.
    render(React.createElement(VoicePanel, { lessonId: 'L1', topic: 'T', trainerConfig: SAMPLE_CONFIG } as never))
    expect(capturedClientTools).toBeDefined()
    expect(Object.keys(capturedClientTools!).sort()).toEqual([
      'clear_board', 'draw_explanation', 'get_lesson_state',
      'goto_trainer_task', 'highlight_trainer_task', 'show_hint',
    ])
  })

  it('startSession is called with dynamicVariables = { lesson_topic, total_tasks }', async () => {
    fetchMock.mockResolvedValueOnce({ ok: true, json: async () => ({ signedUrl: 'wss://x', topic: 'Сложение' }) })
    const { getByText } = render(React.createElement(VoicePanel, { lessonId: 'L1', topic: 'Сложение', trainerConfig: SAMPLE_CONFIG } as never))
    await act(async () => { fireEvent.click(getByText('Запустить голос')) })
    await new Promise(r => setTimeout(r, 0))
    expect(mockStartSession).toHaveBeenCalled()
    expect(capturedDynamicVariables).toEqual({ lesson_topic: 'Сложение', total_tasks: 3 })
  })

  it('when trainerConfig is null, total_tasks defaults to 0', async () => {
    fetchMock.mockResolvedValueOnce({ ok: true, json: async () => ({ signedUrl: 'wss://x', topic: 'T' }) })
    const { getByText } = render(React.createElement(VoicePanel, { lessonId: 'L1', topic: 'T', trainerConfig: null } as never))
    await act(async () => { fireEvent.click(getByText('Запустить голос')) })
    await new Promise(r => setTimeout(r, 0))
    expect(capturedDynamicVariables).toEqual({ lesson_topic: 'T', total_tasks: 0 })
  })

  it('draw_explanation tool returns a string ack within 50ms (fire-and-forget — INV-02)', async () => {
    render(React.createElement(VoicePanel, { lessonId: 'L1', topic: 'T', trainerConfig: SAMPLE_CONFIG } as never))
    const start = Date.now()
    const result = await capturedClientTools!.draw_explanation({ prompt: 'сложение 245+874' })
    expect(Date.now() - start).toBeLessThan(50)
    expect(typeof result).toBe('string')
    // Bus emit happens synchronously inside the handler
    expect(mockEmit).toHaveBeenCalledWith('board:draw_request', { prompt: 'сложение 245+874', lessonId: 'L1' })
  })
})
