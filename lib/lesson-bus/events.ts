// Typed event contract for the lesson page event bus (D-07).
// Phase 3 baseline: lesson:test, lesson:start, lesson:end.
// Phase 4 adds: board:say (stub — emitted in Phase 6 when voice integration lands).
// Phase 7 adds: trainer events (4 events + 3 commands).
// Each variant is a discriminated union with a unique 'type' literal.

export type LessonTestPayload  = { source: string; counter: number }
export type LessonStartPayload = { lessonId: string; at: Date }
export type LessonEndPayload   = { lessonId: string; at: Date }

// Phase 4 stub — BoardPanel will emit this in Phase 6 for TTS integration (D-09).
export type BoardSayPayload = { text: string; timestamp: number }

// Phase 7 — Trainer events (emitted by trainer UI to bus, D-03)
export type TrainerAnswerSubmittedPayload = { taskId: string; value: string; correct: boolean }
export type TrainerHintOpenedPayload      = { taskId: string; hintLevel: number }
export type TrainerTaskFocusedPayload     = { taskId: string }
export type TrainerIdle15sPayload         = { lastActivityAt: number }

// Phase 7 — Trainer commands (emitted by bot TO trainer, subscribed by TrainerPanel, D-05)
export type TrainerHighlightPayload  = { elementId: string; durationMs?: number }
export type TrainerShowHintPayload   = { taskId: string; hintLevel: number }
export type TrainerGotoTaskPayload   = { taskId: string }

export type LessonBusEvent =
  | { type: 'lesson:test';  payload: LessonTestPayload }
  | { type: 'lesson:start'; payload: LessonStartPayload }
  | { type: 'lesson:end';   payload: LessonEndPayload }
  | { type: 'board:say';    payload: BoardSayPayload }  // Phase 6: emitted when say tool fires
  // Phase 7 — Trainer events (D-03)
  | { type: 'trainer:answer_submitted'; payload: TrainerAnswerSubmittedPayload }
  | { type: 'trainer:hint_opened';      payload: TrainerHintOpenedPayload }
  | { type: 'trainer:task_focused';     payload: TrainerTaskFocusedPayload }
  | { type: 'trainer:idle_15s';         payload: TrainerIdle15sPayload }
  // Phase 7 — Trainer commands (D-05)
  | { type: 'trainer:highlight';  payload: TrainerHighlightPayload }
  | { type: 'trainer:show_hint';  payload: TrainerShowHintPayload }
  | { type: 'trainer:goto_task';  payload: TrainerGotoTaskPayload }

// Helper: extract payload type for a given event type string.
// Usage: EventPayload<'lesson:test'> → { source: string; counter: number }
export type EventPayload<E extends LessonBusEvent['type']> =
  Extract<LessonBusEvent, { type: E }>['payload']
