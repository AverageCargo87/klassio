// Curriculum resolver — maps (subjectId, lessonSlug) → lesson metadata.
// Single place the tutor route + parent reports look up human-readable titles.
// Today only «Окружающий мир · 4 класс» exists; add subjects here as they ship.
import { OKR_MIR_4_LESSONS, type CurriculumLesson } from './okr-mir-4'

export type { CurriculumLesson, LessonStatus, LessonCanvas } from './okr-mir-4'
export { OKR_MIR_4_LESSONS, ASTRONOM_MIRO_CANVAS } from './okr-mir-4'

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
  {
    slug: 'investicii',
    number: 1,
    title: 'Инвестиции для начинающих',
    subtitle: 'Как заставить деньги работать: инфляция, акции, риск и сила времени.',
    status: 'available',
    href: '/tutor/fin-gramotnost/investicii',
    canvas: {
      htmlFile: '/tutor/invest.html',
      boardOrder: ['cover', 'inflation', 'shares', 'income', 'risk', 'compound', 'reward'],
      theoryBoards: ['inflation', 'shares', 'income', 'risk', 'compound'],
      totalTasks: 13,
      // Свой 11labs-агент для инвестиций (промпт scripts/tutor-agent-prompt-invest.md).
      // Поставь ELEVENLABS_INVEST_AGENT_ID в env — иначе откатится на общий тьютор-агент.
      agentEnvVar: 'ELEVENLABS_INVEST_AGENT_ID',
    },
  },
  {
    slug: 'detskaya-karta',
    number: 2,
    title: 'Твоя первая банковская карта',
    subtitle: 'Что умеет детская карта: оплата, приложение, безопасность и кешбэк.',
    status: 'available',
    href: '/tutor/fin-gramotnost/detskaya-karta',
    canvas: {
      htmlFile: '/tutor/vtb-karta.html',
      boardOrder: ['cover', 'what', 'money', 'pay', 'app', 'safe', 'cashback', 'reward'],
      theoryBoards: ['what', 'money', 'pay', 'app', 'safe', 'cashback'],
      totalTasks: 13,
      // Обложка уже на экране со старта → первый next_slide открывает `what`,
      // а не повторно обложку (фидбек 08-07: урок проскакивал доску `what`).
      coverPreShown: true,
      // Демо ведёт Sber-стек (промпт по slug у оркестратора). 11labs-агента под
      // этот урок НЕТ — открывать только с ?stack=sber (он же дефолт).
    },
  },
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
