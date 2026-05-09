import { describe, it, expect } from 'vitest'
import { canStartLesson } from '../can-start'

describe('canStartLesson', () => {
  const scheduled = new Date('2026-06-01T10:00:00Z')
  const duration = 45

  it('returns false 10 minutes before scheduled', () => {
    const now = new Date(scheduled.getTime() - 10 * 60_000)
    expect(canStartLesson(scheduled, duration, now)).toBe(false)
  })

  it('returns true exactly 5 minutes before scheduled (boundary)', () => {
    const now = new Date(scheduled.getTime() - 5 * 60_000)
    expect(canStartLesson(scheduled, duration, now)).toBe(true)
  })

  it('returns true 4 minutes before scheduled', () => {
    const now = new Date(scheduled.getTime() - 4 * 60_000)
    expect(canStartLesson(scheduled, duration, now)).toBe(true)
  })

  it('returns true exactly at scheduled time', () => {
    expect(canStartLesson(scheduled, duration, scheduled)).toBe(true)
  })

  it('returns true at scheduled + duration (boundary)', () => {
    const now = new Date(scheduled.getTime() + duration * 60_000)
    expect(canStartLesson(scheduled, duration, now)).toBe(true)
  })

  it('returns false 1 minute after scheduled + duration', () => {
    const now = new Date(scheduled.getTime() + (duration + 1) * 60_000)
    expect(canStartLesson(scheduled, duration, now)).toBe(false)
  })

  it('returns false 1 hour after scheduled + duration', () => {
    const now = new Date(scheduled.getTime() + (duration + 60) * 60_000)
    expect(canStartLesson(scheduled, duration, now)).toBe(false)
  })

  it('returns false 1 hour before scheduled', () => {
    const now = new Date(scheduled.getTime() - 60 * 60_000)
    expect(canStartLesson(scheduled, duration, now)).toBe(false)
  })
})
