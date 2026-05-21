// scripts/restore-agent-config.mjs
// Restores the Klassio ElevenLabs agent (agent_7701kr9c2v7eev3tabzv4f2b0e8b) to
// the configuration spec'd in .planning/PHASE-6-SETUP-2026-05-10.md, AND
// re-creates + attaches the 6 Phase 8 client tools per D-07/D-11.
//
// Phase 8 + API migration update (2026-05-13):
// ─────────────────────────────────────────────
// 11labs deprecated inline `agent.prompt.tools[]` for custom client tools.
// Tools must now be created as workspace resources (POST /v1/convai/tools) and
// attached to the agent via `agent.prompt.tool_ids[]`. See body builder for the
// architectural notes.
//
// Restore flow (idempotent):
//   1. List workspace tools, find all matching our 6 names (PHASE_8_TOOL_NAMES).
//   2. DELETE each one — we always recreate from PHASE_8_TOOLS to guarantee the
//      current schema is applied. Webhook/MCP tools with names NOT in
//      PHASE_8_TOOL_NAMES (send_to_makeAI, n8n-*) are untouched.
//   3. POST 6 fresh tools, collect their IDs.
//   4. PATCH agent with prompt, first_message, voice, llm, language AND the 6
//      new tool_ids.
//   5. GET agent to verify — print voice, language, llm, prompt-head, tool count,
//      tool names.
//
// Why this exists: during Phase 6.5 UAT we discovered the agent had been reset
// to ElevenLabs's "Professor Echo" demo template. Manual UI editing is fragile;
// API-driven restore is reproducible. After Phase 8 deploy this is the
// canonical way to bring the agent into known-good state.
//
// Run from a non-RU IP if fetch fails on residential RU IPs — but the 2026-05-13
// test from RU residential succeeded all the way to HTTP 200, so try locally
// first. Fallback: scp this + body module + prompt onto the Frankfurt VPS.

import { readFileSync } from 'node:fs'
import {
  PHASE_8_TOOLS,
  PHASE_8_TOOL_NAMES,
  buildToolCreateBody,
  buildAgentPatchBody,
} from './restore-agent-config-body.mjs'

const API_KEY = process.env.ELEVENLABS_API_KEY
const AGENT_ID = process.env.ELEVENLABS_AGENT_ID
if (!API_KEY || !AGENT_ID) {
  console.error('Need ELEVENLABS_API_KEY and ELEVENLABS_AGENT_ID env vars')
  process.exit(1)
}

const PROMPT_PATH = process.env.PROMPT_PATH || '/tmp/klassio-prompt.txt'
const PROMPT = readFileSync(PROMPT_PATH, 'utf8').trim()

// Phase 8.6 focus-group fix (2026-05-14): teacher now introduces herself by name.
// History:
//   - Phase 6: "Я Учитель" — focus group said it felt impersonal
//   - Phase 8.6 round 1: "Меня зовут Наташа" with voice Nataly
//   - Phase 8.6 round 2: "Меня зовут Надя" — voice changed to Nadia in 11labs UI,
//     name in first_message aligned to match (Nadia → Надя)
const FIRST_MESSAGE =
  'Привет! Меня зовут Надя, я твоя учительница математики на сегодня. А тебя как зовут?'

const BASE_HEADERS = {
  'xi-api-key': API_KEY,
  'User-Agent': 'Mozilla/5.0 Klassio/restore-script',
  'Content-Type': 'application/json',
}

const API = 'https://api.elevenlabs.io/v1/convai'

// ─── 1. List workspace tools, identify ours ─────────────────────────────────
console.log(`[1/5] Listing workspace tools to find existing Phase 8 ones...`)
{
  const listRes = await fetch(`${API}/tools`, { headers: BASE_HEADERS })
  if (!listRes.ok) {
    console.error(`     HTTP ${listRes.status}`, await listRes.text())
    process.exit(2)
  }
  const data = await listRes.json()
  const allTools = data.tools || []
  const ours = allTools.filter((t) => PHASE_8_TOOL_NAMES.includes(t.tool_config?.name))
  console.log(
    `     Found ${allTools.length} total workspace tools — ${ours.length} match Phase 8 names (will be DELETED + recreated).`,
  )
  if (ours.length > 0) {
    for (const t of ours) console.log(`       - ${t.id} (${t.tool_config.name})`)
  }

  // ─── 2. Delete existing matches so we always recreate cleanly ──────────────
  console.log(`[2/5] Deleting ${ours.length} stale Phase 8 tool(s) with ?force=true...`)
  // ?force=true is required because tools may already be attached to the agent
  // (HTTP 409 otherwise: "Tool is still in use by an agent"). Since the agent's
  // tool_ids will be rewritten in step 4 anyway, force-deleting is safe.
  for (const t of ours) {
    const delRes = await fetch(`${API}/tools/${t.id}?force=true`, {
      method: 'DELETE',
      headers: BASE_HEADERS,
    })
    if (!delRes.ok && delRes.status !== 404) {
      console.error(`     FAILED to DELETE ${t.id}: HTTP ${delRes.status}`, await delRes.text())
      process.exit(3)
    }
    console.log(`     DELETE ${t.id} → HTTP ${delRes.status}`)
  }
}

