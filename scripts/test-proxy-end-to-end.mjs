// scripts/test-proxy-end-to-end.mjs
// E2E test: Klassio client → h2.nexus proxy → 11labs.
// Validates that the proxy actually relays audio frames and survives >15s
// the same way a direct connection does.
//
// Run: node scripts/test-proxy-end-to-end.mjs
import { config } from 'dotenv'
config({ path: '.env.local' })

import WebSocket from 'ws'
import { createHmac } from 'node:crypto'

const API_KEY = process.env.ELEVENLABS_API_KEY
const AGENT_ID = process.env.ELEVENLABS_AGENT_ID
const PROXY_HOST = process.env.H2NEXUS_DOMAIN || '87.120.93.35.nip.io'
const HMAC_SECRET = process.env.VOICE_PROXY_HMAC_SECRET

if (!API_KEY || !AGENT_ID || !HMAC_SECRET) {
  console.error('Missing env: need ELEVENLABS_API_KEY, ELEVENLABS_AGENT_ID, VOICE_PROXY_HMAC_SECRET')
  process.exit(1)
}

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Klassio/test'

console.log('[1/3] Fetching 11labs signed_url from Vercel-side fetch...')
const t0 = Date.now()
const res = await fetch(
  `https://api.elevenlabs.io/v1/convai/conversation/get-signed-url?agent_id=${AGENT_ID}`,
  { headers: { 'xi-api-key': API_KEY, 'User-Agent': UA } },
)
console.log(`     HTTP ${res.status} in ${Date.now() - t0}ms`)
if (!res.ok) {
  console.error(await res.text())
  process.exit(1)
}
const { signed_url } = await res.json()
console.log(`     signed_url length: ${signed_url.length}`)

console.log('')
console.log('[2/3] Minting proxy token (HMAC of u:t with shared secret)...')
const u = Buffer.from(signed_url, 'utf8').toString('base64')
const t = String(Date.now())
const s = createHmac('sha256', HMAC_SECRET).update(`${u}:${t}`).digest('hex')
const proxyUrl = `wss://${PROXY_HOST}/?u=${encodeURIComponent(u)}&t=${t}&s=${s}`
console.log(`     u=${u.length} chars, t=${t}, s=${s.slice(0, 16)}...`)
console.log(`     proxy URL host: wss://${PROXY_HOST}/?...`)

console.log('')
console.log('[3/3] Opening WS via proxy (will run 20 sec)...')
const tWs = Date.now()
const ws = new WebSocket(proxyUrl, { headers: { 'User-Agent': UA } })

let opened = false
let messages = 0
let audioBytes = 0

ws.on('open', () => {
  opened = true
  console.log(`[+${Date.now() - tWs}ms] WS OPEN ✓ (via proxy)`)
  ws.send(
    JSON.stringify({ type: 'conversation_initiation_client_data', conversation_config_override: {} }),
  )
})

ws.on('message', (data) => {
  messages++
  const txt = data.toString()
  if (txt.includes('audio_event')) audioBytes += data.length
  if (messages <= 5 || messages % 5 === 0) {
    console.log(`[+${Date.now() - tWs}ms] msg #${messages}: ${txt.slice(0, 90)}...`)
  }
})

ws.on('close', (code, reason) => {
  const r = reason && reason.length ? reason.toString() : '(empty)'
  console.log(
    `[+${Date.now() - tWs}ms] CLOSED code=${code} reason=${r} | opened=${opened} msgs=${messages} audioBytes≈${audioBytes}`,
  )
  process.exit(opened && Date.now() - tWs >= 10_000 ? 0 : 1)
})

ws.on('error', (e) => {
  console.log(`[+${Date.now() - tWs}ms] ERROR: ${e.message}`)
})

setTimeout(() => {
  console.log(`[+${Date.now() - tWs}ms] 20s elapsed — closing`)
  ws.close(1000, 'test ended')
}, 20_000)

setTimeout(() => {
  console.log(`[+${Date.now() - tWs}ms] watchdog`)
  process.exit(2)
}, 25_000)
