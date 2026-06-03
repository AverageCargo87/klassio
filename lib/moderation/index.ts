// Public API of the behaviour-moderation module (LESSON-FLOW.md §7).
// Server-side layer 1 of 2 (layer 2 is the agent prompt). Import from
// '@/lib/moderation' in app/api/tutor/moderation.
export { detectMisbehavior, decideModerationAction } from './detect'
export type {
  Severity,
  ModerationDetection,
  ModerationAction,
  ModerationDecision,
} from './detect'
export { normalize, canonicalize } from './normalize'
