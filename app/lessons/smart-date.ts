/**
 * Smart-relative date formatting for lesson schedule (D-04).
 * Pure function — accepts `now` as parameter (no Date.now() inside).
 * Uses Intl.DateTimeFormat('ru-RU') throughout — no external libraries.
 *
 * Tiers:
 *   TODAY     → "Сегодня в 16:00"
 *   TOMORROW  → "Завтра в 16:00"
 *   THIS WEEK → "Пятница, 16:00"   (same Mon-Sun week, not today/tomorrow)
 *   FURTHER   → "Пт 15 мая, 16:00" (different week — past or future)
 */

function isSameDate(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  )
}

/** Returns Monday 00:00:00 of the calendar week containing `d` (Mon-Sun, EU convention) */
function getMondayOf(d: Date): Date {
  const copy = new Date(d)
  const day = copy.getDay() // 0=Sun, 1=Mon, ..., 6=Sat
  copy.setHours(0, 0, 0, 0)
  copy.setDate(copy.getDate() + (day === 0 ? -6 : 1 - day))
  return copy
}

function isSameCalendarWeek(a: Date, b: Date): boolean {
  return getMondayOf(a).getTime() === getMondayOf(b).getTime()
}

function formatTime(d: Date): string {
  return d.toLocaleString('ru-RU', { hour: '2-digit', minute: '2-digit' })
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1)
}

/**
 * Formats a lesson's scheduled time as a smart-relative date string in Russian.
 *
 * @param scheduledAt - The lesson's scheduled date/time
 * @param now - Reference point for relative calculations
 * @returns Formatted string per D-04 tier rules
 */
export function formatSmartDate(scheduledAt: Date, now: Date): string {
  const time = formatTime(scheduledAt)

  // TODAY: same calendar date
  if (isSameDate(scheduledAt, now)) {
    return `Сегодня в ${time}`
  }

  // TOMORROW: next calendar date
  const tomorrow = new Date(now)
  tomorrow.setDate(now.getDate() + 1)
  if (isSameDate(scheduledAt, tomorrow)) {
    return `Завтра в ${time}`
  }

  // THIS WEEK: same Mon-Sun calendar week (but not today or tomorrow)
  if (isSameCalendarWeek(scheduledAt, now)) {
    const weekday = capitalize(
      scheduledAt.toLocaleString('ru-RU', { weekday: 'long' }),
    )
    return `${weekday}, ${time}`
  }

  // FURTHER: different week (past or future ≥ next week)
  // Format: "Пт 15 мая, 16:00"
  const shortWeekday = capitalize(
    scheduledAt.toLocaleString('ru-RU', { weekday: 'short' }),
  )
  const day = scheduledAt.getDate()
  const month = scheduledAt.toLocaleString('ru-RU', { month: 'long' })
  return `${shortWeekday} ${day} ${month}, ${time}`
}
