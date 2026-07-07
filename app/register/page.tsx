// /register — регистрация (экран 02 Claude Design прототипа). Стили — /demo/site.css
// (общие с лендингом). Логика — server action в ./actions.ts (демо-вход без письма).
import type { CSSProperties, ReactNode } from 'react'
import { auth } from '@/auth'
import { redirect } from 'next/navigation'
import { RegisterForm } from './register-form'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Регистрация · Klassio' }

function Spark({ style, size }: { style: CSSProperties; size: number }): ReactNode {
  return (
    <span className="su-spark" style={style}>
      <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
        <path d="M12 0c1 7 5 11 12 12-7 1-11 5-12 12-1-7-5-11-12-12C7 11 11 7 12 0z" />
      </svg>
    </span>
  )
}

export default async function RegisterPage({
  searchParams,
}: {
  searchParams: Promise<{ email?: string }>
}) {
  const session = await auth()
  if (session?.user) redirect('/cabinet')
  const { email } = await searchParams

  return (
    <>
      {/* React 19 поднимет link в <head>; стили общие с лендингом, закэшированы */}
      <link rel="stylesheet" href="/demo/site.css" />
      <section className="screen active" data-screen="signup">
        <div className="wrap">
          <header className="topbar">
            <a className="brand" href="/"><span className="mark"></span>классио</a>
            <span className="chip chip-top">Регистрация</span>
          </header>

          <div className="su-stage">
            <Spark size={22} style={{ left: -46, top: -4, ['--d' as string]: '.3s' } as CSSProperties} />
            <Spark size={16} style={{ right: -52, top: 112, ['--d' as string]: '1.4s' } as CSSProperties} />
            <Spark size={15} style={{ left: -30, bottom: 60, ['--d' as string]: '2.1s', color: 'var(--av-2)' } as CSSProperties} />
            <RegisterForm defaultEmail={email ?? ''} />
          </div>
        </div>
      </section>
    </>
  )
}
