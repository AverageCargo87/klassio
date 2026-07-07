'use server'
// Регистрация демо-платформы: email + имя ребёнка + класс + согласие → аккаунт
// и сессия СРАЗУ (без письма — см. lib/auth/demo-session.ts, почему).
// Email сам попадает в whitelist (allowed_email) — signIn-колбэк Auth.js остаётся
// строгим для magic-link пути, когда он вернётся.
import { redirect } from 'next/navigation'
import { eq } from 'drizzle-orm'
import { db, schema } from '@/lib/db'
import { establishDemoSession } from '@/lib/auth/demo-session'

export interface RegisterState {
  error: string | null
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/

export async function registerAction(_prev: RegisterState, formData: FormData): Promise<RegisterState> {
  const email = String(formData.get('email') ?? '').trim().toLowerCase()
  const rawName = String(formData.get('childName') ?? '').trim().replace(/\s+/g, ' ').slice(0, 40)
  const grade = parseInt(String(formData.get('grade') ?? ''), 10)
  const agreed = String(formData.get('agree') ?? '') === '1'

  if (!EMAIL_RE.test(email)) return { error: 'Проверьте email — похоже, в нём опечатка.' }
  if (!rawName) return { error: 'Напишите, как зовут ребёнка.' }
  if (!Number.isFinite(grade) || grade < 1 || grade > 7) return { error: 'Выберите класс.' }
  if (!agreed) return { error: 'Поставьте галочку согласия на обработку данных.' }

  const childName = rawName[0].toUpperCase() + rawName.slice(1)

  try {
    await db.insert(schema.allowedEmails).values({ email, notes: 'self-registered (demo)' }).onConflictDoNothing()

    const existing = await db
      .select({ id: schema.users.id, childName: schema.users.childName })
      .from(schema.users)
      .where(eq(schema.users.email, email))
      .limit(1)

    let userId: string
    if (existing.length) {
      // Повторная регистрация = вход. Чужое child_name не перетираем.
      userId = existing[0].id
      await db
        .update(schema.users)
        .set({
          lastLoginAt: new Date(),
          ...(existing[0].childName ? {} : { childName, childAge: 6 + grade }),
        })
        .where(eq(schema.users.id, userId))
    } else {
      userId = crypto.randomUUID()
      await db.insert(schema.users).values({
        id: userId,
        email,
        emailVerified: new Date(), // демо: подтверждения письмом нет
        childName,
        childAge: 6 + grade, // класс → примерный возраст (1 класс ≈ 7 лет)
        lastLoginAt: new Date(),
      })
    }

    await establishDemoSession({ id: userId, email })
  } catch (err) {
    console.error('[register] failed:', err)
    return { error: 'Не получилось создать кабинет. Попробуйте ещё раз.' }
  }
  redirect('/cabinet')
}
