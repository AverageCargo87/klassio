// Curriculum resolver — maps (subjectId, lessonSlug) → lesson metadata.
// Single place the tutor route + parent reports look up human-readable titles.
// Today only «Окружающий мир · 4 класс» exists; add subjects here as they ship.
import { OKR_MIR_4_LESSONS, type CurriculumLesson } from './okr-mir-4'

export type { CurriculumLesson, LessonStatus } from './okr-mir-4'
export { OKR_MIR_4_LESSONS } from './okr-mir-4'

export interface SubjectMeta {
  id: string
  title: string
  grade: string
  lessons: CurriculumLesson[]
}

export const SUBJECTS: Record<string, SubjectMeta> = {
  'okr-mir-4': {
    id: 'okr-mir-4',
    title: 'Окружающий мир',
    grade: '4 класс',
    lessons: OKR_MIR_4_LESSONS,
  },
}

export interface ResolvedLesson extends CurriculumLesson {
  subjectId: string
  subjectTitle: string
}

/** Resolve a lesson by (subjectId, slug); undefined if unknown. */
export function resolveLesson(subjectId: string, slug: string): ResolvedLesson | undefined {
  const subject = SUBJECTS[subjectId]
  const lesson = subject?.lessons.find((l) => l.slug === slug)
  if (!subject || !lesson) return undefined
  return { ...lesson, subjectId: subject.id, subjectTitle: subject.title }
}

/** Human-readable title for (subjectId, slug); falls back to the slug. */
export function lessonTitle(subjectId: string, slug: string): string {
  return resolveLesson(subjectId, slug)?.title ?? slug
}
