'use client'
// LessonBusProvider wraps the lesson page client component tree (D-06).
// Creates one LessonBus instance per mount; clears it on unmount (D-10).
// Not a global singleton — scoped to the lesson page lifecycle.
import React, { createContext, useMemo } from 'react'
import { LessonBus } from './bus'

// Context holds the bus instance. null = outside provider (guard in hook).
export const LessonBusContext = createContext<LessonBus | null>(null)

LessonBusContext.displayName = 'LessonBusContext'

export function LessonBusProvider({ children }: { children: React.ReactNode }) {
  // useMemo with empty deps: one instance per mount. React StrictMode may
  // double-invoke but the bus is stateless beyond its Map — safe.
  const bus = useMemo(() => new LessonBus(), [])

  // Cleanup: clear all subscriptions when provider unmounts (D-10).
  React.useEffect(() => {
    return () => bus.clear()
  }, [bus])

  return (
    React.createElement(LessonBusContext.Provider, { value: bus }, children)
  )
}
