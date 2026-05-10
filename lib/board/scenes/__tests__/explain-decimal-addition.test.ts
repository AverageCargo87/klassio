import { describe, it, expect } from 'vitest'
import '../explain-decimal-addition'
import { explainDecimalAddition } from '../explain-decimal-addition'

describe('explainDecimalAddition', () => {
  it('yields >= 12 primitives for 3.5 + 2.75', () => {
    const primitives = [...explainDecimalAddition({ a: 3.5, b: 2.75 })]
    expect(primitives.length).toBeGreaterThanOrEqual(12)
  })

  it('first primitive is say', () => {
    const primitives = [...explainDecimalAddition({ a: 3.5, b: 2.75 })]
    expect(primitives[0].name).toBe('say')
  })

  it('includes at least one wait', () => {
    const primitives = [...explainDecimalAddition({ a: 3.5, b: 2.75 })]
    expect(primitives.some((p) => p.name === 'wait')).toBe(true)
  })

  it('result 6.25 appears in draw_text', () => {
    const primitives = [...explainDecimalAddition({ a: 3.5, b: 2.75 })]
    const texts = primitives.filter((p) => p.name === 'draw_text').map((p) => String(p.input.text))
    const joined = texts.join(' ')
    // Result should be 6.25 (or 6,25)
    expect(joined).toMatch(/6[.,]25|6\.25/)
  })

  it('source values appear in text', () => {
    const primitives = [...explainDecimalAddition({ a: 3.5, b: 2.75 })]
    const texts = primitives.filter((p) => p.name === 'draw_text').map((p) => String(p.input.text))
    const joined = texts.join(' ')
    expect(joined).toMatch(/3[.,]5|3\.5/)
  })

  it('all coordinates within 800x600 canvas', () => {
    const primitives = [...explainDecimalAddition({ a: 3.5, b: 2.75 })]
    for (const p of primitives) {
      if ('x' in p.input) expect(p.input.x as number).toBeGreaterThanOrEqual(0)
      if ('x' in p.input) expect(p.input.x as number).toBeLessThanOrEqual(800)
      if ('y' in p.input) expect(p.input.y as number).toBeGreaterThanOrEqual(0)
      if ('y' in p.input) expect(p.input.y as number).toBeLessThanOrEqual(600)
    }
  })

  it('works for integers treated as decimals (5 + 3 = 8)', () => {
    const primitives = [...explainDecimalAddition({ a: 5, b: 3 })]
    const texts = primitives.filter((p) => p.name === 'draw_text').map((p) => String(p.input.text))
    expect(texts.join(' ')).toContain('8')
  })
})
