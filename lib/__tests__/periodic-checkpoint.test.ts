// Phase 8 Wave 3 GREEN — plan 08-06 creates `lib/periodic-checkpoint` to satisfy this contract.
// Covers HTM-01 (10-min cadence, fake timers).
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { startPeriodicCheckpoint } from '@/lib/periodic-checkpoint'

describe('periodic checkpoint (HTM-01 + D-03)', () => {
  beforeEach(() => { vi.useFakeTimers() })
  afterEach(() => { vi.useRealTimers() })

  it('fires callback after exactly 10 minutes (600_000 ms)', () => {
    const onCheckpoint = vi.fn()
    const cleanup = startPeriodicCheckpoint(onCheckpoint)
    vi.advanceTimersByTime(10 * 60 * 1000 - 1)
    expect(onCheckpoint).not.toHaveBeenCalled()
    vi.advanceTimersByTime(1)
    expect(onCheckpoint).toHaveBeenCalledTimes(1)
    expect(onCheckpoint).toHaveBeenCalledWith(expect.objectContaining({ elapsedMinutes: 10 }))
    cleanup()
  })

  it('fires every 10 minutes (count increments)', () => {
    const onCheckpoint = vi.fn()
    const cleanup = startPeriodicCheckpoint(onCheckpoint)
    vi.advanceTimersByTime(30 * 60 * 1000)
    expect(onCheckpoint).toHaveBeenCalledTimes(3)
    const args = onCheckpoint.mock.calls.map((c: unknown[]) => (c[0] as { elapsedMinutes: number }).elapsedMinutes)
    expect(args).toEqual([10, 20, 30])
    cleanup()
  })

  it('cleanup function stops the timer', () => {
    const onCheckpoint = vi.fn()
    const cleanup = startPeriodicCheckpoint(onCheckpoint)
    cleanup()
    vi.advanceTimersByTime(60 * 60 * 1000)
    expect(onCheckpoint).not.toHaveBeenCalled()
  })
})
