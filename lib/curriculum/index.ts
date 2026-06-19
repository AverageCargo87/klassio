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
  emoji: string
  description: string
  lessons: CurriculumLesson[]
}

// Заглушки для предметов, чей голосовой контент ещё не готов (рисуются в Claude
// Design). Уроки помечены coming-soon → в пикере «скоро», в кабинете — «предстоят».
const MATH_5_LESSONS: CurriculumLesson[] = [
  { slug: 'slozhenie-stolbik', number: 1, title: 'Сложение в столбик', subtitle: 'Складываем многозначные числа.', status: 'coming-soon' },
  { slug: 'vychitanie-stolbik', number: 2, title: 'Вычитание в столбик', subtitle: 'Вычитаем с переходом через разряд.', status: 'coming-soon' },
]
const FIN_LIT_LESSONS: CurriculumLesson[] = [
  { slug: 'pervye-investicii', number: 1, title: 'Мои первые инвестиции', subtitle: 'Что такое деньги, накопления и зачем их вкладывают.', status: 'coming-soon' },
]

// Порядок = порядок карточек в кабинете/пикере.
export const SUBJECTS: Record<string, SubjectMeta> = {
  'matematika-5': {
    id: 'matematika-5',
    title: 'Математика',
    grade: '5 класс',
    emoji: '🧮',
    description: 'Сложение и вычитание в столбик.',
    lessons: MATH_5_LESSONS,
  },
  'okr-mir-4': {
    id: 'okr-mir-4',
    title: 'Окружающий мир',
    grade: '4 класс',
    emoji: '🪐',
    description: 'Земля и человечество — астрономия, Солнечная система, звёздное небо.',
    lessons: OKR_MIR_4_LESSONS,
  },
  'fin-gramotnost': {
    id: 'fin-gramotnost',
    title: 'Финансовая грамотность',
    grade: 'для детей',
    emoji: '💰',
    description: 'Деньги, накопления и первые инвестиции простыми словами.',
    lessons: FIN_LIT_LESSONS,
  },
}

/** Список предметов в порядке отображения. */
export const SUBJECT_LIST: SubjectMeta[] = Object.values(SUBJECTS)

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
