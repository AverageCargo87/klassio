'use client'
// Typed hooks for consuming the lesson event bus (D-09).
import { useContext, useEffect } from 'react'
import { LessonBusContext } from './provider'
import type { LessonBusEvent, EventPayload } from './events'
import type { LessonBus } from './bus'

/**
 * Returns the LessonBus instance from context.
 * Must be called inside LessonBusProvider. Throws otherwise.
 */
export function useLessonBus(): LessonBus {
  const bus = useContext(LessonBusContext)
  if (!bus) {
    throw new Error('useLessonBus must be used inside <LessonBusProvider>')
  }
  return bus
}

/**
 * Subscribe to a typed lesson bus event for the lifetime of the component.
 * Auto-unsubscribes on unmount or when event/handler reference changes.
 *
 * Note: pass a stable handler reference (e.g. useCallback) to avoid
 * re-subscribing on every render. For simple cases, an inline function is fine.
 */
export function useLessonBusEvent<E extends LessonBusEvent['type']>(
  event: E,
  handler: (payload: EventPayload<E>) => void,
): void {
  const bus = useLessonBus()
  useEffect(() => {
    bus.on(event, handler)
    return () => {
      bus.off(event, handler)
    }
  }, [bus, event, handler])
}
