// Unit tests for POST /api/voice/signed-url
// Coverage: VOI-01-D (auth guard), VOI-01-E (input validation), VOI-01-F (ownership check),
//           VOI-01-G (env guard), VOI-01-H (happy path), 502 case, order invariants.
//
// Mock pattern mirrors app/api/draw/__tests__/route.test.ts exactly — same auth/db/drizzle/schema
// mocks plus a new @/lib/elevenlabs/get-signed-url mock (since this route delegates upstream).

import { describe, it, expect, vi, beforeEach } from 'vitest'
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

// Include `topic` because this route selects it (vs draw which only selects `id`).
vi.mock('@/lib/db/schema', () => ({
  lessons: { id: 'id', userId: 'user_id', topic: 'topic' },
}))

vi.mock('drizzle-orm', () => ({
  eq: vi.fn((a: unknown, b: unknown) => ({ field: a, value: b })),
  and: vi.fn((...args: unknown[]) => args),
}))

// ─── Mock the 11labs HTTP wrapper ───────────────────────────────────────────
// Individual tests set mockResolvedValue / mockRejectedValue per case.
vi.mock('@/lib/elevenlabs/get-signed-url', () => ({
  getSignedUrl: vi.fn(),
}))

import { POST } from '../route'
import { auth } from '@/auth'
import { db } from '@/lib/db'
import { getSignedUrl } from '@/lib/elevenlabs/get-signed-url'

