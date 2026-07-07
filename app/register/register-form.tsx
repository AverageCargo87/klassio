'use client'
// Форма регистрации — вёрстка 1-в-1 из Claude Design прототипа (su-* классы в
// /demo/site.css), интерактив (класс-сегменты, чекбокс согласия) на React-стейте.
import { useActionState, useState } from 'react'
import { registerAction, type RegisterState } from './actions'

const GRADES = [1, 2, 3, 4, 5, 6, 7] as const

export function RegisterForm({ defaultEmail = '' }: { defaultEmail?: string }) {
  const [state, formAction, pending] = useActionState<RegisterState, FormData>(registerAction, { error: null })
  const [grade, setGrade] = useState<number>(4)
  const [agree, setAgree] = useState(false)

  return (
    <form className="su-card rise" action={formAction} noValidate>
      <h1>Создаём кабинет</h1>
      <p className="sub">Минута — и Аня познакомится с вашим ребёнком.</p>

      <div className="su-field">
        <label htmlFor="su-email">Email родителя</label>
        <input
          className="su-input" id="su-email" name="email" type="email"
          placeholder="mama@example.ru" autoComplete="email" defaultValue={defaultEmail} required
        />
      </div>
      <div className="su-field">
        <label htmlFor="su-name">Имя ребёнка</label>
        <input
          className="su-input" id="su-name" name="childName" type="text"
          placeholder="Миша" autoComplete="off" required
        />
      </div>
      <div className="su-field">
        <label>Класс</label>
        <div className="su-grades" role="radiogroup" aria-label="Класс">
          {GRADES.map((g) => (
            <button
              key={g} type="button" role="radio" aria-checked={g === grade}
              className={`su-grade${g === grade ? ' on' : ''}`}
              onClick={() => setGrade(g)}
            >
              {g}
            </button>
          ))}
        </div>
        <input type="hidden" name="grade" value={grade} />
      </div>

      <div
        className={`su-agree${agree ? ' on' : ''}`}
        role="checkbox" aria-checked={agree} tabIndex={0}
        onClick={() => setAgree((a) => !a)}
        onKeyDown={(e) => {
          if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); setAgree((a) => !a) }
        }}
      >
        <span className="su-check"></span>
        <span>Согласен(на) на обработку персональных данных</span>
      </div>
      <input type="hidden" name="agree" value={agree ? '1' : ''} />

      {state.error && (
        <p role="alert" style={{ color: '#C0392B', fontSize: 13.5, fontWeight: 600, margin: '12px 0 0' }}>
          {state.error}
        </p>
      )}

      <button className="btn btn-accent su-submit" type="submit" disabled={pending}>
        {pending ? 'Создаём…' : 'Создать аккаунт'}
      </button>
      <p className="su-free">Первый урок — бесплатно</p>
      <p className="su-alt">Уже есть аккаунт? <a href="/login">Войти</a></p>
    </form>
  )
}
