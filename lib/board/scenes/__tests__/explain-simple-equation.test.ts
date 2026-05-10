import { describe, it, expect } from 'vitest'
import '../explain-simple-equation'
import { explainSimpleEquation } from '../explain-simple-equation'

describe('explainSimpleEquation', () => {
  it('yields >= 10 primitives for multiply type: 3·x=12', () => {
    const primitives = [...explainSimpleEquation({ coefficient: 3, value: 12, type: 'multiply' })]
    expect(primitives.length).toBeGreaterThanOrEqual(10)
  })

  it('first primitive is say', () => {
    const primitives = [...explainSimpleEquation({ coefficient: 3, value: 12, type: 'multiply' })]
    expect(primitives[0].name).toBe('say')
  })

  it('solution x=4 appears in draw_text primitives for 3·x=12', () => {
    const primitives = [...explainSimpleEquation({ coefficient: 3, value: 12, type: 'multiply' })]
    const texts = primitives.filter((p) => p.name === 'draw_text').map((p) => String(p.input.text))
    expect(texts.join(' ')).toContain('4')
    expect(texts.join(' ')).toContain('x')
  })

  it('solution x=4 appears for add type: x+5=9', () => {
    const primitives = [...explainSimpleEquation({ coefficient: 5, value: 9, type: 'add' })]
    const texts = primitives.filter((p) => p.name === 'draw_text').map((p) => String(p.input.text))
    expect(texts.join(' ')).toContain('4')
  })

  it('all coordinates within 800x600 canvas', () => {
    const primitives = [...explainSimpleEquation({ coefficient: 3, value: 12, type: 'multiply' })]
    for (const p of primitives) {
      if ('x' in p.input) expect(p.input.x as number).toBeLessThanOrEqual(800)
      if ('y' in p.input) expect(p.input.y as number).toBeLessThanOrEqual(600)
    }
  })

  it('throws TypeError for coefficient=0 with multiply type', () => {
    expect(() => [
      ...explainSimpleEquation({ coefficient: 0, value: 12, type: 'multiply' }),
    ]).toThrow(TypeError)
  })

  it('throws TypeError for invalid type', () => {
    expect(() => [
      ...explainSimpleEquation({ coefficient: 3, value: 12, type: 'subtract' }),
    ]).toThrow(TypeError)
  })
})
