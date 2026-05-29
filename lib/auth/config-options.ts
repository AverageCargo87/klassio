// Edge-safe NextAuth config object — NO adapter, NO providers with DB dependencies.
// Used by both auth.config.ts (for middleware) and auth.ts (for full handler).
// Cookie config + pages live here so tests can verify shape (cookie-config.test.ts).
// Source: RESEARCH § Pattern 1 + § Pattern 3 (JWT strategy)
import type { NextAuthConfig } from 'next-auth'

const isProd = process.env.NODE_ENV === 'production'

export const authConfigOptions = {
  secret: process.env.AUTH_SECRET,
  trustHost: true, // required when AUTH_URL not set; Vercel deploy sets via VERCEL_URL
  session: {
    strategy: 'jwt' as const,
    maxAge: 365 * 24 * 60 * 60, // D-04: 1 year
  },
  pages: {
    signIn: '/login',
    error: '/no-access', // D-18: only for expired/invalid magic link clicks
    verifyRequest: '/login?sent=1', // A1 silent-drop: same target for all login submissions
  },
  cookies: {
    sessionToken: {
      name: isProd ? '__Secure-authjs.session-token' : 'authjs.session-token',
      options: {
        httpOnly: true, // T-01-04: defeats XSS-based theft (ASVS V13.4)
        sameSite: 'lax' as const, // T-01-06: defeats most CSRF (ASVS V13.2)
        path: '/',
        secure: isProd, // production-only — local dev uses http
      },
    },
  },
  callbacks: {
    // authorized() runs in EDGE middleware via auth.config.ts.
    // Returns true → request continues; false → redirect to pages.signIn.
    // Source: RESEARCH § Pattern 1
    authorized: async ({ auth, request }: { auth: any; request: any }) => {
      const isLoggedIn = !!auth?.user
      const path = request.nextUrl.pathname
      const isProtected =
        path.startsWith('/lessons') ||
        path.startsWith('/lesson/') ||
        path.startsWith('/cabinet')
      if (isProtected && !isLoggedIn) return false // → /login
      return true
    },
    // session() populates session.user.id from JWT token.sub (user's DB id).
    // Required: app/lessons/page.tsx uses session.user.id to query lessons.
    // Auth.js v5 default session callback does NOT include id; token.sub = user.id.
    // Safe for edge runtime — no DB access, just token data.
    session: ({ session, token }: { session: any; token: any }) => {
      if (session.user && token.sub) {
        session.user.id = token.sub
      }
      return session
    },
  },
  providers: [], // Resend provider is attached in auth.ts (the node-only file)
} satisfies NextAuthConfig
