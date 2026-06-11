// /opt/klassio-sber-tutor/index.mjs
// Klassio AI-репетитор «Аня» — RU-stack (Sber) voice orchestrator.
//
// Sits next to the 11labs voice-proxy on the Frankfurt box. The browser (new
// /tutor-ru route) connects here over WS instead of to 11labs. We run the full
// voice turn server-side, close to Sber (low latency):
//
//   browser mic (VAD, whole utterance, PCM16@16k)  ──▶  SaluteSpeech STT
//        ──▶  GigaChat-Pro (function-calling tool-loop + streaming-ish per-sentence)
//        ──▶  SaluteSpeech TTS (per sentence)  ──▶  browser audio queue
//
// The lesson UI is driven exactly like the 11labs version: GigaChat emits the
// SAME 9 client-tools; we relay each tool_call to the browser, which runs the
// real handler (engine.showBoard/showTask/… + pacing guards) and returns a
// result STRING; we feed that back to GigaChat as the function result. The
// guards' corrective strings («рано, держи слайд 60 сек») are what tame pacing.
//
// ── WS protocol ──────────────────────────────────────────────────────────────
// Connect:  wss://<host>/sber-tutor?sid=<sessionId>&t=<ms>&s=<hmac(sid:t)>
// browser → orchestrator:
//   {type:'init', voiceName, dynamicVariables:{child_name,lesson_title,...}}
//   <binary>                         finalized child utterance (PCM16 mono 16k)
//   {type:'tool_result', id, result} result string from a browser clientTool
//   {type:'user_text', text, trigger}  platform signal; trigger=true → Аня reacts now
//   {type:'end'}
// orchestrator → browser:
//   {type:'ready'}
//   {type:'mode', mode:'thinking'|'speaking'|'listening'}
//   {type:'transcript', role:'user'|'agent', text}
//   {type:'tool_call', id, name, args}   (browser MUST reply with tool_result)
//   {type:'audio', seq, b64}             per-sentence wav16 base64
//   {type:'agent_done'}
//   {type:'error', message}
import { WebSocketServer } from 'ws'
import { createHmac, timingSafeEqual, randomUUID } from 'node:crypto'
import { createServer } from 'node:http'
import https from 'node:https'
import { readFileSync } from 'node:fs'
import { config } from 'dotenv'

config({ path: process.env.ENV_PATH || '/opt/klassio-sber-tutor/.env' })

const PORT = Number(process.env.PORT || 3002)
const SECRET = process.env.SBER_TUTOR_HMAC_SECRET
const SALUTE_KEY = process.env.SALUTESPEECH_AUTH_KEY
const GIGA_KEY = process.env.GIGACHAT_AUTH_KEY
const GIGA_MODEL = process.env.GIGA_MODEL || 'GigaChat-Pro' // spike: Pro = best pacing discipline
const VOICE = process.env.SBER_VOICE || 'Nec_24000'
const PROMPT_PATH = process.env.TUTOR_PROMPT_PATH || '/opt/klassio-sber-tutor/tutor-prompt.md'
const TTL_MS = 5 * 60 * 1000

if (!SECRET || !SALUTE_KEY || !GIGA_KEY) {
  console.error('Need SBER_TUTOR_HMAC_SECRET + SALUTESPEECH_AUTH_KEY + GIGACHAT_AUTH_KEY in env — refusing to start')
  process.exit(1)
}

// Prompt template (vars filled per session). Strip the HTML doc-comment header.
const PROMPT_TEMPLATE = readFileSync(PROMPT_PATH, 'utf8').replace(/<!--[\s\S]*?-->/g, '').trim()

// ── Sber transport (node https + keepAlive + Russian CA) ─────────────────────
const agent = new https.Agent({ keepAlive: true, rejectUnauthorized: false, maxSockets: 32 })
function req(url, { method = 'GET', headers = {}, body = null, timeout = 45000 } = {}) {
  return new Promise((resolve, reject) => {
    const u = new URL(url)
    const r = https.request({ hostname: u.hostname, port: u.port || 443, path: u.pathname + u.search, method, headers, agent }, (res) => {
      const c = []; res.on('data', (x) => c.push(x)); res.on('end', () => resolve({ status: res.statusCode, body: Buffer.concat(c) }))
    })
    r.on('error', reject); r.setTimeout(timeout, () => r.destroy(new Error('sber timeout')))
    if (body) r.write(body); r.end()
  })
}