// ─── Helpers ────────────────────────────────────────────────────────────────
function makeRequest(body: unknown, opts: { raw?: boolean } = {}): NextRequest {
  return new NextRequest('http://localhost/api/voice/signed-url', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: opts.raw && typeof body === 'string' ? body : JSON.stringify(body),
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

// ─── Tests ──────────────────────────────────────────────────────────────────
describe('POST /api/voice/signed-url', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    delete process.env.ELEVENLABS_API_KEY
    delete process.env.ELEVENLABS_AGENT_ID
  })

  // ── VOI-01-D: Auth guard ───────────────────────────────────────────────
  it('VOI-01-D: returns 401 when auth() returns null', async () => {
    vi.mocked(auth).mockResolvedValue(null as never)

    const res = await POST(makeRequest({ lessonId: 'uuid-1' }))
    expect(res.status).toBe(401)
    expect(res.headers.get('Content-Type')).toContain('application/json')
    const body = await res.json()
    expect(body).toEqual({ error: 'Войдите в систему' })
  })

  it('VOI-01-D: returns 401 when session has no user.id', async () => {
    vi.mocked(auth).mockResolvedValue({} as never)

    const res = await POST(makeRequest({ lessonId: 'uuid-1' }))
    expect(res.status).toBe(401)
    const body = await res.json()
    expect(body).toEqual({ error: 'Войдите в систему' })
  })

  // ── VOI-01-E: Input validation ──────────────────────────────────────────
  it('VOI-01-E: returns 400 with bad JSON body', async () => {
    vi.mocked(auth).mockResolvedValue({ user: { id: 'user-1' } } as never)

    const res = await POST(makeRequest('not-json-at-all', { raw: true }))
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body).toEqual({ error: 'Неверный формат запроса' })
  })

  it('VOI-01-E: returns 400 when lessonId is missing from body', async () => {
    vi.mocked(auth).mockResolvedValue({ user: { id: 'user-1' } } as never)

    const res = await POST(makeRequest({}))
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body).toEqual({ error: 'lessonId обязателен' })
  })

  it('VOI-01-E: returns 400 when lessonId is empty string (after trim)', async () => {
    vi.mocked(auth).mockResolvedValue({ user: { id: 'user-1' } } as never)

    const res = await POST(makeRequest({ lessonId: '   ' }))
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body).toEqual({ error: 'lessonId обязателен' })
  })

  it('VOI-01-E: returns 400 when lessonId is not a string (number)', async () => {
    vi.mocked(auth).mockResolvedValue({ user: { id: 'user-1' } } as never)

    const res = await POST(makeRequest({ lessonId: 123 }))
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body).toEqual({ error: 'lessonId обязателен' })
  })

  // ── VOI-01-F: Ownership check ──────────────────────────────────────────
  it('VOI-01-F: returns 403 when lesson does not belong to user (db returns empty)', async () => {
    vi.mocked(auth).mockResolvedValue({ user: { id: 'user-1' } } as never)
    vi.mocked(db.select).mockReturnValue(makeDbChain([]) as never)

    const res = await POST(makeRequest({ lessonId: 'uuid-bad' }))
    expect(res.status).toBe(403)
    const body = await res.json()
    expect(body).toEqual({ error: 'Этот урок не ваш' })
  })

  // ── VOI-01-G: Env var guard ────────────────────────────────────────────
  it('VOI-01-G: returns 500 when only ELEVENLABS_API_KEY is set (agent id missing)', async () => {
    process.env.ELEVENLABS_API_KEY = 'sk_unit_test'
    vi.mocked(auth).mockResolvedValue({ user: { id: 'user-1' } } as never)
    vi.mocked(db.select).mockReturnValue(makeDbChain([{ id: 'uuid-1', topic: 'тема' }]) as never)

    const res = await POST(makeRequest({ lessonId: 'uuid-1' }))
    expect(res.status).toBe(500)
    const body = await res.json()
    expect(body).toEqual({ error: 'Voice service не настроен' })
  })

  it('VOI-01-G: returns 500 when only ELEVENLABS_AGENT_ID is set (api key missing)', async () => {
    process.env.ELEVENLABS_AGENT_ID = 'agent_unit_test'
    vi.mocked(auth).mockResolvedValue({ user: { id: 'user-1' } } as never)
    vi.mocked(db.select).mockReturnValue(makeDbChain([{ id: 'uuid-1', topic: 'тема' }]) as never)

    const res = await POST(makeRequest({ lessonId: 'uuid-1' }))
    expect(res.status).toBe(500)
    const body = await res.json()
    expect(body).toEqual({ error: 'Voice service не настроен' })
  })

  it('VOI-01-G: returns 500 when both env vars are unset', async () => {
    vi.mocked(auth).mockResolvedValue({ user: { id: 'user-1' } } as never)
    vi.mocked(db.select).mockReturnValue(makeDbChain([{ id: 'uuid-1', topic: 'тема' }]) as never)

    const res = await POST(makeRequest({ lessonId: 'uuid-1' }))
    expect(res.status).toBe(500)
    const body = await res.json()
    expect(body).toEqual({ error: 'Voice service не настроен' })
  })

  // ── VOI-01-H: Happy path ────────────────────────────────────────────────
  it('VOI-01-H: returns 200 with { signedUrl, topic } JSON on success', async () => {
    process.env.ELEVENLABS_API_KEY = 'sk_unit_test'
    process.env.ELEVENLABS_AGENT_ID = 'agent_unit_test'
    vi.mocked(auth).mockResolvedValue({ user: { id: 'user-1' } } as never)
    vi.mocked(db.select).mockReturnValue(
      makeDbChain([{ id: 'lid', topic: 'Сложение в столбик' }]) as never,
    )
    vi.mocked(getSignedUrl).mockResolvedValue('wss://mock/sign')

    const res = await POST(makeRequest({ lessonId: 'lid' }))
    expect(res.status).toBe(200)
    expect(res.headers.get('Content-Type')).toContain('application/json')
    const body = await res.json()
    expect(body).toEqual({ signedUrl: 'wss://mock/sign', topic: 'Сложение в столбик' })
  })

  // ── 502: upstream failure wrap ─────────────────────────────────────────
  it('returns 502 with generic message when getSignedUrl throws', async () => {
    process.env.ELEVENLABS_API_KEY = 'sk_unit_test'
    process.env.ELEVENLABS_AGENT_ID = 'agent_unit_test'
    vi.mocked(auth).mockResolvedValue({ user: { id: 'user-1' } } as never)
    vi.mocked(db.select).mockReturnValue(
      makeDbChain([{ id: 'lid', topic: 'тема' }]) as never,
    )
    vi.mocked(getSignedUrl).mockRejectedValue(
      new Error('11labs get-signed-url failed: HTTP 503'),
    )

    const res = await POST(makeRequest({ lessonId: 'lid' }))
    expect(res.status).toBe(502)
    const body = await res.json()
    expect(body).toEqual({ error: 'Не удалось подключиться к голосовому сервису' })
  })

  // ── Defense-in-depth: getSignedUrl called with env values in correct order ──
  it('calls getSignedUrl with (agentId, apiKey) from process.env in that order', async () => {
    process.env.ELEVENLABS_API_KEY = 'sk_unit_test'
    process.env.ELEVENLABS_AGENT_ID = 'agent_unit_test'
    vi.mocked(auth).mockResolvedValue({ user: { id: 'user-1' } } as never)
    vi.mocked(db.select).mockReturnValue(
      makeDbChain([{ id: 'lid', topic: 'тема' }]) as never,
    )
    vi.mocked(getSignedUrl).mockResolvedValue('wss://x')

    await POST(makeRequest({ lessonId: 'lid' }))

    expect(vi.mocked(getSignedUrl).mock.calls[0]).toEqual(['agent_unit_test', 'sk_unit_test'])
  })

  // ── Order invariant: auth runs BEFORE body parse ──────────────────────
  it('auth guard runs before body parse: 401 (not 400) when auth fails AND body is malformed', async () => {
    vi.mocked(auth).mockResolvedValue(null as never)

    // Body is invalid JSON — would normally trigger 400. But auth fails first → 401.
    const res = await POST(makeRequest('not-json', { raw: true }))
    expect(res.status).toBe(401)
    const body = await res.json()
    expect(body).toEqual({ error: 'Войдите в систему' })
  })
})
