import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import React from 'react'

// Mock useLessonBus and useLessonBusEvent from the lesson-bus module
const mockEmit = vi.fn()
const mockOn = vi.fn()
const mockOff = vi.fn()

// Track subscriptions for manual trigger in tests
const subscriptions: Map<string, Array<(payload: unknown) => void>> = new Map()

vi.mock('@/lib/lesson-bus', () => ({
  useLessonBus: () => ({
    emit: mockEmit,
    on: mockOn,
    off: mockOff,
  }),
  useLessonBusEvent: (
    event: string,
    handler: (payload: unknown) => void,
  ) => {
    // Register handler so tests can simulate events
    if (!subscriptions.has(event)) {
      subscriptions.set(event, [])
    }
    subscriptions.get(event)!.push(handler)
    // Cleanup is simulated via the test lifecycle
  },
}))

import { useTrainerIdle } from '../use-trainer-idle'

describe('useTrainerIdle', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    mockEmit.mockClear()
    mockOn.mockClear()
    mockOff.mockClear()
    subscriptions.clear()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('emits trainer:idle_15s after 40 seconds of no activity', () => {
    renderHook(() => useTrainerIdle())

    // Advance timer by 40+ seconds (polling is every 5s, threshold 40s)
    act(() => {
      vi.advanceTimersByTime(45_000)
    })

    expect(mockEmit).toHaveBeenCalledWith('trainer:idle_15s', expect.objectContaining({
      lastActivityAt: expect.any(Number),
    }))
  })

  it('resets the idle timer when any trainer event fires', () => {
    renderHook(() => useTrainerIdle())

    // Advance 25 seconds (not yet idle — below 40s threshold)
    act(() => {
      vi.advanceTimersByTime(25_000)
    })

    // Simulate a trainer event to reset the timer
    act(() => {
      const handlers = subscriptions.get('trainer:answer_submitted')
      if (handlers) {
        handlers.forEach((h) => h({ taskId: 'task-1', value: '42', correct: true }))
      }
    })

    // Advance another 25 seconds (only 25s since reset — below 40s threshold)
    act(() => {
      vi.advanceTimersByTime(25_000)
    })

    // Should NOT have emitted yet (reset happened)
    expect(mockEmit).not.toHaveBeenCalledWith('trainer:idle_15s', expect.anything())
  })

  it('does not emit a second trainer:idle_15s within 55 seconds of the first', () => {
    renderHook(() => useTrainerIdle())

    // First idle fires after 40s threshold
    act(() => {
      vi.advanceTimersByTime(45_000)
    })

    expect(mockEmit).toHaveBeenCalledTimes(1)

    // 30 more seconds — still within 55s spam guard
    act(() => {
      vi.advanceTimersByTime(30_000)
    })

    // Should still be 1 (spam guard blocks second emit)
    expect(mockEmit).toHaveBeenCalledTimes(1)
  })

  it('emits a second idle after 55+ seconds from first emit', () => {
    renderHook(() => useTrainerIdle())

    // First idle fires at 45s
    act(() => {
      vi.advanceTimersByTime(45_000)
    })

    expect(mockEmit).toHaveBeenCalledTimes(1)

    // Advance 60 more seconds (45+60=105 from start; 60s after first emit > 55s guard)
    act(() => {
      vi.advanceTimersByTime(60_000)
    })

    // Second idle should now fire
    expect(mockEmit.mock.calls.filter(
      (call) => call[0] === 'trainer:idle_15s',
    ).length).toBeGreaterThanOrEqual(2)
  })

  it('cleans up interval on unmount', () => {
    const { unmount } = renderHook(() => useTrainerIdle())
    const clearSpy = vi.spyOn(global, 'clearInterval')

    unmount()

    expect(clearSpy).toHaveBeenCalled()
    clearSpy.mockRestore()
  })
})
