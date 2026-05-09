// Full NextAuth config WITH adapter and Resend provider.
// Used by app/api/auth/[...nextauth]/route.ts and Server Components / Server Actions via auth() / signIn() / signOut().
// MUST NOT be imported by middleware.ts (would crash edge runtime — Pitfall 1 / T-01-14).
//
// Source: RESEARCH § Pattern 1 (full file) + § Pattern 2 (signIn callback) + § Code Example 5 (Resend provider)
import NextAuth from 'next-auth'
import Resend from 'next-auth/providers/resend'
import { DrizzleAdapter } from '@auth/drizzle-adapter'
import { db, schema } from '@/lib/db'
import { authConfigOptions } from '@/lib/auth/config-options'
import { isEmailWhitelisted } from '@/lib/auth/whitelist'
import { sendVerificationRequest } from '@/lib/auth/email-template'
import { env } from '@/lib/env'

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfigOptions,
  adapter: DrizzleAdapter(db, {
    usersTable: schema.users,
    accountsTable: schema.accounts,
    sessionsTable: schema.sessions,
    verificationTokensTable: schema.verificationTokens,
  }),
  providers: [
    Resend({
      from: 'Klassio <onboarding@resend.dev>', // Pitfall 4: test sender for Phase 1 (no domain verified yet)
      apiKey: env.AUTH_RESEND_KEY,
      sendVerificationRequest, // custom Russian template
      maxAge: 24 * 60 * 60, // 24 hours — magic link expiry
    }),
  ],
  callbacks: {
    ...authConfigOptions.callbacks,
    // signIn runs in NODE runtime only (DB access).
    // T-01-01 mitigation: returning false silently rejects without exposing whitelist contents.
    // T-01-05 mitigation: constant-shape DB query regardless of result (no early-return short-circuit).
    // The corresponding `loginAction` in Plan 05 catches the AccessDeniedError and redirects to /login?sent=1
    // (uniform UX with the success path), preventing user enumeration via redirect-target diff.
    signIn: async ({ user }) => {
      return await isEmailWhitelisted(user?.email)
    },
  },
})
