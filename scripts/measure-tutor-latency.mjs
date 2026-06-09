// scripts/measure-tutor-latency.mjs
//
// Pull REAL per-stage latency from 11labs' own conversation analytics for the
// tutor agent, and aggregate median/p90/max per pipeline stage. 11labs records
// these per turn under transcript[].conversation_turn_metrics.metrics:
//   convai_asr_trailing_service_latency   — ASR finalization tail after speech end
//   convai_llm_service_ttfb               — LLM time to first byte
//   convai_llm_service_ttf_sentence       — LLM time to first full sentence (gates TTS)
//   convai_llm_tool_request_generation_latency — LLM generating a tool call (spike source)
//   convai_tts_service_ttfb               — TTS time to first audio byte
//   tool_latency_secs (on the turn)       — our client tool execution time
//
// REST API is NOT RU-blocked (only the WSS endpoint is) — runs fine locally.
// Usage:  node scripts/measure-tutor-latency.mjs
import fs from 'node:fs'
import { execFileSync } from 'node:child_process'

const ENV = fs.existsSync('.env.local') ? fs.readFileSync('.env.local', 'utf8') : ''
const XI = (ENV.match(/^ELEVENLABS_API_KEY=(.*)$/m) || [])[1]?.replace(/["\r]/g, '').trim()
const AGENT = process.env.AGENT || 'agent_7701kr9c2v7eev3tabzv4f2b0e8b'
const MIN_DUR = Number(process.env.MIN_DUR || 40) // ignore <40s (aborted/test taps)
const MAX_CONV = Number(process.env.MAX_CONV || 25)
if (!XI) { console.error('No ELEVENLABS_API_KEY in .env.local'); process.exit(1) }

// Transport = curl, NOT node fetch. Cloudflare bot-management blocks node's
// undici TLS fingerprint from RU IPs with 403 (same reason the WSS endpoint is
// proxied — see lib/elevenlabs/proxy-url.ts); curl's fingerprint passes.
const base = 'https://api.elevenlabs.io/v1/convai'
const get = async (u) => {
  const out = execFileSync('curl', ['-s', '--max-time', '30', '-H', `xi-api-key: ${XI}`, u], {
    encoding: 'utf8', maxBuffer: 64 * 1024 * 1024,
  })
  return JSON.parse(out)
}

const stat = (a) => {
  if (!a.length) return null
  const s = [...a].sort((x, y) => x - y)
  const q = (p) => s[Math.min(s.length - 1, Math.floor(p * s.length))]
  const sum = s.reduce((x, y) => x + y, 0)
  const r = (x) => Math.round(x * 1000) // → ms
  return { n: s.length, median_ms: r(q(0.5)), p90_ms: r(q(0.9)), max_ms: r(s[s.length - 1]), mean_ms: r(sum / s.length) }
}

const list = await get(`${base}/conversations?agent_id=${AGENT}&page_size=100`)
const convs = (list.conversations || [])
  .filter((c) => c.status === 'done' && (c.call_duration_secs || 0) >= MIN_DUR)
  .slice(0, MAX_CONV)
console.log(`Agent ${AGENT}`)
console.log(`Conversations: ${list.conversations?.length || 0} total, ${convs.length} analyzed (status=done, ≥${MIN_DUR}s)\n`)

const agg = {}
const push = (k, v) => { if (typeof v === 'number' && isFinite(v)) (agg[k] ??= []).push(v) }
let turns = 0, toolTurns = 0, sampleShown = false
const answer = { tool: [], notool: [] } // ASR-final→first audio proxy = llm_ttf_sentence + tts_ttfb

for (const c of convs) {
  let d
  try { d = await get(`${base}/conversations/${c.conversation_id}`) } catch (e) { console.error('skip', c.conversation_id, String(e)); continue }
  for (const t of d.transcript || []) {
    const m = t.conversation_turn_metrics?.metrics
    if (!sampleShown && m) { console.log('sample metrics block:', JSON.stringify(m), '\n'); sampleShown = true }
    if (typeof t.tool_latency_secs === 'number') push('tool_latency_secs', t.tool_latency_secs)
    if (!m) continue
    turns++
    const hasTool = 'convai_llm_tool_request_generation_latency' in m
    if (hasTool) toolTurns++
    for (const [k, val] of Object.entries(m)) push(k, val?.elapsed_time)
    const ans = (m.convai_llm_service_ttf_sentence?.elapsed_time || 0) + (m.convai_tts_service_ttfb?.elapsed_time || 0)
    if (ans > 0) (hasTool ? answer.tool : answer.notool).push(ans)
  }
}

console.log(`Turns with metrics: ${turns}  (with tool call: ${toolTurns}, plain: ${turns - toolTurns})\n`)
console.log('── Per-stage latency (ms) ─────────────────────────────')
for (const k of Object.keys(agg).sort()) console.log(k.padEnd(46), stat(agg[k]))
console.log('\n── Answer time = LLM-to-first-sentence + TTS-first-byte ──')
console.log('plain turns (no tool):', stat(answer.notool))
console.log('tool turns           :', stat(answer.tool))
