'use client'
// lib/lesson-v2/use-voice.tsx
// Persisted voice preference shared across the lesson-v2 component tree.
//
// UAT 2026-05-22 round 15: switched from per-component useState to a
// React Context. Earlier each call to useVoice() owned its own state, so
// VoiceToggle would update its local state on click but LessonPageInner
// (which consumed voice separately) never saw the change — chat header
// stayed «Аня» when the picker showed «Надя». Context fixes that by
// making the state a single instance shared by every consumer.

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import { DEFAULT_VOICE, VOICES, type VoiceKey, type VoiceOption } from './voices'

const STORAGE_KEY = 'klassio-lesson-v2-voice'

interface VoiceContextValue {
  voice: VoiceKey
  setVoice: (next: VoiceKey) => void
  voiceId: string
  option: VoiceOption
}

const VoiceContext = createContext<VoiceContextValue | null>(null)

function readStored(): VoiceKey {
  if (typeof window === 'undefined') return DEFAULT_VOICE
  const v = window.localStorage.getItem(STORAGE_KEY)
  return VOICES.some((opt) => opt.key === v) ? (v as VoiceKey) : DEFAULT_VOICE
}

export function VoiceProvider({ children }: { children: ReactNode }) {
  const [voice, setVoiceState] = useState<VoiceKey>(DEFAULT_VOICE)

  // Hydrate from storage on mount. SSR returns DEFAULT_VOICE; the effect
  // runs only on the client and updates if the stored preference differs.
  useEffect(() => {
    setVoiceState(readStored())
  }, [])

  const setVoice = useCallback((next: VoiceKey) => {
    setVoiceState(next)
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(STORAGE_KEY, next)
    }
  }, [])

  const value = useMemo<VoiceContextValue>(() => {
    const option = VOICES.find((opt) => opt.key === voice) ?? VOICES[0]
    return { voice, setVoice, voiceId: option.voiceId, option }
  }, [voice, setVoice])

  return <VoiceContext.Provider value={value}>{children}</VoiceContext.Provider>
}

export function useVoice(): VoiceContextValue {
  const ctx = useContext(VoiceContext)
  if (!ctx) {
    throw new Error('useVoice must be used inside <VoiceProvider>')
  }
  return ctx
}
