// D-16 v3: корень — публичный лендинг для ВСЕХ, включая залогиненных.
// Раньше залогиненного кидало на /cabinet (двойной прыжок / → /cabinet + холодный
// старт = «сначала не открывает»). Теперь / всегда показывает лендинг; в кабинет
// ведёт кнопка «Войти» (→ /login → если уже есть сессия, редиректит в /cabinet).
// Источник разметки: lib/landing/landing-html.ts (автоген из Claude Design).
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
  // Локальный дев-байпас (только НЕ на Vercel production): сразу в урок.
  if (process.env.KLASSIO_DEV_USER_ID && process.env.VERCEL_ENV !== 'production') redirect(DEV_LESSON_ENTRY)
  // suppressHydrationWarning: браузер нормализует innerHTML (void-элементы, порядок
  // атрибутов, entity) — строка никогда не совпадёт байт-в-байт, а патчить React
  // здесь нечего: остров статичный, весь JS у него свой (GSAP + landing.js).
  return <main suppressHydrationWarning dangerouslySetInnerHTML={{ __html: LANDING_HTML }} />
}
