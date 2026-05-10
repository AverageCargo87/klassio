import type { InferSelectModel } from 'drizzle-orm'
import type { lessons } from '@/lib/db/schema'

type Lesson = InferSelectModel<typeof lessons>

export type WeekBucket = {
  label: string
  weekIndex: number
  lessons: Lesson[]
}

/** Returns Monday 00:00:00.000 of the week containing `date` (Mon-Sun, RU/EU convention) */
function getMondayOf(date: Date): Date {
  const d = new Date(date)
  const day = d.getDay() // 0=Sun, 1=Mon, ..., 6=Sat
  const diff = day === 0 ? -6 : 1 - day // shift to Monday
  d.setHours(0, 0, 0, 0)
  d.setDate(d.getDate() + diff)
  return d
}

function getWeekLabel(weekIndex: number, monday: Date): string {
  if (weekIndex === 0) return 'Эта неделя'
  if (weekIndex === 1) return 'Следующая неделя'
  // Weeks 2 and 3: date range like "25–31 мая" or "28 мая–3 июня"
  const sunday = new Date(monday)
  sunday.setDate(monday.getDate() + 6)

  const startDay = monday.getDate()
  const endDay = sunday.getDate()
  const startMonth = monday.toLocaleString('ru-RU', { month: 'long' })
  const endMonth = sunday.toLocaleString('ru-RU', { month: 'long' })

  if (startMonth === endMonth) {
    return `${startDay}–${endDay} ${startMonth}`
  }
  return `${startDay} ${startMonth}–${endDay} ${endMonth}`
}

/**
 * Groups upcoming lessons (scheduledAt >= now, within 4-week horizon) into calendar week buckets.
 * Pure function — accepts `now` as parameter (no Date.now() inside).
 *
 * @param inputLessons - All lessons to consider (past ones are filtered out)
 * @param now - Reference point for "today"
 * @returns Non-empty WeekBuckets sorted by weekIndex ascending
 */
export function groupByWeek(inputLessons: Lesson[], now: Date): WeekBucket[] {
  const thisMonday = getMondayOf(now)

  // Horizon: end of Sunday of week 3 (4 calendar weeks total: 0, 1, 2, 3)
  const horizonSunday = new Date(thisMonday)
  horizonSunday.setDate(thisMonday.getDate() + 4 * 7 - 1) // +27 days = start of week-3 Sunday
  horizonSunday.setHours(23, 59, 59, 999)

  const buckets: Map<number, Lesson[]> = new Map()

  for (const lesson of inputLessons) {
    if (lesson.scheduledAt < now) continue // past — skip
    if (lesson.scheduledAt > horizonSunday) continue // beyond horizon — skip

    const lessonMonday = getMondayOf(lesson.scheduledAt)
    const msPerWeek = 7 * 24 * 60 * 60 * 1000
    const weekIndex = Math.round(
      (lessonMonday.getTime() - thisMonday.getTime()) / msPerWeek,
    )

    if (weekIndex < 0 || weekIndex > 3) continue

    if (!buckets.has(weekIndex)) buckets.set(weekIndex, [])
    buckets.get(weekIndex)!.push(lesson)
  }

  const result: WeekBucket[] = []
  for (const [weekIndex, weekLessons] of [...buckets.entries()].sort(([a], [b]) => a - b)) {
    const monday = new Date(thisMonday)
    monday.setDate(thisMonday.getDate() + weekIndex * 7)

    result.push({
      label: getWeekLabel(weekIndex, monday),
      weekIndex,
      lessons: weekLessons.sort(
        (a, b) => a.scheduledAt.getTime() - b.scheduledAt.getTime(),
      ),
    })
  }

  return result
}
