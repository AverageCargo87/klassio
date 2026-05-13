// Phase 8 — pure formatters for sendContextualUpdate payloads (D-08).
// One function per ALLOW-LISTED event. The focus-on-task trainer event is
// internal-only per D-08 (too noisy: every click would emit an update) and
// therefore has NO formatter here — Nataly never sees it.
// All output strings are Russian — Nataly speaks Russian; updates are inline
// context notes she reads to inform her next utterance.
import type {
  TrainerAnswerSubmittedPayload,
  TrainerHintOpenedPayload,
} from '@/lib/lesson-bus'

type TaskType = 'numeric-input' | 'single-choice' | 'matching'

// Short Russian aliases that fit naturally in update strings.
const TASK_TYPE_SHORT: Record<TaskType, string> = {
  'numeric-input': 'numeric',
  'single-choice': 'choice',
  'matching':      'match',
}

/**
 * '✓ task-3 (numeric, ok)' on correct; '✗ task-3 (numeric): ответ 11, правильный 12' on wrong.
 * D-08 format — task type + ✓/✗ marker keeps the LLM oriented to which task is active.
 * The 'correctValue' option is provided by the caller from trainerConfig (since the
 * payload carries only the child's answer, not the canonical correct value).
 */
export function formatAnswerSubmitted(
  payload: TrainerAnswerSubmittedPayload,
  taskType: TaskType,
  options?: { correctValue?: string },
): string {
  const short = TASK_TYPE_SHORT[taskType]
  if (payload.correct) {
    return `✓ ${payload.taskId} (${short}, ok)`
  }
  const correct = options?.correctValue
  if (correct !== undefined) {
    return `✗ ${payload.taskId} (${short}): ответ ${payload.value}, правильный ${correct}`
  }
  return `✗ ${payload.taskId} (${short}): ответ ${payload.value}`
}

/** 'Открыл подсказку уровня 2 на task-3' */
export function formatHintOpened(payload: TrainerHintOpenedPayload): string {
  return `Открыл подсказку уровня ${payload.hintLevel} на ${payload.taskId}`
}

/** 'Ребёнок молчит 15 сек на task-4' — taskId injected by VoicePanel from currentTaskId ref */
export function formatIdle15s(payload: { taskId: string }): string {
  return `Ребёнок молчит 15 сек на ${payload.taskId}`
}

/**
 * 'Переход task-2→task-3. Решено: task-1,task-2. Тема task-3: переход через десяток.'
 * Per D-03 mini-recap on goto_trainer_task transitions — gives Nataly a fresh save-point.
 */
export function formatMiniRecap(input: {
  fromTask: string
  toTask: string
  solvedTaskIds: string[]
  toTaskTopic: string
}): string {
  const solved = input.solvedTaskIds.join(',')
  return `Переход ${input.fromTask}→${input.toTask}. Решено: ${solved}. Тема ${input.toTask}: ${input.toTaskTopic}.`
}

/**
 * '⏱ 10 мин урока. Решено: 2/7, без ошибок.' or '⏱ 20 мин урока. Решено: 3/7, ошибок: 2.'
 * Per D-03 periodic checkpoint every ~10 min — anchors state at the END of context window
 * where attention is strongest (mitigates lost-in-the-middle, RESEARCH § Context Behavior).
 */
export function formatPeriodicCheckpoint(input: {
  elapsedMinutes: number
  solvedCount: number
  totalTasks: number
  mistakeCount: number
}): string {
  const tail = input.mistakeCount === 0
    ? 'без ошибок'
    : `ошибок: ${input.mistakeCount}`
  return `⏱ ${input.elapsedMinutes} мин урока. Решено: ${input.solvedCount}/${input.totalTasks}, ${tail}.`
}
