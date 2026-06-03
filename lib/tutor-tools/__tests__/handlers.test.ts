import { describe, it, expect, vi, beforeEach } from 'vitest'
import { buildTutorClientTools } from '../handlers'
import type { LessonBus } from '@/lib/lesson-bus'

function setup() {
  const emit = vi.fn()
  const bus = { emit } as unknown as LessonBus
  const getState = vi.fn(() => 'СОСТОЯНИЕ: фаза cycle, решено 2/3')
  const tools = buildTutorClientTools({ bus, sessionId: 'sess-1', getState })
  return { tools, emit, getState }
}

describe('buildTutorClientTools', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    // fire-and-forget tracking — stub fetch so nothing hits the network.
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(new Response('{}'))))
  })

  it('exposes exactly the 8 agent tool names', () => {
    const { tools } = setup()
    expect(Object.keys(tools).sort()).toEqual(
      ['draw_board', 'give_reward', 'hide_tool', 'lesson_state', 'set_phase', 'show_board', 'show_trainer', 'take_break'].sort(),
    )
  })

  it('show_board emits tutor:show_tool and tracks', () => {
    const { tools, emit } = setup()
    const ack = tools.show_board({ board: 'solar-system' })
    expect(emit).toHaveBeenCalledWith('tutor:show_tool', { tool: 'board', variant: 'solar-system' })
    expect(String(ack)).toContain('solar-system')
    expect(fetch).toHaveBeenCalledWith('/api/tutor/event', expect.objectContaining({ method: 'POST' }))
  })

  it('show_board rejects empty board id', () => {
    const { tools, emit } = setup()
    expect(String(tools.show_board({}))).toContain('Error')
    expect(emit).not.toHaveBeenCalled()
  })

  it('show_trainer enforces the task-N id pattern', () => {
    const { tools, emit } = setup()
    expect(String(tools.show_trainer({ taskId: 'task-3' }))).toContain('task-3')
    expect(String(tools.show_trainer({ taskId: '../etc' }))).toContain('Error')
    expect(emit).toHaveBeenCalledTimes(1)
  })

  it('set_phase validates the phase against the state machine', () => {
    const { tools, emit } = setup()
    expect(String(tools.set_phase({ phase: 'cycle' }))).toContain('cycle')
    expect(emit).toHaveBeenCalledWith('tutor:phase', { phase: 'cycle' })
    expect(fetch).toHaveBeenCalledWith('/api/tutor/phase', expect.any(Object))
    expect(String(tools.set_phase({ phase: 'banana' }))).toContain('Error')
  })

  it('take_break maps start/stop to a boolean and rejects others', () => {
    const { tools, emit } = setup()
    tools.take_break({ active: 'start' })
    expect(emit).toHaveBeenCalledWith('tutor:break', { active: true })
    tools.take_break({ active: 'stop' })
    expect(emit).toHaveBeenCalledWith('tutor:break', { active: false })
    expect(String(tools.take_break({ active: 'maybe' }))).toContain('Error')
  })

  it('draw_board emits board:draw_request with the sessionId as lessonId', () => {
    const { tools, emit } = setup()
    tools.draw_board({ prompt: 'орбиты планет' })
    expect(emit).toHaveBeenCalledWith('board:draw_request', { prompt: 'орбиты планет', lessonId: 'sess-1' })
  })

  it('hide_tool and lesson_state work', () => {
    const { tools, emit, getState } = setup()
    tools.hide_tool({})
    expect(emit).toHaveBeenCalledWith('tutor:hide_tool', {})
    expect(tools.lesson_state({})).toContain('СОСТОЯНИЕ')
    expect(getState).toHaveBeenCalled()
  })
})