// ── OAuth (both scopes, 30-min tokens, refresh at 25) ────────────────────────
let salTok, gigTok, tokAt = 0
async function oauth(key, scope) {
  const r = await req('https://ngw.devices.sberbank.ru:9443/api/v2/oauth', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Accept': 'application/json', 'RqUID': randomUUID(), 'Authorization': 'Basic ' + key },
    body: 'scope=' + encodeURIComponent(scope), timeout: 20000,
  })
  if (r.status !== 200) throw new Error(`OAuth ${scope} HTTP ${r.status}: ${r.body.toString().slice(0, 160)}`)
  return JSON.parse(r.body.toString()).access_token
}
async function ensureTokens() {
  if (salTok && Date.now() - tokAt < 25 * 60 * 1000) return
  ;[salTok, gigTok] = await Promise.all([oauth(SALUTE_KEY, 'SALUTE_SPEECH_PERS'), oauth(GIGA_KEY, 'GIGACHAT_API_PERS')])
  tokAt = Date.now()
  console.log('[sber-tutor] tokens refreshed')
}

// ── STT / TTS / sentence-split (from the streaming stand) ────────────────────
async function stt(pcmBuf) {
  const r = await req('https://smartspeech.sber.ru/rest/v1/speech:recognize', {
    method: 'POST', headers: { 'Authorization': 'Bearer ' + salTok, 'Content-Type': 'audio/x-pcm;bit=16;rate=16000' }, body: pcmBuf,
  })
  try { const j = JSON.parse(r.body.toString()); return (j.result && j.result[0]) || '' } catch { return '' }
}
async function ttsB64(text, voice = VOICE) {
  const r = await req('https://smartspeech.sber.ru/rest/v1/text:synthesize?format=wav16&voice=' + voice, {
    method: 'POST', headers: { 'Authorization': 'Bearer ' + salTok, 'Content-Type': 'application/text' }, body: Buffer.from(text, 'utf8'),
  })
  if (r.status !== 200 || r.body.length < 1000) throw new Error('TTS HTTP ' + r.status)
  return r.body.toString('base64')
}
const SENT_RE = /^([\s\S]*?[.!?…]+["»”')\]]*)\s+([\s\S]*)$/
function splitSentences(text) {
  const out = []; let rest = text + ' '; let m
  while ((m = rest.match(SENT_RE))) { const s = m[1].trim(); rest = m[2]; if (s) out.push(s) }
  if (rest.trim()) out.push(rest.trim())
  return out
}

// ── GigaChat: the SAME 9 tutor tools (mirror of scripts/restore-tutor-agent-body.mjs) ──
const GIGA_FUNCTIONS = [
  { name: 'show_board', description: 'Показать на доске готовую схему урока. board: cover | etymology | bodies | solar | sunEarth | facts. Говори ПАРАЛЛЕЛЬНО, чуть медленнее. Потом убери через hide_tool.', parameters: { type: 'object', properties: { board: { type: 'string', description: 'cover | etymology | bodies | solar | sunEarth | facts' } }, required: ['board'] } },
  { name: 'next_slide', description: 'Показать СЛЕДУЮЩУЮ доску строго по порядку (cover→etymology→bodies→solar→sunEarth→facts). Первый вызов покажет обложку cover. Веди теорию через него.', parameters: { type: 'object', properties: {} } },
  { name: 'show_trainer', description: 'Показать интерактивное задание для практики. Потом убери через hide_tool.', parameters: { type: 'object', properties: { taskId: { type: 'string', description: 'ID задачи, напр. "task-1".' } }, required: ['taskId'] } },
  { name: 'hide_tool', description: 'Убрать доску/тренажёр, вернуть пустой холст. Зови ТОЛЬКО при переходе к разговору без инструментов (разогрев, пауза, прощание), НЕ между двумя инструментами.', parameters: { type: 'object', properties: {} } },
  { name: 'set_phase', description: 'Отметить переход фазы урока. phase: connecting | warmup | diagnostic | bridge | cycle | pause | summary | farewell.', parameters: { type: 'object', properties: { phase: { type: 'string', description: 'connecting | warmup | diagnostic | bridge | cycle | pause | summary | farewell' } }, required: ['phase'] } },
  { name: 'give_reward', description: 'Показать экран награды «урок пройден». Зови ТОЛЬКО в самом конце, после всех 13 заданий.', parameters: { type: 'object', properties: { label: { type: 'string', description: 'Короткая подпись, напр. "Молодец!"' } }, required: [] } },
  { name: 'take_break', description: 'Режим отдыха. active="start" начать паузу, active="stop" вернуться к уроку.', parameters: { type: 'object', properties: { active: { type: 'string', description: 'start | stop' } }, required: ['active'] } },
  { name: 'lesson_state', description: 'Узнать состояние урока (фаза, сколько решено, ошибки), если потеряла нить.', parameters: { type: 'object', properties: {} } },
  { name: 'set_child_name', description: 'Запомнить имя ребёнка для подписи реплик. Зови ОДИН раз, как только узнала имя.', parameters: { type: 'object', properties: { name: { type: 'string', description: 'Имя ребёнка, напр. "Гриша".' } }, required: ['name'] } },
]

function buildSystem(vars = {}) {
  return PROMPT_TEMPLATE.replace(/\{\{(\w+)\}\}/g, (_, k) => (vars[k] != null ? String(vars[k]) : `{{${k}}}`))
}
// Pro quota on the freemium key is prepaid and finite → on HTTP 402 we degrade
// to the base model for the rest of the process (quota is account-level).
// Pro pacing is nicer, but base + the front-end guards is fully workable
// (spike verdict). Restore Pro by paying + restarting with GIGA_MODEL.
let activeModel = GIGA_MODEL
async function gigaChat(messages, { noTools = false } = {}) {
  const call = (model) => req('https://gigachat.devices.sberbank.ru/api/v1/chat/completions', {
    method: 'POST',
    headers: { 'Authorization': 'Bearer ' + gigTok, 'Content-Type': 'application/json', 'Accept': 'application/json' },
    body: JSON.stringify({ model, messages, functions: GIGA_FUNCTIONS, function_call: noTools ? 'none' : 'auto', temperature: 0.4 }),
  })
  let r = await call(activeModel)
  if (r.status === 402 && activeModel !== 'GigaChat') {
    console.error(`[sber-tutor] ${activeModel} → HTTP 402 (квота Pro кончилась) — деградирую на GigaChat (base)`)
    activeModel = 'GigaChat'
    r = await call(activeModel)
  }
  if (r.status !== 200) throw new Error('GigaChat HTTP ' + r.status + ': ' + r.body.toString().slice(0, 200))
  return JSON.parse(r.body.toString())
}

// ── per-connection session ───────────────────────────────────────────────────
const send = (ws, obj) => { try { if (ws.readyState === 1) ws.send(JSON.stringify(obj)) } catch {} }

function callBrowserTool(session, name, args) {
  return new Promise((resolve) => {
    const id = (session.toolSeq = (session.toolSeq || 0) + 1)
    const timer = setTimeout(() => { session.pending.delete(id); resolve('OK') }, 8000) // never hang the lesson
    session.pending.set(id, (result) => { clearTimeout(timer); resolve(typeof result === 'string' && result ? result : 'OK') })
    send(session.ws, { type: 'tool_call', id, name, args })
  })
}

// Trim history but keep system[0] and never orphan a function result.
function trimHistory(session) {
  const m = session.messages
  if (m.length <= 40) return
  let start = m.length - 30
  while (start > 1 && m[start].role === 'function') start++ // don't lead with an orphan result
  session.messages = [m[0], ...m.slice(start)]
}

async function runTurn(session) {
  const ws = session.ws
  // No barge-in in v1, but DON'T drop overlapping triggers (solve-click while
  // Аня is mid-turn): queue ONE follow-up turn and run it right after.
  if (session.busy) { session.pendingTurn = true; return }
  session.busy = true
  send(ws, { type: 'mode', mode: 'thinking' })
  let finalText = ''
  try {
    await ensureTokens()
    // 8 tool-calls per turn is plenty for a legit chain (set_phase + next_slide +
    // show_trainer + state); the base model can burn ANY budget chaining calls,
    // so the cap is also a token-economy guard (each call re-sends the ~7k prompt).
    let refusalStreak = 0 // consecutive «Рано…» guard refusals — stubborn-model cutoff
    for (let step = 0; step < 8; step++) {
      const j = await gigaChat(session.messages)
      const msg = j.choices?.[0]?.message
      if (!msg) break
      session.messages.push(msg)
      const fc = msg.function_call
      if (fc && fc.name) {
        let args = fc.arguments
        if (typeof args === 'string') { try { args = JSON.parse(args) } catch { args = {} } }
        const result = await callBrowserTool(session, fc.name, args || {})
        // GigaChat REQUIRES the function result content to be a JSON string.
        session.messages.push({ role: 'function', name: fc.name, content: JSON.stringify({ result }) })
        // The base model sometimes keeps ramming the pacing guards (each refused
        // call = another full LLM round-trip ≈ 1s of felt latency). Two refusals
        // in a row → stop the loop and force a spoken reply instead.
        if (/^(Рано|Error)/.test(result)) { if (++refusalStreak >= 2) break } else refusalStreak = 0
        continue
      }
      finalText = (msg.content || '').trim() // NB: only spoken replies reach TTS; function-call junk content never does
      break
    }
    if (!finalText) {
      // The tool-loop ate the whole budget without speaking (base GigaChat loves
      // chaining calls). Force a SPOKEN wrap-up with functions disabled — Аня
      // must never end a turn mute.
      const j = await gigaChat(session.messages, { noTools: true })
      const msg = j.choices?.[0]?.message
      if (msg) { session.messages.push(msg); finalText = (msg.content || '').trim() }
    }
  } catch (e) {
    console.error('[sber-tutor] turn error:', e?.message || e)
    send(ws, { type: 'error', message: String(e?.message || e) })
  }

  if (finalText) {
    send(ws, { type: 'transcript', role: 'agent', text: finalText })
    send(ws, { type: 'mode', mode: 'speaking' })
    let seq = 0
    for (const sentence of splitSentences(finalText)) {
      try { send(ws, { type: 'audio', seq: seq++, b64: await ttsB64(sentence, session.voice) }) } catch (e) { console.error('[sber-tutor] tts:', e?.message || e) }
    }
  }
  trimHistory(session)
  send(ws, { type: 'agent_done' })
  send(ws, { type: 'mode', mode: 'listening' })
  session.busy = false
  if (session.pendingTurn && ws.readyState === 1) { session.pendingTurn = false; runTurn(session) }
}

async function handleAudio(session, pcmBuf) {
  try {
    await ensureTokens()
    const transcript = await stt(pcmBuf)
    send(session.ws, { type: 'transcript', role: 'user', text: transcript })
    session.messages.push({ role: 'user', content: transcript || '(не расслышала)' })
    await runTurn(session)
  } catch (e) {
    console.error('[sber-tutor] audio error:', e?.message || e)
    send(session.ws, { type: 'error', message: String(e?.message || e) })
    send(session.ws, { type: 'mode', mode: 'listening' })
  }
}

async function handleInit(session, { voiceName, voiceId, dynamicVariables }) {
  const name = (voiceName || 'Аня').toString()
  // Per-session SaluteSpeech voice (Nec/May/Ost — the front-end teacher picker).
  if (typeof voiceId === 'string' && /^[A-Za-z]+_(8000|24000)$/.test(voiceId)) session.voice = voiceId
  const vars = { teacher_name: name, ...(dynamicVariables || {}) }
  session.messages = [{ role: 'system', content: buildSystem(vars) }]
  const greeting = `Привет! Меня зовут ${name}. А тебя как зовут?`
  session.messages.push({ role: 'assistant', content: greeting })
  send(session.ws, { type: 'ready' })
  // speak the greeting
  send(session.ws, { type: 'transcript', role: 'agent', text: greeting })
  send(session.ws, { type: 'mode', mode: 'speaking' })
  try { await ensureTokens(); send(session.ws, { type: 'audio', seq: 0, b64: await ttsB64(greeting, session.voice) }) } catch (e) { console.error('[sber-tutor] greet tts:', e?.message || e) }
  send(session.ws, { type: 'agent_done' })
  send(session.ws, { type: 'mode', mode: 'listening' })
}

// ── HMAC upgrade auth (mirrors voice-proxy) ──────────────────────────────────
function verifySig(sid, t, s) {
  const expected = createHmac('sha256', SECRET).update(`${sid}:${t}`).digest('hex')
  if (typeof s !== 'string' || s.length !== expected.length) return false
  try { return timingSafeEqual(Buffer.from(s, 'utf8'), Buffer.from(expected, 'utf8')) } catch { return false }
}

const httpServer = createServer((req, res) => {
  if (req.url === '/healthz') {
    res.writeHead(200, { 'content-type': 'text/plain' })
    res.end(`ok\nmodel=${activeModel}${activeModel !== GIGA_MODEL ? ` (degraded from ${GIGA_MODEL})` : ''}\nconnections=${wss.clients.size}\nuptime=${Math.floor(process.uptime())}s\n`)
    return
  }
  res.writeHead(426, { 'content-type': 'text/plain', upgrade: 'websocket' }); res.end('Upgrade Required')
})

const wss = new WebSocketServer({ noServer: true, perMessageDeflate: false })

httpServer.on('upgrade', (req, socket, head) => {
  let parsed; try { parsed = new URL(req.url, 'http://x') } catch { socket.write('HTTP/1.1 400 Bad Request\r\n\r\n'); socket.destroy(); return }
  const sid = parsed.searchParams.get('sid'); const t = parsed.searchParams.get('t'); const s = parsed.searchParams.get('s')
  if (!sid || !t || !s) { socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n'); socket.destroy(); return }
  const age = Date.now() - Number(t)
  if (!Number.isFinite(age) || age < -10000 || age > TTL_MS) { socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n'); socket.destroy(); return }
  if (!verifySig(sid, t, s)) { socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n'); socket.destroy(); return }
  wss.handleUpgrade(req, socket, head, (ws) => onConnection(ws, sid))
})

function onConnection(ws, sid) {
  console.log(`[${new Date().toISOString()}] sber-tutor open sid=${sid.slice(0, 8)}…`)
  const session = { ws, sessionId: sid, messages: [], pending: new Map(), busy: false, pendingTurn: false, toolSeq: 0, voice: VOICE }
  ws.on('message', (data, isBinary) => {
    if (isBinary) { handleAudio(session, data) ; return }
    let m; try { m = JSON.parse(data.toString()) } catch { return }
    switch (m.type) {
      case 'init': handleInit(session, m); break
      case 'tool_result': { const r = session.pending.get(m.id); if (r) { session.pending.delete(m.id); r(m.result) } break }
      case 'user_text': {
        const text = (m.text || '').toString().trim(); if (!text) break
        session.messages.push({ role: 'user', content: text })
        if (m.trigger) runTurn(session) // sendUserMessage → react now; sendContextualUpdate (trigger=false) → just context
        break
      }
      case 'end': try { ws.close(1000) } catch {} ; break
    }
  })
  ws.on('close', () => { for (const r of session.pending.values()) r('OK'); session.pending.clear(); console.log(`  sber-tutor close sid=${sid.slice(0, 8)}…`) })
  ws.on('error', (e) => console.error('  sber-tutor ws err:', e.message))
}

await ensureTokens().catch((e) => { console.error('[sber-tutor] initial OAuth failed:', e?.message || e); process.exit(1) })
httpServer.listen(PORT, '127.0.0.1', () => console.log(`klassio-sber-tutor on 127.0.0.1:${PORT} · model=${GIGA_MODEL} · voice=${VOICE} · prompt ${PROMPT_TEMPLATE.length} chars`))
for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => { httpServer.close(); wss.clients.forEach((c) => c.close(1001)); setTimeout(() => process.exit(0), 800).unref() })
process.on('uncaughtException', (e) => console.error('[sber-tutor] uncaught:', e?.message || e))
