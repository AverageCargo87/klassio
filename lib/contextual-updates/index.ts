// Phase 8 — public API for the contextual-updates module.
// Import from '@/lib/contextual-updates' in consumer files (VoicePanel, lib/client-tools).
// Allow-list discipline per D-08: only events that benefit Nataly's reasoning are
// formatted; the focus event (internal-only) is intentionally absent.
export {
  formatAnswerSubmitted,
  formatHintOpened,
  formatIdle15s,
  formatMiniRecap,
  formatPeriodicCheckpoint,
} from './formatters'
