// scripts/patch-tutor-llm.mjs
//
// Safely change ONLY the tutor agent's LLM (TUTOR_LLM_MODEL in
// restore-tutor-agent-body.mjs) WITHOUT deleting/recreating its client tools.
//
// Why a separate script: restore-tutor-agent.mjs deletes + recreates the 9 tools
// BEFORE patching the agent. If the new LLM id is invalid, that PATCH 400s and
// the agent is left referencing the just-deleted tools → broken. This patcher
// instead reads the agent's CURRENT tool_ids and re-PATCHes the full config with
// only the LLM changed. On a bad LLM id the PATCH simply 400s and nothing is lost.
//
// Run (on the Frankfurt VPS — 11labs is RU-blocked):
//   ELEVENLABS_API_KEY=... ELEVENLABS_TUTOR_AGENT_ID=agent_... node patch-tutor-llm.mjs

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import {
  buildTutorAgentPatchBody,
  stripPromptComments,
  TUTOR_FIRST_MESSAGE,
  TUTOR_LLM_MODEL,
} from './restore-tutor-agent-body.mjs'

const API_KEY = process.env.ELEVENLABS_API_KEY
const AGENT_ID = process.env.ELEVENLABS_TUTOR_AGENT_ID
if (!API_KEY || !AGENT_ID) {
  console.error('Need ELEVENLABS_API_KEY and ELEVENLABS_TUTOR_AGENT_ID')
  process.exit(1)
}

const __dirname = dirname(fileURLToPath(import.meta.url))
const PROMPT = stripPromptComments(readFileSync(join(__dirname, 'tutor-agent-prompt.md'), 'utf8'))
const API = 'https://api.elevenlabs.io/v1/convai'
const H = { 'xi-api-key': API_KEY, 'User-Agent': 'Mozilla/5.0 Klassio/llm-patch', 'Content-Type': 'application/json' }

// 1. Read the agent's CURRENT tool_ids (so we don't wipe them).
const cur = await (await fetch(`${API}/agents/${AGENT_ID}`, { headers: H })).json()
const prompt = cur.conversation_config?.agent?.prompt
let toolIds = Array.isArray(prompt?.tool_ids) ? prompt.tool_ids : []
if (!toolIds.length && Array.isArray(prompt?.tools)) {
  toolIds = prompt.tools.filter((t) => !t?.params?.system_tool_type && t?.id).map((t) => t.id)
}
console.log('current llm :', prompt?.llm)
console.log('tool_ids    :', toolIds.length)
if (toolIds.length === 0) {
  console.error('Refusing to patch: found 0 tool_ids (would blank the tools). Aborting.')
  process.exit(2)
}

// 2. Build the full body (buildTutorAgentPatchBody uses TUTOR_LLM_MODEL = new model)
//    with the EXISTING tool ids, and PATCH. REPLACE-on-object is fine — every
//    field is re-sent identical to the last restore except the LLM.
const body = buildTutorAgentPatchBody({ prompt: PROMPT, firstMessage: TUTOR_FIRST_MESSAGE, toolIds })
console.log(`PATCHing llm → ${TUTOR_LLM_MODEL} (keeping ${toolIds.length} tools)...`)
const res = await fetch(`${API}/agents/${AGENT_ID}`, { method: 'PATCH', headers: H, body: JSON.stringify(body) })
console.log('PATCH status:', res.status)
if (!res.ok) {
  console.error('FAILED (tools untouched, agent unchanged):', (await res.text()).slice(0, 500))
  process.exit(3)
}

// 3. Verify
const v = await (await fetch(`${API}/agents/${AGENT_ID}`, { headers: H })).json()
const vp = v.conversation_config?.agent?.prompt
const vTools = (vp?.tools || []).filter((t) => !t?.params?.system_tool_type)
console.log('NEW llm     :', vp?.llm)
console.log('tts model   :', v.conversation_config?.tts?.model_id, '| stability:', v.conversation_config?.tts?.stability)
console.log('custom tools:', vTools.length)
console.log(vp?.llm === TUTOR_LLM_MODEL ? '✅ LLM switched.' : '⚠ LLM did not stick — check the id.')
