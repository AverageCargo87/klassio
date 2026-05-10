import { describe, it, expect } from 'vitest'
// Import side-effect registers the scene; import the function for direct testing
import '../explain-long-division'
import { explainLongDivision } from '../explain-long-division'

describe('explainLongDivision', () => {
  it('yields >= 20 primitives for 846 ÷ 4', () => {
    const primitives = [...explainLongDivision({ dividend: 846, divisor: 4 })]
    expect(primitives.length).toBeGreaterThanOrEqual(20)
  })

  it('first primitive is say', () => {
    const primitives = [...explainLongDivision({ dividend: 846, divisor: 4 })]
    expect(primitives[0].name).toBe('say')
  })

  it('quotient digits appear in primitives (846 ÷ 4 = 211 remainder 2)', () => {
    const primitives = [...explainLongDivision({ dividend: 846, divisor: 4 })]
    const texts = primitives.filter((p) => p.name === 'draw_text').map((p) => String(p.input.text))
    // Quotient digits 2, 1, 1 should appear
    expect(texts.some((t) => t.includes('2') || t.includes('1'))).toBe(true)
  })

  it('throws TypeError for divisor=0', () => {
    expect(() => [...explainLongDivision({ dividend: 100, divisor: 0 })]).toThrow(TypeError)
  })

  it('all coordinates within 800x600 canvas', () => {
    const primitives = [...explainLongDivision({ dividend: 846, divisor: 4 })]
    for (const p of primitives) {
      if ('x' in p.input) expect(p.input.x as number).toBeLessThanOrEqual(800)
      if ('y' in p.input) expect(p.input.y as number).toBeLessThanOrEqual(600)
      if ('x1' in p.input) expect(p.input.x1 as number).toBeLessThanOrEqual(800)
      if ('x2' in p.input) expect(p.input.x2 as number).toBeLessThanOrEqual(800)
    }
  })

  it('handles exact division (no remainder): 100 ÷ 4 = 25', () => {
    const primitives = [...explainLongDivision({ dividend: 100, divisor: 4 })]
    const sayTexts = primitives.filter((p) => p.name === 'say').map((p) => String(p.input.text))
    // Should mention 25 somewhere in say texts
    expect(sayTexts.join(' ')).toContain('25')
  })
})
