// scripts/create-invest-agent.mjs
//
// Creates a SECOND 11labs tutor agent for the «Инвестиции» lesson, WITHOUT
// touching the live astronomy agent or its tools. Unlike restore-tutor-agent
// --create (which deletes+recreates the shared workspace tools by name → would
// break the astronomy agent's tool_ids), this script REUSES the existing tutor
// tool ids and only creates a new agent record with the investments prompt +
// finance ASR keywords.
//
// Reads ELEVENLABS_API_KEY from .env.local (never printed). Writes the new
// agent id to .env.local as ELEVENLABS_INVEST_AGENT_ID. For the DEPLOYED app,
// also add ELEVENLABS_INVEST_AGENT_ID to the Vercel env.
//
//   node scripts/create-invest-agent.mjs

import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import {
  TUTOR_TOOL_NAMES,
  TUTOR_FIRST_MESSAGE,
  buildTutorAgentPatchBody,
  stripPromptComments,
} from './restore-tutor-agent-body.mjs'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '..')
const ENV_PATH = join(ROOT, '.env.local')

// ── load .env.local (do NOT print values) ───────────────────────────────────
function loadEnvLocal(path) {
  const out = {}
  let raw = ''
  try { raw = readFileSync(path, 'utf8') } catch { return out }
  for (const line of raw.split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
    if (!m) continue
    let v = m[2]
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1)
    out[m[1]] = v
  }
  return out
}
const env = loadEnvLocal(ENV_PATH)
const API_KEY = process.env.ELEVENLABS_API_KEY || env.ELEVENLABS_API_KEY
if (!API_KEY) {
  console.error('✗ ELEVENLABS_API_KEY not found (checked process.env and .env.local).')
  process.exit(1)
}

const PROMPT = stripPromptComments(readFileSync(join(__dirname, 'tutor-agent-prompt-invest.md'), 'utf8'))
if (!PROMPT) { console.error('✗ invest prompt empty after stripping comments'); process.exit(1) }

// Finance ASR vocabulary so SaluteSpeech/11labs STT recognises the terms.
const INVEST_ASR_KEYWORDS = [
  'инвестиции', 'инвестировать', 'инвестор', 'акция', 'акции', 'акционер',
  'дивиденды', 'инфляция', 'компания', 'совладелец', 'доля', 'кусочек',
  'риск', 'диверсификация', 'сложный процент', 'процент', 'прибыль',
  'доход', 'вклад', 'копилка', 'биржа', 'облигация', 'портфель',
]

const BASE_HEADERS = {
  'xi-api-key': API_KEY,
  'User-Agent': 'Mozilla/5.0 Klassio/create-invest-agent',
  'Content-Type': 'application/json',
}
const API = 'https://api.elevenlabs.io/v1/convai'

// ── 1. Reuse existing tutor tool ids (by name) — never delete/recreate ───────
console.log('[1/3] Listing workspace tools, reusing existing tutor tool ids...')
const listRes = await fetch(`${API}/tools`, { headers: BASE_HEADERS })
if (!listRes.ok) { console.error(`HTTP ${listRes.status}`, await listRes.text()); process.exit(2) }
const data = await listRes.json()
const byName = new Map()
for (const t of (data.tools || [])) {
  const name = t.tool_config?.name
  if (TUTOR_TOOL_NAMES.includes(name) && !byName.has(name)) byName.set(name, t.id)
}
const missing = TUTOR_TOOL_NAMES.filter((n) => !byName.has(n))
if (missing.length) {
  console.error(`✗ Missing tutor tools in workspace: ${missing.join(', ')}.`)
  console.error('  Provision the astronomy tutor agent first (scripts/restore-tutor-agent.mjs).')
  process.exit(3)
}
const toolIds = TUTOR_TOOL_NAMES.map((n) => byName.get(n))
console.log(`     Reusing ${toolIds.length} shared tutor tools (astronomy untouched).`)

// ── 2. Create the invest agent (clones tutor voice/llm/turn; invest prompt) ──
const body = buildTutorAgentPatchBody({ prompt: PROMPT, firstMessage: TUTOR_FIRST_MESSAGE, toolIds })
body.conversation_config.asr.keywords = INVEST_ASR_KEYWORDS // finance vocab
console.log(`[2/3] Creating invest agent (prompt ${PROMPT.length} chars, ${toolIds.length} tools)...`)
const res = await fetch(`${API}/agents/create`, {
  method: 'POST',
  headers: BASE_HEADERS,
  body: JSON.stringify({ name: 'Klassio · Аня · Инвестиции', ...body }),
})
console.log(`     HTTP ${res.status}`)
if (!res.ok) { console.error(await res.text()); process.exit(4) }
const created = await res.json()
const agentId = created.agent_id || created.id
if (!agentId) { console.error('✗ No agent id in response', JSON.stringify(created).slice(0, 300)); process.exit(5) }

// ── 3. Write ELEVENLABS_INVEST_AGENT_ID to .env.local (no secrets printed) ───
let envRaw = ''
try { envRaw = readFileSync(ENV_PATH, 'utf8') } catch { /* none */ }
const KEY = 'ELEVENLABS_INVEST_AGENT_ID'
const lineRe = new RegExp(`^${KEY}=.*$`, 'm')
if (lineRe.test(envRaw)) envRaw = envRaw.replace(lineRe, `${KEY}=${agentId}`)
else envRaw = envRaw.replace(/\s*$/, '') + `\n${KEY}=${agentId}\n`
writeFileSync(ENV_PATH, envRaw)

console.log('[3/3] Verifying...')
const verify = await fetch(`${API}/agents/${agentId}`, { headers: BASE_HEADERS })
const j = await verify.json()
const tools = (j.conversation_config?.agent?.prompt?.tools || []).filter((t) => !t.params?.system_tool_type)
console.log('')
console.log('✅ Создан агент инвестиций.')
console.log(`   agent_id         : ${agentId}`)
console.log(`   name             : ${j.name}`)
console.log(`   voice_id         : ${j.conversation_config?.tts?.voice_id}`)
console.log(`   llm              : ${j.conversation_config?.agent?.prompt?.llm}`)
console.log(`   prompt len       : ${(j.conversation_config?.agent?.prompt?.prompt || '').length} chars`)
console.log(`   custom tools     : ${tools.length} (${tools.map((t) => t.name).filter(Boolean).join(', ')})`)
console.log(`   asr keywords     : ${(j.conversation_config?.asr?.keywords || []).length} (finance)`)
console.log('')
console.log(`   → ELEVENLABS_INVEST_AGENT_ID записан в .env.local`)
console.log(`   → для деплоя добавь ту же переменную в Vercel env`)
