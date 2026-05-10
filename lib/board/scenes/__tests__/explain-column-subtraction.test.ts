import { describe, it, expect } from 'vitest'
import '../explain-column-subtraction'
import { explainColumnSubtraction } from '../explain-column-subtraction'

describe('explainColumnSubtraction', () => {
  it('yields >= 12 primitives for 874 - 245', () => {
    const primitives = [...explainColumnSubtraction({ a: 874, b: 245 })]
    expect(primitives.length).toBeGreaterThanOrEqual(12)
  })

  it('first primitive is say', () => {
    const primitives = [...explainColumnSubtraction({ a: 874, b: 245 })]
    expect(primitives[0].name).toBe('say')
  })

  it('includes at least one wait', () => {
    const primitives = [...explainColumnSubtraction({ a: 874, b: 245 })]
    expect(primitives.some((p) => p.name === 'wait')).toBe(true)
  })

  it('result text "629" appears in draw_text primitives', () => {
    const primitives = [...explainColumnSubtraction({ a: 874, b: 245 })]
    const texts = primitives.filter((p) => p.name === 'draw_text').map((p) => String(p.input.text))
    expect(texts.join(' ')).toContain('629')
  })

  it('all coordinates within 800x600 canvas', () => {
    const primitives = [...explainColumnSubtraction({ a: 874, b: 245 })]
    for (const p of primitives) {
      if ('x' in p.input) expect(p.input.x as number).toBeGreaterThanOrEqual(0)
      if ('x' in p.input) expect(p.input.x as number).toBeLessThanOrEqual(800)
      if ('y' in p.input) expect(p.input.y as number).toBeGreaterThanOrEqual(0)
      if ('y' in p.input) expect(p.input.y as number).toBeLessThanOrEqual(600)
      if ('x1' in p.input) expect(p.input.x1 as number).toBeLessThanOrEqual(800)
      if ('x2' in p.input) expect(p.input.x2 as number).toBeLessThanOrEqual(800)
    }
  })

  it('throws TypeError when b > a', () => {
    expect(() => [...explainColumnSubtraction({ a: 5, b: 10 })]).toThrow(TypeError)
  })

  it('throws TypeError for invalid args (negative or zero a)', () => {
    expect(() => [...explainColumnSubtraction({ a: 0, b: 5 })]).toThrow(TypeError)
    expect(() => [...explainColumnSubtraction({ a: -1, b: 5 })]).toThrow(TypeError)
  })
})
