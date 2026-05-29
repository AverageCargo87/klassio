// Edge runtime middleware — protects /lessons and /lesson/* routes.
// Imports ONLY auth.config.ts (not auth.ts) to keep edge bundle free of DB driver (postgres-js).
// Source: RESEARCH § Pattern 1
// T-01-14 mitigation: verified by acceptance criterion (grep for @/lib/db must be empty in this file)
import NextAuth from 'next-auth'
import authConfig from './auth.config'

export const { auth: middleware } = NextAuth(authConfig)

export default middleware((_req) => {
  // Empty body — `authorized` callback in authConfigOptions handles redirect logic.
})

export const config = {
  matcher: ['/lessons/:path*', '/lesson/:path*', '/cabinet/:path*'],
}
