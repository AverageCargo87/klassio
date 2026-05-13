// Phase 8 Wave 0 RED — Wave 1 plan 08-02 creates `lib/lesson-state` to flip GREEN.
// Covers LLM-01 (get_lesson_state snapshot format).
import { describe, it, expect } from 'vitest'
// RED — Wave 1 plan 08-02 creates lib/lesson-state/index.ts.
// @ts-expect-error — module not yet created (Wave 0 RED contract)
import { getLessonStateSnapshot } from '@/lib/lesson-state'

describe('getLessonStateSnapshot (LLM-01 + D-03)', () => {
  it('returns compact single-line string with active task + solved count + total', () => {
    const result = getLessonStateSnapshot('task-2', new Set(['task-1']), [], 5)
    expect(result).toBe('STATE: task-2 active, solved=1/5[task-1]')
    expect(result).not.toContain('\n')
  })

  it('empty solved set renders as empty brackets', () => {
    const result = getLessonStateSnapshot('task-1', new Set(), [], 5)
    expect(result).toBe('STATE: task-1 active, solved=0/5[]')
  })

  it('includes last 3 mistakes (oldest dropped)', () => {
    const mistakes = [
      { taskId: 'task-1', value: '100', correct: '119' },
      { taskId: 'task-2', value: '20', correct: '25' },
      { taskId: 'task-3', value: '5', correct: '7' },
      { taskId: 'task-4', value: '50', correct: '60' },
    ]
    const result = getLessonStateSnapshot('task-5', new Set(['task-1','task-2','task-3','task-4']), mistakes, 6)
    expect(result).toContain('mistakes=[task-2:ans20,task-3:ans5,task-4:ans50]')
    expect(result).not.toContain('task-1:ans100')
  })

  it('omits mistakes section when no mistakes', () => {
    const result = getLessonStateSnapshot('task-3', new Set(['task-1','task-2']), [], 5)
    expect(result).toBe('STATE: task-3 active, solved=2/5[task-1,task-2]')
    expect(result).not.toContain('mistakes=')
  })
})
