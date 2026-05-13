// Phase 8 Wave 0 RED — Wave 1 plan 08-02 creates `lib/contextual-updates` to flip GREEN.
// Covers PED-02 + HTM-01 (3 events + mini-recap + periodic checkpoint + task_focused NOT forwarded).
import { describe, it, expect } from 'vitest'
// RED — Wave 1 plan 08-02 creates these formatters.
import {
  formatAnswerSubmitted,
  formatHintOpened,
  formatIdle15s,
  formatMiniRecap,
  formatPeriodicCheckpoint,
  // @ts-expect-error — module not yet created (Wave 0 RED contract)
} from '@/lib/contextual-updates'

describe('contextual-update formatters (PED-02 + HTM-01 + D-08)', () => {
  it('formatAnswerSubmitted (correct=true) returns checkmark + numeric task type', () => {
    expect(formatAnswerSubmitted({ taskId: 'task-3', value: '15', correct: true }, 'numeric-input'))
      .toBe('✓ task-3 (numeric, ok)')
  })

  it('formatAnswerSubmitted (correct=false) includes value and correct answer when provided', () => {
    expect(formatAnswerSubmitted(
      { taskId: 'task-3', value: '11', correct: false },
      'numeric-input',
      { correctValue: '12' },
    )).toBe('✗ task-3 (numeric): ответ 11, правильный 12')
  })

  it('formatHintOpened formats with level and taskId (Russian)', () => {
    expect(formatHintOpened({ taskId: 'task-3', hintLevel: 2 }))
      .toBe('Открыл подсказку уровня 2 на task-3')
  })

  it('formatIdle15s mentions task and silence (Russian)', () => {
    expect(formatIdle15s({ taskId: 'task-4' }))
      .toBe('Ребёнок молчит 15 сек на task-4')
  })

  it('formatMiniRecap includes from→to and solved list (D-03)', () => {
    expect(formatMiniRecap({
      fromTask: 'task-2',
      toTask: 'task-3',
      solvedTaskIds: ['task-1', 'task-2'],
      toTaskTopic: 'переход через десяток',
    })).toBe('Переход task-2→task-3. Решено: task-1,task-2. Тема task-3: переход через десяток.')
  })

  it('formatPeriodicCheckpoint includes elapsed minutes and progress (D-03)', () => {
    expect(formatPeriodicCheckpoint({
      elapsedMinutes: 10, solvedCount: 2, totalTasks: 7, mistakeCount: 0,
    })).toBe('⏱ 10 мин урока. Решено: 2/7, без ошибок.')
  })

  it('formatPeriodicCheckpoint with mistakes uses plural form', () => {
    expect(formatPeriodicCheckpoint({
      elapsedMinutes: 20, solvedCount: 3, totalTasks: 7, mistakeCount: 2,
    })).toBe('⏱ 20 мин урока. Решено: 3/7, ошибок: 2.')
  })

  it('there is no formatter for task_focused (D-08 allow-list discipline)', async () => {
    // task_focused is internal-only per D-08 — verify no exported formatter exists
    // @ts-expect-error — module not yet created (Wave 0 RED contract)
    const mod = await import('@/lib/contextual-updates')
    const exported = Object.keys(mod)
    expect(exported.find((k: string) => k.toLowerCase().includes('taskfocused'))).toBeUndefined()
    expect(exported.find((k: string) => k.toLowerCase().includes('task_focused'))).toBeUndefined()
  })
})
