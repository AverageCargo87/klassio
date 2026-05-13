// Phase 8 Wave 1 GREEN — plan 08-02 flipped this from RED by implementing lib/client-tools.
// Covers LLM-01 (6 client tools, fire-and-forget semantics, mini-recap before goto).
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { buildClientTools } from '@/lib/client-tools'
import type { LessonBus } from '@/lib/lesson-bus'

const fetchMock = vi.hoisted(() => vi.fn())
vi.stubGlobal('fetch', fetchMock)

function makeBus(): LessonBus & { emit: ReturnType<typeof vi.fn> } {
  const emit = vi.fn()
  return { emit, on: vi.fn(), off: vi.fn(), clear: vi.fn() } as unknown as
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

  it('draw_explanation emits board:draw_request and returns ack string within 50ms (fire-and-forget)', async () => {
    const bus = makeBus()
    const tools = buildClientTools({ bus, lessonId: 'L1', getState: () => 'STATE:', sendContextualUpdate: vi.fn(), getCurrentTaskId: () => '', getSolvedTaskIds: () => new Set(), getTaskTopic: () => '' })
    const start = Date.now()
    const result = await tools.draw_explanation({ prompt: 'сложение в столбик 245+874' })
    expect(Date.now() - start).toBeLessThan(50)
    expect(typeof result).toBe('string')
    expect(bus.emit).toHaveBeenCalledWith('board:draw_request', { prompt: 'сложение в столбик 245+874', lessonId: 'L1' })
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
