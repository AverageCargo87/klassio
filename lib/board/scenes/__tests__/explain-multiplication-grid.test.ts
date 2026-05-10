import { describe, it, expect } from 'vitest'
// Import side-effect registers the scene; import the function for direct testing
import '../explain-multiplication-grid'
import { explainMultiplicationGrid } from '../explain-multiplication-grid'

describe('explainMultiplicationGrid', () => {
  it('yields >= 20 primitives for 48 × 23', () => {
    const primitives = [...explainMultiplicationGrid({ a: 48, b: 23 })]
    expect(primitives.length).toBeGreaterThanOrEqual(20)
  })

  it('first primitive is say', () => {
    const primitives = [...explainMultiplicationGrid({ a: 48, b: 23 })]
    expect(primitives[0].name).toBe('say')
  })

  it('result 1104 appears in draw_text primitives', () => {
    const primitives = [...explainMultiplicationGrid({ a: 48, b: 23 })]
    const texts = primitives.filter((p) => p.name === 'draw_text').map((p) => String(p.input.text))
    expect(texts.join(' ')).toContain('1104')
  })

  it('includes at least one wait', () => {
    const primitives = [...explainMultiplicationGrid({ a: 48, b: 23 })]
    expect(primitives.some((p) => p.name === 'wait')).toBe(true)
  })

  it('all coordinates within 800x600 canvas', () => {
    const primitives = [...explainMultiplicationGrid({ a: 48, b: 23 })]
    for (const p of primitives) {
      if ('x' in p.input) expect(p.input.x as number).toBeLessThanOrEqual(800)
      if ('y' in p.input) expect(p.input.y as number).toBeLessThanOrEqual(600)
      if ('x1' in p.input) expect(p.input.x1 as number).toBeLessThanOrEqual(800)
      if ('x2' in p.input) expect(p.input.x2 as number).toBeLessThanOrEqual(800)
    }
  })

  it('throws TypeError for invalid args (zero or negative)', () => {
    expect(() => [...explainMultiplicationGrid({ a: 0, b: 5 })]).toThrow(TypeError)
    expect(() => [...explainMultiplicationGrid({ a: 5, b: -1 })]).toThrow(TypeError)
  })

  it('works for single-digit × single-digit: 7 × 6 = 42', () => {
    const primitives = [...explainMultiplicationGrid({ a: 7, b: 6 })]
    const texts = primitives.filter((p) => p.name === 'draw_text').map((p) => String(p.input.text))
    expect(texts.join(' ')).toContain('42')
  })
})
