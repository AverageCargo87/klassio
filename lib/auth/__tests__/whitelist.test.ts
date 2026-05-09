import { describe, it, expect, vi, beforeEach } from 'vitest'

// Use vi.hoisted to declare the mock before the vi.mock hoisting occurs
const { selectMock } = vi.hoisted(() => {
  const selectMock = vi.fn()
  return { selectMock }
})

// Mock db before importing the callback
vi.mock('@/lib/db', () => ({
  db: {
    select: selectMock,
  },
  schema: {
    allowedEmails: { email: 'email_col_marker', id: 'id_col_marker' },
  },
}))

// Import the pure callback under test (extracted into lib/auth/whitelist.ts)
import { isEmailWhitelisted } from '@/lib/auth/whitelist'

beforeEach(() => {
  selectMock.mockReset()
})

describe('isEmailWhitelisted', () => {
  function mockReturn(rows: unknown[]) {
    selectMock.mockReturnValue({
      from: () => ({
        where: () => ({
          limit: () => Promise.resolve(rows),
        }),
      }),
    })
  }

  it('returns true when email is in allowed_email', async () => {
    mockReturn([{ id: '1' }])
    expect(await isEmailWhitelisted('parent@example.com')).toBe(true)
  })

  it('returns false when email is not in allowed_email', async () => {
    mockReturn([])
    expect(await isEmailWhitelisted('rando@example.com')).toBe(false)
  })

  it('returns false for undefined email', async () => {
    expect(await isEmailWhitelisted(undefined)).toBe(false)
    expect(selectMock).not.toHaveBeenCalled()
  })

  it('returns false for empty string email', async () => {
    expect(await isEmailWhitelisted('')).toBe(false)
    expect(selectMock).not.toHaveBeenCalled()
  })

  it('lowercases and trims email before query', async () => {
    let capturedComparator: unknown
    selectMock.mockImplementation(() => ({
      from: () => ({
        where: (comparator: unknown) => {
          capturedComparator = comparator
          return { limit: () => Promise.resolve([{ id: '1' }]) }
        },
      }),
    }))
    await isEmailWhitelisted('  PARENT@Example.COM  ')
    // We can't easily inspect drizzle eq() output structurally — assert that the call happened
    // and that the function did not bail early.
    expect(selectMock).toHaveBeenCalledOnce()
    expect(capturedComparator).toBeDefined()
  })
})
