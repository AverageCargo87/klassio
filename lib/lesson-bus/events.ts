// Typed event contract for the lesson page event bus (D-07).
// Phase 3 baseline: lesson:test, lesson:start, lesson:end.
// Phase 4 adds: board:say (stub — emitted in Phase 6 when voice integration lands).
// Each variant is a discriminated union with a unique 'type' literal.

export type LessonTestPayload  = { source: string; counter: number }
export type LessonStartPayload = { lessonId: string; at: Date }
export type LessonEndPayload   = { lessonId: string; at: Date }

// Phase 4 stub — BoardPanel will emit this in Phase 6 for TTS integration (D-09).
export type BoardSayPayload = { text: string; timestamp: number }

export type LessonBusEvent =
  | { type: 'lesson:test';  payload: LessonTestPayload }
  | { type: 'lesson:start'; payload: LessonStartPayload }
  | { type: 'lesson:end';   payload: LessonEndPayload }
  | { type: 'board:say';    payload: BoardSayPayload }  // Phase 6: emitted when say tool fires

// Helper: extract payload type for a given event type string.
// Usage: EventPayload<'lesson:test'> → { source: string; counter: number }
export type EventPayload<E extends LessonBusEvent['type']> =
  Extract<LessonBusEvent, { type: E }>['payload']