// ─── 3. Create 6 fresh tools, collect their IDs ─────────────────────────────
console.log(`[3/5] Creating ${PHASE_8_TOOLS.length} Phase 8 tools...`)
const toolIds = []
for (const def of PHASE_8_TOOLS) {
  const body = buildToolCreateBody(def)
  const res = await fetch(`${API}/tools`, {
    method: 'POST',
    headers: BASE_HEADERS,
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    console.error(`     FAILED to POST ${def.name}: HTTP ${res.status}`, await res.text())
    process.exit(4)
  }
  const created = await res.json()
  toolIds.push(created.id)
  console.log(`     ${def.name} → ${created.id}`)
}

// ─── 4. PATCH agent ─────────────────────────────────────────────────────────
console.log(
  `[4/5] Sending agent PATCH (prompt: ${PROMPT.length} chars, voice: Nadia, lang: ru, tool_ids: ${toolIds.length})...`,
)
{
  const body = buildAgentPatchBody({
    prompt: PROMPT,
    firstMessage: FIRST_MESSAGE,
    toolIds,
  })
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

// ─── 5. Re-fetch + verify ───────────────────────────────────────────────────
console.log('')
console.log('[5/5] Re-fetching agent to confirm...')
{
  const verify = await fetch(`${API}/agents/${AGENT_ID}`, { headers: BASE_HEADERS })
  const j = await verify.json()
  const agentTools = j.conversation_config?.agent?.prompt?.tools || []
  const customTools = agentTools.filter((t) => !t.params?.system_tool_type)
  const customNames = customTools.map((t) => t.name).filter(Boolean)
  const tts = j.conversation_config?.tts || {}
  const turn = j.conversation_config?.turn || {}
  const conv = j.conversation_config?.conversation || {}
  const asr = j.conversation_config?.asr || {}
  console.log('  voice_id      :', tts.voice_id)
  console.log('  tts model     :', tts.model_id)
  console.log('  tts stability :', tts.stability, '(target: 0.35 — Phase 8.6 round 3 energetic)')
  console.log('  tts similarity:', tts.similarity_boost, '(target: 0.75)')
  console.log('  tts speed     :', tts.speed, '(target: 1.0)')
  console.log('  language      :', j.conversation_config?.agent?.language)
  console.log('  llm           :', j.conversation_config?.agent?.prompt?.llm)
  console.log('  max duration  :', conv.max_duration_seconds, 's (Phase 6 baseline: 3600)')
  console.log('  turn timeout  :', turn.turn_timeout, 's (Phase 6 baseline: 10)')
  console.log('  turn eagerness:', turn.turn_eagerness, '(Phase 6 baseline: normal)')
  console.log('  asr keywords  :', asr.keywords?.length || 0, 'keywords (Phase 6 baseline: 18)')
  console.log('  pron dicts    :', tts.pronunciation_dictionary_locators?.length || 0,
              'dictionary attached (target: 1 — klassio-math-ru-v1, 30 rules)')
  console.log('  text norm     :', tts.text_normalisation_type, "(target: 'elevenlabs' for punctuation handling)")
  console.log('  first_message :', (j.conversation_config?.agent?.first_message || '').slice(0, 80))
  console.log('  prompt len    :', (j.conversation_config?.agent?.prompt?.prompt || '').length, 'chars')
  console.log('  prompt head   :', (j.conversation_config?.agent?.prompt?.prompt || '').slice(0, 80))
  console.log('  tool_ids      :', j.conversation_config?.agent?.prompt?.tool_ids || [])
  console.log('  total tools   :', agentTools.length, '(custom + built-in)')
  console.log('  custom tools  :', customTools.length, '(target: 6)')
  console.log('  custom names  :', customNames.join(', '))
  console.log('')
  if (customTools.length === PHASE_8_TOOLS.length) {
    console.log('✅ Restored. All 6 Phase 8 tools attached. Test the voice from your browser now.')
  } else {
    console.log(
      `⚠ WARNING: expected ${PHASE_8_TOOLS.length} custom tools, got ${customTools.length}. Inspect agent in 11labs UI.`,
    )
  }
}
