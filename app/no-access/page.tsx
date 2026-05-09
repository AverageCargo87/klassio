// D-18: Single neutral landing for auth errors that DO surface (expired/invalid magic link).
// Whitelist-rejected emails go to /login?sent=1 (silent drop), NOT here — see A1 / Plan 04.

import Link from 'next/link'

export default function NoAccessPage() {
  return (
    <main className="container mx-auto max-w-md p-6 mt-12 text-center">
      <h1 className="text-2xl font-semibold mb-4">Доступ не предоставлен</h1>
      <p className="text-muted-foreground mb-6">
        Обратитесь к репетитору.
      </p>
      <Link href="/login" className="underline text-sm">
        Запросить ссылку для входа
      </Link>
    </main>
  )
}
