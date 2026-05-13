// Phase 8 Wave 1 GREEN — plan 08-02 flipped this from RED by implementing lib/client-tools.
// Covers LLM-01 (6 client tools, fire-and-forget semantics, mini-recap before goto).
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { buildClientTools } from '@/lib/client-tools'
import type { LessonBus } from '@/lib/lesson-bus'

const fetchMock = vi.hoisted(() => vi.fn())
vi.stubGlobal('fetch', fetchMock)

// "Live" bus mock — emit() delivers events to handlers registered via on().
// Required because draw_explanation now uses bus.on('board:draw_complete', ...)
// internally and awaits the resolution. A plain vi.fn() emit would never reach
// the handler.
function makeBus(): LessonBus & { emit: ReturnType<typeof vi.fn> } {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const handlers = new Map<string, Set<(p: any) => void>>()
  const on = vi.fn((event: string, h: (p: unknown) => void) => {
    if (!handlers.has(event)) handlers.set(event, new Set())
    handlers.get(event)!.add(h)
  })
  const off = vi.fn((event: string, h: (p: unknown) => void) => {
    handlers.get(event)?.delete(h)
  })
  const emit = vi.fn((event: string, payload: unknown) => {
    handlers.get(event)?.forEach((h) => h(payload))
  })
  return { emit, on, off, clear: vi.fn() } as unknown as
    LessonBus & { emit: ReturnType<typeof vi.fn> }
}

