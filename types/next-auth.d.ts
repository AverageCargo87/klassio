// Augment Session.user with Klassio-specific fields (D-03).
// Used by Server Components in Plan 05 to render greeting, etc.
// Source: CONTEXT D-03 — single parent/child relationship in v1.
import type { DefaultSession } from 'next-auth'

declare module 'next-auth' {
  interface Session {
    user: {
      id: string
      childName?: string | null
      childAge?: number | null
    } & DefaultSession['user']
  }
}
