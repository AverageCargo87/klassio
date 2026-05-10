import { describe, it, expect } from 'vitest'
import '../explain-rectangle-area'
import { explainRectangleArea } from '../explain-rectangle-area'

describe('explainRectangleArea', () => {
  it('yields >= 10 primitives for width=5, height=3', () => {
    const primitives = [...explainRectangleArea({ width: 5, height: 3 })]
    expect(primitives.length).toBeGreaterThanOrEqual(10)
  })

  it('first primitive is say', () => {
    const primitives = [...explainRectangleArea({ width: 5, height: 3 })]
    expect(primitives[0].name).toBe('say')
  })

  it('draw_rectangle primitive is present', () => {
    const primitives = [...explainRectangleArea({ width: 5, height: 3 })]
    expect(primitives.some((p) => p.name === 'draw_rectangle')).toBe(true)
  })

  it('area value 15 appears in draw_text or say primitives', () => {
    const primitives = [...explainRectangleArea({ width: 5, height: 3 })]
    const texts = primitives
      .filter((p) => p.name === 'draw_text' || p.name === 'say')
      .map((p) => String(p.input.text))
    expect(texts.join(' ')).toContain('15')
  })

  it('formula label "S" appears in draw_text primitives', () => {
    const primitives = [...explainRectangleArea({ width: 5, height: 3 })]
    const texts = primitives.filter((p) => p.name === 'draw_text').map((p) => String(p.input.text))
    expect(texts.join(' ')).toContain('S')
  })

  it('all coordinates within 800x600 canvas', () => {
    const primitives = [...explainRectangleArea({ width: 5, height: 3 })]
    for (const p of primitives) {
      if ('x' in p.input) expect(p.input.x as number).toBeLessThanOrEqual(800)
      if ('y' in p.input) expect(p.input.y as number).toBeLessThanOrEqual(600)
    }
  })

  it('throws TypeError for invalid args (zero or negative)', () => {
    expect(() => [...explainRectangleArea({ width: 0, height: 3 })]).toThrow(TypeError)
    expect(() => [...explainRectangleArea({ width: 5, height: -1 })]).toThrow(TypeError)
  })
})
