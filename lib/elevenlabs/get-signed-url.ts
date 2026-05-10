// Server-only HTTP client for the 11labs signed-URL REST endpoint.
//
// SECURITY (D-05): NEVER import this module from a client component — doing so
// would leak the trust boundary that protects ELEVENLABS_API_KEY. The key MUST
// only travel as the `xi-api-key` HTTP header in this single server-to-server
// request, and the returned signed URL (a wss:// URL with HMAC signature) is the
// ONLY artifact that may cross back into the browser.
//
// Endpoint contract (per RESEARCH § Pattern 2):
//   GET https://api.elevenlabs.io/v1/convai/conversation/get-signed-url?agent_id={id}
//   Headers: { 'xi-api-key': apiKey }
//   200 → { signed_url: 'wss://api.elevenlabs.io/v1/convai/conversation?...' }
//   TTL on the signed URL: 15 min — DO NOT cache (cache: 'no-store').
//
// Used by: app/api/voice/signed-url/route.ts (Phase 6 plan 06-01).

export async function getSignedUrl(agentId: string, apiKey: string): Promise<string> {
  const url = new URL('https://api.elevenlabs.io/v1/convai/conversation/get-signed-url')
  url.searchParams.set('agent_id', agentId)

  const response = await fetch(url.toString(), {
    method: 'GET',
    headers: { 'xi-api-key': apiKey },
    cache: 'no-store',
  })

  if (!response.ok) {
    const text = await response.text().catch(() => '')
    throw new Error(`11labs get-signed-url failed: HTTP ${response.status} ${text}`)
  }

  const data = (await response.json()) as { signed_url?: string }
  if (!data.signed_url) {
    throw new Error('11labs response missing signed_url field')
  }
  return data.signed_url
}
