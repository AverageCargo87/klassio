import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Klassio',
  description: 'Живой урок с AI-репетитором Аней: голос, интерактивные доски, тренажёр — и запись урока для родителей.',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    // suppressHydrationWarning on <html> and <body> tolerates attributes injected
    // by browser extensions (MetaMask, Bybit Wallet, password managers, etc.).
    // Without this, extensions on the user's primary browser cause hydration
    // mismatches that can break Client Component lifecycle deeper in the tree.
    // Scope is limited to <html>/<body> — child components still get full
    // hydration warnings.
    <html lang="ru" suppressHydrationWarning>
      <body suppressHydrationWarning>{children}</body>
    </html>
  )
}
