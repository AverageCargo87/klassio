// scripts/restore-agent-config.mjs
// Restores the Klassio ElevenLabs agent (agent_7701kr9c2v7eev3tabzv4f2b0e8b) to
// the configuration spec'd in .planning/PHASE-6-SETUP-2026-05-10.md.
//
// Why this exists: during Phase 6.5 UAT we discovered the agent had been reset
// to ElevenLabs's "Professor Echo" demo template — wrong voice (Eric/EN),
// wrong language, wrong prompt, wrong LLM, wrong TTS model. Manual UI editing
// is fragile (this is the second reset we've hit); doing it through the API
// is reproducible and lives in the repo.
//
// Run from a non-RU IP — local fetch to api.elevenlabs.io is flaky on RU
// residential IPs. Easiest: scp this onto the Frankfurt VPS and run there.
//   scp scripts/restore-agent-config.mjs root@87.120.93.35:/tmp/
//   ssh root@87.120.93.35 \
//     "ELEVENLABS_API_KEY=... ELEVENLABS_AGENT_ID=... node /tmp/restore-agent-config.mjs"
import { readFileSync } from 'node:fs'

const API_KEY = process.env.ELEVENLABS_API_KEY
const AGENT_ID = process.env.ELEVENLABS_AGENT_ID
if (!API_KEY || !AGENT_ID) {
  console.error('Need ELEVENLABS_API_KEY and ELEVENLABS_AGENT_ID env vars')
  process.exit(1)
}

const NATALY_VOICE_ID = 'NhY0kyTmsKuEpHvDMngm' // "Nataly - Youthful, Gentle and Soft"
const PROMPT_PATH = process.env.PROMPT_PATH || '/tmp/klassio-prompt.txt'
const PROMPT = readFileSync(PROMPT_PATH, 'utf8').trim()

const FIRST_MESSAGE =
  'Привет! Я Учитель — буду заниматься с тобой математикой сегодня. Тебя как зовут?'

const body = {
  conversation_config: {
    agent: {
      language: 'ru',
      first_message: FIRST_MESSAGE,
      prompt: {
        prompt: PROMPT,
        llm: 'gpt-4.1-mini',
      },
    },
    tts: {
      voice_id: NATALY_VOICE_ID,
      model_id: 'eleven_multilingual_v2',
    },
  },
}

console.log(`[1/2] Sending PATCH (prompt: ${PROMPT.length} chars, voice: Nataly, lang: ru)...`)
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
console.log('')
console.log('✅ Restored. Test the voice from your browser now.')
