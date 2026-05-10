// VoicePanel component tests — Phase 6 plan 06-02 (VOI-01-I..R + invariants).
// Tests are TDD: this file lands RED before the rewrite of voice-panel.tsx is implemented.
//
// Coverage map:
//   #1  base initial render          — Start visible, status «Готов к запуску»
//   #2  VOI-01-I (call order)        — getUserMedia BEFORE fetch
//   #3  VOI-01-J                     — POST /api/voice/signed-url body shape
//   #4  VOI-01-K                     — startSession with connectionType:'websocket' + firstMessage
//   #5  VOI-01-K defense-in-depth    — firstMessage uses response.topic, NOT prop
//   #6  VOI-01-L                     — onModeChange listening → bus voice:state listening
//   #7  VOI-01-M                     — onModeChange speaking  → bus voice:state speaking
//   #8  VOI-01-N                     — onDisconnect           → bus voice:state idle
//   #9  Open Q3                      — onConnect              → bus voice:state idle (NOT 'connected')
//   #10 VOI-01-O                     — onError                → error block + bus voice:state idle
//   #11 VOI-01-P                     — NotAllowedError        → Доступ к микрофону запрещён
//   #12 VOI-01-Q                     — NotFoundError          → Микрофон не найден
//   #13 Mic busy                     — NotReadableError       → Микрофон занят другим приложением
//   #14 Fetch failure                — res.ok=false            → Не удалось получить ссылку
//   #15 VOI-01-R                     — status='connected'      → Stop button visible + endSession on click
//   #16 Cleanup (Pitfall 7)          — unmount while connected → endSession called
//   #17 Stable callbacks (Pitfall 4) — re-render twice          → onModeChange ref identical
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import React from 'react'

// ─── Mock @elevenlabs/react ────────────────────────────────────────────────
// SDK v1.6.0 split into ConversationProvider + useConversation. Our panel
// uses both — we mock both. capturedOptions exposes the registered callbacks
// so tests can fire them synchronously without a real WS handshake.
let capturedOptions: {
  onConnect?: (p?: { conversationId: string }) => void
  onDisconnect?: (d?: unknown) => void
  onModeChange?: (p: { mode: 'speaking' | 'listening' }) => void
  onError?: (msg: string, ctx?: unknown) => void
} = {}

const mockStartSession = vi.fn()
const mockEndSession = vi.fn()
const baseReturn = {
  status: 'disconnected' as 'connected' | 'connecting' | 'disconnected' | 'disconnecting',
  mode: 'listening' as 'listening' | 'speaking',
  isSpeaking: false,
  isListening: false,
  isMuted: false,
  startSession: mockStartSession,
  endSession: mockEndSession,
}

let capturedReturn: typeof baseReturn = { ...baseReturn }

vi.mock('@elevenlabs/react', () => ({
  // ConversationProvider — pass children through, capture options on it too
  // (panel registers callbacks on the provider so they survive across sessions).
  ConversationProvider: ({ children, ...options }: { children: React.ReactNode } & typeof capturedOptions) => {
    capturedOptions = { ...capturedOptions, ...options }
    return React.createElement(React.Fragment, null, children)
  },
  useConversation: (options: typeof capturedOptions) => {
    // VoicePanel may pass callbacks via the hook OR via the provider — capture both paths.
    capturedOptions = { ...capturedOptions, ...options }
    return capturedReturn
  },
}))

// ─── Mock @/lib/lesson-bus ─────────────────────────────────────────────────
const mockEmit = vi.fn()
vi.mock('@/lib/lesson-bus', () => ({
  useLessonBus: () => ({ emit: mockEmit, on: vi.fn(), off: vi.fn() }),
  useLessonBusEvent: vi.fn(),
}))

// ─── Mock Avatar + useAvatarState — keep test focused on Voice behavior ────
vi.mock('@/components/avatar/avatar', () => ({
  Avatar: ({ state }: { state: string }) =>
    React.createElement('div', { 'data-avatar-state': state }, 'AVATAR'),
}))
vi.mock('@/components/avatar/use-avatar-state', () => ({
  useAvatarState: () => 'idle',
}))

// ─── Mock fetch + getUserMedia ─────────────────────────────────────────────
const mockFetch = vi.fn()
global.fetch = mockFetch as unknown as typeof fetch

