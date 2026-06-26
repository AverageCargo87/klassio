// Shared types for the AI-репетитор backend (LESSON-FLOW.md).

export type TutorPhase =
  | 'connecting'
  | 'warmup'
  | 'diagnostic'
  | 'bridge'
  | 'cycle'
  | 'pause'
  | 'summary'
  | 'farewell'

export const TUTOR_PHASES: TutorPhase[] = [
  'connecting',
  'warmup',
  'diagnostic',
  'bridge',
  'cycle',
  'pause',
  'summary',
  'farewell',
]

export type ProgressEventType =
  | 'session_started'
  | 'session_completed'
  | 'phase_change'
  | 'tool_used'
  | 'task_correct'
  | 'task_wrong'
  | 'hint_shown'
  | 'fatigue_signal'
  | 'pause_started'
  | 'pause_ended'
  | 'reward_given'
  | 'diagnostic_result'
  | 'moderation_warning'
  | 'moderation_escalation'

export interface StartSessionResult {
  sessionId: string
  /** Attempt number for THIS (subject, lesson) — 1 the first time. */
  attemptNumber: number
  /** True when this is the child's very first tutor session of any lesson. */
  isFirstEver: boolean
  /** Completed runs of THIS lesson before now. */
  priorCompletions: number
  /** Completed runs of ANY lesson by this child (continuing-scenario signal). */
  priorLessonsDone: number
  /** True when an in-progress session was resumed rather than created. */
  resumed: boolean
}

/**
 * Dynamic variables injected into the 11labs tutor agent at session start
 * (referenced as {{name}} in the agent prompt). Values are strings/numbers —
 * the only types 11labs dynamic variables accept.
 */
export interface TutorDynamicVariables {
  child_name: string
  lesson_title: string
  lesson_topic: string
  /** Lesson slug (e.g. 'investicii'). The Sber orchestrator uses it to pick the
   *  lesson's own compact system prompt; 11labs ignores it (per-lesson agent). */
  lesson_slug: string
  /** 'да' on the child's first-ever tutor lesson, else 'нет' (prompt reads RU). */
  is_first_lesson: 'да' | 'нет'
  /** Human phrase for the prompt's opening line. */
  is_first_lesson_phrase: string
  prior_lessons_done: number
  attempt_number: number
}
