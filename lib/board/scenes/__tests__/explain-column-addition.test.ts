import { describe, it, expect } from 'vitest'
// Import side-effect registers the scene; import the function for direct testing
import '../explain-column-addition'
import { explainColumnAddition } from '../explain-column-addition'

describe('explainColumnAddition', () => {
  it('yields >= 15 primitives for 245 + 874', () => {
    const primitives = [...explainColumnAddition({ a: 245, b: 874 })]
    expect(primitives.length).toBeGreaterThanOrEqual(15)
  })

  it('first primitive is say', () => {
    const primitives = [...explainColumnAddition({ a: 245, b: 874 })]
    expect(primitives[0].name).toBe('say')
  })

  it('includes at least one wait', () => {
    const primitives = [...explainColumnAddition({ a: 245, b: 874 })]
    expect(primitives.some((p) => p.name === 'wait')).toBe(true)
  })

  it('result text "1119" appears in draw_text primitives', () => {
    const primitives = [...explainColumnAddition({ a: 245, b: 874 })]
    const texts = primitives.filter((p) => p.name === 'draw_text').map((p) => String(p.input.text))
    expect(texts.join(' ')).toContain('1119')
  })

  it('all coordinates within 800x600 canvas', () => {
    const primitives = [...explainColumnAddition({ a: 245, b: 874 })]
    for (const p of primitives) {
      if ('x' in p.input) expect(p.input.x as number).toBeGreaterThanOrEqual(0)
      if ('x' in p.input) expect(p.input.x as number).toBeLessThanOrEqual(800)
      if ('y' in p.input) expect(p.input.y as number).toBeGreaterThanOrEqual(0)
      if ('y' in p.input) expect(p.input.y as number).toBeLessThanOrEqual(600)
      if ('x1' in p.input) expect(p.input.x1 as number).toBeLessThanOrEqual(800)
      if ('x2' in p.input) expect(p.input.x2 as number).toBeLessThanOrEqual(800)
    }
  })

  it('throws TypeError for invalid args (zero or negative)', () => {
    expect(() => [...explainColumnAddition({ a: 0, b: 5 })]).toThrow(TypeError)
    expect(() => [...explainColumnAddition({ a: -1, b: 5 })]).toThrow(TypeError)
  })

  it('source values appear in draw_text primitives', () => {
    const primitives = [...explainColumnAddition({ a: 245, b: 874 })]
    const texts = primitives.filter((p) => p.name === 'draw_text').map((p) => String(p.input.text))
    const joined = texts.join(' ')
    expect(joined).toContain('245')
    expect(joined).toContain('874')
  })
})
