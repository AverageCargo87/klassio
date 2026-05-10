import { describe, it, expect } from 'vitest'
import '../explain-arithmetic-mean'
import { explainArithmeticMean } from '../explain-arithmetic-mean'

describe('explainArithmeticMean', () => {
  it('yields >= 12 primitives for [4, 7, 10]', () => {
    const primitives = [...explainArithmeticMean({ numbers: [4, 7, 10] })]
    expect(primitives.length).toBeGreaterThanOrEqual(12)
  })

  it('first primitive is say', () => {
    const primitives = [...explainArithmeticMean({ numbers: [4, 7, 10] })]
    expect(primitives[0].name).toBe('say')
  })

  it('sum and count appear in texts for [4, 7, 10]', () => {
    const primitives = [...explainArithmeticMean({ numbers: [4, 7, 10] })]
    const texts = primitives
      .filter((p) => p.name === 'draw_text' || p.name === 'say')
      .map((p) => String(p.input.text))
    expect(texts.join(' ')).toContain('21') // sum = 21
    expect(texts.join(' ')).toContain('7')  // mean = 7
    expect(texts.join(' ')).toContain('3')  // count = 3
  })

  it('throws TypeError for single number', () => {
    expect(() => [...explainArithmeticMean({ numbers: [5] })]).toThrow(TypeError)
  })

  it('throws TypeError for empty array', () => {
    expect(() => [...explainArithmeticMean({ numbers: [] })]).toThrow(TypeError)
  })

  it('throws TypeError for more than 8 numbers', () => {
    expect(() => [...explainArithmeticMean({ numbers: [1, 2, 3, 4, 5, 6, 7, 8, 9] })]).toThrow(TypeError)
  })

  it('all coordinates within 800x600 canvas', () => {
    const primitives = [...explainArithmeticMean({ numbers: [4, 7, 10] })]
    for (const p of primitives) {
      if ('x' in p.input) expect(p.input.x as number).toBeLessThanOrEqual(800)
      if ('y' in p.input) expect(p.input.y as number).toBeLessThanOrEqual(600)
    }
  })

  it('works for 2 numbers: [8, 12] → mean=10', () => {
    const primitives = [...explainArithmeticMean({ numbers: [8, 12] })]
    const texts = primitives
      .filter((p) => p.name === 'draw_text' || p.name === 'say')
      .map((p) => String(p.input.text))
    expect(texts.join(' ')).toContain('10') // mean = 10
    expect(texts.join(' ')).toContain('20') // sum = 20
  })
})
