// Phase 8 — periodic checkpoint timer per D-03 channel #4.
// Every 10 minutes of an active session, fires a callback so the caller
// (VoicePanel) can sendContextualUpdate a state summary to Nataly. This
// places fresh state snapshots at the tail of her LLM context window
// where attention is strongest (mitigates lost-in-the-middle degradation
// per RESEARCH § Context Behavior, § Risk 5).
//
// Pure utility — no React, no SDK. VoicePanel composes this with the
// formatter from lib/contextual-updates and its own state refs.

const CHECKPOINT_INTERVAL_MS = 10 * 60 * 1000 // 10 minutes

export interface PeriodicCheckpointArgs {
  /** Wall-clock minutes elapsed since startPeriodicCheckpoint was called: 10, 20, 30, … */
  elapsedMinutes: number
}

/**
 * Schedule a periodic checkpoint callback every 10 minutes.
 *
 * @param onCheckpoint Called with elapsedMinutes after each interval tick. Caller
 *                     supplies the actual data + format (typically formatPeriodicCheckpoint).
 * @returns Cleanup function that clears the interval. Idempotent — calling it
 *          multiple times after the timer is already cleared is a no-op.
 */
export function startPeriodicCheckpoint(
  onCheckpoint: (args: PeriodicCheckpointArgs) => void,
): () => void {
  let count = 0
  let timerId: ReturnType<typeof setInterval> | null = setInterval(() => {
    count += 1
    onCheckpoint({ elapsedMinutes: count * 10 })
  }, CHECKPOINT_INTERVAL_MS)

  return () => {
    if (timerId !== null) {
      clearInterval(timerId)
      timerId = null
    }
  }
}
