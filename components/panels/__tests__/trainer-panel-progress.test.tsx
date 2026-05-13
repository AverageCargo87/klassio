// Phase 8 Wave 0 RED — Wave 4 plan 08-07 adds progress UI (current task ring + "N из M" counter + smooth-scroll).
// Covers HTM-01 + D-02 progress UI.
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, cleanup, screen, act } from '@testing-library/react'
import React from 'react'

const busHandlers: Record<string, (p: unknown) => void> = {}
const mockEmit = vi.fn()
vi.mock('@/lib/lesson-bus', () => ({
  useLessonBus: () => ({ emit: mockEmit, on: vi.fn(), off: vi.fn() }),
  useLessonBusEvent: (evt: string, fn: (p: unknown) => void) => { busHandlers[evt] = fn },
}))

const { TrainerPanel } = await import('../trainer-panel')

const SAMPLE_CONFIG = {
  title: 'Сложение',
  tasks: [
    { id: 'task-1', type: 'numeric-input' as const, prompt: 'p1', correct: 1 },
    { id: 'task-2', type: 'numeric-input' as const, prompt: 'p2', correct: 2 },
    { id: 'task-3', type: 'numeric-input' as const, prompt: 'p3', correct: 3 },
  ],
}

beforeEach(() => {
  Object.keys(busHandlers).forEach(k => delete busHandlers[k])
  mockEmit.mockClear()
  cleanup()
})

describe('TrainerPanel — Phase 8 progress UI (HTM-01 + D-02)', () => {
  it('renders "1 из 3" counter when first task is the implicit current task', () => {
    render(React.createElement(TrainerPanel, { lessonId: 'L1', trainerConfig: SAMPLE_CONFIG } as never))
    // D-02 mandates "N из M" Russian counter
    expect(screen.getByText(/1\s*из\s*3/)).toBeInTheDocument()
  })

  it('applies a visible ring/border CSS class to the current task element', () => {
    const { container } = render(React.createElement(TrainerPanel, { lessonId: 'L1', trainerConfig: SAMPLE_CONFIG } as never))
    const currentEl = container.querySelector('[data-task-id="task-1"]')
    expect(currentEl?.className).toMatch(/ring|border/)  // Tailwind ring-* or border-* class
  })

  it('updates current task ring + counter on trainer:goto_task', () => {
    const scrollIntoViewSpy = vi.fn()
    Element.prototype.scrollIntoView = scrollIntoViewSpy
    const { container } = render(React.createElement(TrainerPanel, { lessonId: 'L1', trainerConfig: SAMPLE_CONFIG } as never))
    // Fire bus event inside act() so React flushes pending state updates from
    // the handler's forceUpdate() before we assert. Phase 8 UAT fix removed
    // flushSync() from inside the handler (it caused an infinite-loop browser
    // freeze on Submit — see TrainerPanel comment block) so the counter now
    // updates on the next React tick instead of synchronously.
    act(() => {
      busHandlers['trainer:goto_task']?.({ taskId: 'task-3' })
    })
    const el = container.querySelector('[data-task-id="task-3"]')
    expect(el?.className).toMatch(/ring|border/)
    // Counter advances to "3 из 3"
    expect(screen.getByText(/3\s*из\s*3/)).toBeInTheDocument()
    // smooth-scroll invoked per D-02
    expect(scrollIntoViewSpy).toHaveBeenCalledWith(expect.objectContaining({ behavior: 'smooth' }))
  })

  it('marks solved tasks with a checkmark indicator on trainer:answer_submitted (correct=true)', () => {
    const { container } = render(React.createElement(TrainerPanel, { lessonId: 'L1', trainerConfig: SAMPLE_CONFIG } as never))
    busHandlers['trainer:answer_submitted']?.({ taskId: 'task-1', value: '1', correct: true })
    // Find any visual marker — text "✓" or aria attribute
    const el = container.querySelector('[data-task-id="task-1"]')
    expect(el?.textContent || el?.getAttribute('data-solved')).toMatch(/✓|true/)
  })
})
