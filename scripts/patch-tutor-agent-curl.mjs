// scripts/patch-tutor-agent-curl.mjs
//
// Apply scripts/tutor-agent-prompt.md to the LIVE 11labs tutor agent using curl
// as transport. node fetch is 403'd from RU IPs by Cloudflare bot-management
// (same reason the WSS path is proxied — see lib/elevenlabs/proxy-url.ts); curl's
// TLS fingerprint passes, so REST works locally without the VPS.
//
// SAFE + surgical:
//   - reads the agent's CURRENT tool_ids and live turn fields and re-sends them
//     verbatim → nothing but the prompt changes (no tool wipe, no turn_model reset).
//   - on any non-2xx the agent is left untouched (PATCH is atomic).
//
// Rollback:  git checkout scripts/tutor-agent-prompt.md && node scripts/patch-tutor-agent-curl.mjs
// Run:       node scripts/patch-tutor-agent-curl.mjs   (from project root)
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { buildTutorAgentPatchBody, stripPromptComments, TUTOR_FIRST_MESSAGE } from './restore-tutor-agent-body.mjs'

const ENV = readFileSync('.env.local', 'utf8')
const XI = (ENV.match(/^ELEVENLABS_API_KEY=(.*)$/m) || [])[1]?.replace(/["\r]/g, '').trim()
const AGENT = process.env.ELEVENLABS_TUTOR_AGENT_ID || 'agent_7701kr9c2v7eev3tabzv4f2b0e8b'
if (!XI) { console.error('No ELEVENLABS_API_KEY in .env.local'); process.exit(1) }

const API = 'https://api.elevenlabs.io/v1/convai'
const curlGet = (u) =>
  JSON.parse(execFileSync('curl', ['-s', '--max-time', '30', '-H', `xi-api-key: ${XI}`, u], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }))

const __dirname = dirname(fileURLToPath(import.meta.url))
const PROMPT = stripPromptComments(readFileSync(join(__dirname, 'tutor-agent-prompt.md'), 'utf8'))

// 1. live config → tool_ids + fields we must preserve verbatim
const cur = await curlGet(`${API}/agents/${AGENT}`)
const cp = cur.conversation_config?.agent?.prompt
const toolIds = Array.isArray(cp?.tool_ids) ? cp.tool_ids : []
if (toolIds.length === 0) { console.error('Refusing: 0 tool_ids (would blank tools).'); process.exit(2) }
const liveTurn = cur.conversation_config?.turn || {}
const liveVoice = cur.conversation_config?.tts?.voice_id
const liveFirst = cur.conversation_config?.agent?.first_message ?? TUTOR_FIRST_MESSAGE
console.log('live llm:', cp?.llm, '| tools:', toolIds.length, '| turn_model:', liveTurn.turn_model)

// 2. proven body shape + preserve the extra live turn fields the builder omits
const body = buildTutorAgentPatchBody({ prompt: PROMPT, firstMessage: liveFirst, voiceId: liveVoice, toolIds })
if (liveTurn.turn_model !== undefined) body.conversation_config.turn.turn_model = liveTurn.turn_model
if (liveTurn.retranscribe_on_turn_timeout !== undefined)
  body.conversation_config.turn.retranscribe_on_turn_timeout = liveTurn.retranscribe_on_turn_timeout

// 3. PATCH via curl (body in a temp file → no arg-length/quoting issues with the 19k prompt)
mkdirSync('.tmp', { recursive: true })
const bodyFile = '.tmp/agent-patch-body.json'
writeFileSync(bodyFile, JSON.stringify(body))
const status = execFileSync('curl', ['-s', '-o', '.tmp/agent-patch-resp.json', '-w', '%{http_code}', '--max-time', '40',
  '-X', 'PATCH', '-H', `xi-api-key: ${XI}`, '-H', 'Content-Type: application/json', '-d', `@${bodyFile}`,
  `${API}/agents/${AGENT}`], { encoding: 'utf8' })
console.log('PATCH status:', status)
if (!/^2\d\d$/.test(status)) {
  console.error('FAILED (agent untouched):', readFileSync('.tmp/agent-patch-resp.json', 'utf8').slice(0, 400))
  process.exit(3)
}

// 4. verify
const v = await curlGet(`${API}/agents/${AGENT}`)
const vprompt = v.conversation_config?.agent?.prompt?.prompt || ''
console.log('verify llm  :', v.conversation_config?.agent?.prompt?.llm)
console.log('verify turn :', JSON.stringify(v.conversation_config?.turn))
console.log('pre-tool-speech instruction in prompt:', vprompt.includes('короткая связка') ? '✅ yes' : '⚠ NO')
console.log('prompt len  :', vprompt.length, '(was 19077)')
