// Unit tests for POST /api/tutor/session.
// Real @/lib/curriculum (so lesson resolution is exercised); mocks @/auth,
// @/lib/tutor (getOrStartSession + buildTutorDynamicVariables) and @/lib/db.
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

vi.mock('@/auth', () => ({ auth: vi.fn() }))
vi.mock('@/lib/tutor', () => ({
  getOrStartSession: vi.fn(),
  buildTutorDynamicVariables: vi.fn(() => ({ child_name: 'Маша', is_first_lesson: 'да' })),
}))
vi.mock('@/lib/db', () => ({ db: { select: vi.fn() } }))
vi.mock('@/lib/db/schema', () => ({ users: { id: 'id', childName: 'child_name' } }))
vi.mock('drizzle-orm', () => ({ eq: vi.fn((a, b) => ({ a, b })) }))

import { POST } from '../route'
import { auth } from '@/auth'
import { getOrStartSession } from '@/lib/tutor'
import { db } from '@/lib/db'

function req(body: unknown, raw = false): NextRequest {
  return new NextRequest('http://localhost/api/tutor/session', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: raw && typeof body === 'string' ? body : JSON.stringify(body),
  })
}

function usersChain(rows: unknown[]) {
  return { from: vi.fn().mockReturnThis(), where: vi.fn().mockReturnThis(), limit: vi.fn().mockResolvedValue(rows) }
}

describe('POST /api/tutor/session', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(auth).mockResolvedValue({ user: { id: 'user-1' } } as never)
    vi.mocked(db.select).mockReturnValue(usersChain([{ childName: 'Маша' }]) as never)
    vi.mocked(getOrStartSession).mockResolvedValue({
      sessionId: 'sess-1',
      attemptNumber: 1,
      isFirstEver: true,
      priorCompletions: 0,
      priorLessonsDone: 0,
      resumed: false,
    })
  })

  it('401 when not signed in', async () => {
    vi.mocked(auth).mockResolvedValue(null as never)
    expect((await POST(req({ subjectId: 'okr-mir-4', lessonSlug: 'astronom' }))).status).toBe(401)
  })

  it('400 on malformed body', async () => {
    expect((await POST(req('nope', true))).status).toBe(400)
  })

  it('404 for a lesson not in the curriculum', async () => {
    const res = await POST(req({ subjectId: 'okr-mir-4', lessonSlug: 'no-such-lesson' }))
    expect(res.status).toBe(404)
    expect(getOrStartSession).not.toHaveBeenCalled()
  })

  it('happy path → 200 with sessionId + dynamicVariables', async () => {
    const res = await POST(req({ subjectId: 'okr-mir-4', lessonSlug: 'astronom' }))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.sessionId).toBe('sess-1')
    expect(body.isFirstEver).toBe(true)
    expect(body.dynamicVariables).toMatchObject({ child_name: 'Маша' })
    expect(getOrStartSession).toHaveBeenCalledWith({
      userId: 'user-1',
      subjectId: 'okr-mir-4',
      lessonSlug: 'astronom',
    })
  })
})