const mockGetUserMedia = vi.fn()
Object.defineProperty(global.navigator, 'mediaDevices', {
  value: { getUserMedia: mockGetUserMedia },
  writable: true,
  configurable: true,
})

const { VoicePanel } = await import('../voice-panel')

function resetMocks() {
  capturedOptions = {}
  capturedReturn = { ...baseReturn }
  mockEmit.mockReset()
  mockStartSession.mockReset().mockResolvedValue('conv_test_123')
  mockEndSession.mockReset().mockResolvedValue(undefined)
  mockFetch.mockReset()
  mockGetUserMedia.mockReset()
}

async function flushMicrotasks(times = 5) {
  for (let i = 0; i < times; i++) {
    await new Promise<void>((r) => r())
  }
}

describe('VoicePanel — Phase 6 mic integration (VOI-01-I..R)', () => {
  beforeEach(() => {
    resetMocks()
    cleanup()
  })

  // ── #1 base initial render ───────────────────────────────────────────────
  it('renders Start button «Запустить голос» and status «Готов к запуску» when disconnected', () => {
    render(React.createElement(VoicePanel, { lessonId: 'lid-test', topic: 'Дроби' }))
    expect(screen.getByRole('button', { name: /Запустить голос/ })).toBeTruthy()
    expect(screen.queryByRole('button', { name: /^Стоп$/ })).toBeFalsy()
    expect(screen.getByText('Готов к запуску')).toBeTruthy()
  })

  // ── #2 VOI-01-I: getUserMedia BEFORE fetch ───────────────────────────────
  it('VOI-01-I: calls navigator.mediaDevices.getUserMedia BEFORE /api/voice/signed-url fetch', async () => {
    const callOrder: string[] = []
    mockGetUserMedia.mockImplementation(async () => {
      callOrder.push('getUserMedia')
      return { getTracks: () => [{ stop: vi.fn() }] }
    })
    mockFetch.mockImplementation(async () => {
      callOrder.push('fetch')
      return {
        ok: true,
        status: 200,
        json: async () => ({ signedUrl: 'wss://x', topic: 'T' }),
      }
    })

    render(React.createElement(VoicePanel, { lessonId: 'lid-test', topic: 'T' }))
    fireEvent.click(screen.getByRole('button', { name: /Запустить голос/ }))

    await flushMicrotasks(20)
    expect(callOrder.indexOf('getUserMedia')).toBeGreaterThanOrEqual(0)
    expect(callOrder.indexOf('fetch')).toBeGreaterThanOrEqual(0)
    expect(callOrder.indexOf('getUserMedia')).toBeLessThan(callOrder.indexOf('fetch'))
    expect(mockGetUserMedia).toHaveBeenCalledWith({ audio: true })
  })

  // ── #3 VOI-01-J: POST body shape ─────────────────────────────────────────
  it('VOI-01-J: POSTs to /api/voice/signed-url with body {lessonId} after mic granted', async () => {
    mockGetUserMedia.mockResolvedValue({ getTracks: () => [{ stop: vi.fn() }] })
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ signedUrl: 'wss://x', topic: 'T' }),
    })

    render(React.createElement(VoicePanel, { lessonId: 'lid-test', topic: 'T' }))
    fireEvent.click(screen.getByRole('button', { name: /Запустить голос/ }))
    await flushMicrotasks(20)

    expect(mockFetch).toHaveBeenCalledWith(
      '/api/voice/signed-url',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ lessonId: 'lid-test' }),
      }),
    )
  })

  // ── #4 VOI-01-K: startSession args ───────────────────────────────────────
  it('VOI-01-K: startSession called with {signedUrl, connectionType:"websocket", overrides.agent.firstMessage}', async () => {
    mockGetUserMedia.mockResolvedValue({ getTracks: () => [{ stop: vi.fn() }] })
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ signedUrl: 'wss://mock', topic: 'Дроби' }),
    })

    render(React.createElement(VoicePanel, { lessonId: 'lid-test', topic: 'Дроби' }))
    fireEvent.click(screen.getByRole('button', { name: /Запустить голос/ }))
    await flushMicrotasks(20)

    expect(mockStartSession).toHaveBeenCalledTimes(1)
    expect(mockStartSession).toHaveBeenCalledWith(
      expect.objectContaining({
        signedUrl: 'wss://mock',
        connectionType: 'websocket',
        overrides: expect.objectContaining({
          agent: expect.objectContaining({
            firstMessage: 'Привет! Сегодня у нас тема: Дроби. Тебя как зовут?',
          }),
        }),
      }),
    )
  })

  // ── #5 VOI-01-K defense-in-depth ────────────────────────────────────────
  it('VOI-01-K (defense): firstMessage uses topic from RESPONSE, not from prop', async () => {
    mockGetUserMedia.mockResolvedValue({ getTracks: () => [{ stop: vi.fn() }] })
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ signedUrl: 'wss://mock', topic: 'CORRECT_TOPIC' }),
    })

    render(React.createElement(VoicePanel, { lessonId: 'lid-test', topic: 'WRONG_PROP' }))
    fireEvent.click(screen.getByRole('button', { name: /Запустить голос/ }))
    await flushMicrotasks(20)

    const args = mockStartSession.mock.calls[0]?.[0] as {
      overrides?: { agent?: { firstMessage?: string } }
    }
    const fm = args?.overrides?.agent?.firstMessage ?? ''
    expect(fm).toContain('CORRECT_TOPIC')
    expect(fm).not.toContain('WRONG_PROP')
  })

  // ── #6 VOI-01-L ──────────────────────────────────────────────────────────
  it('VOI-01-L: onModeChange({mode:"listening"}) emits voice:state listening on the bus', () => {
    render(React.createElement(VoicePanel, { lessonId: 'lid-test', topic: 'T' }))
    expect(capturedOptions.onModeChange).toBeInstanceOf(Function)
    capturedOptions.onModeChange!({ mode: 'listening' })
    expect(mockEmit).toHaveBeenCalledWith('voice:state', { state: 'listening' })
  })

  // ── #7 VOI-01-M ──────────────────────────────────────────────────────────
  it('VOI-01-M: onModeChange({mode:"speaking"}) emits voice:state speaking on the bus', () => {
    render(React.createElement(VoicePanel, { lessonId: 'lid-test', topic: 'T' }))
    capturedOptions.onModeChange!({ mode: 'speaking' })
    expect(mockEmit).toHaveBeenCalledWith('voice:state', { state: 'speaking' })
  })

  // ── #8 VOI-01-N ──────────────────────────────────────────────────────────
  it('VOI-01-N: onDisconnect emits voice:state idle on the bus', () => {
    render(React.createElement(VoicePanel, { lessonId: 'lid-test', topic: 'T' }))
    capturedOptions.onDisconnect!()
    expect(mockEmit).toHaveBeenCalledWith('voice:state', { state: 'idle' })
  })

  // ── #9 Open Q3: onConnect → idle (NOT 'connected') ───────────────────────
  it('Open Q3: onConnect emits voice:state idle on the bus (NOT the unsupported "connected" variant)', () => {
    render(React.createElement(VoicePanel, { lessonId: 'lid-test', topic: 'T' }))
    capturedOptions.onConnect!({ conversationId: 'conv-1' })
    expect(mockEmit).toHaveBeenCalledWith('voice:state', { state: 'idle' })
    // Negative: no 'connected' string was ever emitted
    const connectedEmits = mockEmit.mock.calls.filter(
      (c) =>
        c[0] === 'voice:state' &&
        (c[1] as { state: string })?.state === ('connected' as never),
    )
    expect(connectedEmits.length).toBe(0)
  })

  // ── #10 VOI-01-O ─────────────────────────────────────────────────────────
  it('VOI-01-O: onError displays Russian SDK error AND emits voice:state idle (fail-safe)', () => {
    render(React.createElement(VoicePanel, { lessonId: 'lid-test', topic: 'T' }))
    capturedOptions.onError!('boom', undefined)
    expect(screen.getByText(/Ошибка голосового сервиса\. Попробуйте снова\./)).toBeTruthy()
    expect(mockEmit).toHaveBeenCalledWith('voice:state', { state: 'idle' })
  })

  // ── #11 VOI-01-P: NotAllowedError → Russian mic-denied message ───────────
  it('VOI-01-P: mic NotAllowedError shows «Доступ к микрофону запрещён» and skips startSession', async () => {
    const err = new Error('denied')
    err.name = 'NotAllowedError'
    mockGetUserMedia.mockRejectedValue(err)

    render(React.createElement(VoicePanel, { lessonId: 'lid-test', topic: 'T' }))
    fireEvent.click(screen.getByRole('button', { name: /Запустить голос/ }))
    await flushMicrotasks(20)

    expect(screen.getByText(/Доступ к микрофону запрещён/)).toBeTruthy()
    expect(mockStartSession).not.toHaveBeenCalled()
  })

  // ── #12 VOI-01-Q: NotFoundError → Russian mic-not-found message ──────────
  it('VOI-01-Q: mic NotFoundError shows «Микрофон не найден»', async () => {
    const err = new Error('no device')
    err.name = 'NotFoundError'
    mockGetUserMedia.mockRejectedValue(err)

    render(React.createElement(VoicePanel, { lessonId: 'lid-test', topic: 'T' }))
    fireEvent.click(screen.getByRole('button', { name: /Запустить голос/ }))
    await flushMicrotasks(20)

    expect(screen.getByText(/Микрофон не найден/)).toBeTruthy()
    expect(mockStartSession).not.toHaveBeenCalled()
  })

  // ── #13 NotReadableError → mic-busy message ──────────────────────────────
  it('mic NotReadableError shows «Микрофон занят другим приложением»', async () => {
    const err = new Error('busy')
    err.name = 'NotReadableError'
    mockGetUserMedia.mockRejectedValue(err)

    render(React.createElement(VoicePanel, { lessonId: 'lid-test', topic: 'T' }))
    fireEvent.click(screen.getByRole('button', { name: /Запустить голос/ }))
    await flushMicrotasks(20)

    expect(screen.getByText(/Микрофон занят другим приложением/)).toBeTruthy()
    expect(mockStartSession).not.toHaveBeenCalled()
  })

  // ── #14 fetch failure → Russian signed-url-fetch message ─────────────────
  it('fetch failure on /api/voice/signed-url shows «Не удалось получить ссылку» and skips startSession', async () => {
    mockGetUserMedia.mockResolvedValue({ getTracks: () => [{ stop: vi.fn() }] })
    mockFetch.mockResolvedValue({
      ok: false,
      status: 500,
      text: async () => 'server error',
      json: async () => ({ error: 'server' }),
    })

    render(React.createElement(VoicePanel, { lessonId: 'lid-test', topic: 'T' }))
    fireEvent.click(screen.getByRole('button', { name: /Запустить голос/ }))
    await flushMicrotasks(20)

    expect(screen.getByText(/Не удалось получить ссылку/)).toBeTruthy()
    expect(mockStartSession).not.toHaveBeenCalled()
  })

  // ── #15 VOI-01-R: status='connected' → Stop visible + endSession ─────────
  it('VOI-01-R: when status="connected", Stop button is visible and click calls endSession', () => {
    capturedReturn = { ...baseReturn, status: 'connected' }
    render(React.createElement(VoicePanel, { lessonId: 'lid-test', topic: 'T' }))
    const stopBtn = screen.getByRole('button', { name: /^Стоп$/ })
    expect(stopBtn).toBeTruthy()
    fireEvent.click(stopBtn)
    expect(mockEndSession).toHaveBeenCalled()
  })

  // ── #16 Cleanup (Pitfall 7): unmount while connected calls endSession ────
  it('Pitfall 7: unmount while status="connected" triggers endSession (mic indicator clears)', () => {
    capturedReturn = { ...baseReturn, status: 'connected' }
    const { unmount } = render(React.createElement(VoicePanel, { lessonId: 'lid-test', topic: 'T' }))
    unmount()
    expect(mockEndSession).toHaveBeenCalled()
  })

  // ── #17 Stable callbacks (Pitfall 4): onModeChange ref identical on rerender
  it('Pitfall 4: onModeChange callback ref is stable across re-renders with same props', () => {
    const { rerender } = render(
      React.createElement(VoicePanel, { lessonId: 'lid-test', topic: 'T' }),
    )
    const firstRef = capturedOptions.onModeChange
    rerender(React.createElement(VoicePanel, { lessonId: 'lid-test', topic: 'T' }))
    rerender(React.createElement(VoicePanel, { lessonId: 'lid-test', topic: 'T' }))
    expect(capturedOptions.onModeChange).toBe(firstRef)
  })
})
