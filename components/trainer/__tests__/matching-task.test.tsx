import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import React from 'react'
import type { TrainerTask } from '@/lib/trainer/config-schema'

const mockEmit = vi.fn()

vi.mock('@/lib/lesson-bus', () => ({
  useLessonBus: () => ({
    emit: mockEmit,
    on: vi.fn(),
    off: vi.fn(),
  }),
  useLessonBusEvent: vi.fn(),
}))

const { MatchingTask } = await import('../matching-task')

const matchingTask: TrainerTask = {
  id: 'task-3',
  type: 'matching',
  prompt: 'Сопоставь разряды',
  correct: [
    ['1', 'единицы'],
    ['10', 'десятки'],
    ['100', 'сотни'],
  ],
  options: ['единицы', 'десятки', 'сотни'],
}

describe('MatchingTask', () => {
  beforeEach(() => {
    mockEmit.mockClear()
  })

  it('renders root div with correct data attributes', () => {
    const { container } = render(React.createElement(MatchingTask, { task: matchingTask }))
    const root = container.firstElementChild as HTMLElement
    expect(root.getAttribute('data-task-id')).toBe('task-3')
    expect(root.getAttribute('data-task-type')).toBe('matching')
    expect(root.getAttribute('data-hint-level')).toBe('0')
    expect(root.getAttribute('data-task-status')).toBe('pending')
  })

  it('renders left column items (from task.correct pairs) and right column items (from task.options)', () => {
    render(React.createElement(MatchingTask, { task: matchingTask }))
    // Left items are the first element of each pair in correct
    expect(screen.getByText('1')).toBeDefined()
    expect(screen.getByText('10')).toBeDefined()
    expect(screen.getByText('100')).toBeDefined()
    // Right items from options
    expect(screen.getByText('единицы')).toBeDefined()
    expect(screen.getByText('десятки')).toBeDefined()
    expect(screen.getByText('сотни')).toBeDefined()
  })

  it('does not emit answer event when only partial pairs are formed', () => {
    render(React.createElement(MatchingTask, { task: matchingTask }))
    // Click left item '1'
    fireEvent.click(screen.getByText('1'))
    // Click right item 'единицы' — creates one pair out of 3 needed
    fireEvent.click(screen.getByText('единицы'))
    // Only 1 pair formed — should NOT emit yet
    expect(mockEmit).not.toHaveBeenCalledWith('trainer:answer_submitted', expect.anything())
  })

  it('emits trainer:answer_submitted with correct=true when all correct pairs formed', () => {
    render(React.createElement(MatchingTask, { task: matchingTask }))

    // Pair 1: '1' → 'единицы'
    fireEvent.click(screen.getByText('1'))
    fireEvent.click(screen.getByText('единицы'))

    // Pair 2: '10' → 'десятки'
    fireEvent.click(screen.getByText('10'))
    fireEvent.click(screen.getByText('десятки'))

    // Pair 3: '100' → 'сотни' — all pairs formed
    fireEvent.click(screen.getByText('100'))
    fireEvent.click(screen.getByText('сотни'))

    expect(mockEmit).toHaveBeenCalledWith('trainer:answer_submitted', expect.objectContaining({
      taskId: 'task-3',
      correct: true,
    }))
  })

  it('emits trainer:answer_submitted with correct=false when wrong pairs formed', () => {
    render(React.createElement(MatchingTask, { task: matchingTask }))

    // Pair 1: '1' → 'десятки' (wrong)
    fireEvent.click(screen.getByText('1'))
    fireEvent.click(screen.getByText('десятки'))

    // Pair 2: '10' → 'единицы' (wrong)
    fireEvent.click(screen.getByText('10'))
    fireEvent.click(screen.getByText('единицы'))

    // Pair 3: '100' → 'сотни' (correct, but overall wrong)
    fireEvent.click(screen.getByText('100'))
    fireEvent.click(screen.getByText('сотни'))

    expect(mockEmit).toHaveBeenCalledWith('trainer:answer_submitted', expect.objectContaining({
      taskId: 'task-3',
      correct: false,
    }))
  })
})
