import { describe, it, expect, vi } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import React from 'react'
import { LessonBusProvider } from '../provider'
import { useLessonBus, useLessonBusEvent } from '../hooks'

// Wrapper that provides the bus context
const wrapper = ({ children }: { children: React.ReactNode }) =>
  React.createElement(LessonBusProvider, null, children)

describe('useLessonBus', () => {
  it('returns bus instance with on/off/emit', () => {
    const { result } = renderHook(() => useLessonBus(), { wrapper })
    expect(typeof result.current.on).toBe('function')
    expect(typeof result.current.off).toBe('function')
    expect(typeof result.current.emit).toBe('function')
  })

  it('throws when used outside LessonBusProvider', () => {
    // suppress React's error boundary console output in test
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    expect(() => renderHook(() => useLessonBus())).toThrow(
      /LessonBusProvider/
    )
    spy.mockRestore()
  })
})

describe('useLessonBusEvent', () => {
  it('calls handler when event is emitted', () => {
    const handler = vi.fn()
    const { result } = renderHook(
      () => {
        const bus = useLessonBus()
        useLessonBusEvent('lesson:test', handler)
        return bus
      },
      { wrapper }
    )
    act(() => {
      result.current.emit('lesson:test', { source: 'voice', counter: 1 })
    })
    expect(handler).toHaveBeenCalledWith({ source: 'voice', counter: 1 })
  })

  it('unsubscribes handler on unmount', () => {
    const handler = vi.fn()
    const { result, unmount } = renderHook(
      () => {
        const bus = useLessonBus()
        useLessonBusEvent('lesson:test', handler)
        return bus
      },
      { wrapper }
    )
    unmount()
    act(() => {
      result.current.emit('lesson:test', { source: 'test', counter: 0 })
    })
    expect(handler).not.toHaveBeenCalled()
  })
})
