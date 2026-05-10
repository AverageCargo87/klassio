// Public API of the lesson bus module.
// Import from '@/lib/lesson-bus' in consumer files.
export type { LessonBusEvent, EventPayload } from './events'
export type {
  LessonTestPayload,
  LessonStartPayload,
  LessonEndPayload,
  BoardSayPayload,
  // Phase 7 — Trainer event payloads (D-03)
  TrainerAnswerSubmittedPayload,
  TrainerHintOpenedPayload,
  TrainerTaskFocusedPayload,
  TrainerIdle15sPayload,
  // Phase 7 — Trainer command payloads (D-05)
  TrainerHighlightPayload,
  TrainerShowHintPayload,
  TrainerGotoTaskPayload,
  // Phase 9 — Avatar/voice payloads (D-06)
  VoiceStatePayload,
  AvatarEmotionPayload,
} from './events'
export { LessonBus } from './bus'
export { LessonBusProvider, LessonBusContext } from './provider'
export { useLessonBus, useLessonBusEvent } from './hooks'
