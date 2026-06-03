// Pure formatters for sendContextualUpdate notes the tutor agent reads inline
// (LESSON-FLOW §6). The fatigue signal is the v1 minimum: 3 numbers computed in
// the browser → one compact RU line. The string format is LOAD-BEARING — it must
// match what scripts/tutor-agent-prompt.md tells «Аня» to expect ([СОСТОЯНИЕ] …).

export interface FatigueSignal {
  /** Mean time-to-answer across recent tasks, in seconds. */
  avgReactionSec: number
  /** Current run of consecutive wrong answers. */
  consecutiveErrors: number
  /** Minutes elapsed since the lesson started. */
  minutesElapsed: number
}

/** '[СОСТОЯНИЕ] реакция ~7сек, ошибок подряд: 2, идёт 18 мин' */
export function formatFatigueSignal(s: FatigueSignal): string {
  const r = Math.max(0, Math.round(s.avgReactionSec))
  const k = Math.max(0, Math.round(s.consecutiveErrors))
  const m = Math.max(0, Math.round(s.minutesElapsed))
  return `[СОСТОЯНИЕ] реакция ~${r}сек, ошибок подряд: ${k}, идёт ${m} мин`
}

/** Compact lesson-state snapshot for the lesson_state tool (mirrors math format). */
export function formatTutorState(input: {
  phase: string
  solvedCount: number
  totalShown: number
  consecutiveErrors: number
}): string {
  const head = `СОСТОЯНИЕ: фаза ${input.phase}, решено ${input.solvedCount}/${input.totalShown}`
  const tail = input.consecutiveErrors > 0 ? `, ошибок подряд ${input.consecutiveErrors}` : ''
  return head + tail
}
