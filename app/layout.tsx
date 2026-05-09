import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Klassio',
  description: 'Репетитор математики для пятиклассников',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ru">
      <body>{children}</body>
    </html>
  )
}
