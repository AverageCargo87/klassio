// scripts/restore-agent-config.mjs
// Restores the Klassio ElevenLabs agent (agent_7701kr9c2v7eev3tabzv4f2b0e8b) to
// the configuration spec'd in .planning/PHASE-6-SETUP-2026-05-10.md.
//
// Phase 8 update (D-11): now also PATCHes the agent's `tools` array with all 6
// client tool definitions per D-07. PATCH overwrites the entire tools array —
// see RESEARCH § Risk 6 (when extending in future phases, ADD to PHASE_8_TOOLS
// in restore-agent-config-body.mjs; never run an older version of this script
// after a newer phase added tools).
//
// Why this exists: during Phase 6.5 UAT we discovered the agent had been reset
// to ElevenLabs's "Professor Echo" demo template. Manual UI editing is fragile;
// PATCH via API is reproducible. After Phase 8 deploy this is the canonical way
// to restore the agent to known-good state.
//
// Run from a non-RU IP — local fetch to api.elevenlabs.io is flaky on RU
// residential IPs. Easiest: scp this + body module + prompt file onto the
// Frankfurt VPS and run there.
//   scp scripts/restore-agent-config*.mjs root@87.120.93.35:/tmp/
//   ssh root@87.120.93.35 \
//     "ELEVENLABS_API_KEY=... ELEVENLABS_AGENT_ID=... node /tmp/restore-agent-config.mjs"
import { readFileSync } from 'node:fs'
import { PHASE_8_TOOLS, buildAgentPatchBody } from './restore-agent-config-body.mjs'

const API_KEY = process.env.ELEVENLABS_API_KEY
const AGENT_ID = process.env.ELEVENLABS_AGENT_ID
if (!API_KEY || !AGENT_ID) {
  console.error('Need ELEVENLABS_API_KEY and ELEVENLABS_AGENT_ID env vars')
  process.exit(1)
}

const PROMPT_PATH = process.env.PROMPT_PATH || '/tmp/klassio-prompt.txt'
const PROMPT = readFileSync(PROMPT_PATH, 'utf8').trim()

const FIRST_MESSAGE =
  'Привет! Я Учитель — буду заниматься с тобой математикой сегодня. Тебя как зовут?'

const body = buildAgentPatchBody({
  prompt: PROMPT,
  firstMessage: FIRST_MESSAGE,
  tools: PHASE_8_TOOLS,
})

console.log(
  `[1/2] Sending PATCH (prompt: ${PROMPT.length} chars, ` +
    `voice: Nataly, lang: ru, tools: ${PHASE_8_TOOLS.length})...`,
)
const res = await fetch(`https://api.elevenlabs.io/v1/convai/agents/${AGENT_ID}`, {
  method: 'PATCH',
  headers: {
    'xi-api-key': API_KEY,
    'User-Agent': 'Mozilla/5.0 Klassio/restore-script',
    'Content-Type': 'application/json',
  },
  body: JSON.stringify(body),
})
console.log(`     HTTP ${res.status}`)
if (!res.ok) {
  console.error(await res.text())
  process.exit(2)
}

console.log('')
console.log('[2/2] Re-fetching to confirm...')
const verify = await fetch(`https://api.elevenlabs.io/v1/convai/agents/${AGENT_ID}`, {
  headers: { 'xi-api-key': API_KEY, 'User-Agent': 'Mozilla/5.0 Klassio/restore-script' },
})
const j = await verify.json()
console.log('  voice_id     :', j.conversation_config?.tts?.voice_id)
console.log('  tts model    :', j.conversation_config?.tts?.model_id)
console.log('  language     :', j.conversation_config?.agent?.language)
console.log('  llm          :', j.conversation_config?.agent?.prompt?.llm)
console.log('  first_message:', (j.conversation_config?.agent?.first_message || '').slice(0, 80))
console.log('  prompt len   :', (j.conversation_config?.agent?.prompt?.prompt || '').length, 'chars')
console.log('  prompt head  :', (j.conversation_config?.agent?.prompt?.prompt || '').slice(0, 80))
console.log('  tools count  :', j.conversation_config?.agent?.prompt?.tools?.length ?? 0)
console.log(
  '  tool names   :',
  (j.conversation_config?.agent?.prompt?.tools || []).map((t) => t.name).join(', '),
)
console.log('')
console.log('✅ Restored. Test the voice from your browser now.')
