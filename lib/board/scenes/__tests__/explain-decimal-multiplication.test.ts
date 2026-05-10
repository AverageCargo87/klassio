import { describe, it, expect } from 'vitest'
import '../explain-decimal-multiplication'
import { explainDecimalMultiplication } from '../explain-decimal-multiplication'

describe('explainDecimalMultiplication', () => {
  it('yields >= 10 primitives for 1.5 × 2.4', () => {
    const primitives = [...explainDecimalMultiplication({ a: 1.5, b: 2.4 })]
    expect(primitives.length).toBeGreaterThanOrEqual(10)
  })

  it('first primitive is say', () => {
    const primitives = [...explainDecimalMultiplication({ a: 1.5, b: 2.4 })]
    expect(primitives[0].name).toBe('say')
  })

  it('result value appears in draw_text or say primitives for 1.5 × 2.4 = 3.6', () => {
    const primitives = [...explainDecimalMultiplication({ a: 1.5, b: 2.4 })]
    const texts = primitives
      .filter((p) => p.name === 'draw_text' || p.name === 'say')
      .map((p) => String(p.input.text))
    // Result is 3.6 (or 3.60)
    expect(texts.join(' ')).toMatch(/3\.6/)
  })

  it('includes integer multiplication step in texts', () => {
    const primitives = [...explainDecimalMultiplication({ a: 1.5, b: 2.4 })]
    const texts = primitives
      .filter((p) => p.name === 'draw_text' || p.name === 'say')
      .map((p) => String(p.input.text))
    // Integer multiplication: 15 × 24 = 360
    expect(texts.join(' ')).toContain('360')
  })

  it('all coordinates within 800x600 canvas', () => {
    const primitives = [...explainDecimalMultiplication({ a: 1.5, b: 2.4 })]
    for (const p of primitives) {
      if ('x' in p.input) expect(p.input.x as number).toBeLessThanOrEqual(800)
      if ('y' in p.input) expect(p.input.y as number).toBeLessThanOrEqual(600)
    }
  })

  it('throws TypeError for NaN input', () => {
    expect(() => [...explainDecimalMultiplication({ a: NaN, b: 2 })]).toThrow(TypeError)
    expect(() => [...explainDecimalMultiplication({ a: 1.5, b: Infinity })]).toThrow(TypeError)
  })

  it('works for integer inputs: 3 × 4 = 12', () => {
    const primitives = [...explainDecimalMultiplication({ a: 3, b: 4 })]
    const texts = primitives
      .filter((p) => p.name === 'draw_text' || p.name === 'say')
      .map((p) => String(p.input.text))
    expect(texts.join(' ')).toContain('12')
  })
})
