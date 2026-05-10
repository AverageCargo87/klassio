'use client'
// Avatar component — Phase 9 SHELL (D-03).
// 6 emoji states with CSS animations per D-02.
// Controlled via `state` prop (used by VoicePanel + tests).
// Autonomous mode: use useAvatarState hook in the parent.
//
// Emojis per CONTEXT.md:
//  idle      → 🙂 (neutral)
//  listening → 👂 (cup ear)
//  speaking  → 🗣️ (speaking head)
//  thinking  → 🤔 (thinking face)
//  happy     → 😊 (smile)
//  sad       → 😟 (concerned)
import type { AvatarState } from '@/lib/avatar/state-machine'

// Maps each state to an emoji + accessible label
const AVATAR_EMOJI: Record<AvatarState, { emoji: string; label: string }> = {
  idle:      { emoji: '🙂',  label: 'Учитель ждёт' },
  listening: { emoji: '👂',  label: 'Учитель слушает' },
  speaking:  { emoji: '🗣️', label: 'Учитель говорит' },
  thinking:  { emoji: '🤔',  label: 'Учитель думает' },
  happy:     { emoji: '😊',  label: 'Учитель доволен' },
  sad:       { emoji: '😟',  label: 'Учитель огорчён' },
}

// CSS animation class per state (keyframes defined in globals.css via Tailwind).
// Tailwind arbitrary animate-* not supported without plugin — use inline class names
// with @keyframes defined below (CSS Module approach via globals.css additions).
const AVATAR_ANIMATION_CLASS: Record<AvatarState, string> = {
  idle:      'avatar-anim-idle',      // slow breathe (scale pulse)
  listening: 'avatar-anim-listening', // subtle nod (rotate slight)
  speaking:  'avatar-anim-speaking',  // bounce
  thinking:  'avatar-anim-thinking',  // wiggle
  happy:     'avatar-anim-happy',     // celebrate (scale up/down fast)
  sad:       'avatar-anim-sad',       // wilt (slow droop)
}

interface AvatarProps {
  state: AvatarState
  /** Size class for the emoji. Defaults to text-7xl (≈112px). */
  size?: 'text-5xl' | 'text-6xl' | 'text-7xl' | 'text-8xl'
}

/**
 * Controlled avatar component (D-10).
 * Renders the emoji + animation for the given AvatarState.
 * data-avatar-state attribute used by E2E tests (D-11).
 */
export function Avatar({ state, size = 'text-7xl' }: AvatarProps) {
  const { emoji, label } = AVATAR_EMOJI[state]
  const animClass = AVATAR_ANIMATION_CLASS[state]

  return (
    <div
      className="flex flex-col items-center justify-center gap-2"
      data-avatar-state={state}
      role="img"
      aria-label={label}
    >
      {/* Soft coloured circle background (D-Claude's discretion) */}
      <div className="relative flex items-center justify-center rounded-full bg-primary/10 w-32 h-32">
        <span
          className={`${size} leading-none select-none ${animClass}`}
          aria-hidden="true"
        >
          {emoji}
        </span>
      </div>
      <p className="text-xs text-muted-foreground">{label}</p>
    </div>
  )
}
