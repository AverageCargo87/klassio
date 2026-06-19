// /learn/* — меню выбора урока. Тот же фирменный визуал Klassio, что и кабинет.
import type { ReactNode } from 'react'
import { Onest } from 'next/font/google'
import '../cabinet/cabinet.css'

const onest = Onest({ subsets: ['latin', 'cyrillic'], display: 'swap', variable: '--kc-font' })

export default function LearnLayout({ children }: { children: ReactNode }) {
  return <div className={`kc-app ${onest.variable}`}>{children}</div>
}
