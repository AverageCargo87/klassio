'use server'
// Вход на демо-платформе: по email, без письма (см. lib/auth/demo-session.ts).
// Аккаунта нет → подсказываем регистрацию (для демо дружелюбие важнее
// анти-enumeration: данных тут нет, письма не шлются).
import { redirect } from 'next/navigation'
import { eq } from 'drizzle-orm'
import { db, schema } from '@/lib/db'
import { establishDemoSession } from '@/lib/auth/demo-session'

export interface LoginState {
  error: string | null
  missing?: boolean
}

export async function loginAction(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const email = String(formData.get('email') ?? '').trim().toLowerCase()
  if (!email || !email.includes('@')) return { error: 'Введите email, с которым регистрировались.' }

  let userId: string | null = null
  try {
    const rows = await db
      .select({ id: schema.users.id })
      .from(schema.users)
      .where(eq(schema.users.email, email))
      .limit(1)
    if (rows.length) {
      userId = rows[0].id
      await db.update(schema.users).set({ lastLoginAt: new Date() }).where(eq(schema.users.id, userId))
      await establishDemoSession({ id: userId, email })
    }
  } catch (err) {
    console.error('[login] failed:', err)
    return { error: 'Не получилось войти. Попробуйте ещё раз.' }
  }
  if (!userId) {
    return { error: 'Не нашли кабинет с этой почтой.', missing: true }
  }
  redirect('/cabinet')
}
