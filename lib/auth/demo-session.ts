// Демо-вход без email-письма. Resend-аккаунт пока без верифицированного домена
// (from: onboarding@resend.dev шлёт ТОЛЬКО владельцу аккаунта), поэтому для теста
// с коллегами регистрация/вход создают сессию сразу: минтим тот же JWT, который
// Auth.js кладёт в сессионную куку после magic-link, — auth()/middleware валидируют
// его как обычный. Когда появится верифицированный домен, этот модуль можно убрать
// и вернуть magic-link (Resend-провайдер в auth.ts не тронут).
//
// Параметры ДОЛЖНЫ совпадать с lib/auth/config-options.ts: имя куки (salt = имя),
// secure/sameSite/path и maxAge — иначе auth() не расшифрует токен.
import { cookies } from 'next/headers'
import { encode } from 'next-auth/jwt'

const isProd = process.env.NODE_ENV === 'production'
const SESSION_COOKIE = isProd ? '__Secure-authjs.session-token' : 'authjs.session-token'
const MAX_AGE_SEC = 365 * 24 * 60 * 60 // = session.maxAge (D-04: 1 год)

export async function establishDemoSession(user: { id: string; email: string }): Promise<void> {
  const token = await encode({
    token: { sub: user.id, email: user.email },
    secret: process.env.AUTH_SECRET!,
    salt: SESSION_COOKIE, // v5: salt = имя куки, так же деривует ключ auth() при decode
    maxAge: MAX_AGE_SEC,
  })
  const jar = await cookies()
  jar.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    secure: isProd,
    maxAge: MAX_AGE_SEC,
  })
}
