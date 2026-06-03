// Unit tests for POST /api/tutor/moderation.
// Uses the REAL @/lib/moderation (so detection + escalation are exercised for
// real) and mocks only the DB-touching @/lib/tutor functions + @/auth.
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

vi.mock('@/auth', () => ({ auth: vi.fn() }))
vi.mock('@/lib/tutor', () => ({
  getSession: vi.fn(),
  recordEvent: vi.fn(),
  countSessionEvents: vi.fn(),
}))

import { POST } from '../route'
import { auth } from '@/auth'
import { getSession, recordEvent, countSessionEvents } from '@/lib/tutor'

// Valid RFC-4122 v4 UUID (version nibble 4, variant nibble 8) — z.string().uuid()
// rejects non-conformant fixtures, and real gen_random_uuid() values conform.
const SID = '11111111-1111-4111-8111-111111111111'

function req(body: unknown, raw = false): NextRequest {
  return new NextRequest('http://localhost/api/tutor/moderation', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: raw && typeof body === 'string' ? body : JSON.stringify(body),
  })
}

describe('POST /api/tutor/moderation', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(auth).mockResolvedValue({ user: { id: 'user-1' } } as never)
    vi.mocked(getSession).mockResolvedValue({ id: SID, userId: 'user-1', subjectId: 'okr-mir-4' } as never)
    vi.mocked(countSessionEvents).mockResolvedValue(0)
    vi.mocked(recordEvent).mockResolvedValue('evt-1')
  })

  it('401 when not signed in', async () => {
    vi.mocked(auth).mockResolvedValue(null as never)
    const res = await POST(req({ sessionId: SID, text: 'сука' }))
    expect(res.status).toBe(401)
  })

  it('400 on malformed body', async () => {
    const res = await POST(req('nope', true))
    expect(res.status).toBe(400)
  })

  it('403 when the session is not the user’s', async () => {
    vi.mocked(getSession).mockResolvedValue(null as never)
    const res = await POST(req({ sessionId: SID, text: 'сука' }))
    expect(res.status).toBe(403)
  })

  it('clean text → action none, NO db write', async () => {
    const res = await POST(req({ sessionId: SID, text: 'солнце это звезда, а на небе много планет' }))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.action).toBe('none')
    expect(recordEvent).not.toHaveBeenCalled()
  })

  it('first profanity → warn, records moderation_warning, reasons-only payload', async () => {
    vi.mocked(countSessionEvents).mockResolvedValue(0)
    const res = await POST(req({ sessionId: SID, text: 'это какая-то хуйня' }))
    const body = await res.json()
    expect(body.action).toBe('warn')
    expect(body.notifyParent).toBe(false)
    expect(body.contextualUpdate).toContain('[МОДЕРАЦИЯ]')

    expect(recordEvent).toHaveBeenCalledTimes(1)
    const arg = vi.mocked(recordEvent).mock.calls[0][0]
    expect(arg.eventType).toBe('moderation_warning')
    // PRIVACY: payload must carry reason tags, never the raw word.
    expect(JSON.stringify(arg.payload)).toContain('profanity')
    expect(JSON.stringify(arg.payload)).not.toContain('хуйня')
  })

  it('repeat incident → escalate + notify parent', async () => {
    vi.mocked(countSessionEvents).mockResolvedValue(1)
    const res = await POST(req({ sessionId: SID, text: 'ты дура' }))
    const body = await res.json()
    expect(body.action).toBe('escalate')
    expect(body.notifyParent).toBe(true)
    expect(vi.mocked(recordEvent).mock.calls[0][0].eventType).toBe('moderation_escalation')
  })

  it('never echoes the raw utterance in the response', async () => {
    const res = await POST(req({ sessionId: SID, text: 'сука блять' }))
    const raw = await res.text()
    expect(raw).not.toContain('сука')
    expect(raw).not.toContain('блять')
  })
})
