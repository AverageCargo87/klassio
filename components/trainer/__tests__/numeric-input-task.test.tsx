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

// Dynamic import after mock is set up
const { NumericInputTask } = await import('../numeric-input-task')

const numericTask: TrainerTask = {
  id: 'task-1',
  type: 'numeric-input',
  prompt: 'Реши: 245 + 874 = ?',
  correct: 1119,
  hints: ['Сложи единицы первыми', 'Не забудь перенос', 'Ответ больше 1000'],
}

const numericTaskNoHints: TrainerTask = {
  id: 'task-2',
  type: 'numeric-input',
  prompt: 'Реши: 2 + 2 = ?',
  correct: 4,
}

describe('NumericInputTask', () => {
  beforeEach(() => {
    mockEmit.mockClear()
  })

  it('renders root div with correct data attributes', () => {
    const { container } = render(React.createElement(NumericInputTask, { task: numericTask }))
    const root = container.firstElementChild as HTMLElement
    expect(root.getAttribute('data-task-id')).toBe('task-1')
    expect(root.getAttribute('data-task-type')).toBe('numeric-input')
    expect(root.getAttribute('data-correct')).toBe('1119')
    expect(root.getAttribute('data-hint-level')).toBe('0')
    expect(root.getAttribute('data-task-status')).toBe('pending')
  })

  it('renders input[inputmode=numeric] and Ответить button', () => {
    render(React.createElement(NumericInputTask, { task: numericTask }))
    const input = screen.getByRole('textbox')
    expect(input).toBeDefined()
    expect(input.getAttribute('inputmode')).toBe('numeric')
    expect(screen.getByText('Ответить')).toBeDefined()
  })

  it('emits trainer:answer_submitted with correct=true when correct answer submitted', () => {
    render(React.createElement(NumericInputTask, { task: numericTask }))
    const input = screen.getByRole('textbox')
    fireEvent.change(input, { target: { value: '1119' } })
    fireEvent.click(screen.getByText('Ответить'))
    expect(mockEmit).toHaveBeenCalledWith('trainer:answer_submitted', {
      taskId: 'task-1',
      value: '1119',
      correct: true,
    })
  })

  it('emits trainer:answer_submitted with correct=false when wrong answer submitted', () => {
    render(React.createElement(NumericInputTask, { task: numericTask }))
    const input = screen.getByRole('textbox')
    fireEvent.change(input, { target: { value: '999' } })
    fireEvent.click(screen.getByText('Ответить'))
    expect(mockEmit).toHaveBeenCalledWith('trainer:answer_submitted', {
      taskId: 'task-1',
      value: '999',
      correct: false,
    })
  })

  it('shows Показать подсказку button after wrong answer when hints exist', () => {
    render(React.createElement(NumericInputTask, { task: numericTask }))
    const input = screen.getByRole('textbox')
    fireEvent.change(input, { target: { value: '999' } })
    fireEvent.click(screen.getByText('Ответить'))
    expect(screen.getByText('Показать подсказку')).toBeDefined()
  })

  it('clicking Показать подсказку emits trainer:hint_opened and increments hint level', () => {
    render(React.createElement(NumericInputTask, { task: numericTask }))
    const input = screen.getByRole('textbox')
    fireEvent.change(input, { target: { value: '999' } })
    fireEvent.click(screen.getByText('Ответить'))
    mockEmit.mockClear()
    fireEvent.click(screen.getByText('Показать подсказку'))
    expect(mockEmit).toHaveBeenCalledWith('trainer:hint_opened', {
      taskId: 'task-1',
      hintLevel: 1,
    })
    // data-hint-level should update to 1
    const root = screen.getByRole('textbox').closest('[data-task-id]') as HTMLElement
    expect(root.getAttribute('data-hint-level')).toBe('1')
  })

  it('does not show Показать подсказку button after wrong answer when no hints', () => {
    render(React.createElement(NumericInputTask, { task: numericTaskNoHints }))
    const input = screen.getByRole('textbox')
    fireEvent.change(input, { target: { value: '999' } })
    fireEvent.click(screen.getByText('Ответить'))
    expect(screen.queryByText('Показать подсказку')).toBeNull()
  })
})
