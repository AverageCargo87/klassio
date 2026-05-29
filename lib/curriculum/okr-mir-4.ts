// Static curriculum for "Окружающий мир · 4 класс" — first 3 astronomy lessons
// from Плешаков, «Школа России», стр. 3-21 (раздел «Земля и человечество»).
//
// Source of truth: materials/okruzhayushchiy-mir-4/okruzhayushchiy-mir-4kl-ch1-text.md
//
// These lessons are NOT in the `lesson` DB table (that table stores tutoring
// sessions). They live as static data + static routes under /cabinet/okr-mir-4.
// When a lesson becomes playable, set `status: 'available'` and point `href` at
// the trainer route (e.g. `/lesson-v2/okr-mir-astronom-1`).

export type LessonStatus = 'available' | 'coming-soon'

export interface CurriculumLesson {
  slug: string
  number: number
  title: string
  subtitle: string
  status: LessonStatus
  /** Where the "Начать урок" button should go when status === 'available'. */
  href?: string
}

export const OKR_MIR_4_LESSONS: CurriculumLesson[] = [
  {
    slug: 'astronom',
    number: 1,
    title: 'Мир глазами астронома',
    subtitle: 'Что такое астрономия, Вселенная, Солнечная система. Солнце как звезда.',
    status: 'coming-soon',
  },
  {
    slug: 'planety',
    number: 2,
    title: 'Планеты Солнечной системы',
    subtitle: '8 планет, их спутники и кольца. История изучения Луны. Смена дня/ночи и времён года.',
    status: 'coming-soon',
  },
  {
    slug: 'zvyozdnoe-nebo',
    number: 3,
    title: 'Звёздное небо — великая книга природы',
    subtitle: 'Созвездия, правила наблюдения. Полярная звезда, Сириус, Альдебаран, Плеяды.',
    status: 'coming-soon',
  },
]

export function getLessonBySlug(slug: string): CurriculumLesson | undefined {
  return OKR_MIR_4_LESSONS.find((l) => l.slug === slug)
}
