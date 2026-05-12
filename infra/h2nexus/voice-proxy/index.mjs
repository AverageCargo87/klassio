// /opt/klassio-voice-proxy/index.mjs
// Klassio voice WS-proxy: transparent passthrough between Klassio frontend
// (RU users) and ElevenLabs Conversational AI WSS (api.elevenlabs.io).
//
// Why this proxy exists:
//   ElevenLabs hides their API behind Cloudflare bot-management. Cloudflare
//   does TLS fingerprinting (JA3) on the browser WS handshake and cuts the
//   connection ~1.6s after upgrade if the browser is in an undesired region.
//   Server-to-server WS from a clean EU IP (this VPS in Frankfurt) is fine.
//   We sit in the middle so the browser WS terminates at OUR IP.
//
// Wire protocol (Klassio → us):
//   wss://87.120.93.35.nip.io/?u=<base64-of-11labs-signed-url>&t=<ms>&s=<hmac>
//
//   u: base64-encoded full 11labs signed_url (which contains agent_id +
//      conversation_signature). Must start with wss://api.elevenlabs.io/
//   t: timestamp (ms since epoch) when token was minted by Vercel /api/voice/signed-url
//   s: HMAC-SHA256(SECRET, u + ':' + t) — proves Vercel issued this token
//
// We verify (s, t) before opening upstream. Token is single-use semantically
// (the 11labs signed_url it carries is one-shot) and time-bound (5 min TTL).
import { WebSocketServer, WebSocket } from 'ws'
import { createHmac, timingSafeEqual } from 'node:crypto'
import { createServer } from 'node:http'
import { config } from 'dotenv'

config({ path: '/opt/klassio-voice-proxy/.env' })

const PORT = Number(process.env.PORT || 3001)
const SECRET = process.env.VOICE_PROXY_HMAC_SECRET
const TTL_MS = 5 * 60 * 1000 // 5-minute token lifetime
const UPSTREAM_PREFIX = 'wss://api.elevenlabs.io/'

if (!SECRET) {
  console.error('VOICE_PROXY_HMAC_SECRET missing in env — refusing to start')
  process.exit(1)
}

// Constant-time HMAC verify to defeat timing attacks.
function verifySig(u, t, s) {
  const expected = createHmac('sha256', SECRET).update(`${u}:${t}`).digest('hex')
  if (typeof s !== 'string' || s.length !== expected.length) return false
  try {
    return timingSafeEqual(Buffer.from(s, 'utf8'), Buffer.from(expected, 'utf8'))
  } catch {
    return false
  }
}

// Browser User-Agent + Origin sent to upstream. Empirically the combo of a
// real Chrome UA + Origin = klassio-one.vercel.app keeps 11labs Cloudflare
// happy — we tested this from the same VPS in scripts/test-ws-from-ru.mjs.
const UPSTREAM_UA =
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/132.0.0.0 Safari/537.36'
const UPSTREAM_ORIGIN = 'https://klassio-one.vercel.app'

const httpServer = createServer((req, res) => {
  if (req.url === '/healthz') {
    res.writeHead(200, { 'content-type': 'text/plain' })
    res.end(`ok\nconnections=${wss.clients.size}\nuptime=${Math.floor(process.uptime())}s\n`)
    return
  }
  // Anything else over plain HTTP — caller forgot to upgrade. 426.
  res.writeHead(426, { 'content-type': 'text/plain', upgrade: 'websocket' })
  res.end('Upgrade Required')
})

const wss = new WebSocketServer({ noServer: true, perMessageDeflate: false })

