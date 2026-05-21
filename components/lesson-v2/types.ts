// components/lesson-v2/types.ts
// Internal data types used by lesson-v2 components. These are a thin layer on top
// of the project's TrainerConfig — they match what Claude Design's components
// expect (kind: 'intro'|'task', task.expr/answer/options[].key etc.) so we don't
// have to refactor the UI to match our JSON schema.
//
// Conversion from TrainerConfig → Screen[] lives in adapt-config.ts.

export interface IntroScreen {
  kind: 'intro'
  id: string
  emoji: string
  title: string
  /** Body split into paragraphs for rendering as <p> stack. */
  body: string[]
}

export interface NumericInputTask {
  kind: 'task'
  id: string
  type: 'numeric-input'
  difficulty: 1 | 2 | 3
  /** Short label above the column expression, e.g. "Сложи в столбик:". */
  prompt: string
  /** Optional column expression in form "A + B" — rendered as visual stack. */
  expr: string | null
  /** Canonical answer as string for value comparison. */
  answer: string
  hints: string[]
  explanation: string
}

export interface SingleChoiceOption {
  key: string // "A" | "B" | "C" | "D"
  label: string
  correct: boolean
}

export interface SingleChoiceTask {
  kind: 'task'
  id: string
  type: 'single-choice'
  difficulty: 1 | 2 | 3
  prompt: string
  options: SingleChoiceOption[]
  hints: string[]
  explanation: string
}

export interface MatchingPair {
  left: string
  right: string
}

export interface MatchingTask {
  kind: 'task'
  id: string
  type: 'matching'
  difficulty: 1 | 2 | 3
  prompt: string
  pairs: MatchingPair[]
  rightOptions: string[]
  hints: string[]
  explanation: string
}

export type TaskScreen = NumericInputTask | SingleChoiceTask | MatchingTask
export type Screen = IntroScreen | TaskScreen

// Per-task UI state held in LessonPage state.
export interface TaskState {
  status: 'pending' | 'solved'
  hintsShown: number
  attempts: number
}

// Chat log entry in FloatingTeacher.
export interface ChatMessage {
  role: 'teacher' | 'user'
  text: string
  t: number // Date.now() at insertion
}

export type TeacherStatus = 'idle' | 'listening' | 'speaking'
