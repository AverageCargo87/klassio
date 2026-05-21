import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
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

  // Phase 8.7 — intro блоки, explanation, difficulty (опциональные расширения).
  describe('Phase 8.7 schema extensions', () => {
    it('accepts config with intro blocks', () => {
      const result = trainerConfigSchema.safeParse({
        title: 'Сложение в столбик',
        intro: [
          { id: 'intro-1', type: 'intro', title: 'Что такое столбик?', body: 'Объяснение.' },
        ],
        tasks: [
          { id: 'task-1', type: 'numeric-input', prompt: 'Реши', correct: 42 },
        ],
      })
      expect(result.success).toBe(true)
    })

    it('accepts task with explanation field', () => {
      const result = trainerConfigSchema.safeParse({
        title: 'Test',
        tasks: [
          {
            id: 'task-1',
            type: 'numeric-input',
            prompt: 'Реши',
            correct: 42,
            explanation: 'Молодец! Правильно.',
          },
        ],
      })
      expect(result.success).toBe(true)
    })

    it('accepts difficulty values 1, 2, 3', () => {
      for (const d of [1, 2, 3] as const) {
        const result = trainerConfigSchema.safeParse({
          title: 'Test',
          tasks: [
            { id: 'task-1', type: 'numeric-input', prompt: 'Реши', correct: 42, difficulty: d },
          ],
        })
        expect(result.success).toBe(true)
      }
    })

    it('rejects difficulty outside 1-3 range', () => {
      const result = trainerConfigSchema.safeParse({
        title: 'Test',
        tasks: [
          { id: 'task-1', type: 'numeric-input', prompt: 'Реши', correct: 42, difficulty: 4 },
        ],
      })
      expect(result.success).toBe(false)
    })

    it('rejects intro block with wrong type literal', () => {
      const result = trainerConfigSchema.safeParse({
        title: 'Test',
        intro: [
          { id: 'intro-1', type: 'tutorial', title: 'X', body: 'Y' },
        ],
        tasks: [
          { id: 'task-1', type: 'numeric-input', prompt: 'Реши', correct: 42 },
        ],
      })
      expect(result.success).toBe(false)
    })

    it('backward compat: old config without intro/explanation/difficulty still valid', () => {
      const oldJson = JSON.parse(
        readFileSync(
          join(process.cwd(), 'public/trainer-configs/sample-column-addition.json'),
          'utf8',
        ),
      )
      const result = trainerConfigSchema.safeParse(oldJson)
      expect(result.success).toBe(true)
    })

    it('new lesson-column-addition.json: full content validates', () => {
      const newJson = JSON.parse(
        readFileSync(
          join(process.cwd(), 'public/trainer-configs/lesson-column-addition.json'),
          'utf8',
        ),
      )
      const result = trainerConfigSchema.safeParse(newJson)
      if (!result.success) {
        // Show first 3 issues for easy debugging if schema/JSON ever drift
        // eslint-disable-next-line no-console
        console.error('Validation issues:', result.error.issues.slice(0, 3))
      }
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.intro?.length).toBe(3)
        expect(result.data.tasks.length).toBe(20)
        expect(result.data.tasks.every((t) => t.difficulty !== undefined)).toBe(true)
        expect(result.data.tasks.every((t) => t.explanation !== undefined)).toBe(true)
      }
    })
  })
})
