import { describe, it, expect } from 'vitest'
import '../explain-fraction-simplification'
import { explainFractionSimplification } from '../explain-fraction-simplification'

describe('explainFractionSimplification', () => {
  it('yields >= 10 primitives for 6/8', () => {
    const primitives = [...explainFractionSimplification({ numerator: 6, denominator: 8 })]
    expect(primitives.length).toBeGreaterThanOrEqual(10)
  })

  it('first primitive is say', () => {
    const primitives = [...explainFractionSimplification({ numerator: 6, denominator: 8 })]
    expect(primitives[0].name).toBe('say')
  })

  it('includes at least one wait', () => {
    const primitives = [...explainFractionSimplification({ numerator: 6, denominator: 8 })]
    expect(primitives.some((p) => p.name === 'wait')).toBe(true)
  })

  it('simplified result "3" and "4" appear for 6/8', () => {
    const primitives = [...explainFractionSimplification({ numerator: 6, denominator: 8 })]
    const texts = primitives.filter((p) => p.name === 'draw_text').map((p) => String(p.input.text))
    const joined = texts.join(' ')
    expect(joined).toContain('3')
    expect(joined).toContain('4')
  })

  it('GCD text appears (НОД or gcd)', () => {
    const primitives = [...explainFractionSimplification({ numerator: 6, denominator: 8 })]
    const texts = primitives
      .filter((p) => p.name === 'draw_text' || p.name === 'say')
      .map((p) => String(p.input.text))
    const joined = texts.join(' ')
    expect(joined).toMatch(/НОД|НОД|GCD|gcd|наибольш/i)
  })

  it('all coordinates within 800x600 canvas', () => {
    const primitives = [...explainFractionSimplification({ numerator: 6, denominator: 8 })]
    for (const p of primitives) {
      if ('x' in p.input) expect(p.input.x as number).toBeGreaterThanOrEqual(0)
      if ('x' in p.input) expect(p.input.x as number).toBeLessThanOrEqual(800)
      if ('y' in p.input) expect(p.input.y as number).toBeGreaterThanOrEqual(0)
      if ('y' in p.input) expect(p.input.y as number).toBeLessThanOrEqual(600)
    }
  })

  it('throws TypeError for zero denominator', () => {
    expect(() => [
      ...explainFractionSimplification({ numerator: 1, denominator: 0 }),
    ]).toThrow(TypeError)
  })

  it('irreducible fraction (3/7) says already simplified', () => {
    const primitives = [...explainFractionSimplification({ numerator: 3, denominator: 7 })]
    const texts = primitives
      .filter((p) => p.name === 'say' || p.name === 'draw_text')
      .map((p) => String(p.input.text))
    const joined = texts.join(' ')
    // Should mention that GCD=1 or fraction is already irreducible
    expect(joined).toMatch(/несократим|уже|НОД.*1|1.*НОД/i)
  })
})
