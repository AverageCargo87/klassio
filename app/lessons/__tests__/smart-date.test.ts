import { describe, it, expect } from 'vitest'
import { formatSmartDate } from '../smart-date'

// Fixed reference: Monday 2026-05-11 09:00:00 (local time)
// Week 0: Mon 2026-05-11 – Sun 2026-05-17
// Week 1: Mon 2026-05-18 – Sun 2026-05-24
const NOW = new Date('2026-05-11T09:00:00')

describe('formatSmartDate', () => {
  it('returns "Сегодня в 16:00" for a lesson today at 16:00', () => {
    const scheduledAt = new Date('2026-05-11T16:00:00')
    const result = formatSmartDate(scheduledAt, NOW)
    expect(result).toBe('Сегодня в 16:00')
  })

  it('returns "Завтра в 16:00" for a lesson tomorrow at 16:00', () => {
    const scheduledAt = new Date('2026-05-12T16:00:00')
    const result = formatSmartDate(scheduledAt, NOW)
    expect(result).toBe('Завтра в 16:00')
  })

  it('returns Russian full weekday for a lesson this Friday (same week, not today/tomorrow)', () => {
    // 2026-05-15 is Friday (within this week Mon 11 – Sun 17)
    const scheduledAt = new Date('2026-05-15T16:00:00')
    const result = formatSmartDate(scheduledAt, NOW)
    // Should be "Пятница, 16:00" (capitalized Russian weekday)
    expect(result).toMatch(/^Пятница,\s+16:00$/)
  })

  it('returns date with month for a lesson next week (further tier)', () => {
    // 2026-05-18 is next Monday (different calendar week)
    const scheduledAt = new Date('2026-05-18T10:00:00')
    const result = formatSmartDate(scheduledAt, NOW)
    // Should include the month — ICU may return nominative "май" or genitive "мая"
    // depending on the runtime's Intl implementation (happy-dom vs Node.js ICU)
    expect(result).toMatch(/май/)
    // Should not be "Сегодня", "Завтра", or a full weekday-only format
    expect(result).not.toMatch(/^Сегодня/)
    expect(result).not.toMatch(/^Завтра/)
  })

  it('returns date with month for a lesson 2 weeks out', () => {
    const scheduledAt = new Date('2026-05-25T14:00:00')
    const result = formatSmartDate(scheduledAt, NOW)
    // ICU may return nominative "май" or genitive "мая"
    expect(result).toMatch(/май/)
    expect(result).toMatch(/14:00/)
  })

  it('returns date with month for a past lesson (further tier)', () => {
    // A past lesson is in a different week — falls to "further" tier
    const scheduledAt = new Date('2026-05-05T09:30:00')
    const result = formatSmartDate(scheduledAt, NOW)
    // ICU may return nominative "май" or genitive "мая"
    expect(result).toMatch(/май/)
    expect(result).toMatch(/09:30/)
  })

  it('formats time as HH:mm with leading zero for single-digit hours', () => {
    const scheduledAt = new Date('2026-05-11T09:05:00') // 09:05 today
    const result = formatSmartDate(scheduledAt, NOW)
    expect(result).toBe('Сегодня в 09:05')
  })

  it('uses Russian weekday name (not English) for this-week tier', () => {
    // Wednesday 2026-05-13
    const scheduledAt = new Date('2026-05-13T12:00:00')
    const result = formatSmartDate(scheduledAt, NOW)
    // Must be a Russian day name
    expect(result).toMatch(/Среда|Среда,/)
    expect(result).not.toMatch(/Wednesday/)
  })

  it('formats exactly midnight today as Сегодня', () => {
    // now = 2026-05-11T09:00:00, scheduledAt = midnight same day
    const scheduledAt = new Date('2026-05-11T00:00:00')
    const result = formatSmartDate(scheduledAt, NOW)
    expect(result).toBe('Сегодня в 00:00')
  })
})
