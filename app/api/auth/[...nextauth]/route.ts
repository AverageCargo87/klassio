// Source: RESEARCH § Pattern 1 + Auth.js v5 docs
// Catchall route handler — NextAuth handles /api/auth/signin, /api/auth/callback/resend, etc.
// Runs in NODE runtime (not edge) — can import auth.ts which has DrizzleAdapter.
import { handlers } from '@/auth'

export const { GET, POST } = handlers
