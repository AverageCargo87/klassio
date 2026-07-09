'use client'
// Форма входа (su-* стили из /demo/site.css). Демо-вход без письма — ./actions.ts.
// Любой email работает: незнакомый → аккаунт создаётся сразу. Имя ребёнка —
// необязательно, но с ним кабинет сразу персональный.
import { useActionState, useState } from 'react'
import { loginAction, type LoginState } from './actions'

export function LoginForm() {
  const [state, formAction, pending] = useActionState<LoginState, FormData>(loginAction, { error: null })
  const [email, setEmail] = useState('')

  return (
    <form className="su-card rise" action={formAction} noValidate>
      <h1>Вход в кабинет</h1>
      <p className="sub">Укажите email и имя ребёнка — сразу откроем кабинет, без письма.</p>

      <div className="su-field">
        <label htmlFor="li-email">Email родителя</label>
        <input
          className="su-input" id="li-email" name="email" type="email"
          placeholder="mama@example.ru" autoComplete="email"
          value={email} onChange={(e) => setEmail(e.target.value)} required
        />
      </div>

      <div className="su-field">
        <label htmlFor="li-name">Имя ребёнка</label>
        <input
          className="su-input" id="li-name" name="childName" type="text"
          placeholder="Например, Гриша" autoComplete="off" maxLength={40}
        />
      </div>

      {state.error && (
        <p role="alert" style={{ color: '#C0392B', fontSize: 13.5, fontWeight: 600, margin: '12px 0 0' }}>
          {state.error}
        </p>
      )}

      <button className="btn btn-accent su-submit" type="submit" disabled={pending}>
        {pending ? 'Входим…' : 'Войти'}
      </button>
    </form>
  )
}
