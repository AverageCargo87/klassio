import { describe, it, expect } from 'vitest'

// Import the raw config object (extracted into a non-side-effect-having module so tests can read it)
import { authConfigOptions } from '@/lib/auth/config-options'

describe('authConfigOptions', () => {
  it('uses JWT session strategy', () => {
    expect(authConfigOptions.session?.strategy).toBe('jwt')
  })

  it('cookie max age is 365 days', () => {
    expect(authConfigOptions.session?.maxAge).toBe(365 * 24 * 60 * 60)
  })

  it('sessionToken cookie is httpOnly and sameSite=lax', () => {
    const sessionTokenCookie = authConfigOptions.cookies?.sessionToken
    expect(sessionTokenCookie?.options?.httpOnly).toBe(true)
    expect(sessionTokenCookie?.options?.sameSite).toBe('lax')
  })

  it('cookie secure flag matches NODE_ENV (false in test)', () => {
    expect(authConfigOptions.cookies?.sessionToken?.options?.secure).toBe(false)
  })

  it('error page is /no-access, signIn page is /login, verifyRequest is /login?sent=1', () => {
    expect(authConfigOptions.pages?.signIn).toBe('/login')
    expect(authConfigOptions.pages?.error).toBe('/no-access')
    expect(authConfigOptions.pages?.verifyRequest).toBe('/login?sent=1')
  })
})
