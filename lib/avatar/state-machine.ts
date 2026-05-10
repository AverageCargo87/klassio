// Avatar state machine — pure reducer (D-04, D-05).
// Phase 9: emoji-based avatar SHELL; Lottie animation swap deferred to Phase 9.1.
//
// 6 states (D-02): idle, listening, speaking, thinking, happy, sad.
// Transitions driven by voice:state bus events (Phase 6 will emit)
// and avatar:emotion bus events (Phase 8 Pedagogical LLM will emit).
// Auto-reset to idle after 3s of no events is handled by useAvatarState hook.

export type AvatarState = 'idle' | 'listening' | 'speaking' | 'thinking' | 'happy' | 'sad'

export type AvatarAction =
  | { type: 'voice'; state: 'idle' | 'listening' | 'speaking' | 'thinking' }
  | { type: 'emotion'; emotion: 'neutral' | 'happy' | 'sad' | 'thinking' }
  | { type: 'answer'; correct: boolean }   // trainer:answer_submitted shortcut
  | { type: 'reset' }                       // auto-reset to idle after timeout

/**
 * Pure avatar state reducer (D-04).
 * Transitions (D-05):
 *  - reset   → idle (always)
 *  - voice   → maps 1:1 (idle→idle, listening→listening, speaking→speaking, thinking→thinking)
 *  - emotion.neutral  → idle
 *  - emotion.happy    → happy
 *  - emotion.sad      → sad
 *  - emotion.thinking → thinking
 *  - answer.correct   → happy
 *  - answer.wrong     → sad (caller responsible for 2-wrong-in-a-row check; see useAvatarState)
 */
export function avatarReducer(state: AvatarState, action: AvatarAction): AvatarState {
  switch (action.type) {
    case 'reset':
      return 'idle'

    case 'voice':
      switch (action.state) {
        case 'idle':      return 'idle'
        case 'listening': return 'listening'
        case 'speaking':  return 'speaking'
        case 'thinking':  return 'thinking'
      }
      break

    case 'emotion':
      switch (action.emotion) {
        case 'neutral':  return 'idle'
        case 'happy':    return 'happy'
        case 'sad':      return 'sad'
        case 'thinking': return 'thinking'
      }
      break

    case 'answer':
      return action.correct ? 'happy' : 'sad'
  }

  // Exhaustive: TypeScript will warn if new action variants are added without handling
  return state
}
