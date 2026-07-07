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
export {
  appendTranscript,
  getTranscript,
  speechOnly,
  type TranscriptLine,
  type TranscriptKind,
} from './transcript'
export {
  createHomework,
  listHomework,
  markHomeworkDone,
  type HomeworkItem,
  type HomeworkAssignment,
} from './homework'
export { generateLessonSummary, setSessionSummary } from './summary'
export {
  getCabinetHome,
  getSubjectReport,
  getRecentRecords,
  type RecentRecord,
  type SubjectCard,
  type SubjectReport,
  type SubjectLessonRow,
  type SubjectHomework,
  type SubjectNotice,
  type SubjectSkill,
} from './cabinet'
