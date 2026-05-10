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

const { SingleChoiceTask } = await import('../single-choice-task')

const choiceTask: TrainerTask = {
  id: 'task-2',
  type: 'single-choice',
  prompt: 'Сколько единиц в сумме 7+8?',
  correct: '1',
  options: ['15', '5 (с переносом 1)', '5'],
}

describe('SingleChoiceTask', () => {
  beforeEach(() => {
    mockEmit.mockClear()
  })

  it('renders root div with correct data attributes', () => {
    const { container } = render(React.createElement(SingleChoiceTask, { task: choiceTask }))
    const root = container.firstElementChild as HTMLElement
    expect(root.getAttribute('data-task-id')).toBe('task-2')
    expect(root.getAttribute('data-task-type')).toBe('single-choice')
    expect(root.getAttribute('data-correct')).toBe('1')
    expect(root.getAttribute('data-hint-level')).toBe('0')
    expect(root.getAttribute('data-task-status')).toBe('pending')
  })

  it('renders each option as a button with data-option attribute', () => {
    render(React.createElement(SingleChoiceTask, { task: choiceTask }))
    const buttons = screen.getAllByRole('button')
    expect(buttons.length).toBeGreaterThanOrEqual(3)
    // Find option buttons (may include hint button after wrong answer — before any click, all are options)
    const optionButtons = buttons.filter((b) => b.hasAttribute('data-option'))
    expect(optionButtons).toHaveLength(3)
    expect(optionButtons[0].getAttribute('data-option')).toBe('0')
    expect(optionButtons[1].getAttribute('data-option')).toBe('1')
    expect(optionButtons[2].getAttribute('data-option')).toBe('2')
  })

  it('emits trainer:answer_submitted with correct=true when correct option clicked', () => {
    render(React.createElement(SingleChoiceTask, { task: choiceTask }))
    const optionButtons = screen.getAllByRole('button').filter((b) => b.hasAttribute('data-option'))
    // Option at index 1 is correct (task.correct = '1')
    fireEvent.click(optionButtons[1])
    expect(mockEmit).toHaveBeenCalledWith('trainer:answer_submitted', {
      taskId: 'task-2',
      value: '1',
      correct: true,
    })
  })

  it('emits trainer:answer_submitted with correct=false when wrong option clicked', () => {
    render(React.createElement(SingleChoiceTask, { task: choiceTask }))
    const optionButtons = screen.getAllByRole('button').filter((b) => b.hasAttribute('data-option'))
    // Option at index 0 is wrong
    fireEvent.click(optionButtons[0])
    expect(mockEmit).toHaveBeenCalledWith('trainer:answer_submitted', {
      taskId: 'task-2',
      value: '0',
      correct: false,
    })
  })

  it('disables all option buttons after an answer is submitted', () => {
    render(React.createElement(SingleChoiceTask, { task: choiceTask }))
    const optionButtons = screen.getAllByRole('button').filter((b) => b.hasAttribute('data-option'))
    fireEvent.click(optionButtons[0])
    // All option buttons should be disabled after selection
    const updatedOptionButtons = screen
      .getAllByRole('button')
      .filter((b) => b.hasAttribute('data-option'))
    updatedOptionButtons.forEach((btn) => {
      expect(btn).toBeDisabled()
    })
  })
})
