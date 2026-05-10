'use client'
// LessonBusProvider wraps the lesson page client component tree (D-06).
// Creates one LessonBus instance per mount; clears it on unmount (D-10).
// Not a global singleton — scoped to the lesson page lifecycle.
//
// Phase 9 — E2E test bus exposure (A4):
//   In non-production environments (NODE_ENV !== 'production') the bus instance
//   is attached to window.__lessonBus so Playwright E2E tests can fire events:
//     await page.evaluate(() => window.__lessonBus.emit('voice:state', { state: 'speaking' }))
//   This pattern was already used in Phase 7; Phase 9 formalises it in the provider.
import React, { createContext, useMemo } from 'react'
import { LessonBus } from './bus'

// Augment Window so TypeScript doesn't complain (test/dev only)
declare global {
  interface Window {
    __lessonBus?: LessonBus
  }
}

// Context holds the bus instance. null = outside provider (guard in hook).
export const LessonBusContext = createContext<LessonBus | null>(null)

LessonBusContext.displayName = 'LessonBusContext'

export function LessonBusProvider({ children }: { children: React.ReactNode }) {
  // useMemo with empty deps: one instance per mount. React StrictMode may
  // double-invoke but the bus is stateless beyond its Map — safe.
  const bus = useMemo(() => new LessonBus(), [])

  // Cleanup: clear all subscriptions when provider unmounts (D-10).
  // Also remove window reference when provider unmounts.
  React.useEffect(() => {
    // Expose bus for E2E + dev testing (not in production)
    if (process.env.NODE_ENV !== 'production' && typeof window !== 'undefined') {
      window.__lessonBus = bus
    }
    return () => {
      bus.clear()
      if (typeof window !== 'undefined') {
        delete window.__lessonBus
      }
    }
  }, [bus])

  return (
    React.createElement(LessonBusContext.Provider, { value: bus }, children)
  )
}
