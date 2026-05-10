import { describe, it, expect } from 'vitest'
import '../explain-fraction-addition'
import { explainFractionAddition } from '../explain-fraction-addition'

describe('explainFractionAddition', () => {
  it('yields >= 12 primitives for 1/3 + 1/4', () => {
    const primitives = [...explainFractionAddition({ a: 1, b: 3, c: 1, d: 4 })]
    expect(primitives.length).toBeGreaterThanOrEqual(12)
  })

  it('first primitive is say', () => {
    const primitives = [...explainFractionAddition({ a: 1, b: 3, c: 1, d: 4 })]
    expect(primitives[0].name).toBe('say')
  })

  it('includes at least one wait', () => {
    const primitives = [...explainFractionAddition({ a: 1, b: 3, c: 1, d: 4 })]
    expect(primitives.some((p) => p.name === 'wait')).toBe(true)
  })

  it('result "7" appears (1/3 + 1/4 = 7/12)', () => {
    const primitives = [...explainFractionAddition({ a: 1, b: 3, c: 1, d: 4 })]
    const texts = primitives.filter((p) => p.name === 'draw_text').map((p) => String(p.input.text))
    // 7/12 is the result — both 7 and 12 should appear
    expect(texts.join(' ')).toContain('7')
    expect(texts.join(' ')).toContain('12')
  })

  it('all coordinates within 800x600 canvas', () => {
    const primitives = [...explainFractionAddition({ a: 1, b: 3, c: 1, d: 4 })]
    for (const p of primitives) {
      if ('x' in p.input) expect(p.input.x as number).toBeGreaterThanOrEqual(0)
      if ('x' in p.input) expect(p.input.x as number).toBeLessThanOrEqual(800)
      if ('y' in p.input) expect(p.input.y as number).toBeGreaterThanOrEqual(0)
      if ('y' in p.input) expect(p.input.y as number).toBeLessThanOrEqual(600)
    }
  })

  it('throws TypeError for zero denominator', () => {
    expect(() => [...explainFractionAddition({ a: 1, b: 0, c: 1, d: 4 })]).toThrow(TypeError)
    expect(() => [...explainFractionAddition({ a: 1, b: 3, c: 1, d: 0 })]).toThrow(TypeError)
  })

  it('same-denominator fractions (1/4 + 2/4 = 3/4)', () => {
    const primitives = [...explainFractionAddition({ a: 1, b: 4, c: 2, d: 4 })]
    const texts = primitives.filter((p) => p.name === 'draw_text').map((p) => String(p.input.text))
    expect(texts.join(' ')).toContain('3')
    expect(texts.join(' ')).toContain('4')
  })
})
