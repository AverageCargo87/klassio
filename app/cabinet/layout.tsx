// Кабинет — фирменная тема Klassio (Onest + тёплая палитра). Оборачивает все
// /cabinet/* экраны в .kc-app, где живут CSS-токены (app/cabinet/cabinet.css).
// onest.variable выставляет --kc-font; cabinet.css берёт font-family: var(--kc-font).
import type { ReactNode } from 'react'
import { Onest } from 'next/font/google'
import './cabinet.css'

const onest = Onest({ subsets: ['latin', 'cyrillic'], display: 'swap', variable: '--kc-font' })

export default function CabinetLayout({ children }: { children: ReactNode }) {
  return <div className={`kc-app ${onest.variable}`}>{children}</div>
}
