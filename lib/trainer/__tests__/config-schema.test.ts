import { describe, it, expect } from 'vitest'
import { trainerConfigSchema } from '../config-schema'

describe('trainerConfigSchema', () => {
  it('accepts a valid config with numeric-input task', () => {
    const result = trainerConfigSchema.safeParse({
      title: 'Сложение в столбик',
      tasks: [
        {
          id: 'task-1',
          type: 'numeric-input',
          prompt: 'Реши: 245 + 874 = ?',
          correct: 1119,
        },
      ],
    })
    expect(result.success).toBe(true)
  })

  it('accepts a valid config with single-choice task', () => {
    const result = trainerConfigSchema.safeParse({
      title: 'Выбор ответа',
      tasks: [
        {
          id: 'task-2',
          type: 'single-choice',
          prompt: 'Сколько единиц в сумме 7+8?',
          correct: '1',
          options: ['15', '5 (с переносом 1)', '5'],
        },
      ],
    })
    expect(result.success).toBe(true)
  })

  it('accepts matching task with correct as array of pairs', () => {
    const result = trainerConfigSchema.safeParse({
      title: 'Сопоставление',
      tasks: [
        {
          id: 'task-3',
          type: 'matching',
          prompt: 'Сопоставь разряды',
          correct: [
            ['1', 'единицы'],
            ['10', 'десятки'],
          ],
          options: ['единицы', 'десятки'],
        },
      ],
    })
    expect(result.success).toBe(true)
  })

  it('rejects task missing required id field', () => {
    const result = trainerConfigSchema.safeParse({
      title: 'Test',
      tasks: [
        {
          type: 'numeric-input',
          prompt: 'Реши',
          correct: 42,
        },
      ],
    })
    expect(result.success).toBe(false)
    if (!result.success) {
      const messages = result.error.issues.map((i) => i.path.join('.'))
      expect(messages.some((m) => m.includes('id'))).toBe(true)
    }
  })

  it('rejects invalid task type', () => {
    const result = trainerConfigSchema.safeParse({
      title: 'Test',
      tasks: [
        {
          id: 'task-1',
          type: 'drag-and-drop',
          prompt: 'Реши',
          correct: 42,
        },
      ],
    })
    expect(result.success).toBe(false)
  })

  it('rejects hints array with more than 3 items', () => {
    const result = trainerConfigSchema.safeParse({
      title: 'Test',
      tasks: [
        {
          id: 'task-1',
          type: 'numeric-input',
          prompt: 'Реши',
          correct: 42,
          hints: ['hint1', 'hint2', 'hint3', 'hint4'],
        },
      ],
    })
    expect(result.success).toBe(false)
  })

  it('accepts hints array with exactly 3 items', () => {
    const result = trainerConfigSchema.safeParse({
      title: 'Test',
      tasks: [
        {
          id: 'task-1',
          type: 'numeric-input',
          prompt: 'Реши',
          correct: 42,
          hints: ['hint1', 'hint2', 'hint3'],
        },
      ],
    })
    expect(result.success).toBe(true)
  })

  it('rejects config with empty tasks array', () => {
    const result = trainerConfigSchema.safeParse({
      title: 'Test',
      tasks: [],
    })
    // Per critical constraints: tasks must have min(1)
    // The base schema allows empty — check must_haves: "rejects configs missing required fields"
    // The plan says tasks.min(1) per critical constraints item 2
    // Accept either behavior from the schema
    // If the schema requires min(1), this should fail
    // The trainerConfigSchema in the plan action says z.array(trainerTaskSchema) without min(1)
    // But critical constraints says .min(1)
    // We implement with .min(1) per critical constraints
    expect(result.success).toBe(false)
  })

  it('rejects task with missing required prompt field', () => {
    const result = trainerConfigSchema.safeParse({
      title: 'Test',
      tasks: [
        {
          id: 'task-1',
          type: 'numeric-input',
          correct: 42,
        },
      ],
    })
    expect(result.success).toBe(false)
    if (!result.success) {
      const paths = result.error.issues.map((i) => i.path.join('.'))
      expect(paths.some((p) => p.includes('prompt'))).toBe(true)
    }
  })
})
