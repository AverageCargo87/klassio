// Phase 8 PED-02 — public API for the proactive-triggers module.
// Two browser-event hooks that VoicePanel composes with
// conversation.sendContextualUpdate to forward visibility/consecutive-mistake
// signals to Nataly. Hook bodies live in their own files; this barrel only
// re-exports — keeps consumer imports compact: `from '@/lib/proactive-triggers'`.
export { useVisibilityTrigger } from './visibility'
export { useConsecutiveMistakesTrigger } from './mistakes'
export type { ConsecutiveMistakesTriggerArgs } from './mistakes'