httpServer.on('upgrade', (req, socket, head) => {
  // URL parsing — note `req.url` here is a path like /?u=...&t=...&s=...
  let parsed
  try {
    parsed = new URL(req.url, 'http://x')
  } catch {
    socket.write('HTTP/1.1 400 Bad Request\r\n\r\n')
    socket.destroy()
    return
  }
  const u = parsed.searchParams.get('u')
  const t = parsed.searchParams.get('t')
  const s = parsed.searchParams.get('s')

  if (!u || !t || !s) {
    socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n')
    socket.destroy()
    return
  }

  const ageMs = Date.now() - Number(t)
  if (!Number.isFinite(ageMs) || ageMs < -10_000 || ageMs > TTL_MS) {
    socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n')
    socket.destroy()
    return
  }

  if (!verifySig(u, t, s)) {
    socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n')
    socket.destroy()
    return
  }

  // Decode upstream URL
  let upstreamUrl
  try {
    upstreamUrl = Buffer.from(u, 'base64').toString('utf8')
  } catch {
    socket.write('HTTP/1.1 400 Bad Request\r\n\r\n')
    socket.destroy()
    return
  }
  if (!upstreamUrl.startsWith(UPSTREAM_PREFIX)) {
    socket.write('HTTP/1.1 400 Bad Request\r\n\r\n')
    socket.destroy()
    return
  }

  // Auth passed — accept the WS, then plug it into upstream.
  wss.handleUpgrade(req, socket, head, (clientWs) => {
    bridge(clientWs, upstreamUrl, req)
  })
})

function bridge(clientWs, upstreamUrl, req) {
  const t0 = Date.now()
  const clientIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress
  const upstreamTail = upstreamUrl.slice(upstreamUrl.indexOf('?'))
  console.log(`[${new Date().toISOString()}] open from=${clientIp} upstream=${upstreamTail.slice(0, 90)}...`)

  const upstreamWs = new WebSocket(upstreamUrl, {
    headers: { 'User-Agent': UPSTREAM_UA, Origin: UPSTREAM_ORIGIN },
    perMessageDeflate: false,
  })

  // Buffer client → upstream messages that arrive before upstream is OPEN.
  // Without this, the SDK's first init payload can be lost if it arrives
  // before the upstream socket finishes the handshake.
  let upstreamOpen = false
  const pending = []

  upstreamWs.on('open', () => {
    upstreamOpen = true
    console.log(`  upstream OPEN +${Date.now() - t0}ms`)
    for (const { data, isBinary } of pending) upstreamWs.send(data, { binary: isBinary })
    pending.length = 0
  })

  upstreamWs.on('message', (data, isBinary) => {
    if (clientWs.readyState === clientWs.OPEN) clientWs.send(data, { binary: isBinary })
  })

  clientWs.on('message', (data, isBinary) => {
    if (upstreamOpen && upstreamWs.readyState === upstreamWs.OPEN) {
      upstreamWs.send(data, { binary: isBinary })
    } else {
      pending.push({ data, isBinary })
    }
  })

  const closeBoth = (origin, code, reason) => {
    console.log(
      `  closed by=${origin} code=${code} reason=${reason ? reason.toString().slice(0, 40) : ''} after ${Date.now() - t0}ms`,
    )
    try { if (clientWs.readyState <= 1) clientWs.close(code >= 1000 && code < 5000 ? code : 1011) } catch {}
    try { if (upstreamWs.readyState <= 1) upstreamWs.close() } catch {}
  }

  clientWs.on('close', (code, reason) => closeBoth('client', code, reason))
  upstreamWs.on('close', (code, reason) => closeBoth('upstream', code, reason))
  clientWs.on('error', (e) => console.error(`  client err: ${e.message}`))
  upstreamWs.on('error', (e) => console.error(`  upstream err: ${e.message}`))
}

httpServer.listen(PORT, '127.0.0.1', () => {
  console.log(`klassio-voice-proxy listening on 127.0.0.1:${PORT}`)
  console.log(`  TTL=${TTL_MS}ms upstream_prefix=${UPSTREAM_PREFIX}`)
})

// Graceful shutdown
for (const sig of ['SIGINT', 'SIGTERM']) {
  process.on(sig, () => {
    console.log(`${sig} — closing`)
    httpServer.close()
    wss.clients.forEach((c) => c.close(1001, 'server shutdown'))
    setTimeout(() => process.exit(0), 1000).unref()
  })
}
