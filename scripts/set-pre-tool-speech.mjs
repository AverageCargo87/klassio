// scripts/set-pre-tool-speech.mjs
//
// Enable (or roll back) force_pre_tool_speech on the tutor's "show" tools so the
// agent speaks a short bridge BEFORE the tool fires — filling the ~844 ms
// tool-call silence. Prompt steering alone did NOT work: the show tools are
// expects_response:true, so the model calls the tool first and only speaks
// after the result. This is the platform-level switch 11labs actually honors.
//
// SAFE: GET each target tool's FULL config, flip ONLY force_pre_tool_speech,
// PATCH the whole tool_config back (REPLACE-safe). Originals are backed up in
// .tmp/tool-backups/<name>.json. curl transport (node fetch 403s from RU IPs).
//
// Set:      node scripts/set-pre-tool-speech.mjs
// Rollback: node scripts/set-pre-tool-speech.mjs --rollback   (re-applies backups)
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs'
import { execFileSync } from 'node:child_process'

const ROLLBACK = process.argv.includes('--rollback')
const TARGETS = ['show_board', 'next_slide', 'show_trainer']
const XI = (readFileSync('.env.local', 'utf8').match(/^ELEVENLABS_API_KEY=(.*)$/m) || [])[1]?.replace(/["\r]/g, '').trim()
const AGENT = process.env.ELEVENLABS_TUTOR_AGENT_ID || 'agent_7701kr9c2v7eev3tabzv4f2b0e8b'
if (!XI) { console.error('No ELEVENLABS_API_KEY'); process.exit(1) }
const API = 'https://api.elevenlabs.io/v1/convai'
const BK = '.tmp/tool-backups'
mkdirSync(BK, { recursive: true })

const curlGet = (u) => JSON.parse(execFileSync('curl', ['-s', '--max-time', '30', '-H', `xi-api-key: ${XI}`, u], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }))
const curlPatch = (u, bodyObj) => {
  const f = '.tmp/tool-patch-body.json'
  writeFileSync(f, JSON.stringify(bodyObj))
  const code = execFileSync('curl', ['-s', '-o', '.tmp/tool-patch-resp.json', '-w', '%{http_code}', '--max-time', '40',
    '-X', 'PATCH', '-H', `xi-api-key: ${XI}`, '-H', 'Content-Type: application/json', '-d', `@${f}`, u], { encoding: 'utf8' })
  return { code, resp: readFileSync('.tmp/tool-patch-resp.json', 'utf8') }
}

// map target names → tool_ids from the live agent
const agent = curlGet(`${API}/agents/${AGENT}`)
const ids = agent.conversation_config.agent.prompt.tool_ids
const idByName = {}
for (const id of ids) { const t = curlGet(`${API}/tools/${id}`); idByName[(t.tool_config || t).name] = id }

for (const name of TARGETS) {
  const id = idByName[name]
  if (!id) { console.log(name, '— NOT FOUND, skip'); continue }
  let cfg
  if (ROLLBACK) {
    cfg = JSON.parse(readFileSync(`${BK}/${name}.json`, 'utf8')).tool_config
  } else {
    const cur = curlGet(`${API}/tools/${id}`)
    if (!existsSync(`${BK}/${name}.json`)) writeFileSync(`${BK}/${name}.json`, JSON.stringify(cur)) // preserve original
    cfg = cur.tool_config
    // The enum pre_tool_speech is the REAL lever (valid: 'auto'|'force'|'off');
    // the boolean force_pre_tool_speech alone is silently ignored on PATCH.
    cfg.pre_tool_speech = 'force'
    cfg.force_pre_tool_speech = true
  }
  const { code, resp } = curlPatch(`${API}/tools/${id}`, { tool_config: cfg })
  if (!/^2\d\d$/.test(code)) { console.log(name.padEnd(14), 'PATCH', code, 'FAILED:', resp.slice(0, 200)); continue }
  const v = curlGet(`${API}/tools/${id}`)
  const vc = v.tool_config || v
  console.log(name.padEnd(14), 'pre_tool_speech →', JSON.stringify(vc.pre_tool_speech), '| force_pre_tool_speech', vc.force_pre_tool_speech, `(HTTP ${code})`)
}
console.log(ROLLBACK ? '↩ ROLLBACK done.' : '✅ Done. Applies on next lesson start.')
