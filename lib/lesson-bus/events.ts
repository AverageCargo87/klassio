// Typed event contract for the lesson page event bus (D-07).
// Phase 3 baseline: 3 events. Phase 4+ extends this union.
// Each variant is a discriminated union with a unique 'type' literal.

export type LessonTestPayload  = { source: string; counter: number }
export type LessonStartPayload = { lessonId: string; at: Date }
export type LessonEndPayload   = { lessonId: string; at: Date }

export type LessonBusEvent =
  | { type: 'lesson:test';  payload: LessonTestPayload }
  | { type: 'lesson:start'; payload: LessonStartPayload }
  | { type: 'lesson:end';   payload: LessonEndPayload }

// Helper: extract payload type for a given event type string.
// Usage: EventPayload<'lesson:test'> → { source: string; counter: number }
export type EventPayload<E extends LessonBusEvent['type']> =
  Extract<LessonBusEvent, { type: E }>['payload']
