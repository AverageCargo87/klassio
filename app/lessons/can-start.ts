// Pure function — no side effects, no Date.now() reads.
// Tests inject `now`. ACC-02 acceptance: button active 5 min before through end of lesson.
// Per RESEARCH Open Question 3: server snapshot only — user refreshes if they sit too long.
export function canStartLesson(
  scheduledAt: Date,
  durationMin: number,
  now: Date,
): boolean {
  const startsBeingActive = scheduledAt.getTime() - 5 * 60_000
  const stopsBeingActive = scheduledAt.getTime() + durationMin * 60_000
  const t = now.getTime()
  return t >= startsBeingActive && t <= stopsBeingActive
}
