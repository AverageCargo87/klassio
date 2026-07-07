// D-16 v2: корень — публичный лендинг (Claude Design, июль 2026).
// Залогинен → /cabinet. Не залогинен → лендинг (готовый HTML из прототипа:
// пиксель-в-пиксель с одобренным дизайном, скрипты исполняются, т.к. страница
// приходит полноценным SSR-HTML). Источник: lib/landing/landing-html.ts (автоген).
import { auth } from '@/auth'
import { redirect } from 'next/navigation'
import { LANDING_HTML } from '@/lib/landing/landing-html'

export const dynamic = 'force-dynamic'

// Дев-локация форм урока (KLASSIO_DEV_USER_ID) — открываем СРАЗУ урок, без входа.
// Меняй shell здесь, чтобы дефолтная форма при заходе на localhost была другой:
// '?shell=miro' — Miro-доска; убери query — сайт-форма (anya.html).
const DEV_LESSON_ENTRY = '/tutor/okr-mir-4/astronom?shell=miro'

export const metadata = {
  title: 'Klassio — живой урок с AI-репетитором',
  description: 'Аня объяснит тему голосом, покажет интерактивные доски, проверит задания — а родители получат запись урока.',
}

export default async function RootPage() {
  // Guard: dev-байпас не работает на Vercel production, даже если переменная
  // осталась в настройках проекта (P0 из AVITO-TEST-READINESS).
  if (process.env.KLASSIO_DEV_USER_ID && process.env.VERCEL_ENV !== 'production') redirect(DEV_LESSON_ENTRY)
  const session = await auth()
  if (session?.user) redirect('/cabinet')
  // suppressHydrationWarning: браузер нормализует innerHTML (void-элементы, порядок
  // атрибутов, entity) — строка никогда не совпадёт байт-в-байт, а патчить React
  // здесь нечего: остров статичный, весь JS у него свой (GSAP + landing.js).
  return <main suppressHydrationWarning dangerouslySetInnerHTML={{ __html: LANDING_HTML }} />
}
