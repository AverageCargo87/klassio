// Unit tests for lib/elevenlabs/get-signed-url.ts
// Coverage: VOI-01-A (URL/header shape), VOI-01-B (non-200 throw), VOI-01-C (missing field throw)
// Plus defense-in-depth: API key MUST NEVER appear in URL string.
//
// Test conventions per .planning/phases/06-voice/06-PATTERNS.md:
// - vi.hoisted + vi.stubGlobal for fetch mock (vitest 4.x idiom)
// - fetchMock.mockReset() in beforeEach
// - assertions match runtime byte-for-byte for English error fragments

import { describe, it, expect, vi, beforeEach } from 'vitest'

// vi.hoisted ensures fetchMock is defined before vi.stubGlobal hoists.
const { fetchMock } = vi.hoisted(() => {
  const fetchMock = vi.fn()
  return { fetchMock }
})

vi.stubGlobal('fetch', fetchMock)

import { getSignedUrl } from '@/lib/elevenlabs/get-signed-url'

beforeEach(() => {
  fetchMock.mockReset()
})

describe('getSignedUrl (VOI-01-A/B/C)', () => {
  // ── VOI-01-A: URL + header shape ───────────────────────────────────────
  it('VOI-01-A: GET /v1/convai/conversation/get-signed-url?agent_id=... with xi-api-key header returns signed_url', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ signed_url: 'wss://example/ok' }),
    })

    const result = await getSignedUrl('agent_test', 'sk_test')

    expect(result).toBe('wss://example/ok')
    expect(fetchMock).toHaveBeenCalledTimes(1)

    const callArgs = fetchMock.mock.calls[0]
    const url = callArgs[0] as string
    const opts = callArgs[1] as RequestInit

    expect(url).toContain('https://api.elevenlabs.io/v1/convai/conversation/get-signed-url')
    expect(url).toContain('agent_id=agent_test')
    expect(opts.method).toBe('GET')
    expect((opts.headers as Record<string, string>)['xi-api-key']).toBe('sk_test')
    expect(opts.cache).toBe('no-store')
  })

  // ── VOI-01-A defensive: API key must NEVER appear in URL ──────────────
  it('VOI-01-A defense: URL string does not contain the API key (sk_ substring)', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ signed_url: 'wss://example/ok' }),
    })

    await getSignedUrl('agent_test', 'sk_super_secret_xyz')

    const url = fetchMock.mock.calls[0][0] as string
    expect(url).not.toMatch(/sk_/)
  })

  // ── VOI-01-B: non-200 throws with HTTP status in message ──────────────
  it('VOI-01-B: throws Error containing HTTP 401 when upstream returns 401', async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 401,
      text: async () => 'unauthorized',
    })

    await expect(getSignedUrl('agent_x', 'sk_x')).rejects.toThrow(/HTTP 401/)
    await expect(getSignedUrl('agent_x', 'sk_x')).rejects.toThrow(/unauthorized/)
  })

  it('VOI-01-B: throws Error containing HTTP 500 when upstream returns 500 with empty body', async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 500,
      text: async () => '',
    })

    await expect(getSignedUrl('agent_x', 'sk_x')).rejects.toThrow(/HTTP 500/)
  })

  // ── VOI-01-C: missing signed_url field throws ─────────────────────────
  it('VOI-01-C: throws when response JSON lacks signed_url field', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({}),
    })

    await expect(getSignedUrl('agent_x', 'sk_x')).rejects.toThrow(/missing signed_url/i)
  })

  it('VOI-01-C: throws when signed_url is empty string', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ signed_url: '' }),
    })

    await expect(getSignedUrl('agent_x', 'sk_x')).rejects.toThrow(/missing signed_url/i)
  })

  // ── Single API call (no retry, no fallback) ───────────────────────────
  it('calls fetch exactly once per invocation (no retry)', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ signed_url: 'wss://x' }),
    })

    await getSignedUrl('agent_test', 'sk_test')
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })
})
