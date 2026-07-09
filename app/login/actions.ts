'use server'
// Вход на демо-платформе: по ЛЮБОМУ email, без письма (см. lib/auth/demo-session.ts).
// Незнакомая почта → аккаунт создаётся на лету и сразу открывается кабинет
// (демо: дружелюбие важнее анти-enumeration — данных тут нет, письма не шлются).
// Имя ребёнка (необязательное поле) кладём в кабинет: если указали — обновляем.
import { redirect } from 'next/navigation'
import { eq } from 'drizzle-orm'
import { db, schema } from '@/lib/db'
import { establishDemoSession } from '@/lib/auth/demo-session'

export interface LoginState {
  error: string | null
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/

export async function loginAction(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const email = String(formData.get('email') ?? '').trim().toLowerCase()
  const rawName = String(formData.get('childName') ?? '').trim().replace(/\s+/g, ' ').slice(0, 40)
  const childName = rawName ? rawName[0].toUpperCase() + rawName.slice(1) : ''

  if (!EMAIL_RE.test(email)) return { error: 'Проверьте email — похоже, в нём опечатка.' }

  let userId: string | null = null
  try {
    // Любая почта разрешена (демо). allowed_email заполняем на всякий случай —
    // чтобы и magic-link путь Auth.js работал, если к нему вернёмся.
    await db.insert(schema.allowedEmails).values({ email, notes: 'demo login' }).onConflictDoNothing()

    const rows = await db
      .select({ id: schema.users.id })
      .from(schema.users)
      .where(eq(schema.users.email, email))
      .limit(1)

    if (rows.length) {
      userId = rows[0].id
      await db
        .update(schema.users)
        .set({ lastLoginAt: new Date(), ...(childName ? { childName } : {}) })
        .where(eq(schema.users.id, userId))
    } else {
      userId = crypto.randomUUID()
      await db.insert(schema.users).values({
        id: userId,
        email,
        emailVerified: new Date(), // демо: подтверждения письмом нет
        childName: childName || null,
        childAge: 10,
        lastLoginAt: new Date(),
      })
    }

    await establishDemoSession({ id: userId, email })
  } catch (err) {
    console.error('[login] failed:', err)
    return { error: 'Не получилось войти. Попробуйте ещё раз.' }
  }

  if (!userId) return { error: 'Не получилось войти. Попробуйте ещё раз.' }
  redirect('/cabinet') // ВНЕ try: redirect() бросает NEXT_REDIRECT, его нельзя ловить
}
