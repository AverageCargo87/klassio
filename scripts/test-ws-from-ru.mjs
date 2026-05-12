// scripts/test-ws-from-ru.mjs
// Sanity check: can we open a real 11labs Conversational AI WebSocket
// from a Russian residential IP without a VPN?
//
// If YES → Phase 6.5 (EU WS-proxy) might not be needed at all.
// If NO  → we confirm RU-IP block at the WSS layer, justifying the proxy.
//
// Run: node scripts/test-ws-from-ru.mjs
import 'dotenv/config'
import { config } from 'dotenv'
config({ path: '.env.local' })

import WebSocket from 'ws'

const API_KEY = process.env.ELEVENLABS_API_KEY
const AGENT_ID = process.env.ELEVENLABS_AGENT_ID

if (!API_KEY || !AGENT_ID) {
  console.error('Missing ELEVENLABS_API_KEY or ELEVENLABS_AGENT_ID in .env.local')
  process.exit(1)
}

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/132.0.0.0 Safari/537.36'

console.log('[1/2] Fetching signed URL...')
const t0 = Date.now()
const res = await fetch(
  `https://api.elevenlabs.io/v1/convai/conversation/get-signed-url?agent_id=${AGENT_ID}`,
  { headers: { 'xi-api-key': API_KEY, 'User-Agent': UA } },
)
console.log(`     HTTP ${res.status} in ${Date.now() - t0}ms`)
if (!res.ok) {
  console.error('     body:', await res.text())
  process.exit(1)
}
const { signed_url } = await res.json()
console.log(`     signed_url length: ${signed_url.length}`)

console.log('')
console.log('[2/2] Opening WebSocket... (will run for 20 seconds)')
const tWs = Date.now()
const ws = new WebSocket(signed_url, {
  headers: {
    'User-Agent': UA,
    'Origin': 'https://klassio-one.vercel.app',
  },
})

let opened = false
let messages = 0

ws.on('open', () => {
  opened = true
  console.log(`[+${Date.now() - tWs}ms] WS OPEN ✓ (Sec-WebSocket-Accept handshake succeeded)`)
  // Send the initial conversation init payload the SDK normally sends
  ws.send(
    JSON.stringify({
      type: 'conversation_initiation_client_data',
      conversation_config_override: {},
    }),
  )
})

ws.on('message', (data) => {
  messages++
  const txt = data.toString()
  const preview = txt.length > 120 ? txt.slice(0, 120) + '...' : txt
  console.log(`[+${Date.now() - tWs}ms] MSG #${messages}: ${preview}`)
})

ws.on('close', (code, reason) => {
  const r = reason && reason.length ? reason.toString() : '(empty reason)'
  console.log(`[+${Date.now() - tWs}ms] WS CLOSED — code=${code}, reason=${r}, opened=${opened}, msgs=${messages}`)
  process.exit(opened && Date.now() - tWs >= 10_000 ? 0 : 1)
})

ws.on('error', (e) => {
  console.log(`[+${Date.now() - tWs}ms] WS ERROR: ${e.message}`)
})

// Close gracefully after 20s if still alive
setTimeout(() => {
  console.log(`[+${Date.now() - tWs}ms] 20s elapsed — closing intentionally`)
  try {
    ws.close(1000, 'test ended')
  } catch {
    /* nothing */
  }
}, 20_000)

// Hard watchdog — if nothing happens at all in 25s, exit
setTimeout(() => {
  console.log(`[+${Date.now() - tWs}ms] watchdog timeout`)
  process.exit(2)
}, 25_000)
