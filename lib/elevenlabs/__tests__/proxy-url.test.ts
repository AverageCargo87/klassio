// Tests for lib/elevenlabs/proxy-url.ts (Phase 6.5).
import { describe, it, expect } from 'vitest'
import { createHmac } from 'node:crypto'
import { wrapSignedUrl } from '../proxy-url'

const VALID_SIGNED =
  'wss://api.elevenlabs.io/v1/convai/conversation?agent_id=agent_xyz&conversation_signature=cvtkn_abc'
const SECRET = 'a'.repeat(64)
const HOST = '87.120.93.35.nip.io'
const PINNED_NOW = 1_700_000_000_000

describe('wrapSignedUrl', () => {
  it('VOI-PROXY-A: returns proxy URL with u, t, s params when proxy env is set', () => {
    const { url, proxied } = wrapSignedUrl(
      VALID_SIGNED,
      { VOICE_PROXY_HOST: HOST, VOICE_PROXY_HMAC_SECRET: SECRET },
      PINNED_NOW,
    )
    expect(proxied).toBe(true)
    expect(url.startsWith(`wss://${HOST}/?`)).toBe(true)

    const parsed = new URL(url)
    expect(parsed.searchParams.get('u')).toBeTruthy()
    expect(parsed.searchParams.get('t')).toBe(String(PINNED_NOW))
    expect(parsed.searchParams.get('s')).toBeTruthy()
  })

  it('VOI-PROXY-B: u parameter base64-decodes back to the original signed_url', () => {
    const { url } = wrapSignedUrl(
      VALID_SIGNED,
      { VOICE_PROXY_HOST: HOST, VOICE_PROXY_HMAC_SECRET: SECRET },
      PINNED_NOW,
    )
    const u = new URL(url).searchParams.get('u')!
    const decoded = Buffer.from(u, 'base64').toString('utf8')
    expect(decoded).toBe(VALID_SIGNED)
  })

  it('VOI-PROXY-C: HMAC signature verifies against u + ":" + t with the shared secret', () => {
    const { url } = wrapSignedUrl(
      VALID_SIGNED,
      { VOICE_PROXY_HOST: HOST, VOICE_PROXY_HMAC_SECRET: SECRET },
      PINNED_NOW,
    )
    const params = new URL(url).searchParams
    const u = params.get('u')!
    const t = params.get('t')!
    const s = params.get('s')!

    const expected = createHmac('sha256', SECRET).update(`${u}:${t}`).digest('hex')
    expect(s).toBe(expected)
  })

  it('VOI-PROXY-D: fallback — returns upstream URL unchanged when VOICE_PROXY_HOST is missing', () => {
    const result = wrapSignedUrl(VALID_SIGNED, { VOICE_PROXY_HMAC_SECRET: SECRET }, PINNED_NOW)
    expect(result.proxied).toBe(false)
    expect(result.url).toBe(VALID_SIGNED)
  })

  it('VOI-PROXY-E: fallback — returns upstream URL unchanged when VOICE_PROXY_HMAC_SECRET is missing', () => {
    const result = wrapSignedUrl(VALID_SIGNED, { VOICE_PROXY_HOST: HOST }, PINNED_NOW)
    expect(result.proxied).toBe(false)
    expect(result.url).toBe(VALID_SIGNED)
  })

  it('VOI-PROXY-F: rejects suspicious signed_url that does not point to 11labs', () => {
    expect(() =>
      wrapSignedUrl(
        'wss://evil.example.com/sneaky',
        { VOICE_PROXY_HOST: HOST, VOICE_PROXY_HMAC_SECRET: SECRET },
        PINNED_NOW,
      ),
    ).toThrow(/Refusing to wrap/)
  })

  it('VOI-PROXY-G: different timestamps produce different signatures', () => {
    const a = wrapSignedUrl(
      VALID_SIGNED,
      { VOICE_PROXY_HOST: HOST, VOICE_PROXY_HMAC_SECRET: SECRET },
      PINNED_NOW,
    )
    const b = wrapSignedUrl(
      VALID_SIGNED,
      { VOICE_PROXY_HOST: HOST, VOICE_PROXY_HMAC_SECRET: SECRET },
      PINNED_NOW + 1,
    )
    expect(new URL(a.url).searchParams.get('s')).not.toBe(new URL(b.url).searchParams.get('s'))
  })
})
