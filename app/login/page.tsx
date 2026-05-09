// Server Component with inline Server Action — Auth.js v5 simplest pattern.
// A1 silent-drop: BOTH whitelisted and non-whitelisted submissions land on /login?sent=1
// (uniform UX defeats user enumeration — T-01-01, T-01-05 mitigated end-to-end here).
//
// Source: RESEARCH § Code Example 6 + A1 resolution from Plan 02 CONTEXT update.
import { signIn, auth } from '@/auth'
import { redirect } from 'next/navigation'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ sent?: string }>
}) {
  const session = await auth()
  if (session?.user) redirect('/lessons')
  const { sent } = await searchParams

  async function loginAction(formData: FormData) {
    'use server'
    const raw = String(formData.get('email') ?? '').trim().toLowerCase()
    if (!raw || !raw.includes('@')) {
      // Malformed — same uniform redirect (don't expose validation errors)
      redirect('/login?sent=1')
    }

    try {
      // signIn with Resend provider; redirectTo on success → /login?sent=1.
      // Throws AuthError on failure (incl. AccessDeniedError when signIn callback returns false).
      await signIn('resend', { email: raw, redirectTo: '/login?sent=1' })
    } catch (error) {
      // Important: signIn redirect throws NEXT_REDIRECT internally; do NOT swallow that.
      // We only want to catch AccessDeniedError (whitelist rejection — A1 silent drop).
      // The Next.js redirect error is a special object — re-throw it.
      // Source: https://nextjs.org/docs/app/api-reference/functions/redirect
      if (
        error &&
        typeof error === 'object' &&
        'digest' in error &&
        String((error as { digest: unknown }).digest).startsWith('NEXT_REDIRECT')
      ) {
        throw error
      }
      // Any other error (AccessDeniedError from whitelist rejection, network blip, etc.):
      // → silent drop to /login?sent=1 (T-01-01 mitigation — uniform response).
      redirect('/login?sent=1')
    }
  }

  return (
    <main className="container mx-auto max-w-md p-6 mt-12">
      <h1 className="text-2xl font-semibold mb-2">Вход в Klassio</h1>
      <p className="text-muted-foreground mb-6">
        Введите email родителя — мы отправим ссылку для входа.
      </p>
      {sent && (
        <div className="mb-4 p-3 bg-secondary border border-border rounded text-sm">
          Если ваш email в нашем списке, мы отправили ссылку. Проверьте почту.
        </div>
      )}
      <form action={loginAction} className="space-y-4">
        <div>
          <Label htmlFor="email">Email родителя</Label>
          <Input id="email" name="email" type="email" required autoComplete="email" />
        </div>
        <Button type="submit" className="w-full">Отправить ссылку</Button>
      </form>
    </main>
  )
}
