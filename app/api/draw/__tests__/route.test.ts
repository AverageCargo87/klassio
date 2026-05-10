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
vi.mock('@/lib/db/schema', () => ({
  lessons: { id: 'id', userId: 'user_id' },
}))
vi.mock('drizzle-orm', () => ({
  eq: vi.fn((a: unknown, b: unknown) => ({ field: a, value: b })),
  and: vi.fn((...args: unknown[]) => args),
}))

// ─── Mock OpenAI ────────────────────────────────────────────────────────────
// Default mock: stream with no tool calls → agent exits after one turn
vi.mock('openai', () => {
  const makeMockStream = () => ({
    on: vi.fn().mockReturnThis(),
    finalChatCompletion: vi.fn().mockResolvedValue({
      choices: [
        {
          message: { tool_calls: [] },
          finish_reason: 'stop',
        },
      ],
      usage: { prompt_tokens: 100, completion_tokens: 20 },
    }),
  })
  return {
    default: vi.fn().mockImplementation(() => ({
      chat: {
        completions: {
          stream: vi.fn().mockReturnValue(makeMockStream()),
        },
      },
    })),
  }
})

import { POST } from '../route'
import { auth } from '@/auth'
import { db } from '@/lib/db'

// ─── Helpers ────────────────────────────────────────────────────────────────
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

// ─── Tests ──────────────────────────────────────────────────────────────────
describe('POST /api/draw', () => {
  beforeEach(() => {
    vi.mocked(auth).mockReset()
    vi.mocked(db.select).mockReset()
  })

  // ── Auth guard ─────────────────────────────────────────────────────────
  it('returns 401 when not authenticated (auth() returns null)', async () => {
    vi.mocked(auth).mockResolvedValue(null as never)
    const res = await POST(makeRequest({ prompt: 'тест', lessonId: 'uuid-1' }))
    expect(res.status).toBe(401)
  })

  it('returns 401 when session exists but user.id is missing', async () => {
    vi.mocked(auth).mockResolvedValue({ user: {} } as never)
    const res = await POST(makeRequest({ prompt: 'тест', lessonId: 'uuid-1' }))
    expect(res.status).toBe(401)
  })

  // ── Input validation ────────────────────────────────────────────────────
  it('returns 400 when prompt is empty string', async () => {
    vi.mocked(auth).mockResolvedValue({ user: { id: 'user-1' } } as never)
    const res = await POST(makeRequest({ prompt: '', lessonId: 'uuid-1' }))
    expect(res.status).toBe(400)
  })

  it('returns 400 when lessonId is missing from body', async () => {
    vi.mocked(auth).mockResolvedValue({ user: { id: 'user-1' } } as never)
    const res = await POST(makeRequest({ prompt: 'объясни 5+3' }))
    expect(res.status).toBe(400)
  })

  it('returns 400 when prompt is whitespace-only', async () => {
    vi.mocked(auth).mockResolvedValue({ user: { id: 'user-1' } } as never)
    const res = await POST(makeRequest({ prompt: '   ', lessonId: 'uuid-1' }))
    expect(res.status).toBe(400)
  })

  // ── Ownership check ─────────────────────────────────────────────────────
  it('returns 403 when lesson does not belong to user (db returns empty array)', async () => {
    vi.mocked(auth).mockResolvedValue({ user: { id: 'user-1' } } as never)
    vi.mocked(db.select).mockReturnValue(makeDbChain([]) as never)
    const res = await POST(makeRequest({ prompt: 'объясни дроби', lessonId: 'uuid-bad' }))
    expect(res.status).toBe(403)
  })

  // ── Happy path: SSE stream ──────────────────────────────────────────────
  it('returns 200 with text/event-stream when auth + lessonId are valid', async () => {
    vi.mocked(auth).mockResolvedValue({ user: { id: 'user-1' } } as never)
    vi.mocked(db.select).mockReturnValue(makeDbChain([{ id: 'uuid-1' }]) as never)

    const res = await POST(makeRequest({ prompt: 'объясни 245+874 в столбик', lessonId: 'uuid-1' }))
    expect(res.status).toBe(200)
    expect(res.headers.get('Content-Type')).toContain('text/event-stream')
  })

  it('sets Cache-Control: no-cache on SSE response', async () => {
    vi.mocked(auth).mockResolvedValue({ user: { id: 'user-1' } } as never)
    vi.mocked(db.select).mockReturnValue(makeDbChain([{ id: 'uuid-1' }]) as never)

    const res = await POST(makeRequest({ prompt: 'тест', lessonId: 'uuid-1' }))
    expect(res.status).toBe(200)
    expect(res.headers.get('Cache-Control')).toContain('no-cache')
  })
})
