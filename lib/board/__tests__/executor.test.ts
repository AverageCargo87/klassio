import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock tldraw before importing executor — 'use client' module references browser APIs
// that are unavailable in vitest's Node/happy-dom environment.
vi.mock('tldraw', () => ({
  createShapeId: () => `shape_${Math.random().toString(36).slice(2)}`,
  toRichText: (text: string) => ({
    type: 'doc',
    content: [{ type: 'paragraph', content: [{ type: 'text', text }] }],
  }),
}))

// Mock requestAnimationFrame (not available in happy-dom for this usage)
globalThis.requestAnimationFrame = (cb: FrameRequestCallback) => {
  setTimeout(() => cb(performance.now()), 0)
  return 0
}

import { executeToolCall } from '../executor'

function makeMockEditor() {
  return {
    createShape: vi.fn(),
    updateShape: vi.fn(),
    deleteShape: vi.fn(),
    getShape: vi.fn().mockReturnValue({ id: 'shape_mock', type: 'text' }),
  }
}

describe('executeToolCall', () => {
  let editor: ReturnType<typeof makeMockEditor>

  beforeEach(() => {
    editor = makeMockEditor()
  })

  // --- Non-drawing tools ---

  it('wait resolves ok', async () => {
    const result = await executeToolCall(editor as never, 'wait', { ms: 0 })
    expect(result.ok).toBe(true)
  })

  it('say resolves ok with note = input text', async () => {
    const result = await executeToolCall(editor as never, 'say', { text: 'Привет, ребята!' })
    expect(result.ok).toBe(true)
    expect(result.note).toBe('Привет, ребята!')
  })

  it('finish resolves ok', async () => {
    const result = await executeToolCall(editor as never, 'finish', {})
    expect(result.ok).toBe(true)
    expect(result.note).toBe('finished')
  })

  it('unknown tool resolves not ok', async () => {
    const result = await executeToolCall(editor as never, 'do_something_completely_unknown', {})
    expect(result.ok).toBe(false)
    expect(result.note).toContain('unknown tool')
  })

  // --- Drawing tools: editor.createShape called ---

  it('draw_text calls editor.createShape', async () => {
    await executeToolCall(editor as never, 'draw_text', { x: 100, y: 100, text: 'Hello' })
    expect(editor.createShape).toHaveBeenCalled()
  })

  it('draw_rectangle calls editor.createShape with type geo', async () => {
    await executeToolCall(editor as never, 'draw_rectangle', { x: 0, y: 0, w: 100, h: 60 })
    expect(editor.createShape).toHaveBeenCalled()
    const call = editor.createShape.mock.calls[0]?.[0]
    expect(call?.type).toBe('geo')
  })

  it('draw_circle calls editor.createShape with type geo + ellipse', async () => {
    await executeToolCall(editor as never, 'draw_circle', { x: 200, y: 200, radius: 50 })
    expect(editor.createShape).toHaveBeenCalled()
    const call = editor.createShape.mock.calls[0]?.[0]
    expect(call?.props?.geo).toBe('ellipse')
  })

  // --- CRITICAL: richText vs plain text distinction (regression prevention) ---
  // D-10/D-11 + CON-tldraw-shape-quirks:
  //   TextShape: props.richText = toRichText(text) — NEVER text: string
  //   ArrowShape: props.text = string — NEVER richText

  it('draw_text uses richText prop (NOT text: string) for TextShape', async () => {
    await executeToolCall(editor as never, 'draw_text', { x: 50, y: 50, text: 'Test text' })
    const call = editor.createShape.mock.calls[0]?.[0]
    // Must use richText (object), never plain text string in props
    expect(call?.props?.richText).toBeDefined()
    expect(typeof call?.props?.richText).toBe('object')
    // Must NOT use plain text: string for TextShape
    expect(call?.props?.text).toBeUndefined()
  })

  it('draw_arrow uses plain text prop (NOT richText) for ArrowShape — regression guard', async () => {
    await executeToolCall(editor as never, 'draw_arrow', {
      x1: 0,
      y1: 0,
      x2: 100,
      y2: 100,
      label: 'arrow label',
    })
    const call = editor.createShape.mock.calls[0]?.[0]
    // ArrowShape must use plain text: string, never richText (TypeError in tldraw v3)
    expect(call?.props?.richText).toBeUndefined()
    expect(typeof call?.props?.text).toBe('string')
    expect(call?.type).toBe('arrow')
  })

  it('draw_arrow without label still uses text prop (empty string)', async () => {
    await executeToolCall(editor as never, 'draw_arrow', { x1: 0, y1: 0, x2: 50, y2: 50 })
    const call = editor.createShape.mock.calls[0]?.[0]
    expect(call?.props?.richText).toBeUndefined()
    expect(typeof call?.props?.text).toBe('string')
  })
})
