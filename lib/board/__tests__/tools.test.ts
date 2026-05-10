import { describe, it, expect } from 'vitest'
import { drawTools } from '../tools'

describe('drawTools schema', () => {
  it('has exactly 9 tools', () => {
    expect(drawTools).toHaveLength(9)
  })

  it('has all expected tool names', () => {
    const names = drawTools.map((t) => t.name)
    expect(names).toContain('draw_text')
    expect(names).toContain('draw_rectangle')
    expect(names).toContain('draw_line')
    expect(names).toContain('draw_circle')
    expect(names).toContain('draw_arrow')
    expect(names).toContain('highlight_region')
    expect(names).toContain('wait')
    expect(names).toContain('say')
    expect(names).toContain('finish')
  })

  it('all tools have name, description, parameters.type=object, required array', () => {
    for (const t of drawTools) {
      expect(typeof t.name).toBe('string')
      expect(t.description.length).toBeGreaterThan(5)
      expect(t.parameters.type).toBe('object')
      expect(Array.isArray(t.parameters.required)).toBe(true)
    }
  })

  it('draw_text requires x, y, text', () => {
    const t = drawTools.find((t) => t.name === 'draw_text')!
    expect(t.parameters.required).toContain('x')
    expect(t.parameters.required).toContain('y')
    expect(t.parameters.required).toContain('text')
  })

  it('draw_rectangle requires x, y, w, h', () => {
    const t = drawTools.find((t) => t.name === 'draw_rectangle')!
    expect(t.parameters.required).toEqual(expect.arrayContaining(['x', 'y', 'w', 'h']))
  })

  it('draw_arrow requires x1, y1, x2, y2', () => {
    const t = drawTools.find((t) => t.name === 'draw_arrow')!
    expect(t.parameters.required).toEqual(expect.arrayContaining(['x1', 'y1', 'x2', 'y2']))
  })

  it('highlight_region requires x, y, w, h, color, duration_ms', () => {
    const t = drawTools.find((t) => t.name === 'highlight_region')!
    expect(t.parameters.required).toEqual(
      expect.arrayContaining(['x', 'y', 'w', 'h', 'color', 'duration_ms']),
    )
  })

  it('wait requires ms', () => {
    const t = drawTools.find((t) => t.name === 'wait')!
    expect(t.parameters.required).toContain('ms')
  })

  it('say requires text', () => {
    const t = drawTools.find((t) => t.name === 'say')!
    expect(t.parameters.required).toContain('text')
  })

  it('finish has empty required array', () => {
    const t = drawTools.find((t) => t.name === 'finish')!
    expect(t.parameters.required).toHaveLength(0)
  })

  it('all tools have additionalProperties: false', () => {
    for (const t of drawTools) {
      expect(t.parameters.additionalProperties).toBe(false)
    }
  })

  it('draw_line requires x1, y1, x2, y2', () => {
    const t = drawTools.find((t) => t.name === 'draw_line')!
    expect(t.parameters.required).toEqual(expect.arrayContaining(['x1', 'y1', 'x2', 'y2']))
  })

  it('draw_circle requires x, y, radius', () => {
    const t = drawTools.find((t) => t.name === 'draw_circle')!
    expect(t.parameters.required).toEqual(expect.arrayContaining(['x', 'y', 'radius']))
  })
})

// ── Phase 5: allBoardTools (9 primitives + 15 scene tools + finish = 25) ──────

describe('allBoardTools schema', () => {
  it('exports allBoardTools with exactly 24 entries (9 primitives + 15 scenes)', async () => {
    const { allBoardTools } = await import('../tools')
    // 9 primitive tools (draw_text, draw_rectangle, draw_line, draw_circle, draw_arrow,
    // highlight_region, wait, say, finish) + 15 explain_* scene tools = 24
    expect(allBoardTools).toHaveLength(24)
  })

  it('exports sceneTools with exactly 15 entries', async () => {
    const { sceneTools } = await import('../tools')
    expect(sceneTools).toHaveLength(15)
  })

  it('allBoardTools contains all 15 scene names', async () => {
    const { allBoardTools } = await import('../tools')
    const names = allBoardTools.map((t) => t.name)
    const sceneNames = [
      'explain_column_addition',
      'explain_column_subtraction',
      'explain_multiplication_grid',
      'explain_long_division',
      'explain_fraction_addition',
      'explain_fraction_subtraction',
      'explain_fraction_comparison',
      'explain_fraction_simplification',
      'explain_decimal_addition',
      'explain_decimal_multiplication',
      'explain_percent_calculation',
      'explain_rectangle_area',
      'explain_rectangle_perimeter',
      'explain_simple_equation',
      'explain_arithmetic_mean',
    ]
    for (const name of sceneNames) {
      expect(names).toContain(name)
    }
  })

  it('each scene schema has a non-empty description (Russian text)', async () => {
    const { sceneTools } = await import('../tools')
    for (const t of sceneTools) {
      expect(t.description.length).toBeGreaterThan(10)
      // Should contain Cyrillic characters (Russian)
      expect(/[а-яёА-ЯЁ]/.test(t.description)).toBe(true)
    }
  })

  it('each scene schema has at least 1 required parameter', async () => {
    const { sceneTools } = await import('../tools')
    for (const t of sceneTools) {
      expect(t.parameters.required.length).toBeGreaterThanOrEqual(1)
    }
  })

  it('all scene tools have additionalProperties: false', async () => {
    const { sceneTools } = await import('../tools')
    for (const t of sceneTools) {
      expect(t.parameters.additionalProperties).toBe(false)
    }
  })
})
