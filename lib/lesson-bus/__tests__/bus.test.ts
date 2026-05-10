import { describe, it, expect, vi } from 'vitest'
import { LessonBus } from '../bus'

describe('LessonBus', () => {
  it('emits lesson:test payload to subscribed handler', () => {
    const bus = new LessonBus()
    const handler = vi.fn()
    bus.on('lesson:test', handler)
    bus.emit('lesson:test', { source: 'voice', counter: 1 })
    expect(handler).toHaveBeenCalledWith({ source: 'voice', counter: 1 })
  })

  it('emits lesson:start payload to subscribed handler', () => {
    const bus = new LessonBus()
    const handler = vi.fn()
    const at = new Date()
    bus.on('lesson:start', handler)
    bus.emit('lesson:start', { lessonId: 'abc', at })
    expect(handler).toHaveBeenCalledWith({ lessonId: 'abc', at })
  })

  it('delivers to multiple subscribers on same event', () => {
    const bus = new LessonBus()
    const h1 = vi.fn()
    const h2 = vi.fn()
    bus.on('lesson:test', h1)
    bus.on('lesson:test', h2)
    bus.emit('lesson:test', { source: 'board', counter: 2 })
    expect(h1).toHaveBeenCalledOnce()
    expect(h2).toHaveBeenCalledOnce()
  })

  it('off() unsubscribes handler from future emissions', () => {
    const bus = new LessonBus()
    const handler = vi.fn()
    bus.on('lesson:test', handler)
    bus.off('lesson:test', handler)
    bus.emit('lesson:test', { source: 'test', counter: 0 })
    expect(handler).not.toHaveBeenCalled()
  })

  it('clear() removes all handlers', () => {
    const bus = new LessonBus()
    const h1 = vi.fn()
    const h2 = vi.fn()
    bus.on('lesson:test', h1)
    bus.on('lesson:start', h2)
    bus.clear()
    bus.emit('lesson:test', { source: 'x', counter: 0 })
    bus.emit('lesson:start', { lessonId: 'x', at: new Date() })
    expect(h1).not.toHaveBeenCalled()
    expect(h2).not.toHaveBeenCalled()
  })

  it('emitting to event with no subscribers does not throw', () => {
    const bus = new LessonBus()
    expect(() => {
      bus.emit('lesson:end', { lessonId: 'abc', at: new Date() })
    }).not.toThrow()
  })
})
