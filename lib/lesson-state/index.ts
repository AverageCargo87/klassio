// Phase 8 — pure state snapshot for the get_lesson_state client tool (D-03 + D-07).
// Called synchronously by the SDK when Nataly invokes get_lesson_state(); must
// return a single-line compact string (LLM reads it inline as context, no markdown).
// No React, no I/O — fully testable without DOM.

export type LessonMistake = { taskId: string; value: string; correct: string }

/**
 * Build a compact STATE: … snapshot string consumed by Nataly via get_lesson_state.
 * Format chosen per RESEARCH § 2 to minimize context tokens while keeping
 * Nataly's recall of progress reliable.
 *
 * Example outputs:
 *   - 'STATE: task-1 active, solved=0/5[]'
 *   - 'STATE: task-2 active, solved=1/5[task-1]'
 *   - 'STATE: task-5 active, solved=4/6[task-1,task-2,task-3,task-4] mistakes=[task-2:ans20,task-3:ans5,task-4:ans50]'
 *
 * @param currentTaskId  taskId of the currently active task (e.g., 'task-3')
 * @param solvedTaskIds  Set of solved taskIds (insertion-ordered for determinism)
 * @param mistakes       array of mistake records; only LAST 3 are included (token economy)
 * @param totalTasks     total tasks in the lesson trainerConfig
 */
export function getLessonStateSnapshot(
  currentTaskId: string,
  solvedTaskIds: Set<string>,
  mistakes: LessonMistake[],
  totalTasks: number,
): string {
  const solvedList = [...solvedTaskIds].join(',')
  const solvedCount = solvedTaskIds.size
  const head = `STATE: ${currentTaskId} active, solved=${solvedCount}/${totalTasks}[${solvedList}]`
  if (mistakes.length === 0) return head
  const last3 = mistakes.slice(-3)
  const tail = last3.map(m => `${m.taskId}:ans${m.value}`).join(',')
  return `${head} mistakes=[${tail}]`
}
