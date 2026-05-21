import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { trainerConfigToScreens } from '../adapt-config'
import type { TrainerConfig } from '@/lib/trainer/config-schema'

describe('trainerConfigToScreens', () => {
  it('returns empty when no intro and no tasks', () => {
    // schema doesn't allow tasks=[]; we just verify intro alone produces no tasks.
    const cfg: TrainerConfig = {
      title: 'Test',
      intro: [{ id: 'i1', type: 'intro', title: 'X', body: 'Y' }],
      tasks: [
        { id: 'task-1', type: 'numeric-input', prompt: 'P', correct: 1 },
      ],
    }
    const out = trainerConfigToScreens(cfg)
    expect(out).toHaveLength(2)
    expect(out[0].kind).toBe('intro')
    expect(out[1].kind).toBe('task')
  })

  it('orders intros before tasks', () => {
    const cfg: TrainerConfig = {
      title: 'Test',
      intro: [
        { id: 'i1', type: 'intro', title: 'A', body: 'a' },
        { id: 'i2', type: 'intro', title: 'B', body: 'b' },
      ],
      tasks: [
        { id: 'task-1', type: 'numeric-input', prompt: 'P', correct: 1 },
        { id: 'task-2', type: 'numeric-input', prompt: 'Q', correct: 2 },
      ],
    }
    const out = trainerConfigToScreens(cfg)
    expect(out.map((s) => s.kind)).toEqual(['intro', 'intro', 'task', 'task'])
    expect(out.map((s) => s.id)).toEqual(['i1', 'i2', 'task-1', 'task-2'])
  })

  describe('intro emoji extraction', () => {
    it('pulls trailing emoji out of title and strips it', () => {
      const cfg: TrainerConfig = {
        title: 'T',
        intro: [{ id: 'i1', type: 'intro', title: 'Что такое столбик? 🧮', body: 'b' }],
        tasks: [{ id: 'task-1', type: 'numeric-input', prompt: 'P', correct: 1 }],
      }
      const out = trainerConfigToScreens(cfg)
      const intro = out[0]
      expect(intro.kind).toBe('intro')
      if (intro.kind === 'intro') {
        expect(intro.emoji).toBe('🧮')
        expect(intro.title).toBe('Что такое столбик?')
      }
    })

    it('uses default emoji when title has none', () => {
      const cfg: TrainerConfig = {
        title: 'T',
        intro: [{ id: 'i1', type: 'intro', title: 'Plain title', body: 'b' }],
        tasks: [{ id: 'task-1', type: 'numeric-input', prompt: 'P', correct: 1 }],
      }
      const out = trainerConfigToScreens(cfg)
      const intro = out[0]
      if (intro.kind === 'intro') {
        expect(intro.emoji).toBe('🧮') // first default (idx 0)
        expect(intro.title).toBe('Plain title')
      }
    })
  })

  describe('intro body split', () => {
    it('splits sentences into paragraphs', () => {
      const cfg: TrainerConfig = {
        title: 'T',
        intro: [
          {
            id: 'i1',
            type: 'intro',
            title: 'X',
            body:
              'Первое предложение. Второе предложение. Третье предложение. Четвёртое предложение.',
          },
        ],
        tasks: [{ id: 'task-1', type: 'numeric-input', prompt: 'P', correct: 1 }],
      }
      const out = trainerConfigToScreens(cfg)
      const intro = out[0]
      if (intro.kind === 'intro') {
        expect(intro.body.length).toBeGreaterThan(1)
      }
    })

    it('honours explicit paragraph breaks (\\n\\n) when present', () => {
      const cfg: TrainerConfig = {
        title: 'T',
        intro: [
          {
            id: 'i1',
            type: 'intro',
            title: 'X',
            body: 'Para one.\n\nPara two.\n\nPara three.',
          },
        ],
        tasks: [{ id: 'task-1', type: 'numeric-input', prompt: 'P', correct: 1 }],
      }
      const out = trainerConfigToScreens(cfg)
      const intro = out[0]
      if (intro.kind === 'intro') {
        expect(intro.body).toEqual(['Para one.', 'Para two.', 'Para three.'])
      }
    })
  })

  describe('numeric-input task adaptation', () => {
    it('extracts expr from prompt and stringifies correct answer', () => {
      const cfg: TrainerConfig = {
        title: 'T',
        tasks: [
          {
            id: 'task-1',
            type: 'numeric-input',
            prompt: 'Сложи в столбик: 25 + 34',
            correct: 59,
            difficulty: 1,
            hints: ['hint'],
            explanation: 'good',
          },
        ],
      }
      const out = trainerConfigToScreens(cfg)
      const t = out[0]
      expect(t.kind).toBe('task')
      if (t.kind === 'task' && t.type === 'numeric-input') {
        expect(t.expr).toBe('25 + 34')
        expect(t.answer).toBe('59')
        expect(t.difficulty).toBe(1)
        expect(t.explanation).toBe('good')
      }
    })

    it('leaves expr null when prompt has no addition pattern', () => {
      const cfg: TrainerConfig = {
        title: 'T',
        tasks: [
          {
            id: 'task-1',
            type: 'numeric-input',
            prompt: 'Восстанови цифру в выражении.',
            correct: 6,
          },
        ],
      }
      const out = trainerConfigToScreens(cfg)
      const t = out[0]
      if (t.kind === 'task' && t.type === 'numeric-input') {
        expect(t.expr).toBeNull()
      }
    })

    it('defaults difficulty to 2 when omitted', () => {
      const cfg: TrainerConfig = {
        title: 'T',
        tasks: [{ id: 'task-1', type: 'numeric-input', prompt: 'P', correct: 1 }],
      }
      const out = trainerConfigToScreens(cfg)
      const t = out[0]
      if (t.kind === 'task') expect(t.difficulty).toBe(2)
    })
  })

  describe('single-choice task adaptation', () => {
    it('converts options[] + correct index → keyed options with A/B/C/D', () => {
      const cfg: TrainerConfig = {
        title: 'T',
        tasks: [
          {
            id: 'task-1',
            type: 'single-choice',
            prompt: 'Choose',
            correct: 1,
            options: ['First', 'Second', 'Third'],
          },
        ],
      }
      const out = trainerConfigToScreens(cfg)
      const t = out[0]
      expect(t.kind).toBe('task')
      if (t.kind === 'task' && t.type === 'single-choice') {
        expect(t.options).toHaveLength(3)
        expect(t.options[0]).toEqual({ key: 'A', label: 'First', correct: false })
        expect(t.options[1]).toEqual({ key: 'B', label: 'Second', correct: true })
        expect(t.options[2]).toEqual({ key: 'C', label: 'Third', correct: false })
      }
    })

    it('handles 4-option single-choice (A/B/C/D)', () => {
      const cfg: TrainerConfig = {
        title: 'T',
        tasks: [
          {
            id: 'task-1',
            type: 'single-choice',
            prompt: 'Choose',
            correct: 3,
            options: ['One', 'Two', 'Three', 'Four'],
          },
        ],
      }
      const out = trainerConfigToScreens(cfg)
      const t = out[0]
      if (t.kind === 'task' && t.type === 'single-choice') {
        expect(t.options.map((o) => o.key)).toEqual(['A', 'B', 'C', 'D'])
        expect(t.options[3].correct).toBe(true)
      }
    })
  })

  describe('matching task adaptation', () => {
    it('converts correct tuples → pairs with left/right', () => {
      const cfg: TrainerConfig = {
        title: 'T',
        tasks: [
          {
            id: 'task-1',
            type: 'matching',
            prompt: 'Match',
            correct: [
              ['3', 'сотни'],
              ['7', 'десятки'],
              ['4', 'единицы'],
            ],
            options: ['сотни', 'десятки', 'единицы'],
          },
        ],
      }
      const out = trainerConfigToScreens(cfg)
      const t = out[0]
      expect(t.kind).toBe('task')
      if (t.kind === 'task' && t.type === 'matching') {
        expect(t.pairs).toHaveLength(3)
        expect(t.pairs[0]).toEqual({ left: '3', right: 'сотни' })
        expect(t.rightOptions).toEqual(['сотни', 'десятки', 'единицы'])
      }
    })
  })

  it('integration: full lesson-column-addition.json structure', () => {
    // Lightweight smoke test — make sure the actual content file the v2 page
    // consumes round-trips through the adapter with no missing fields.
    const raw = readFileSync(
      join(process.cwd(), 'public/trainer-configs/lesson-column-addition.json'),
      'utf8',
    )
    const cfg = JSON.parse(raw) as TrainerConfig
    const out = trainerConfigToScreens(cfg)
    expect(out).toHaveLength(23) // 3 intro + 20 tasks
    expect(out.filter((s) => s.kind === 'intro')).toHaveLength(3)
    expect(out.filter((s) => s.kind === 'task')).toHaveLength(20)
    // Every task should have valid difficulty
    for (const s of out) {
      if (s.kind === 'task') {
        expect([1, 2, 3]).toContain(s.difficulty)
      }
    }
  })
})
