'use client'
// lib/lesson-v2/use-voice.ts
// Persisted voice preference for the lesson-v2 voice picker. Mirrors
// useTheme — reads localStorage on mount, writes on change. No DOM
// manipulation: the consumer (lesson-page) passes the resolved voiceId
// into conversation.startSession via `overrides.tts.voiceId`.

import { useCallback, useEffect, useState } from 'react'
import { DEFAULT_VOICE, VOICES, type VoiceKey } from './voices'

const STORAGE_KEY = 'klassio-lesson-v2-voice'

function readStored(): VoiceKey {
  if (typeof window === 'undefined') return DEFAULT_VOICE
  const v = window.localStorage.getItem(STORAGE_KEY)
  if (v && VOICES.some((opt) => opt.key === v)) return v as VoiceKey
  return DEFAULT_VOICE
}

export function useVoice(): {
  voice: VoiceKey
  setVoice: (next: VoiceKey) => void
  voiceId: string
} {
  const [voice, setVoiceState] = useState<VoiceKey>(DEFAULT_VOICE)

  useEffect(() => {
    setVoiceState(readStored())
  }, [])

  const setVoice = useCallback((next: VoiceKey) => {
    setVoiceState(next)
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(STORAGE_KEY, next)
    }
  }, [])

  const voiceId = (VOICES.find((opt) => opt.key === voice) ?? VOICES[0]).voiceId
  return { voice, setVoice, voiceId }
}
