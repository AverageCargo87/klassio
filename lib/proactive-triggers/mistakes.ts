'use client'
// Phase 8 PED-02 — consecutive-wrong-answers trigger.
// Subscribes to trainer:answer_submitted on the lesson bus; tracks a streak
// counter per taskId. When the streak hits `threshold` consecutive wrong
// answers on the SAME task (default 2 per REQUIREMENTS.md PED-02 acceptance
// #1 item 3), fires onStreak ONCE. Resets on any correct answer, or when the
// task switches (different taskId).
//
// Pattern: useRef streak state (no re-renders — side-effect state only) +
// useLessonBusEvent for the subscription (PATTERNS.md latched-ref pattern;
// uses the Phase 7 bus hook that auto-cleans on unmount).
import { useCallback, useRef } from 'react'
import { useLessonBusEvent } from '@/lib/lesson-bus'

export interface ConsecutiveMistakesTriggerArgs {
  taskId: string
  count: number
}

/**
 * Subscribe to `trainer:answer_submitted` events and fire `onStreak({taskId,
 * count})` exactly once when the streak of consecutive wrong answers on the
 * same task reaches `threshold`. Subsequent wrong answers on the same task
 * do NOT re-fire (single fire per streak — the `fired` latch). The streak
 * resets on any correct answer, or when the taskId switches.
 *
 * @param onStreak  callback fired once per fresh threshold hit
 * @param threshold consecutive-wrong-answer count required to fire (default 2)
 */
export function useConsecutiveMistakesTrigger(
  onStreak: (args: ConsecutiveMistakesTriggerArgs) => void,
  threshold = 2,
): void {
  // Latched callback ref so the bus subscription handler identity is stable
  // (PATTERNS.md latched-ref pattern — empty-deps inside useCallback).
  const onStreakRef = useRef(onStreak)
  onStreakRef.current = onStreak

  // Per-task streak state — { taskId, count, fired }.
  //   `fired`: ensures we emit ONCE per streak even if wrong answers continue.
  //   Reset to false on any correct answer or task switch, so the next
  //   threshold hit can fire normally.
  const streakRef = useRef<{ taskId: string | null; count: number; fired: boolean }>(
    { taskId: null, count: 0, fired: false },
  )

  const handler = useCallback(
    ({ taskId, correct }: { taskId: string; value: string; correct: boolean }) => {
      const s = streakRef.current
      if (correct) {
        // Any correct answer resets the streak entirely.
        s.taskId = null
        s.count = 0
        s.fired = false
        return
      }
      // Wrong answer.
      if (s.taskId !== taskId) {
        // New streak starts on a different task (or the very first wrong answer).
        s.taskId = taskId
        s.count = 1
        s.fired = false
        return
      }
      // Same task — increment streak.
      s.count += 1
      if (s.count >= threshold && !s.fired) {
        s.fired = true
        try {
          onStreakRef.current({ taskId, count: s.count })
        } catch (err) {
          console.error('[proactive-triggers] consecutiveMistakes callback threw:', err)
        }
      }
    },
    [threshold],
  )

  useLessonBusEvent('trainer:answer_submitted', handler)
}
