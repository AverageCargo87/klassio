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
  label: string
  voiceId: string
  description: string
}

export const VOICES: readonly VoiceOption[] = [
  {
    key: 'nadia',
    label: 'Надя',
    voiceId: 'gedzfqL7OGdPbwm0ynTP',
    description: 'Энергичная, тёплая — основной голос',
  },
  {
    key: 'anna',
    label: 'Anna',
    voiceId: 'd5ruruBhXNbnS7Va7n23',
    description: 'Альтернативный голос учителя',
  },
] as const

export const DEFAULT_VOICE: VoiceKey = 'nadia'

export function getVoiceById(key: string): VoiceOption {
  return VOICES.find((v) => v.key === key) ?? VOICES[0]
}
