// Tests for buildSberTutorWsUrl — HMAC-токен к Sber-оркестратору (/tutor-ru).
// Зеркалит lib/elevenlabs/__tests__/proxy-url.test.ts по духу: подпись
// воспроизводима, фолбэк на VOICE_PROXY_*, понятный отказ без конфига.
import { describe, expect, it } from 'vitest'
import { createHmac } from 'node:crypto'
import { buildSberTutorWsUrl } from '../sber-url'

const SID = '3f7a2c10-9d1b-4e5a-8c2f-1a2b3c4d5e6f'
const NOW = 1760000000000

describe('buildSberTutorWsUrl', () => {
  it('builds a wss URL with sid/t/s and a verifiable HMAC', () => {
    const url = buildSberTutorWsUrl(SID, { SBER_TUTOR_WSS_HOST: 'example.com/sber-tutor', SBER_TUTOR_HMAC_SECRET: 'secret' }, NOW)
    const u = new URL(url)
    expect(url.startsWith('wss://example.com/sber-tutor?')).toBe(true)
    expect(u.searchParams.get('sid')).toBe(SID)
    expect(u.searchParams.get('t')).toBe(String(NOW))
    const expected = createHmac('sha256', 'secret').update(`${SID}:${NOW}`).digest('hex')
    expect(u.searchParams.get('s')).toBe(expected)
  })

  it('falls back to VOICE_PROXY_HOST + /sber-tutor and VOICE_PROXY_HMAC_SECRET', () => {
    const url = buildSberTutorWsUrl(SID, { VOICE_PROXY_HOST: '87.120.93.35.nip.io', VOICE_PROXY_HMAC_SECRET: 'vp-secret' }, NOW)
    expect(url.startsWith('wss://87.120.93.35.nip.io/sber-tutor?')).toBe(true)
    const expected = createHmac('sha256', 'vp-secret').update(`${SID}:${NOW}`).digest('hex')
    expect(new URL(url).searchParams.get('s')).toBe(expected)
  })

  it('prefers dedicated SBER_TUTOR_* vars over the VOICE_PROXY_* fallback', () => {
    const url = buildSberTutorWsUrl(
      SID,
      {
        SBER_TUTOR_WSS_HOST: 'dedicated.host/sber-tutor',
        SBER_TUTOR_HMAC_SECRET: 'dedicated-secret',
        VOICE_PROXY_HOST: 'fallback.host',
        VOICE_PROXY_HMAC_SECRET: 'fallback-secret',
      },
      NOW,
    )
    expect(url.startsWith('wss://dedicated.host/sber-tutor?')).toBe(true)
    const expected = createHmac('sha256', 'dedicated-secret').update(`${SID}:${NOW}`).digest('hex')
    expect(new URL(url).searchParams.get('s')).toBe(expected)
  })

  it('throws a clear error when neither host nor secret is configured', () => {
    expect(() => buildSberTutorWsUrl(SID, {}, NOW)).toThrow(/не настроен/)
    expect(() => buildSberTutorWsUrl(SID, { SBER_TUTOR_WSS_HOST: 'h' }, NOW)).toThrow(/не настроен/)
    expect(() => buildSberTutorWsUrl(SID, { SBER_TUTOR_HMAC_SECRET: 's' }, NOW)).toThrow(/не настроен/)
  })
})
