import { describe, it, expect, vi, beforeEach } from 'vitest'

const fetchMock = vi.fn()
vi.stubGlobal('fetch', fetchMock)

import { sendVerificationRequest } from '@/lib/auth/email-template'

beforeEach(() => {
  fetchMock.mockReset()
})

describe('sendVerificationRequest', () => {
  const provider = { apiKey: 'test_key', from: 'Klassio <onboarding@resend.dev>' } as any

  it('POSTs to api.resend.com with bearer token, subject in Russian, and URL in body', async () => {
    fetchMock.mockResolvedValue({ ok: true, status: 200, text: () => Promise.resolve('') })

    await sendVerificationRequest({
      identifier: 'parent@example.com',
      url: 'https://klassio.vercel.app/api/auth/callback/resend?token=abc&email=p',
      provider,
      expires: new Date(Date.now() + 24 * 60 * 60 * 1000),
      token: 'abc',
      theme: { colorScheme: 'auto' },
      request: new Request('http://localhost'),
    } as any)

    expect(fetchMock).toHaveBeenCalledOnce()
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('https://api.resend.com/emails')
    expect(init.method).toBe('POST')
    expect(init.headers.Authorization).toBe('Bearer test_key')

    const body = JSON.parse(init.body)
    expect(body.from).toBe('Klassio <onboarding@resend.dev>')
    expect(body.to).toBe('parent@example.com')
    expect(body.subject).toBe('Вход в Klassio')
    expect(body.html).toContain('https://klassio.vercel.app/api/auth/callback/resend?token=abc&email=p')
    expect(body.text).toContain('https://klassio.vercel.app/api/auth/callback/resend?token=abc&email=p')
  })

  it('throws when Resend returns non-OK', async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 500, text: () => Promise.resolve('boom') })
    await expect(sendVerificationRequest({
      identifier: 'parent@example.com',
      url: 'https://x/cb',
      provider,
      expires: new Date(),
      token: 't',
      theme: { colorScheme: 'auto' },
      request: new Request('http://localhost'),
    } as any)).rejects.toThrow(/Resend.*500/)
  })
})
