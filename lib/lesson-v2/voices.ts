// lib/lesson-v2/voices.ts
// Catalog of available 11labs voice IDs for the lesson-v2 voice picker
// (UAT 2026-05-22 round 9). The 11labs agent has the primary voice set in
// its config; we always pass an `overrides.tts.voiceId` at startSession so
// the picker drives playback without depending on the agent's default.
//
// Voice IDs are NOT secrets — they're public 11labs voice identifiers
// (you'd see them in any client SDK call). Safe to hardcode.

export type VoiceKey = 'nadia' | 'anna'

export interface VoiceOption {
  key: VoiceKey
  /** Display name in the picker AND the persona name spoken to the child. */
  label: string
  /** 11labs voice ID — passed via overrides.tts.voiceId. */
  voiceId: string
  /** Short blurb shown under the picker option. */
  description: string
  /** Override for agent.first_message — keeps name aligned with the voice.
   *  Without overriding this the new voice still introduces itself as the
   *  primary persona ("Я Надя") regardless of who is actually speaking. */
  firstMessage: string
  /** Override for agent.tts.speed (1.0 is the 11labs default). Tweaked
   *  per voice so each one sounds natural. Round 16: Аня at 0.94 because
   *  user finds her too fast at 1.0. */
  speed: number
}

export const VOICES: readonly VoiceOption[] = [
  {
    key: 'nadia',
    label: 'Надя',
    voiceId: 'gedzfqL7OGdPbwm0ynTP',
    description: 'Энергичная, тёплая — основной голос',
    firstMessage:
      'Привет! Меня зовут Надя, я твоя учительница математики на сегодня. А тебя как зовут?',
    speed: 1.0,
  },
  {
    key: 'anna',
    label: 'Аня',
    voiceId: 'd5ruruBhXNbnS7Va7n23',
    description: 'Альтернативный голос учителя',
    firstMessage:
      'Привет! Меня зовут Аня, я твоя учительница математики на сегодня. А тебя как зовут?',
    speed: 0.94,
  },
] as const

export const DEFAULT_VOICE: VoiceKey = 'nadia'

export function getVoiceById(key: string): VoiceOption {
  return VOICES.find((v) => v.key === key) ?? VOICES[0]
}
