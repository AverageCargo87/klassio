// scripts/restore-tutor-agent.mjs
//
// Provisions the AI-репетитор agent «Аня» on 11labs Conversational AI: creates
// the 8 tutor client tools as workspace resources and CREATES or PATCHES the
// agent with the prompt (scripts/tutor-agent-prompt.md), voice, LLM, ASR, and
// tool_ids.
//
// ⚠ THIS MUTATES 11labs CLOUD STATE (and the math agent is LIVE in prod). Run
// only with explicit operator OK. It NEVER touches the math agent's tools — it
// filters strictly by TUTOR_TOOL_NAMES, which are disjoint from PHASE_8 names.
//
// Modes:
//   Create a NEW tutor agent (first-time setup):
//     ELEVENLABS_API_KEY=... node scripts/restore-tutor-agent.mjs --create
//     → prints the new agent id; put it in .env.local as ELEVENLABS_TUTOR_AGENT_ID
//   Update the existing tutor agent (after editing the prompt/tools):
//     ELEVENLABS_API_KEY=... ELEVENLABS_TUTOR_AGENT_ID=agent_... \
//       node scripts/restore-tutor-agent.mjs
//
// Env: ELEVENLABS_API_KEY (required), ELEVENLABS_TUTOR_AGENT_ID (required unless
//      --create), PROMPT_PATH (default scripts/tutor-agent-prompt.md).

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import {
  TUTOR_TOOLS,
  TUTOR_TOOL_NAMES,
  TUTOR_FIRST_MESSAGE,
  buildToolCreateBody,
  buildTutorAgentPatchBody,
  stripPromptComments,
} from './restore-tutor-agent-body.mjs'

const __dirname = dirname(fileURLToPath(import.meta.url))
const CREATE = process.argv.includes('--create')

const API_KEY = process.env.ELEVENLABS_API_KEY
const AGENT_ID = process.env.ELEVENLABS_TUTOR_AGENT_ID
if (!API_KEY) {
  console.error('Need ELEVENLABS_API_KEY env var')
  process.exit(1)
}
if (!CREATE && !AGENT_ID) {
  console.error('Need ELEVENLABS_TUTOR_AGENT_ID (or pass --create to make a new agent)')
  process.exit(1)
}

const PROMPT_PATH = process.env.PROMPT_PATH || join(__dirname, 'tutor-agent-prompt.md')
const PROMPT = stripPromptComments(readFileSync(PROMPT_PATH, 'utf8'))
if (!PROMPT) {
  console.error(`Prompt at ${PROMPT_PATH} is empty after stripping comments`)
  process.exit(1)
}

const BASE_HEADERS = {
  'xi-api-key': API_KEY,
  'User-Agent': 'Mozilla/5.0 Klassio/restore-tutor',
  'Content-Type': 'application/json',
}
const API = 'https://api.elevenlabs.io/v1/convai'

// ─── 1. Find + delete existing tutor tools (by name; never math tools) ───────
console.log('[1/4] Listing workspace tools, removing stale tutor ones...')
{
  const listRes = await fetch(`${API}/tools`, { headers: BASE_HEADERS })
  if (!listRes.ok) {
    console.error(`     HTTP ${listRes.status}`, await listRes.text())
    process.exit(2)
  }
  const data = await listRes.json()
  const ours = (data.tools || []).filter((t) => TUTOR_TOOL_NAMES.includes(t.tool_config?.name))
  console.log(`     Found ${ours.length} existing tutor tool(s) to recreate.`)
  for (const t of ours) {
    const del = await fetch(`${API}/tools/${t.id}?force=true`, { method: 'DELETE', headers: BASE_HEADERS })
    if (!del.ok && del.status !== 404) {
      console.error(`     FAILED DELETE ${t.id}: HTTP ${del.status}`, await del.text())
      process.exit(3)
    }
    console.log(`     DELETE ${t.id} (${t.tool_config?.name}) → HTTP ${del.status}`)
  }
}

// ─── 2. Create the 8 tutor tools ─────────────────────────────────────────────
console.log(`[2/4] Creating ${TUTOR_TOOLS.length} tutor tools...`)
const toolIds = []
for (const def of TUTOR_TOOLS) {
  const res = await fetch(`${API}/tools`, {
    method: 'POST',
    headers: BASE_HEADERS,
    body: JSON.stringify(buildToolCreateBody(def)),
  })
  if (!res.ok) {
    console.error(`     FAILED POST ${def.name}: HTTP ${res.status}`, await res.text())
    process.exit(4)
  }
  const created = await res.json()
  toolIds.push(created.id)
  console.log(`     ${def.name} → ${created.id}`)
}

// ─── 3. Create or patch the agent ────────────────────────────────────────────
const body = buildTutorAgentPatchBody({ prompt: PROMPT, firstMessage: TUTOR_FIRST_MESSAGE, toolIds })

if (CREATE) {
  console.log(`[3/4] Creating NEW tutor agent (prompt ${PROMPT.length} chars, ${toolIds.length} tools)...`)
  const res = await fetch(`${API}/agents/create`, {
    method: 'POST',
    headers: BASE_HEADERS,
    body: JSON.stringify({ name: 'Klassio AI-репетитор (Аня)', ...body }),
  })
  console.log(`     HTTP ${res.status}`)
  if (!res.ok) {
    console.error(await res.text())
    process.exit(5)
  }
  const created = await res.json()
  console.log('')
  console.log('✅ Created tutor agent. Add this to .env.local:')
  console.log(`   ELEVENLABS_TUTOR_AGENT_ID=${created.agent_id || created.id}`)
  process.exit(0)
}

console.log(`[3/4] PATCHing tutor agent ${AGENT_ID} (prompt ${PROMPT.length} chars, ${toolIds.length} tools)...`)
{
  const res = await fetch(`${API}/agents/${AGENT_ID}`, {
    method: 'PATCH',
    headers: BASE_HEADERS,
    body: JSON.stringify(body),
  })
  console.log(`     HTTP ${res.status}`)
  if (!res.ok) {
    console.error(await res.text())
    process.exit(5)
  }
}

// ─── 4. Verify ───────────────────────────────────────────────────────────────
console.log('[4/4] Re-fetching agent to confirm...')
{
  const verify = await fetch(`${API}/agents/${AGENT_ID}`, { headers: BASE_HEADERS })
  const j = await verify.json()
  const agentTools = j.conversation_config?.agent?.prompt?.tools || []
  const customTools = agentTools.filter((t) => !t.params?.system_tool_type)
  console.log('  voice_id    :', j.conversation_config?.tts?.voice_id)
  console.log('  language    :', j.conversation_config?.agent?.language)
  console.log('  llm         :', j.conversation_config?.agent?.prompt?.llm)
  console.log('  first_message:', (j.conversation_config?.agent?.first_message || '').slice(0, 80))
  console.log('  prompt len  :', (j.conversation_config?.agent?.prompt?.prompt || '').length, 'chars')
  console.log('  custom tools:', customTools.length, `(target: ${TUTOR_TOOLS.length})`)
  console.log('  tool names  :', customTools.map((t) => t.name).filter(Boolean).join(', '))
  console.log('')
  console.log(
    customTools.length === TUTOR_TOOLS.length
      ? '✅ Tutor agent restored. Test the voice from /tutor/okr-mir-4/astronom.'
      : `⚠ expected ${TUTOR_TOOLS.length} tools, got ${customTools.length} — inspect in 11labs UI.`,
  )
}
