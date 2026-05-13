'use client'
// Phase 8 PED-02 — visibilitychange trigger.
// Fires the supplied callback when document.visibilityState becomes 'hidden'.
// Does NOT fire on the inverse transition (back to visible) — VoicePanel
// decides whether the returning child gets a "welcome back" cue (it doesn't
// in MVP; Phase 12 polish if needed).
//
// Pattern: latched callback ref + empty-deps useEffect (PATTERNS.md cleanup-bug
// guard applied — addEventListener registered ONCE per mount; callback identity
// changes do NOT re-attach the listener so we never leak stale closures).
import { useEffect, useRef } from 'react'

/**
 * Subscribe to document.visibilitychange events and fire `onHidden` whenever
 * the page becomes hidden (tab switch, minimise, lock screen). Does NOT fire
 * on mount and does NOT fire when the page comes back visible.
 *
 * The callback is latched in a ref so the underlying listener is registered
 * exactly once per mount — identity changes of the supplied callback do not
 * cause add/removeEventListener churn (Phase 6.5 cleanup-bug guard).
 */
export function useVisibilityTrigger(onHidden: () => void): void {
  const ref = useRef(onHidden)
  ref.current = onHidden

  useEffect(() => {
    // SSR guard — Next.js server-renders without `document`. happy-dom in
    // tests provides it, so the listener attaches normally there.
    if (typeof document === 'undefined') return
    const handler = () => {
      if (document.visibilityState === 'hidden') {
        try {
          ref.current()
        } catch (err) {
          console.error('[proactive-triggers] visibility callback threw:', err)
        }
      }
    }
    document.addEventListener('visibilitychange', handler)
    return () => document.removeEventListener('visibilitychange', handler)
  }, []) // empty — latched ref handles callback identity changes
}
