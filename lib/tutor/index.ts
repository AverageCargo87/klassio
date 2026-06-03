// Public API of the AI-репетитор data-access layer.
// Server-only (touches the DB) — import from API routes / server components.
export type {
  TutorPhase,
  ProgressEventType,
  StartSessionResult,
  TutorDynamicVariables,
} from './types'
export { TUTOR_PHASES } from './types'
export {
  getOrStartSession,
  getSession,
  setPhase,
  completeSession,
} from './sessions'
export {
  recordAttempt,
  recordEvent,
  countSessionEvents,
  type RecordAttemptInput,
} from './tracking'
export { buildTutorDynamicVariables } from './dynamic-vars'
export {
  getChildReport,
  countUnacknowledgedModeration,
  acknowledgeModerationEvent,
  type SessionSummary,
  type SkillSummary,
  type ModerationNotice,
  type ChildReport,
} from './reports'
