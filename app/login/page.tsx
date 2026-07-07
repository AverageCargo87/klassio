// /login — вход на демо-платформе: по email, сессия сразу (без magic-link письма).
// Resend-аккаунт пока без верифицированного домена (onboarding@resend.dev шлёт только
// владельцу аккаунта), поэтому прежний Resend-флоу отключён — вернётся с доменом,
// см. lib/auth/demo-session.ts. Вёрстка — экран 02 Claude Design (su-* в /demo/site.css).
import { auth } from '@/auth'
import { redirect } from 'next/navigation'
import { LoginForm } from './login-form'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Вход · Klassio' }

export default async function LoginPage() {
  // Дев-байпас: не показываем вход — сразу в урок (локальная разработка).
  if (process.env.KLASSIO_DEV_USER_ID) redirect('/tutor/okr-mir-4/astronom?shell=miro')
  const session = await auth()
  if (session?.user) redirect('/cabinet')

  return (
    <>
      <link rel="stylesheet" href="/demo/site.css" />
      <section className="screen active" data-screen="signup">
        <div className="wrap">
          <header className="topbar">
            <a className="brand" href="/"><span className="mark"></span>классио</a>
            <span className="chip chip-top">Вход</span>
          </header>
          <div className="su-stage">
            <LoginForm />
          </div>
        </div>
      </section>
    </>
  )
}
