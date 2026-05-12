// Server-only utility for wrapping an 11labs signed_url into a token-protected
// URL pointing at our Frankfurt WS-proxy on h2.nexus (Phase 6.5).
//
// Why this exists:
//   ElevenLabs hides their WSS endpoint behind Cloudflare bot-management which
//   rejects browser TLS fingerprints from Russian residential IPs ~1.6s after
//   WS upgrade. We route the browser → klassio-voice-proxy.h2.nexus instead,
//   and the VPS opens a clean server-to-server WS to api.elevenlabs.io (its
//   Frankfurt IP passes CF bot checks).
//
// Wire protocol:
//   wss://<PROXY_HOST>/?u=<base64(signed_url)>&t=<unix_ms>&s=<hmac_sha256>
//   s = HMAC-SHA256(VOICE_PROXY_HMAC_SECRET, u + ':' + t)
//
// The proxy verifies s and the freshness of t (5-minute TTL) before opening
// upstream. See infra/h2nexus/voice-proxy/index.mjs for the verify code.
//
// Fallback: if VOICE_PROXY_HOST is not set in env (e.g. local dev or rollback),
// wrapSignedUrl returns the original signed_url unchanged. This keeps the dev
// path simple and the prod rollback path one-env-var-away.

import { createHmac } from 'node:crypto'

export interface WrapResult {
  /** Either the proxy URL (when VOICE_PROXY_HOST is configured) or the original signed_url. */
  url: string
  /** true if we wrapped through the proxy, false if we passed through unchanged. */
  proxied: boolean
}

/**
 * Wrap an 11labs signed_url into a proxy URL with HMAC token.
 *
 * @param signedUrl  The wss:// URL returned by 11labs' get-signed-url endpoint.
 * @param env        Plain object containing VOICE_PROXY_HOST + VOICE_PROXY_HMAC_SECRET.
 *                   In production this is process.env; in tests it's a stub.
 * @param now        Optional injected timestamp (ms) — tests pin this; prod uses Date.now().
 *
 * @throws if signedUrl doesn't start with wss://api.elevenlabs.io/  (defense-in-depth — the
 *         proxy will also reject this, but we'd rather fail at mint time than at connect time).
 */
export function wrapSignedUrl(
  signedUrl: string,
  env: { VOICE_PROXY_HOST?: string; VOICE_PROXY_HMAC_SECRET?: string },
  now: number = Date.now(),
): WrapResult {
  const host = env.VOICE_PROXY_HOST
  const secret = env.VOICE_PROXY_HMAC_SECRET

  // Fallback: no proxy configured → return upstream URL unchanged. This keeps
  // local dev simple (no need to set up the proxy stack) and gives us a one-env-var
  // rollback in prod if the proxy ever misbehaves. The whitelist check below only
  // applies when we ARE wrapping — otherwise we'd reject legitimate test fixtures
  // that mock different upstream URLs.
  if (!host || !secret) {
    return { url: signedUrl, proxied: false }
  }

  // Defense in depth: only wrap real 11labs URLs. Without this, a misconfigured
  // upstream could let someone smuggle an arbitrary destination through our
  // proxy. The proxy itself also enforces this, but failing at mint time gives
  // a clearer error path.
  if (!signedUrl.startsWith('wss://api.elevenlabs.io/')) {
    throw new Error(
      `Refusing to wrap suspicious signed_url (must start with wss://api.elevenlabs.io/): ${signedUrl.slice(0, 60)}...`,
    )
  }

  const u = Buffer.from(signedUrl, 'utf8').toString('base64')
  const t = String(now)
  const s = createHmac('sha256', secret).update(`${u}:${t}`).digest('hex')

  const params = new URLSearchParams({ u, t, s })
  return { url: `wss://${host}/?${params.toString()}`, proxied: true }
}
