import { describe, it, expect } from 'vitest'
import '../explain-rectangle-perimeter'
import { explainRectanglePerimeter } from '../explain-rectangle-perimeter'

describe('explainRectanglePerimeter', () => {
  it('yields >= 10 primitives for width=4, height=6', () => {
    const primitives = [...explainRectanglePerimeter({ width: 4, height: 6 })]
    expect(primitives.length).toBeGreaterThanOrEqual(10)
  })

  it('first primitive is say', () => {
    const primitives = [...explainRectanglePerimeter({ width: 4, height: 6 })]
    expect(primitives[0].name).toBe('say')
  })

  it('draw_rectangle primitive is present', () => {
    const primitives = [...explainRectanglePerimeter({ width: 4, height: 6 })]
    expect(primitives.some((p) => p.name === 'draw_rectangle')).toBe(true)
  })

  it('perimeter value 20 appears in draw_text or say primitives', () => {
    const primitives = [...explainRectanglePerimeter({ width: 4, height: 6 })]
    const texts = primitives
      .filter((p) => p.name === 'draw_text' || p.name === 'say')
      .map((p) => String(p.input.text))
    expect(texts.join(' ')).toContain('20')
  })

  it('formula label "P" appears in draw_text primitives', () => {
    const primitives = [...explainRectanglePerimeter({ width: 4, height: 6 })]
    const texts = primitives.filter((p) => p.name === 'draw_text').map((p) => String(p.input.text))
    expect(texts.join(' ')).toContain('P')
  })

  it('all coordinates within 800x600 canvas', () => {
    const primitives = [...explainRectanglePerimeter({ width: 4, height: 6 })]
    for (const p of primitives) {
      if ('x' in p.input) expect(p.input.x as number).toBeLessThanOrEqual(800)
      if ('y' in p.input) expect(p.input.y as number).toBeLessThanOrEqual(600)
    }
  })

  it('throws TypeError for invalid args', () => {
    expect(() => [...explainRectanglePerimeter({ width: 0, height: 6 })]).toThrow(TypeError)
    expect(() => [...explainRectanglePerimeter({ width: 4, height: -2 })]).toThrow(TypeError)
  })
})
