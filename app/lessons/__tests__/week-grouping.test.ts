import { describe, it, expect } from 'vitest'
import { groupByWeek } from '../week-grouping'
import type { WeekBucket } from '../week-grouping'

// Fixed reference: Monday 2026-05-11 09:00:00 (local time)
// Week 0: Mon 2026-05-11 – Sun 2026-05-17
// Week 1: Mon 2026-05-18 – Sun 2026-05-24
// Week 2: Mon 2026-05-25 – Sun 2026-05-31
// Week 3: Mon 2026-06-01 – Sun 2026-06-07
const NOW = new Date('2026-05-11T09:00:00')

function lesson(scheduledAt: Date, id = Math.random().toString()) {
  return {
    id,
    userId: 'user1',
    scheduledAt,
    topic: 'Тест',
    durationMin: 45,
    htmlTemplateUrl: null,
    htmlTrainerPath: null,
    recordingUrl: null,
    transcriptUrl: null,
    status: 'scheduled' as const,
    createdAt: new Date('2026-01-01'),
    // Phase 3 extensions (D-13)
    actualStartAt: null,
    actualEndAt: null,
  }
}

describe('groupByWeek', () => {
  it('returns [] for empty input', () => {
    const result = groupByWeek([], NOW)
    expect(result).toEqual([])
  })

  it('groups a single lesson today (this week) into "Эта неделя"', () => {
    // 2026-05-11 is Monday (week 0)
    const l = lesson(new Date('2026-05-11T16:00:00'))
    const result = groupByWeek([l], NOW)
    expect(result).toHaveLength(1)
    expect(result[0].label).toBe('Эта неделя')
    expect(result[0].weekIndex).toBe(0)
    expect(result[0].lessons).toHaveLength(1)
  })

  it('groups a lesson on next Monday (week 1) into "Следующая неделя"', () => {
    // 2026-05-18 is the next Monday
    const l = lesson(new Date('2026-05-18T10:00:00'))
    const result = groupByWeek([l], NOW)
    expect(result).toHaveLength(1)
    expect(result[0].label).toBe('Следующая неделя')
    expect(result[0].weekIndex).toBe(1)
  })

  it('groups a lesson in week 2 with a date-range label', () => {
    // 2026-05-25 is Monday of week 2
    const l = lesson(new Date('2026-05-27T14:00:00')) // Wednesday week 2
    const result = groupByWeek([l], NOW)
    expect(result).toHaveLength(1)
    expect(result[0].weekIndex).toBe(2)
    // Label should be something like "25–31 мая" (or "25–31 май" in some ICU environments)
    expect(result[0].label).toMatch(/май/)
    expect(result[0].label).toMatch(/–/)
  })

  it('excludes a lesson 5 weeks out (beyond horizon)', () => {
    // Week 4 starts 2026-06-08 — beyond the 4-week horizon
    const l = lesson(new Date('2026-06-09T10:00:00'))
    const result = groupByWeek([l], NOW)
    expect(result).toEqual([])
  })

  it('excludes a past lesson (scheduledAt < now)', () => {
    // Yesterday
    const l = lesson(new Date('2026-05-10T10:00:00'))
    const result = groupByWeek([l], NOW)
    expect(result).toEqual([])
  })

  it('returns 2 buckets for lessons in week 0 and week 2 (no week 1 bucket)', () => {
    const l0 = lesson(new Date('2026-05-12T10:00:00')) // week 0
    const l2 = lesson(new Date('2026-05-25T10:00:00')) // week 2
    const result = groupByWeek([l0, l2], NOW)
    expect(result).toHaveLength(2)
    expect(result[0].weekIndex).toBe(0)
    expect(result[1].weekIndex).toBe(2)
    // Week 1 is absent
    expect(result.find((b) => b.weekIndex === 1)).toBeUndefined()
  })

  it('sorts lessons within a bucket by scheduledAt ascending', () => {
    const l1 = lesson(new Date('2026-05-13T16:00:00'), 'l1') // Wednesday
    const l2 = lesson(new Date('2026-05-12T09:00:00'), 'l2') // Tuesday (earlier)
    // Pass in reverse order
    const result = groupByWeek([l1, l2], NOW)
    expect(result).toHaveLength(1)
    expect(result[0].lessons[0].id).toBe('l2') // earlier comes first
    expect(result[0].lessons[1].id).toBe('l1')
  })

  it('groups a lesson on the last day of week 3 (Sunday 2026-06-07) into week 3', () => {
    const l = lesson(new Date('2026-06-07T23:00:00'))
    const result = groupByWeek([l], NOW)
    expect(result).toHaveLength(1)
    expect(result[0].weekIndex).toBe(3)
  })

  it('excludes a lesson exactly at the horizon boundary (2026-06-08 00:00:00)', () => {
    // The horizon ends Sunday 2026-06-07 23:59:59.999 — week 4 starts Monday 2026-06-08
    const l = lesson(new Date('2026-06-08T00:00:00'))
    const result = groupByWeek([l], NOW)
    expect(result).toEqual([])
  })
})
