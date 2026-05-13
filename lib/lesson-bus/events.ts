// Typed event contract for the lesson page event bus (D-07).
// Phase 3 baseline: lesson:test, lesson:start, lesson:end.
// Phase 4 adds: board:say (stub — emitted in Phase 6 when voice integration lands).
// Phase 7 adds: trainer events (4 events + 3 commands).
// Phase 9 adds: voice:state, avatar:emotion.
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

// Phase 9 — Avatar/voice events (D-06)
// voice:state: emitted by Phase 6 voice agent; subscribed by AvatarPanel (D-06)
export type VoiceStatePayload  = { state: 'idle' | 'listening' | 'speaking' | 'thinking' }
// avatar:emotion: emitted by Phase 8 Pedagogical LLM; subscribed by AvatarPanel (D-06)
export type AvatarEmotionPayload = { emotion: 'neutral' | 'happy' | 'sad' | 'thinking' }
// Phase 6.5 — Voice transcript stream (emitted by VoicePanel on each 11labs onMessage,
// subscribed by TranscriptPanel that renders the chat-style transcript).
// Role values match the 11labs SDK Role type — 'agent' (teacher) | 'user' (child).
export type VoiceTranscriptPayload = { text: string; role: 'user' | 'agent'; timestamp: number }

// Phase 8 — Board control via Nataly client tools (D-07 + OQ-1 + OQ-6).
// VoicePanel emits these from the draw_explanation / clear_board client tool handlers;
// BoardPanel subscribes and calls its local executeDraw / handleClear functions.
// This avoids exposing tldraw Editor across the React tree (Option B per RESEARCH OQ-1).
export type BoardDrawRequestPayload  = { prompt: string; lessonId: string }
export type BoardClearRequestPayload = Record<string, never>

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
  // Phase 9 — Avatar/voice events (D-06)
  | { type: 'voice:state';    payload: VoiceStatePayload }
  | { type: 'avatar:emotion'; payload: AvatarEmotionPayload }
  // Phase 6.5 — Voice transcript (one event per agent or user message)
  | { type: 'voice:transcript'; payload: VoiceTranscriptPayload }
  // Phase 8 — Board control (D-07, OQ-1, OQ-6)
  | { type: 'board:draw_request';  payload: BoardDrawRequestPayload }
  | { type: 'board:clear_request'; payload: BoardClearRequestPayload }

// Helper: extract payload type for a given event type string.
// Usage: EventPayload<'lesson:test'> → { source: string; counter: number }
export type EventPayload<E extends LessonBusEvent['type']> =
  Extract<LessonBusEvent, { type: E }>['payload']
