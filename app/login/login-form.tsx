'use client'
// Форма входа (su-* стили из /demo/site.css). Демо-вход без письма — ./actions.ts.
import { useActionState, useState } from 'react'
import { loginAction, type LoginState } from './actions'

export function LoginForm() {
  const [state, formAction, pending] = useActionState<LoginState, FormData>(loginAction, { error: null })
  const [email, setEmail] = useState('')

  return (
    <form className="su-card rise" action={formAction} noValidate>
      <h1>С возвращением!</h1>
      <p className="sub">Введите email, с которым создавали кабинет.</p>

      <div className="su-field">
        <label htmlFor="li-email">Email родителя</label>
        <input
          className="su-input" id="li-email" name="email" type="email"
          placeholder="mama@example.ru" autoComplete="email"
          value={email} onChange={(e) => setEmail(e.target.value)} required
        />
      </div>

      {state.error && (
        <p role="alert" style={{ color: '#C0392B', fontSize: 13.5, fontWeight: 600, margin: '12px 0 0' }}>
          {state.error}{' '}
          {state.missing && (
            <a href={`/register?email=${encodeURIComponent(email)}`} style={{ color: 'inherit' }}>
              Создать кабинет →
            </a>
          )}
        </p>
      )}

      <button className="btn btn-accent su-submit" type="submit" disabled={pending}>
        {pending ? 'Входим…' : 'Войти'}
      </button>
      <p className="su-alt">Нет аккаунта? <a href="/register">Зарегистрируйтесь за минуту</a></p>
    </form>
  )
}
