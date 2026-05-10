import { describe, it, expect } from 'vitest'
import '../explain-fraction-subtraction'
import { explainFractionSubtraction } from '../explain-fraction-subtraction'

describe('explainFractionSubtraction', () => {
  it('yields >= 12 primitives for 3/4 - 1/3', () => {
    const primitives = [...explainFractionSubtraction({ a: 3, b: 4, c: 1, d: 3 })]
    expect(primitives.length).toBeGreaterThanOrEqual(12)
  })

  it('first primitive is say', () => {
    const primitives = [...explainFractionSubtraction({ a: 3, b: 4, c: 1, d: 3 })]
    expect(primitives[0].name).toBe('say')
  })

  it('includes at least one wait', () => {
    const primitives = [...explainFractionSubtraction({ a: 3, b: 4, c: 1, d: 3 })]
    expect(primitives.some((p) => p.name === 'wait')).toBe(true)
  })

  it('result "5" and "12" appear (3/4 - 1/3 = 5/12)', () => {
    const primitives = [...explainFractionSubtraction({ a: 3, b: 4, c: 1, d: 3 })]
    const texts = primitives.filter((p) => p.name === 'draw_text').map((p) => String(p.input.text))
    expect(texts.join(' ')).toContain('5')
    expect(texts.join(' ')).toContain('12')
  })

  it('all coordinates within 800x600 canvas', () => {
    const primitives = [...explainFractionSubtraction({ a: 3, b: 4, c: 1, d: 3 })]
    for (const p of primitives) {
      if ('x' in p.input) expect(p.input.x as number).toBeGreaterThanOrEqual(0)
      if ('x' in p.input) expect(p.input.x as number).toBeLessThanOrEqual(800)
      if ('y' in p.input) expect(p.input.y as number).toBeGreaterThanOrEqual(0)
      if ('y' in p.input) expect(p.input.y as number).toBeLessThanOrEqual(600)
    }
  })

  it('throws TypeError for zero denominator', () => {
    expect(() => [...explainFractionSubtraction({ a: 3, b: 0, c: 1, d: 4 })]).toThrow(TypeError)
    expect(() => [...explainFractionSubtraction({ a: 3, b: 4, c: 1, d: 0 })]).toThrow(TypeError)
  })
})
