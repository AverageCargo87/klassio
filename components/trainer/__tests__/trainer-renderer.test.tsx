import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import React from 'react'
import type { TrainerConfig } from '@/lib/trainer/config-schema'

// Mock the 3 task sub-components for isolation
vi.mock('../numeric-input-task', () => ({
  NumericInputTask: ({ task }: { task: { id: string } }) =>
    React.createElement('div', { 'data-testid': 'numeric-input-task', 'data-task-id': task.id }),
}))

vi.mock('../single-choice-task', () => ({
  SingleChoiceTask: ({ task }: { task: { id: string } }) =>
    React.createElement('div', { 'data-testid': 'single-choice-task', 'data-task-id': task.id }),
}))

vi.mock('../matching-task', () => ({
  MatchingTask: ({ task }: { task: { id: string } }) =>
    React.createElement('div', { 'data-testid': 'matching-task', 'data-task-id': task.id }),
}))

vi.mock('@/lib/lesson-bus', () => ({
  useLessonBus: () => ({
    emit: vi.fn(),
    on: vi.fn(),
    off: vi.fn(),
  }),
  useLessonBusEvent: vi.fn(),
}))

const { TrainerRenderer } = await import('../trainer-renderer')

const numericConfig: TrainerConfig = {
  title: 'Сложение в столбик',
  tasks: [
    {
      id: 'task-1',
      type: 'numeric-input',
      prompt: 'Реши: 245 + 874 = ?',
      correct: 1119,
    },
  ],
}

const choiceConfig: TrainerConfig = {
  title: 'Выбор ответа',
  tasks: [
    {
      id: 'task-2',
      type: 'single-choice',
      prompt: 'Выбери правильный ответ',
      correct: '0',
      options: ['Да', 'Нет'],
    },
  ],
}

const matchingConfig: TrainerConfig = {
  title: 'Сопоставление',
  tasks: [
    {
      id: 'task-3',
      type: 'matching',
      prompt: 'Сопоставь',
      correct: [['А', 'Б']] as [string, string][],
      options: ['Б'],
    },
  ],
}

const mixedConfig: TrainerConfig = {
  title: 'Смешанный тренажёр',
  tasks: [
    {
      id: 'task-1',
      type: 'numeric-input',
      prompt: 'Числовой вопрос',
      correct: 42,
    },
    {
      id: 'task-2',
      type: 'single-choice',
      prompt: 'Выбор',
      correct: '1',
      options: ['А', 'Б'],
    },
    {
      id: 'task-3',
      type: 'matching',
      prompt: 'Сопоставление',
      correct: [['X', 'Y']] as [string, string][],
      options: ['Y'],
    },
  ],
}

describe('TrainerRenderer', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders root div with data-block="trainer"', () => {
    const { container } = render(React.createElement(TrainerRenderer, { config: numericConfig }))
    const root = container.querySelector('[data-block="trainer"]')
    expect(root).toBeDefined()
    expect(root).not.toBeNull()
  })

  it('renders config.title as a heading', () => {
    render(React.createElement(TrainerRenderer, { config: numericConfig }))
    expect(screen.getByText('Сложение в столбик')).toBeDefined()
  })

  it('renders NumericInputTask for numeric-input task', () => {
    render(React.createElement(TrainerRenderer, { config: numericConfig }))
    expect(screen.getByTestId('numeric-input-task')).toBeDefined()
  })

  it('renders SingleChoiceTask for single-choice task', () => {
    render(React.createElement(TrainerRenderer, { config: choiceConfig }))
    expect(screen.getByTestId('single-choice-task')).toBeDefined()
  })

  it('renders MatchingTask for matching task', () => {
    render(React.createElement(TrainerRenderer, { config: matchingConfig }))
    expect(screen.getByTestId('matching-task')).toBeDefined()
  })

  it('renders all 3 task type components in mixed config', () => {
    render(React.createElement(TrainerRenderer, { config: mixedConfig }))
    expect(screen.getByTestId('numeric-input-task')).toBeDefined()
    expect(screen.getByTestId('single-choice-task')).toBeDefined()
    expect(screen.getByTestId('matching-task')).toBeDefined()
  })

  it('renders tasks in correct order by key', () => {
    render(React.createElement(TrainerRenderer, { config: mixedConfig }))
    const numericEl = screen.getByTestId('numeric-input-task')
    const choiceEl = screen.getByTestId('single-choice-task')
    const matchingEl = screen.getByTestId('matching-task')
    // Task IDs should match the config
    expect(numericEl.getAttribute('data-task-id')).toBe('task-1')
    expect(choiceEl.getAttribute('data-task-id')).toBe('task-2')
    expect(matchingEl.getAttribute('data-task-id')).toBe('task-3')
  })
})
