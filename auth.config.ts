// Edge-safe NextAuth config. Imported by middleware.ts.
// Source: RESEARCH § Pattern 1
// IMPORTANT: This file MUST NOT import @/lib/db, postgres, or any node-only module.
// The middleware runs in Vercel Edge runtime — DB drivers crash on edge.
import { authConfigOptions } from './lib/auth/config-options'

export default authConfigOptions
