// Phase 8 plan 08-08 — supplementary combined coverage for the two PED-02 hooks.
// This file is created alongside the implementation (NOT a Wave 0 RED stub —
// proactive-triggers-{visibility,mistakes}.test.ts are the Nyquist gates and
// they are flipped GREEN by the same Task 1 that lands these production files).
// This .tsx file adds combined-hook coverage with a higher-fidelity LessonBus
// wrapper (proactive-triggers-mistakes.test.ts already covers the bus subscription
// via LessonBusProvider; this file double-checks rendering integration).
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import React from 'react'
import { LessonBusProvider, useLessonBus } from '@/lib/lesson-bus'
import {
  useVisibilityTrigger,
  useConsecutiveMistakesTrigger,
} from '@/lib/proactive-triggers'

describe('useVisibilityTrigger (PED-02, supplementary)', () => {
  let visibilityState: 'visible' | 'hidden' = 'visible'

  beforeEach(() => {
    visibilityState = 'visible'
    Object.defineProperty(document, 'visibilityState', {
      get: () => visibilityState,
      configurable: true,
    })
  })

  it('fires callback when visibilityState becomes hidden', () => {
    const onHidden = vi.fn()
    renderHook(() => useVisibilityTrigger(onHidden))
    act(() => {
      visibilityState = 'hidden'
      document.dispatchEvent(new Event('visibilitychange'))
    })
    expect(onHidden).toHaveBeenCalledTimes(1)
  })

  it('does NOT fire when becoming visible', () => {
    const onHidden = vi.fn()
    renderHook(() => useVisibilityTrigger(onHidden))
    visibilityState = 'hidden'
    document.dispatchEvent(new Event('visibilitychange'))
    onHidden.mockClear()
    visibilityState = 'visible'
    document.dispatchEvent(new Event('visibilitychange'))
    expect(onHidden).not.toHaveBeenCalled()
  })

  it('cleanup removes the listener on unmount', () => {
    const onHidden = vi.fn()
    const { unmount } = renderHook(() => useVisibilityTrigger(onHidden))
    unmount()
    visibilityState = 'hidden'
    document.dispatchEvent(new Event('visibilitychange'))
    expect(onHidden).not.toHaveBeenCalled()
  })

  it('swallows callback errors so the listener stays alive', () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const onHidden = vi.fn(() => {
      throw new Error('boom')
    })
    renderHook(() => useVisibilityTrigger(onHidden))
    act(() => {
      visibilityState = 'hidden'
      document.dispatchEvent(new Event('visibilitychange'))
    })
    expect(onHidden).toHaveBeenCalledTimes(1)
    expect(consoleSpy).toHaveBeenCalled()
    consoleSpy.mockRestore()
  })
})

describe('useConsecutiveMistakesTrigger (PED-02, supplementary)', () => {
  // Probe component exposes the LessonBus from the wrapper-provided context so
  // tests can drive emits. The hook lives inside the same Probe so the bus
  // subscription is mounted within the LessonBusProvider.
  function makeWrapperAndProbe(
    onStreak: (args: { taskId: string; count: number }) => void,
  ) {
    let busRef: ReturnType<typeof useLessonBus> | undefined
    function Probe() {
      busRef = useLessonBus()
      useConsecutiveMistakesTrigger(onStreak)
      return null
    }
    const Wrapper = ({ children }: { children: React.ReactNode }) =>
      React.createElement(
        LessonBusProvider,
        null,
        React.createElement(Probe, null),
        children,
      )
    renderHook(() => null, { wrapper: Wrapper })
    return () => busRef!
  }

  it('fires onStreak after 2 consecutive wrong answers on the same task', () => {
    const onStreak = vi.fn()
    const getBus = makeWrapperAndProbe(onStreak)
    act(() => {
      getBus().emit('trainer:answer_submitted', {
        taskId: 'task-1',
        value: '5',
        correct: false,
      })
    })
    expect(onStreak).not.toHaveBeenCalled()
    act(() => {
      getBus().emit('trainer:answer_submitted', {
        taskId: 'task-1',
        value: '6',
        correct: false,
      })
    })
    expect(onStreak).toHaveBeenCalledTimes(1)
    expect(onStreak).toHaveBeenCalledWith({ taskId: 'task-1', count: 2 })
  })

  it('does NOT re-fire on a 3rd wrong answer in the same streak', () => {
    const onStreak = vi.fn()
    const getBus = makeWrapperAndProbe(onStreak)
    act(() => {
      getBus().emit('trainer:answer_submitted', {
        taskId: 'task-1',
        value: '5',
        correct: false,
      })
      getBus().emit('trainer:answer_submitted', {
        taskId: 'task-1',
        value: '6',
        correct: false,
      })
      getBus().emit('trainer:answer_submitted', {
        taskId: 'task-1',
        value: '7',
        correct: false,
      })
    })
    expect(onStreak).toHaveBeenCalledTimes(1)
  })

  it('resets streak on a correct answer; new threshold hit fires again', () => {
    const onStreak = vi.fn()
    const getBus = makeWrapperAndProbe(onStreak)
    act(() => {
      getBus().emit('trainer:answer_submitted', {
        taskId: 'task-1',
        value: '5',
        correct: false,
      })
      getBus().emit('trainer:answer_submitted', {
        taskId: 'task-1',
        value: '6',
        correct: false,
      })
    })
    expect(onStreak).toHaveBeenCalledTimes(1)
    act(() => {
      getBus().emit('trainer:answer_submitted', {
        taskId: 'task-1',
        value: '7',
        correct: true,
      })
      getBus().emit('trainer:answer_submitted', {
        taskId: 'task-2',
        value: '8',
        correct: false,
      })
      getBus().emit('trainer:answer_submitted', {
        taskId: 'task-2',
        value: '9',
        correct: false,
      })
    })
    expect(onStreak).toHaveBeenCalledTimes(2)
  })

  it('switching tasks resets the streak (different taskId, single wrong each)', () => {
    const onStreak = vi.fn()
    const getBus = makeWrapperAndProbe(onStreak)
    act(() => {
      getBus().emit('trainer:answer_submitted', {
        taskId: 'task-1',
        value: '5',
        correct: false,
      })
      getBus().emit('trainer:answer_submitted', {
        taskId: 'task-2',
        value: '6',
        correct: false,
      })
    })
    expect(onStreak).not.toHaveBeenCalled()
  })
})