describe('buildClientTools — 6 client tools (LLM-01)', () => {
  beforeEach(() => { fetchMock.mockReset() })

  it('exposes exactly 6 tools: draw_explanation, clear_board, goto_trainer_task, highlight_trainer_task, show_hint, get_lesson_state', () => {
    const bus = makeBus()
    const tools = buildClientTools({ bus, lessonId: 'L1', getState: () => 'STATE:', sendContextualUpdate: vi.fn(), getCurrentTaskId: () => '', getSolvedTaskIds: () => new Set(), getTaskTopic: () => '' })
    expect(Object.keys(tools).sort()).toEqual([
      'clear_board', 'draw_explanation', 'get_lesson_state',
      'goto_trainer_task', 'highlight_trainer_task', 'show_hint',
    ])
  })

  it('draw_explanation is BLOCKING: emits board:draw_request immediately, awaits board:draw_complete before resolving (Phase 8 UAT fix)', async () => {
    const bus = makeBus()
    const tools = buildClientTools({ bus, lessonId: 'L1', getState: () => 'STATE:', sendContextualUpdate: vi.fn(), getCurrentTaskId: () => '', getSolvedTaskIds: () => new Set(), getTaskTopic: () => '' })
    // Kick off the call — do NOT await yet
    const pending = tools.draw_explanation({ prompt: 'сложение в столбик 245+874' }) as Promise<string>
    // Yield a microtask so the handler's emit/on calls run
    await Promise.resolve()
    // bus.emit should have been called with board:draw_request synchronously
    expect(bus.emit).toHaveBeenCalledWith('board:draw_request', { prompt: 'сложение в столбик 245+874', lessonId: 'L1' })
    // Promise should still be pending (no board:draw_complete yet)
    let resolved = false
    pending.then(() => { resolved = true })
    await Promise.resolve()
    expect(resolved).toBe(false)
    // Now simulate the board finishing
    bus.emit('board:draw_complete', { lessonId: 'L1', status: 'ok' })
    const result = await pending
    expect(typeof result).toBe('string')
    expect(result).toContain('complete')
  })

  it('draw_explanation: lessonId mismatch on draw_complete does NOT resolve (cross-lesson protection)', async () => {
    const bus = makeBus()
    const tools = buildClientTools({ bus, lessonId: 'L1', getState: () => '', sendContextualUpdate: vi.fn(), getCurrentTaskId: () => '', getSolvedTaskIds: () => new Set(), getTaskTopic: () => '' })
    const pending = tools.draw_explanation({ prompt: 'тест' }) as Promise<string>
    await Promise.resolve()
    let resolved = false
    pending.then(() => { resolved = true })
    // Wrong lessonId — must be ignored
    bus.emit('board:draw_complete', { lessonId: 'WRONG', status: 'ok' })
    await Promise.resolve()
    expect(resolved).toBe(false)
    // Correct lessonId — resolves
    bus.emit('board:draw_complete', { lessonId: 'L1', status: 'ok' })
    await pending
    expect(resolved).toBe(true)
  })

  it('draw_explanation: error status resolves with Error string (graceful fallback to verbal)', async () => {
    const bus = makeBus()
    const tools = buildClientTools({ bus, lessonId: 'L1', getState: () => '', sendContextualUpdate: vi.fn(), getCurrentTaskId: () => '', getSolvedTaskIds: () => new Set(), getTaskTopic: () => '' })
    const pending = tools.draw_explanation({ prompt: 'тест' }) as Promise<string>
    await Promise.resolve()
    bus.emit('board:draw_complete', { lessonId: 'L1', status: 'error', reason: 'OPENAI_API_KEY missing' })
    const result = await pending
    expect(result).toMatch(/Error/)
    expect(result).toContain('OPENAI_API_KEY')
  })

  it('clear_board emits board:clear_request and returns ack string', async () => {
    const bus = makeBus()
    const tools = buildClientTools({ bus, lessonId: 'L1', getState: () => '', sendContextualUpdate: vi.fn(), getCurrentTaskId: () => '', getSolvedTaskIds: () => new Set(), getTaskTopic: () => '' })
    const result = await tools.clear_board({})
    expect(typeof result).toBe('string')
    expect(bus.emit).toHaveBeenCalledWith('board:clear_request', {})
  })

  it('goto_trainer_task sends mini-recap via sendContextualUpdate BEFORE emitting trainer:goto_task', async () => {
    const bus = makeBus()
    const sendContextualUpdate = vi.fn()
    const calls: string[] = []
    sendContextualUpdate.mockImplementation((_t: string) => { calls.push('contextual') })
    bus.emit.mockImplementation((evt: string) => { calls.push(evt) })
    const tools = buildClientTools({
      bus, lessonId: 'L1',
      getState: () => 'STATE:', sendContextualUpdate,
      getCurrentTaskId: () => 'task-2',
      getSolvedTaskIds: () => new Set(['task-1', 'task-2']),
      getTaskTopic: (id: string) => id === 'task-3' ? 'tens overflow' : '',
    })
    await tools.goto_trainer_task({ taskId: 'task-3' })
    // mini-recap must precede the goto emit
    expect(calls[0]).toBe('contextual')
    expect(calls[1]).toBe('trainer:goto_task')
    expect(sendContextualUpdate).toHaveBeenCalledWith(
      expect.stringContaining('task-2'),
    )
    expect(sendContextualUpdate).toHaveBeenCalledWith(
      expect.stringContaining('task-3'),
    )
    expect(bus.emit).toHaveBeenCalledWith('trainer:goto_task', { taskId: 'task-3' })
  })

  it('highlight_trainer_task emits trainer:highlight with elementId mapped from taskId', async () => {
    const bus = makeBus()
    const tools = buildClientTools({ bus, lessonId: 'L1', getState: () => '', sendContextualUpdate: vi.fn(), getCurrentTaskId: () => '', getSolvedTaskIds: () => new Set(), getTaskTopic: () => '' })
    await tools.highlight_trainer_task({ taskId: 'task-2', durationMs: 4000 })
    expect(bus.emit).toHaveBeenCalledWith('trainer:highlight', { elementId: 'task-2', durationMs: 4000 })
  })

  it('show_hint emits trainer:show_hint with taskId and hintLevel', async () => {
    const bus = makeBus()
    const tools = buildClientTools({ bus, lessonId: 'L1', getState: () => '', sendContextualUpdate: vi.fn(), getCurrentTaskId: () => '', getSolvedTaskIds: () => new Set(), getTaskTopic: () => '' })
    await tools.show_hint({ taskId: 'task-2', hintLevel: 2 })
    expect(bus.emit).toHaveBeenCalledWith('trainer:show_hint', { taskId: 'task-2', hintLevel: 2 })
  })

  it('get_lesson_state returns the snapshot string from injected getState (no side effects)', async () => {
    const bus = makeBus()
    const tools = buildClientTools({ bus, lessonId: 'L1', getState: () => 'STATE: task-2 active, solved=1/5[task-1]', sendContextualUpdate: vi.fn(), getCurrentTaskId: () => '', getSolvedTaskIds: () => new Set(), getTaskTopic: () => '' })
    const result = await tools.get_lesson_state({})
    expect(result).toBe('STATE: task-2 active, solved=1/5[task-1]')
    expect(bus.emit).not.toHaveBeenCalled()
  })

  it('invalid taskId pattern is rejected and returns error string (D-09 + T-2 mitigation)', async () => {
    const bus = makeBus()
    const tools = buildClientTools({ bus, lessonId: 'L1', getState: () => '', sendContextualUpdate: vi.fn(), getCurrentTaskId: () => '', getSolvedTaskIds: () => new Set(), getTaskTopic: () => '' })
    // taskId must match /^task-\d+$/ per RESEARCH § Security V5
    const result = await tools.goto_trainer_task({ taskId: '../etc/passwd' })
    expect(typeof result).toBe('string')
    expect(result).toMatch(/error|invalid/i)
    expect(bus.emit).not.toHaveBeenCalledWith('trainer:goto_task', expect.anything())
  })
})
