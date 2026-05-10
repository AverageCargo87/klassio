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

// ─── Shared mock stream factory ─────────────────────────────────────────────
// We use a module-level variable so individual tests can override stream behavior.
let _streamFactory: () => unknown = () => makeDefaultStream()

function makeDefaultStream() {
  return {
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
  }
}

// ─── Mock OpenAI ────────────────────────────────────────────────────────────
// Default mock: stream with no tool calls → agent exits after one turn.
// Must use a class-style function (not arrow) so `new OpenAI()` works.
vi.mock('openai', () => {
  function MockOpenAI() {
    return {
      chat: {
        completions: {
          stream: vi.fn().mockImplementation(() => _streamFactory()),
        },
      },
    }
  }
  return { default: MockOpenAI }
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

/** Helper to read full SSE stream body from a Response */
async function readSSEEvents(res: Response): Promise<Array<Record<string, unknown>>> {
  const text = await res.text()
  const events: Array<Record<string, unknown>> = []
  for (const line of text.split('\n')) {
    const trimmed = line.trim()
    if (trimmed.startsWith('data: ')) {
      try {
        events.push(JSON.parse(trimmed.slice(6)) as Record<string, unknown>)
      } catch {
        // ignore non-JSON lines
      }
    }
  }
  return events
}

/** Creates a mock stream that emits one tool call then stop */
function makeToolCallStream(toolName: string, toolArgs: string) {
  type DoneCallback = (e: { name: string; arguments: string; parsed_arguments: unknown; index: number }) => void

  let savedCb: DoneCallback | null = null

  const stream = {
    on: vi.fn().mockImplementation((event: string, cb: DoneCallback) => {
      if (event === 'tool_calls.function.arguments.done') {
        savedCb = cb
      }
      return stream
    }),
    finalChatCompletion: vi.fn().mockImplementation(async () => {
      // Fire the callback before resolving (simulating the streaming behavior)
      if (savedCb) {
        await Promise.resolve()
        savedCb({
          name: toolName,
          arguments: toolArgs,
          parsed_arguments: JSON.parse(toolArgs) as unknown,
          index: 0,
        })
        await Promise.resolve()
      }
      return {
        choices: [
          {
            message: {
              tool_calls: [
                { id: 'tc_0', type: 'function', function: { name: toolName, arguments: toolArgs } },
              ],
            },
            finish_reason: 'tool_calls',
          },
        ],
        usage: { prompt_tokens: 200, completion_tokens: 40 },
      }
    }),
  }
  return stream
}

// ─── Tests ──────────────────────────────────────────────────────────────────
describe('POST /api/draw', () => {
  beforeEach(() => {
    vi.mocked(auth).mockReset()
    vi.mocked(db.select).mockReset()
    _streamFactory = () => makeDefaultStream()  // reset to default
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
    process.env.OPENAI_API_KEY = 'sk-test-key-for-unit-tests'
    vi.mocked(auth).mockResolvedValue({ user: { id: 'user-1' } } as never)
    vi.mocked(db.select).mockReturnValue(makeDbChain([{ id: 'uuid-1' }]) as never)

    const res = await POST(makeRequest({ prompt: 'объясни 245+874 в столбик', lessonId: 'uuid-1' }))
    expect(res.status).toBe(200)
    expect(res.headers.get('Content-Type')).toContain('text/event-stream')
    delete process.env.OPENAI_API_KEY
  })

  it('sets Cache-Control: no-cache on SSE response', async () => {
    process.env.OPENAI_API_KEY = 'sk-test-key-for-unit-tests'
    vi.mocked(auth).mockResolvedValue({ user: { id: 'user-1' } } as never)
    vi.mocked(db.select).mockReturnValue(makeDbChain([{ id: 'uuid-1' }]) as never)

    const res = await POST(makeRequest({ prompt: 'тест', lessonId: 'uuid-1' }))
    expect(res.status).toBe(200)
    expect(res.headers.get('Cache-Control')).toContain('no-cache')
    delete process.env.OPENAI_API_KEY
  })
})

// ── Phase 5: Scene expansion integration tests ───────────────────────────────

describe('POST /api/draw — scene expansion (Phase 5)', () => {
  beforeAll(async () => {
    // Ensure scene files are imported so the registry is populated (Wave 1)
    await import('@/lib/board/scenes/explain-column-addition')
    await import('@/lib/board/scenes/explain-fraction-simplification')
    await import('@/lib/board/scenes/explain-percent-calculation')
    // Wave 2 scenes
    await import('@/lib/board/scenes/explain-long-division')
    await import('@/lib/board/scenes/explain-multiplication-grid')
    await import('@/lib/board/scenes/explain-arithmetic-mean')
  })

  beforeEach(() => {
    vi.mocked(auth).mockReset()
    vi.mocked(db.select).mockReset()
    process.env.OPENAI_API_KEY = 'sk-test-key-for-unit-tests'
    vi.mocked(auth).mockResolvedValue({ user: { id: 'user-1' } } as never)
    vi.mocked(db.select).mockReturnValue(makeDbChain([{ id: 'uuid-1' }]) as never)
  })

  it('scene explain_column_addition is expanded: client receives primitive tool_use events, not the scene name', async () => {
    _streamFactory = () => makeToolCallStream('explain_column_addition', '{"a":245,"b":874}')

    const res = await POST(makeRequest({ prompt: 'объясни сложение 245 и 874', lessonId: 'uuid-1' }))
    expect(res.status).toBe(200)

    const events = await readSSEEvents(res)

    // Should have at least one tool_use event
    const toolUseEvents = events.filter((e) => e.type === 'tool_use')
    expect(toolUseEvents.length).toBeGreaterThanOrEqual(1)

    // None of the tool_use events should have name 'explain_column_addition' — scene is expanded
    const sceneForwardEvents = toolUseEvents.filter((e) => e.name === 'explain_column_addition')
    expect(sceneForwardEvents).toHaveLength(0)

    // At least one event should have a primitive name (say, draw_text, wait, etc.)
    const primitiveNames = ['say', 'draw_text', 'draw_line', 'wait', 'highlight_region', 'draw_rectangle', 'draw_circle', 'draw_arrow']
    const primitiveEvents = toolUseEvents.filter((e) => primitiveNames.includes(e.name as string))
    expect(primitiveEvents.length).toBeGreaterThanOrEqual(1)

    // Final done event should have scene_used: 'explain_column_addition'
    const doneEvent = events.find((e) => e.type === 'done')
    expect(doneEvent).toBeDefined()
    expect(doneEvent?.scene_used).toBe('explain_column_addition')

    delete process.env.OPENAI_API_KEY
  })

  it('done event has scene_used: null when only primitive tools are called', async () => {
    _streamFactory = () => makeDefaultStream()

    const res = await POST(makeRequest({ prompt: 'просто нарисуй точку', lessonId: 'uuid-1' }))
    expect(res.status).toBe(200)

    const events = await readSSEEvents(res)
    const doneEvent = events.find((e) => e.type === 'done')
    expect(doneEvent).toBeDefined()
    expect(doneEvent?.scene_used).toBeNull()

    delete process.env.OPENAI_API_KEY
  })

  it('scene explain_percent_calculation is expanded: emits primitive tool_use events only', async () => {
    _streamFactory = () => makeToolCallStream('explain_percent_calculation', '{"value":200,"percent":15}')

    const res = await POST(makeRequest({ prompt: 'объясни 15% от 200', lessonId: 'uuid-1' }))
    expect(res.status).toBe(200)

    const events = await readSSEEvents(res)
    const toolUseEvents = events.filter((e) => e.type === 'tool_use')

    // Scene should be expanded — no raw scene name forwarded
    const sceneForwardEvents = toolUseEvents.filter((e) => e.name === 'explain_percent_calculation')
    expect(sceneForwardEvents).toHaveLength(0)

    // Done event has scene_used
    const doneEvent = events.find((e) => e.type === 'done')
    expect(doneEvent?.scene_used).toBe('explain_percent_calculation')

    delete process.env.OPENAI_API_KEY
  })

  it('Wave-2 scene explain_long_division is expanded: client receives primitive tool_use events', async () => {
    _streamFactory = () => makeToolCallStream('explain_long_division', '{"dividend":156,"divisor":4}')

    const res = await POST(makeRequest({ prompt: 'объясни деление 156 на 4', lessonId: 'uuid-1' }))
    expect(res.status).toBe(200)

    const events = await readSSEEvents(res)
    const toolUseEvents = events.filter((e) => e.type === 'tool_use')

    // Scene must be expanded — no raw scene name forwarded to client
    const sceneForwardEvents = toolUseEvents.filter((e) => e.name === 'explain_long_division')
    expect(sceneForwardEvents).toHaveLength(0)

    // At least one primitive event was emitted from the expanded scene
    const primitiveNames = ['say', 'draw_text', 'draw_line', 'wait', 'highlight_region', 'draw_rectangle', 'draw_circle', 'draw_arrow']
    const primitiveEvents = toolUseEvents.filter((e) => primitiveNames.includes(e.name as string))
    expect(primitiveEvents.length).toBeGreaterThanOrEqual(1)

    // Done event has scene_used set to the long division scene name
    const doneEvent = events.find((e) => e.type === 'done')
    expect(doneEvent).toBeDefined()
    expect(doneEvent?.scene_used).toBe('explain_long_division')

    delete process.env.OPENAI_API_KEY
  })
})
