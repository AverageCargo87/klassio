import { describe, it, expect } from 'vitest'
import { formatFatigueSignal, formatTutorState } from '../contextual-updates'

describe('formatFatigueSignal', () => {
  it('matches the exact [СОСТОЯНИЕ] format the prompt expects', () => {
    expect(formatFatigueSignal({ avgReactionSec: 7.4, consecutiveErrors: 2, minutesElapsed: 18 })).toBe(
      '[СОСТОЯНИЕ] реакция ~7сек, ошибок подряд: 2, идёт 18 мин',
    )
  })

  it('clamps negatives and rounds', () => {
    expect(formatFatigueSignal({ avgReactionSec: -3, consecutiveErrors: -1, minutesElapsed: 0.6 })).toBe(
      '[СОСТОЯНИЕ] реакция ~0сек, ошибок подряд: 0, идёт 1 мин',
    )
  })
})

describe('formatTutorState', () => {
  it('includes phase and solved count; omits errors when zero', () => {
    expect(formatTutorState({ phase: 'cycle', solvedCount: 2, totalShown: 3, consecutiveErrors: 0 })).toBe(
      'СОСТОЯНИЕ: фаза cycle, решено 2/3',
    )
  })
  it('appends consecutive errors when present', () => {
    expect(formatTutorState({ phase: 'cycle', solvedCount: 1, totalShown: 4, consecutiveErrors: 2 })).toContain(
      'ошибок подряд 2',
    )
  })
})
