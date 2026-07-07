'use server'
// Выход из кабинета: чистит сессионную куку (JWT-стратегия) и ведёт на лендинг.
// Нужен для демо, где коллеги пробуют несколько аккаунтов с одного устройства.
import { signOut } from '@/auth'

export async function logoutAction(): Promise<void> {
  await signOut({ redirectTo: '/' })
}
