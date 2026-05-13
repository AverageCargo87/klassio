// Phase 8 Wave 0 RED — Wave 6 plan 08-08 Task 1 creates `lib/proactive-triggers/mistakes.ts` to flip GREEN.
// Covers PED-02 trigger #3 (consecutive ≥ 2 wrong answers → sendContextualUpdate).
import { describe, it, expect, vi } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import React from 'react'
// RED — Wave 6 plan 08-08 Task 1 creates lib/proactive-triggers/mistakes.ts.
// @ts-expect-error — module not yet created (Wave 0 RED contract)
import { useConsecutiveMistakesTrigger } from '@/lib/proactive-triggers'
import { LessonBusProvider, useLessonBus } from '@/lib/lesson-bus'

describe('useConsecutiveMistakesTrigger (PED-02 — consecutive ≥ 2 wrong answers)', () => {
  function setup() {
    const onStreak = vi.fn()
    let bus: ReturnType<typeof useLessonBus>
    function Probe() {
      bus = useLessonBus()
      useConsecutiveMistakesTrigger(onStreak)
      return null
    }
    const Wrapper = ({ children }: { children: React.ReactNode }) =>
      React.createElement(LessonBusProvider, null, React.createElement(Probe, null), children)
    renderHook(() => null, { wrapper: Wrapper })
    return { bus: bus!, onStreak }
  }

  it('fires onStreak after exactly 2 consecutive wrong answers on the same task', () => {
    const { bus, onStreak } = setup()
    act(() => { bus.emit('trainer:answer_submitted', { taskId: 'task-1', value: '5', correct: false }) })
    expect(onStreak).not.toHaveBeenCalled()
    act(() => { bus.emit('trainer:answer_submitted', { taskId: 'task-1', value: '6', correct: false }) })
    expect(onStreak).toHaveBeenCalledTimes(1)
    expect(onStreak).toHaveBeenCalledWith({ taskId: 'task-1', count: 2 })
  })

  it('does NOT re-fire on a 3rd consecutive wrong answer (fires once per streak)', () => {
    const { bus, onStreak } = setup()
    act(() => {
      bus.emit('trainer:answer_submitted', { taskId: 'task-1', value: '5', correct: false })
      bus.emit('trainer:answer_submitted', { taskId: 'task-1', value: '6', correct: false })
      bus.emit('trainer:answer_submitted', { taskId: 'task-1', value: '7', correct: false })
    })
    expect(onStreak).toHaveBeenCalledTimes(1)
  })

  it('resets streak on a correct answer; new threshold hit fires again', () => {
    const { bus, onStreak } = setup()
    act(() => {
      bus.emit('trainer:answer_submitted', { taskId: 'task-1', value: '5', correct: false })
      bus.emit('trainer:answer_submitted', { taskId: 'task-1', value: '6', correct: false })
    })
    expect(onStreak).toHaveBeenCalledTimes(1)
    act(() => {
      bus.emit('trainer:answer_submitted', { taskId: 'task-1', value: '7', correct: true })
      bus.emit('trainer:answer_submitted', { taskId: 'task-2', value: '8', correct: false })
      bus.emit('trainer:answer_submitted', { taskId: 'task-2', value: '9', correct: false })
    })
    expect(onStreak).toHaveBeenCalledTimes(2)
    expect(onStreak).toHaveBeenLastCalledWith({ taskId: 'task-2', count: 2 })
  })

  it('switching to a different task resets the streak (different taskId)', () => {
    const { bus, onStreak } = setup()
    act(() => {
      bus.emit('trainer:answer_submitted', { taskId: 'task-1', value: '5', correct: false })
      bus.emit('trainer:answer_submitted', { taskId: 'task-2', value: '6', correct: false })
    })
    expect(onStreak).not.toHaveBeenCalled()
  })
})
