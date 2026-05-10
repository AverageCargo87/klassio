'use client'
// useAvatarState — React hook for avatar state management.
// Phase 9 (D-04, D-05): manages AvatarState via useReducer + bus subscriptions.
//
// Subscriptions:
//  voice:state       → dispatches voice action
//  avatar:emotion    → dispatches emotion action
//  trainer:answer_submitted → dispatches answer action; tracks wrong-answer streak
//    (2 wrong in a row → sad; correct → happy, resets streak)
//
// Auto-reset to idle: 3s timeout after last action dispatched (D-05).
import { useReducer, useEffect, useRef, useCallback } from 'react'
import { avatarReducer, type AvatarState } from '@/lib/avatar/state-machine'
import { useLessonBusEvent } from '@/lib/lesson-bus'
import type { EventPayload } from '@/lib/lesson-bus'

export function useAvatarState(): AvatarState {
  const [state, dispatch] = useReducer(avatarReducer, 'idle')

  // Auto-reset timer ref — cleared on every dispatch, fires after 3s of silence
  const resetTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  // Wrong-answer streak counter for 2-consecutive-wrong → sad (D-05)
  const wrongStreakRef = useRef<number>(0)

  /** Schedule auto-reset to idle after 3 seconds of no events. */
  const scheduleReset = useCallback(() => {
    if (resetTimerRef.current) clearTimeout(resetTimerRef.current)
    resetTimerRef.current = setTimeout(() => {
      dispatch({ type: 'reset' })
    }, 3000)
  }, [])

  // voice:state → map to voice action (Phase 6 will emit this)
  const handleVoiceState = useCallback(
    (payload: EventPayload<'voice:state'>) => {
      dispatch({ type: 'voice', state: payload.state })
      scheduleReset()
    },
    [scheduleReset],
  )

  // avatar:emotion → map to emotion action (Phase 8 Pedagogical LLM will emit)
  const handleAvatarEmotion = useCallback(
    (payload: EventPayload<'avatar:emotion'>) => {
      dispatch({ type: 'emotion', emotion: payload.emotion })
      scheduleReset()
    },
    [scheduleReset],
  )

  // trainer:answer_submitted → track streak; dispatch answer action (D-05)
  const handleAnswerSubmitted = useCallback(
    (payload: EventPayload<'trainer:answer_submitted'>) => {
      if (payload.correct) {
        wrongStreakRef.current = 0
        dispatch({ type: 'answer', correct: true })
      } else {
        wrongStreakRef.current += 1
        // Only go sad after 2 wrong answers in a row (D-05)
        if (wrongStreakRef.current >= 2) {
          dispatch({ type: 'answer', correct: false })
        }
      }
      scheduleReset()
    },
    [scheduleReset],
  )

  useLessonBusEvent('voice:state', handleVoiceState)
  useLessonBusEvent('avatar:emotion', handleAvatarEmotion)
  useLessonBusEvent('trainer:answer_submitted', handleAnswerSubmitted)

  // Cleanup reset timer on unmount
  useEffect(() => {
    return () => {
      if (resetTimerRef.current) clearTimeout(resetTimerRef.current)
    }
  }, [])

  return state
}
