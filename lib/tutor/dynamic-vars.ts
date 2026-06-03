// Build the 11labs dynamic variables for a tutor session (referenced as
// {{name}} in the tutor agent prompt). Greeting the child by name is now a
// core feature of the pivot ("здоровается по имени") — the parent owns the
// account, so childName is low-risk first-party data.
import type { TutorDynamicVariables } from './types'

export function buildTutorDynamicVariables(input: {
  childName?: string | null
  lessonTitle: string
  lessonTopic: string
  isFirstEver: boolean
  priorLessonsDone: number
  attemptNumber: number
}): TutorDynamicVariables {
  return {
    child_name: input.childName?.trim() || 'друг',
    lesson_title: input.lessonTitle,
    lesson_topic: input.lessonTopic,
    is_first_lesson: input.isFirstEver ? 'да' : 'нет',
    prior_lessons_done: input.priorLessonsDone,
    attempt_number: input.attemptNumber,
  }
}
