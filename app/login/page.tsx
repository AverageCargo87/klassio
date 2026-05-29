// Server Component with inline Server Action — Auth.js v5 simplest pattern.
// A1 silent-drop: BOTH whitelisted and non-whitelisted submissions land on /login?sent=1
// (uniform UX defeats user enumeration — T-01-01, T-01-05 mitigated end-to-end here).
//
// Source: RESEARCH § Code Example 6 + A1 resolution from Plan 02 CONTEXT update.
//
// Deviation note (Plan 06): Updated NEXT_REDIRECT handling to include Auth.js Configuration
// errors (e.g. Resend 403 when sending to unverified domains). Auth.js wraps these as a
// NEXT_REDIRECT to /no-access?error=Configuration — we intercept and convert to /login?sent=1
// to maintain the uniform-response T-01-01 mitigation. Only the success redirect
// (to /login?sent=1 or the verifyRequest page) is allowed through.
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
  if (session?.user) redirect('/cabinet')
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
      // Throws AccessDeniedError when signIn callback returns false (whitelist rejection).
      // Throws a NEXT_REDIRECT to /login?sent=1 on success (verifyRequest flow).
      // Throws a NEXT_REDIRECT to /no-access?error=Configuration on Resend failure.
      await signIn('resend', { email: raw, redirectTo: '/login?sent=1' })
    } catch (error) {
      // NEXT_REDIRECT check: Auth.js uses Next.js redirect() internally which throws a
      // special error with a 'digest' field starting with 'NEXT_REDIRECT;'.
      // We must re-throw the SUCCESS redirect (to /login?sent=1) but convert all other
      // Auth.js error redirects (e.g., to /no-access?error=Configuration) to the uniform
      // /login?sent=1 response (T-01-01 mitigation — no information leak about error cause).
      if (
        error &&
        typeof error === 'object' &&
        'digest' in error
      ) {
        const digest = String((error as { digest: unknown }).digest)
        if (digest.startsWith('NEXT_REDIRECT')) {
          // Parse the destination from the digest: "NEXT_REDIRECT;307;url;..."
          // Success path: URL contains /login?sent=1 or /login (verifyRequest redirect chain)
          // Error path: URL contains /no-access or ?error=
          const isSuccessRedirect =
            digest.includes('/login') ||
            digest.includes('sent=1') ||
            digest.includes('verify-request')
          if (isSuccessRedirect) {
            throw error // re-throw — legitimate auth success or verifyRequest redirect
          }
          // Auth.js error redirect (Configuration, Resend 403, etc.) → uniform silent drop
          redirect('/login?sent=1')
        }
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
