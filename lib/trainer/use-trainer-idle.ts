'use client'
// useTrainerIdle — idle detector hook (D-17).
// Subscribes to all trainer events; emits trainer:idle_15s after a threshold
// of silence. Spam guard: max 1 emit per 45s.
//
// UAT 2026-05-22 round 13/16: progressively bumped silence thresholds.
//   Original   : 15s / 30s spam guard
//   Round 13   : 30s / 45s
//   Round 16   : 40s / 55s (current) — user feedback «+10 сек ещё»
// Event name kept as trainer:idle_15s for back-compat with subscribers.
import { useEffect, useRef } from 'react'
import { useLessonBus, useLessonBusEvent } from '@/lib/lesson-bus'

const IDLE_THRESHOLD_MS = 40_000   // 40 seconds
const POLL_INTERVAL_MS  = 5_000    // poll every 5 seconds
const SPAM_GUARD_MS     = 55_000   // max 1 idle event per 55 seconds

export function useTrainerIdle(): void {
  const bus = useLessonBus()

  const lastActivityAt = useRef<number>(Date.now())
  const lastEmitAt     = useRef<number>(0)
  const intervalRef    = useRef<ReturnType<typeof setInterval> | null>(null)

  // Reset activity timestamp on any trainer event
  const resetActivity = (): void => {
    lastActivityAt.current = Date.now()
  }

  // Subscribe to all 4 trainer event types
  useLessonBusEvent('trainer:answer_submitted', resetActivity)
  useLessonBusEvent('trainer:hint_opened',      resetActivity)
  useLessonBusEvent('trainer:task_focused',     resetActivity)
  useLessonBusEvent('trainer:idle_15s',         resetActivity)

  useEffect(() => {
    lastActivityAt.current = Date.now()

    intervalRef.current = setInterval(() => {
      const now = Date.now()
      const sinceActivity = now - lastActivityAt.current
      const sinceLastEmit = now - lastEmitAt.current

      if (sinceActivity >= IDLE_THRESHOLD_MS && sinceLastEmit >= SPAM_GUARD_MS) {
        lastEmitAt.current = now
        bus.emit('trainer:idle_15s', { lastActivityAt: lastActivityAt.current })
      }
    }, POLL_INTERVAL_MS)

    return () => {
      if (intervalRef.current !== null) {
        clearInterval(intervalRef.current)
        intervalRef.current = null
      }
    }
  }, [bus])
}
