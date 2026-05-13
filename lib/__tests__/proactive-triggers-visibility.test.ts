// Phase 8 Wave 0 RED — Wave 6 plan 08-08 Task 1 creates `lib/proactive-triggers/visibility.ts` to flip GREEN.
// Covers PED-02 trigger #2 (visibilitychange detector → sendContextualUpdate when document.hidden).
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook } from '@testing-library/react'
// RED — Wave 6 plan 08-08 Task 1 creates lib/proactive-triggers/visibility.ts.
// @ts-expect-error — module not yet created (Wave 0 RED contract)
import { useVisibilityTrigger } from '@/lib/proactive-triggers'

describe('useVisibilityTrigger (PED-02 — visibilitychange detector)', () => {
  let visibilityState: 'visible' | 'hidden' = 'visible'

  beforeEach(() => {
    visibilityState = 'visible'
    Object.defineProperty(document, 'visibilityState', {
      get: () => visibilityState,
      configurable: true,
    })
  })

  it('fires onHidden callback when document.visibilityState becomes "hidden"', () => {
    const onHidden = vi.fn()
    renderHook(() => useVisibilityTrigger(onHidden))
    expect(onHidden).not.toHaveBeenCalled() // does NOT fire on initial mount
    visibilityState = 'hidden'
    document.dispatchEvent(new Event('visibilitychange'))
    expect(onHidden).toHaveBeenCalledTimes(1)
  })

  it('does NOT fire when visibilityState becomes "visible" (inverse transition ignored)', () => {
    const onHidden = vi.fn()
    renderHook(() => useVisibilityTrigger(onHidden))
    // Go hidden then visible — only the hidden fire counts.
    visibilityState = 'hidden'
    document.dispatchEvent(new Event('visibilitychange'))
    onHidden.mockClear()
    visibilityState = 'visible'
    document.dispatchEvent(new Event('visibilitychange'))
    expect(onHidden).not.toHaveBeenCalled()
  })

  it('cleanup removes the event listener on unmount (Phase 6.5 cleanup-bug guard — no leaked listeners)', () => {
    const onHidden = vi.fn()
    const { unmount } = renderHook(() => useVisibilityTrigger(onHidden))
    unmount()
    visibilityState = 'hidden'
    document.dispatchEvent(new Event('visibilitychange'))
    expect(onHidden).not.toHaveBeenCalled()
  })

  it('uses latched-ref pattern — re-rendering with a new callback does NOT re-register the listener', () => {
    // Empty-deps useEffect + ref.current = onHidden on every render.
    // We can't directly inspect the listener count, but verify behavior: the latest
    // callback identity is invoked when the event fires (not a stale closure).
    const onHidden1 = vi.fn()
    const onHidden2 = vi.fn()
    const { rerender } = renderHook(({ cb }: { cb: () => void }) => useVisibilityTrigger(cb), {
      initialProps: { cb: onHidden1 },
    })
    rerender({ cb: onHidden2 })
    visibilityState = 'hidden'
    document.dispatchEvent(new Event('visibilitychange'))
    expect(onHidden1).not.toHaveBeenCalled()
    expect(onHidden2).toHaveBeenCalledTimes(1)
  })
})
