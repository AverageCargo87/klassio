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

/** Per-lesson canvas wiring. When present, the tutor route serves this lesson's
 *  own HTML/board config instead of the astronomy defaults baked into the tutor
 *  components. Lets each Claude-Design lesson plug in without code changes. */
export interface LessonCanvas {
  /** Static HTML served in the tutor iframe (default: /tutor/anya.html). */
  htmlFile: string
  /** Board names in order; `next_slide` walks this. First must be the cover. */
  boardOrder: string[]
  /** Boards with the ≥60s dwell floor (theory boards; cover/reward exempt). */
  theoryBoards: string[]
  /** Tasks that must all be solved before the reward screen unlocks. */
  totalTasks: number
  /** Optional: name of the env var holding THIS lesson's own 11labs agent id
   *  (e.g. 'ELEVENLABS_INVEST_AGENT_ID'). Absent → shared tutor agent. Lets each
   *  lesson run its own agent/prompt without a shared-prompt conflict. */
  agentEnvVar?: string
}

export interface CurriculumLesson {
  slug: string
  number: number
  title: string
  subtitle: string
  status: LessonStatus
  /** Where the "Начать урок" button should go when status === 'available'. */
  href?: string
  /** Optional per-lesson canvas wiring; absent → astronomy defaults. */
  canvas?: LessonCanvas
}

export const OKR_MIR_4_LESSONS: CurriculumLesson[] = [
  {
    slug: 'astronom',
    number: 1,
    title: 'Мир глазами астронома',
    subtitle: 'Что такое астрономия, Вселенная, Солнечная система. Солнце как звезда.',
    // LIVE: served via app/tutor/[subject]/[slug] → the Claude-Design front-end
    // (public/tutor/anya.html) with the live «Аня» agent bolted on.
    status: 'available',
    href: '/tutor/okr-mir-4/astronom',
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
