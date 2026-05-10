import { describe, it, expect } from 'vitest'
import '../explain-percent-calculation'
import { explainPercentCalculation } from '../explain-percent-calculation'

describe('explainPercentCalculation', () => {
  it('yields >= 12 primitives for 15% of 200', () => {
    const primitives = [...explainPercentCalculation({ value: 200, percent: 15 })]
    expect(primitives.length).toBeGreaterThanOrEqual(12)
  })

  it('first primitive is say', () => {
    const primitives = [...explainPercentCalculation({ value: 200, percent: 15 })]
    expect(primitives[0].name).toBe('say')
  })

  it('includes at least one wait', () => {
    const primitives = [...explainPercentCalculation({ value: 200, percent: 15 })]
    expect(primitives.some((p) => p.name === 'wait')).toBe(true)
  })

  it('result "30" appears in draw_text (15% of 200 = 30)', () => {
    const primitives = [...explainPercentCalculation({ value: 200, percent: 15 })]
    const texts = primitives.filter((p) => p.name === 'draw_text').map((p) => String(p.input.text))
    expect(texts.join(' ')).toContain('30')
  })

  it('source values "200" and "15" appear in text', () => {
    const primitives = [...explainPercentCalculation({ value: 200, percent: 15 })]
    const texts = primitives.filter((p) => p.name === 'draw_text').map((p) => String(p.input.text))
    const joined = texts.join(' ')
    expect(joined).toContain('200')
    expect(joined).toContain('15')
  })

  it('all coordinates within 800x600 canvas', () => {
    const primitives = [...explainPercentCalculation({ value: 200, percent: 15 })]
    for (const p of primitives) {
      if ('x' in p.input) expect(p.input.x as number).toBeGreaterThanOrEqual(0)
      if ('x' in p.input) expect(p.input.x as number).toBeLessThanOrEqual(800)
      if ('y' in p.input) expect(p.input.y as number).toBeGreaterThanOrEqual(0)
      if ('y' in p.input) expect(p.input.y as number).toBeLessThanOrEqual(600)
    }
  })

  it('throws TypeError for invalid percent (negative)', () => {
    expect(() => [...explainPercentCalculation({ value: 200, percent: -5 })]).toThrow(TypeError)
  })

  it('10% of 50 = 5', () => {
    const primitives = [...explainPercentCalculation({ value: 50, percent: 10 })]
    const texts = primitives.filter((p) => p.name === 'draw_text').map((p) => String(p.input.text))
    expect(texts.join(' ')).toContain('5')
  })
})
