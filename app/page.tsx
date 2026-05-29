// D-16: root URL — auto-redirect.
// Logged in → /cabinet (ЛК с выбором предмета). Not logged in → /login.
// No landing page in v1 (vision: лендинг → v2).
import { auth } from '@/auth'
import { redirect } from 'next/navigation'

export default async function RootPage() {
  const session = await auth()
  if (session?.user) {
    redirect('/cabinet')
  }
  redirect('/login')
}
