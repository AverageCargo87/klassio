'use server'
// Выход из кабинета: чистит сессионную куку (JWT-стратегия). Нужен для демо,
// где коллеги пробуют несколько аккаунтов с одного устройства.
// Ведём на /login, НЕ на '/': server action завершается мягкой RSC-навигацией,
// а лендинг — innerHTML-остров, чьи <script> при soft-nav не исполняются
// (GSAP-сцена осталась бы слепой до F5). /login — обычная React-страница,
// а с неё на лендинг ведут полные <a href>-переходы.
import { signOut } from '@/auth'

export async function logoutAction(): Promise<void> {
  await signOut({ redirectTo: '/login' })
}
