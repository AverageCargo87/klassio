import { describe, it, expect } from 'vitest'
import '../explain-fraction-comparison'
import { explainFractionComparison } from '../explain-fraction-comparison'

describe('explainFractionComparison', () => {
  it('yields >= 12 primitives for 2/3 vs 3/4', () => {
    const primitives = [...explainFractionComparison({ a: 2, b: 3, c: 3, d: 4 })]
    expect(primitives.length).toBeGreaterThanOrEqual(12)
  })

  it('first primitive is say', () => {
    const primitives = [...explainFractionComparison({ a: 2, b: 3, c: 3, d: 4 })]
    expect(primitives[0].name).toBe('say')
  })

  it('includes at least one wait', () => {
    const primitives = [...explainFractionComparison({ a: 2, b: 3, c: 3, d: 4 })]
    expect(primitives.some((p) => p.name === 'wait')).toBe(true)
  })

  it('conclusion sign appears in say or draw_text (2/3 < 3/4)', () => {
    const primitives = [...explainFractionComparison({ a: 2, b: 3, c: 3, d: 4 })]
    const texts = primitives
      .filter((p) => p.name === 'say' || p.name === 'draw_text')
      .map((p) => String(p.input.text))
    const joined = texts.join(' ')
    // Should contain '<' (2/3 < 3/4) or the comparison word
    expect(joined).toMatch(/<|больше|меньше|равны|=/)
  })

  it('all coordinates within 800x600 canvas', () => {
    const primitives = [...explainFractionComparison({ a: 2, b: 3, c: 3, d: 4 })]
    for (const p of primitives) {
      if ('x' in p.input) expect(p.input.x as number).toBeGreaterThanOrEqual(0)
      if ('x' in p.input) expect(p.input.x as number).toBeLessThanOrEqual(800)
      if ('y' in p.input) expect(p.input.y as number).toBeGreaterThanOrEqual(0)
      if ('y' in p.input) expect(p.input.y as number).toBeLessThanOrEqual(600)
    }
  })

  it('throws TypeError for zero denominator', () => {
    expect(() => [...explainFractionComparison({ a: 2, b: 0, c: 3, d: 4 })]).toThrow(TypeError)
    expect(() => [...explainFractionComparison({ a: 2, b: 3, c: 3, d: 0 })]).toThrow(TypeError)
  })

  it('equal fractions (1/2 vs 2/4) detected correctly', () => {
    const primitives = [...explainFractionComparison({ a: 1, b: 2, c: 2, d: 4 })]
    const texts = primitives
      .filter((p) => p.name === 'say' || p.name === 'draw_text')
      .map((p) => String(p.input.text))
    const joined = texts.join(' ')
    expect(joined).toMatch(/равн|=/)
  })
})
