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
