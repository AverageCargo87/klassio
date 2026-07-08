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
//   {type:'interrupt'}               barge-in: ребёнок заговорил поверх Ани → обрываем текущий ход
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
import { dirname, join } from 'node:path'
import { config } from 'dotenv'

config({ path: process.env.ENV_PATH || '/opt/klassio-sber-tutor/.env' })

const PORT = Number(process.env.PORT || 3002)
const SECRET = process.env.SBER_TUTOR_HMAC_SECRET
const SALUTE_KEY = process.env.SALUTESPEECH_AUTH_KEY
const GIGA_KEY = process.env.GIGACHAT_AUTH_KEY
const GIGA_MODEL = process.env.GIGA_MODEL || 'GigaChat-Pro' // spike: Pro = best pacing discipline
const VOICE = process.env.SBER_VOICE || 'Nec_24000'
const PROMPT_PATH = process.env.TUTOR_PROMPT_PATH || '/opt/klassio-sber-tutor/tutor-prompt.md'
// Per-lesson prompts live as tutor-prompt-<slug>.md in PROMPT_DIR (default = the
// dir of PROMPT_PATH). The browser sends lesson_slug in init → the orchestrator
// loads THAT lesson's own compact prompt; an unknown/absent slug falls back to
// PROMPT_PATH (astronomy). So ONE orchestrator serves many lessons without a
// bloated system prompt — each session sees only its lesson's content.
const PROMPT_DIR = process.env.TUTOR_PROMPT_DIR || dirname(PROMPT_PATH)
const TTL_MS = 5 * 60 * 1000

if (!SECRET || !SALUTE_KEY || !GIGA_KEY) {
  console.error('Need SBER_TUTOR_HMAC_SECRET + SALUTESPEECH_AUTH_KEY + GIGACHAT_AUTH_KEY in env — refusing to start')
  process.exit(1)
}

// Prompt templates (vars filled per session). Strip the HTML doc-comment header.
function loadPrompt(path) {
  try { return readFileSync(path, 'utf8').replace(/<!--[\s\S]*?-->/g, '').trim() } catch { return '' }
}
const DEFAULT_PROMPT = loadPrompt(PROMPT_PATH)
if (!DEFAULT_PROMPT) console.error(`[sber-tutor] WARN: default prompt ${PROMPT_PATH} empty/missing`)
const promptCache = new Map([['', DEFAULT_PROMPT]])
// Compact per-lesson prompt by slug (cached). The slug is sanitised to a safe
// filename so it can never escape PROMPT_DIR.
function getLessonPrompt(slug) {
  const key = String(slug || '').toLowerCase().replace(/[^a-z0-9_-]/g, '')
  if (promptCache.has(key)) return promptCache.get(key)
  const t = loadPrompt(join(PROMPT_DIR, `tutor-prompt-${key}.md`)) || DEFAULT_PROMPT
  promptCache.set(key, t)
  return t
}

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
  { name: 'show_board', description: 'Показать доску урока по её id. Список допустимых id и их порядок — в системном промпте текущего урока. Говори ПАРАЛЛЕЛЬНО, чуть медленнее. Потом убери через hide_tool.', parameters: { type: 'object', properties: { board: { type: 'string', description: 'id доски из системного промпта урока (первая всегда cover).' } }, required: ['board'] } },
  { name: 'next_slide', description: 'Показать СЛЕДУЮЩУЮ доску урока строго по порядку из системного промпта. Первый вызов покажет обложку (cover). Веди теорию через него, чтобы не пропустить доски.', parameters: { type: 'object', properties: {} } },
  { name: 'show_trainer', description: 'Показать интерактивное задание для практики. Потом убери через hide_tool.', parameters: { type: 'object', properties: { taskId: { type: 'string', description: 'ID задачи, напр. "task-1".' } }, required: ['taskId'] } },
  { name: 'hide_tool', description: 'Убрать доску/тренажёр, вернуть пустой холст. Зови ТОЛЬКО при переходе к разговору без инструментов (разогрев, пауза, прощание), НЕ между двумя инструментами.', parameters: { type: 'object', properties: {} } },
  { name: 'set_phase', description: 'Отметить переход фазы урока. phase: connecting | warmup | diagnostic | bridge | cycle | pause | summary | farewell.', parameters: { type: 'object', properties: { phase: { type: 'string', description: 'connecting | warmup | diagnostic | bridge | cycle | pause | summary | farewell' } }, required: ['phase'] } },
  { name: 'give_reward', description: 'Показать экран награды «урок пройден». Зови ТОЛЬКО в самом конце, после всех 13 заданий.', parameters: { type: 'object', properties: { label: { type: 'string', description: 'Короткая подпись, напр. "Молодец!"' } }, required: [] } },
  { name: 'take_break', description: 'Режим отдыха. active="start" начать паузу, active="stop" вернуться к уроку.', parameters: { type: 'object', properties: { active: { type: 'string', description: 'start | stop' } }, required: ['active'] } },
  { name: 'lesson_state', description: 'Узнать состояние урока (фаза, сколько решено, ошибки), если потеряла нить.', parameters: { type: 'object', properties: {} } },
  { name: 'set_child_name', description: 'Запомнить имя ребёнка для подписи реплик. Зови ОДИН раз, как только узнала имя.', parameters: { type: 'object', properties: { name: { type: 'string', description: 'Имя ребёнка, напр. "Гриша".' } }, required: ['name'] } },
]

function buildSystem(template, vars = {}) {
  return template.replace(/\{\{(\w+)\}\}/g, (_, k) => (vars[k] != null ? String(vars[k]) : `{{${k}}}`))
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

// ── GigaChat SSE (stream:true) — токены по мере генерации ───────────────────
// Готовые предложения уходят в onSentence ЖИВЬЁМ (их тут же синтезирует
// TTS-воркер, пока модель дописывает остальное). Function-call'ы собираются из
// дельт; junk-контент « function:\n» при finish=function_call НЕ озвучивается:
// (а) у него нет терминатора предложения, (б) явный гвард по префиксу.
function gigaChatSSEOnce(model, messages, noTools, onSentence) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({ model, messages, functions: GIGA_FUNCTIONS, function_call: noTools ? 'none' : 'auto', temperature: 0.4, stream: true })
    const u = new URL('https://gigachat.devices.sberbank.ru/api/v1/chat/completions')
    const r = https.request({
      hostname: u.hostname, port: 443, path: u.pathname, method: 'POST',
      headers: { 'Authorization': 'Bearer ' + gigTok, 'Content-Type': 'application/json', 'Accept': 'text/event-stream' }, agent,
    }, (res) => {
      if (res.statusCode !== 200) {
        const cs = []; res.on('data', (c) => cs.push(c))
        res.on('end', () => {
          const e = new Error('GigaChat HTTP ' + res.statusCode + ': ' + Buffer.concat(cs).toString().slice(0, 200))
          e.status = res.statusCode; reject(e)
        })
        return
      }
      const t0 = Date.now()
      let sseBuf = '', content = '', pend = '', firstTokenMs = null
      let fcName = '', fcArgsStr = '', fcArgsObj = null
      const JUNK_RE = /^\s*function\b/i
      res.setEncoding('utf8')
      res.on('data', (chunk) => {
        sseBuf += chunk
        let nl
        while ((nl = sseBuf.indexOf('\n')) >= 0) {
          const line = sseBuf.slice(0, nl); sseBuf = sseBuf.slice(nl + 1)
          const m = line.match(/^data:\s*(.*)$/)
          if (!m || m[1] === '[DONE]') continue
          let d
          try { d = JSON.parse(m[1])?.choices?.[0]?.delta } catch { continue }
          if (!d) continue
          if (d.function_call) {
            if (typeof d.function_call.name === 'string') fcName += d.function_call.name
            const a = d.function_call.arguments
            if (a != null) { if (typeof a === 'string') fcArgsStr += a; else fcArgsObj = a }
          }
          if (typeof d.content === 'string' && d.content) {
            if (firstTokenMs === null) firstTokenMs = Date.now() - t0
            content += d.content; pend += d.content
            if (!fcName && !JUNK_RE.test(content)) {
              const { sentences, rest } = extractStreamSentences(pend)
              pend = rest
              for (const s of sentences) onSentence(s)
            }
          }
        }
      })
      res.on('end', () => {
        const isFc = !!fcName
        if (!isFc && pend.trim() && !JUNK_RE.test(content)) onSentence(pend.trim())
        let args = fcArgsObj
        if (!args) { try { args = JSON.parse(fcArgsStr || '{}') } catch { args = {} } }
        resolve({ content: isFc ? '' : content.trim(), functionCall: isFc ? { name: fcName, arguments: args } : null, firstTokenMs })
      })
      res.on('error', reject)
    })
    r.on('error', reject)
    r.setTimeout(60000, () => r.destroy(new Error('GigaChat stream timeout')))
    r.write(body); r.end()
  })
}
// SENT_RE (выше) — то же правило границы предложения, но с остатком-фрагментом
function extractStreamSentences(buf) {
  const out = []; let rest = buf; let m
  while ((m = rest.match(SENT_RE))) { const s = m[1].trim(); rest = m[2]; if (s) out.push(s) }
  return { sentences: out, rest }
}
// 402-деградация + фолбэк на нестриминговый вызов, если стрим+functions
// у GigaChat вдруг откажет (4xx) — урок важнее красоты.
async function gigaChatStream(messages, { noTools = false } = {}, onSentence) {
  // Страховка от двойного проигрывания: e.status бывает только у до-стримовых
  // ошибок (HTTP-статус приходит раньше тела), но если предложения УЖЕ ушли в
  // синтез — никакие повторы/фолбэки в этом же ходе недопустимы.
  let pushed = 0
  const onceSentence = (s) => { pushed++; onSentence(s) }
  try {
    return await gigaChatSSEOnce(activeModel, messages, noTools, onceSentence)
  } catch (e) {
    if (pushed > 0) throw e
    if (e.status === 402 && activeModel !== 'GigaChat') {
      console.error(`[sber-tutor] ${activeModel} → HTTP 402 (квота кончилась) — деградирую на GigaChat (base)`)
      activeModel = 'GigaChat'
      return await gigaChatSSEOnce(activeModel, messages, noTools, onceSentence)
    }
    if (e.status && e.status >= 400 && e.status < 500) {
      console.error('[sber-tutor] stream → HTTP ' + e.status + ', фолбэк на нестриминговый вызов')
      const j = await gigaChat(messages, { noTools })
      const msg = j.choices?.[0]?.message || {}
      if (msg.function_call?.name) {
        let args = msg.function_call.arguments
        if (typeof args === 'string') { try { args = JSON.parse(args) } catch { args = {} } }
        return { content: '', functionCall: { name: msg.function_call.name, arguments: args || {} }, firstTokenMs: null }
      }
      const text = (msg.content || '').trim()
      if (text) for (const s of splitSentences(text)) onSentence(s)
      return { content: text, functionCall: null, firstTokenMs: null }
    }
    throw e
  }
}

// ── per-connection session ───────────────────────────────────────────────────
const send = (ws, obj) => { try { if (ws.readyState === 1) ws.send(JSON.stringify(obj)) } catch {} }

function callBrowserTool(session, name, args) {
  return new Promise((resolve) => {
    const id = (session.toolSeq = (session.toolSeq || 0) + 1)
    // Таймаут ≠ успех: фиктивный «OK» отравлял историю — модель считала, что
    // доска показана, хотя браузер молчал. Error-строка ведёт себя как отказ
    // гварда (refusalStreak) → после двух подряд Аня просто говорит голосом.
    const timer = setTimeout(() => {
      session.pending.delete(id)
      resolve('Error: браузер не ответил на инструмент за 8 секунд — считай, что показать НЕ удалось, продолжай голосом.')
    }, 8000) // never hang the lesson
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
  // Overlapping triggers (solve-click while Аня is mid-turn): queue ONE follow-up
  // turn and run it right after.
  if (session.busy) { session.pendingTurn = true; return }
  session.busy = true
  session.interrupted = false // свежий ход не считается прерванным
  send(ws, { type: 'mode', mode: 'thinking' })
  // per-turn latency breakdown → journald (сравнение с 11labs: у того answer-time ~1.3s серверных)
  const tTurn = Date.now()
  let llmMs = 0, llmSteps = 0, ttsFirstAt = null, firstSentenceAt = null
  let finalText = ''

  // TTS-воркер: дренит очередь готовых предложений ПО ПОРЯДКУ, пока LLM ещё
  // стримит остальное — «говорит, пока думает». seq растёт монотонно, браузер
  // играет чанки в порядке прихода.
  const sentenceQ = []
  const spokenParts = [] // ВЕСЬ произнесённый за ход текст (для транскрипта)
  let qEnded = false, wake = null, seq = 0
  const pushSentence = (s) => {
    if (session.interrupted) return // ребёнок перебил — больше не синтезируем
    const t = String(s || '').trim()
    if (!t) return
    spokenParts.push(t)
    if (firstSentenceAt === null) firstSentenceAt = Date.now() - tTurn
    sentenceQ.push(t)
    if (wake) { const w = wake; wake = null; w() }
  }
  const ttsWorker = (async () => {
    for (;;) {
      while (sentenceQ.length === 0 && !qEnded) await new Promise((r) => { wake = r })
      if (sentenceQ.length === 0 && qEnded) return
      const text = sentenceQ.shift()
      if (session.interrupted) continue // не шлём хвост перебитого хода в браузер
      try {
        const b64 = await ttsB64(text, session.voice)
        if (session.interrupted) continue
        if (ttsFirstAt === null) { ttsFirstAt = Date.now() - tTurn; send(ws, { type: 'mode', mode: 'speaking' }) }
        send(ws, { type: 'audio', seq: seq++, b64 })
      } catch (e) { console.error('[sber-tutor] tts:', e?.message || e) }
    }
  })()

  try {
    await ensureTokens()
    // 8 tool-calls per turn is plenty for a legit chain (set_phase + next_slide +
    // show_trainer + state); the base model can burn ANY budget chaining calls,
    // so the cap is also a token-economy guard (each call re-sends the ~7k prompt).
    let refusalStreak = 0 // consecutive «Рано…» guard refusals — stubborn-model cutoff
    for (let step = 0; step < 8; step++) {
      if (ws.readyState !== 1 || session.interrupted) break // клиент отвалился/перебил — не жжём токены
      const tLlm = Date.now()
      const r = await gigaChatStream(session.messages, {}, pushSentence)
      llmMs += Date.now() - tLlm; llmSteps++
      if (r.functionCall) {
        // arguments кладём ОБЪЕКТОМ — так их и возвращает API, и в истории
        // объектный round-trip уже проверен спайком.
        session.messages.push({ role: 'assistant', content: '', function_call: r.functionCall })
        const result = await callBrowserTool(session, r.functionCall.name, r.functionCall.arguments || {})
        // GigaChat REQUIRES the function result content to be a JSON string.
        session.messages.push({ role: 'function', name: r.functionCall.name, content: JSON.stringify({ result }) })
        // The base model sometimes keeps ramming the pacing guards (each refused
        // call = another full LLM round-trip ≈ 1s of felt latency). Two refusals
        // in a row → stop the loop and force a spoken reply instead.
        if (/^(Рано|Error)/.test(result)) { if (++refusalStreak >= 2) break } else refusalStreak = 0
        continue
      }
      finalText = r.content // предложения уже улетели в TTS по мере стрима
      break
    }
    if (!finalText && ws.readyState === 1) {
      // The tool-loop ate the whole budget without speaking (base GigaChat loves
      // chaining calls). Force a SPOKEN wrap-up with functions disabled — Аня
      // must never end a turn mute.
      const tLlm = Date.now()
      const r = await gigaChatStream(session.messages, { noTools: true }, pushSentence)
      llmMs += Date.now() - tLlm; llmSteps++
      finalText = r.content
    }
    // GigaChat-Pro иногда отвечает ОДНИМИ инструментами (записала имя через
    // set_child_name + set_phase) и молчит — даже форс-режим выше вернул пусто.
    // Для ребёнка это = «сказал фразу, а Аня не реагирует». Прямой наказ произнести
    // хоть что-то, если за весь ход не прозвучало НИ ОДНОГО предложения.
    if (firstSentenceAt === null && !session.interrupted && ws.readyState === 1) {
      session.messages.push({
        role: 'user',
        content: '[СИСТЕМА] Ты ответила только инструментами и не произнесла ни слова. Скажи ребёнку вслух прямо сейчас одну-две короткие фразы по ситуации (если только что узнала имя — тепло поздоровайся по имени; иначе просто продолжи разговор) и задай один вопрос. Инструменты сейчас НЕ вызывай.',
      })
      const tLlm2 = Date.now()
      const r2 = await gigaChatStream(session.messages, { noTools: true }, pushSentence)
      llmMs += Date.now() - tLlm2; llmSteps++
      session.messages.pop() // служебный наказ в историю не сохраняем
      if (r2.content) finalText = r2.content
    }
    if (finalText) session.messages.push({ role: 'assistant', content: finalText })
  } catch (e) {
    console.error('[sber-tutor] turn error:', e?.message || e)
    send(ws, { type: 'error', message: String(e?.message || e) })
  }

  // Пузырь в чат — ВЕСЬ произнесённый за ход текст (не только finalText). Раньше
  // слали только finalText = последний говорящий шаг; если модель говорила фразу
  // ПЕРЕД вызовом функции (напр. «Верно, молодец!» → show_trainer), та фраза
  // звучала, но в чат НЕ попадала. spokenParts копит все реплики хода по порядку.
  // Прерванный ход не пишем — ребёнок оборвал реплику, показывать нечего.
  const spokenText = spokenParts.join(' ').trim()
  if (spokenText && !session.interrupted) send(ws, { type: 'transcript', role: 'agent', text: spokenText })
  qEnded = true
  if (wake) { const w = wake; wake = null; w() }
  // воркер не должен уметь падать (per-sentence try/catch), но если упадёт —
  // ход обязан закрыться (busy=false), иначе сессия зависнет навсегда
  await ttsWorker.catch((e) => console.error('[sber-tutor] tts worker:', e?.message || e))
  console.log(
    `[turn] sid=${session.sessionId.slice(0, 8)} llm=${llmMs}ms/${llmSteps}x · 1е-предл=${firstSentenceAt ?? '—'}ms · 1й-звук=${ttsFirstAt ?? '—'}ms · всего=${Date.now() - tTurn}ms · model=${activeModel}`,
  )
  trimHistory(session)
  send(ws, { type: 'agent_done' })
  send(ws, { type: 'mode', mode: 'listening' })
  session.busy = false
  if (session.pendingTurn && ws.readyState === 1) { session.pendingTurn = false; runTurn(session) }
}

async function handleAudio(session, pcmBuf) {
  try {
    await ensureTokens()
    const tStt = Date.now()
    const transcript = await stt(pcmBuf)
    console.log(`[stt] sid=${session.sessionId.slice(0, 8)} ${Date.now() - tStt}ms · ${Math.round(pcmBuf.length / 32)}ms звука · «${transcript.slice(0, 60)}»`)
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
  // Pick THIS lesson's compact prompt by slug (browser sends lesson_slug); a
  // missing/unknown slug falls back to the default (astronomy) prompt.
  const template = getLessonPrompt(vars.lesson_slug)
  session.messages = [{ role: 'system', content: buildSystem(template, vars) }]
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
  const session = { ws, sessionId: sid, messages: [], pending: new Map(), busy: false, pendingTurn: false, interrupted: false, toolSeq: 0, voice: VOICE }
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
      // BARGE-IN: браузер сообщил, что ребёнок заговорил поверх Ани. Помечаем
      // текущий ход прерванным — TTS-воркер и tool-loop останавливаются, хвост
      // не уходит в браузер, токены не жгутся. Следующая реплика (PCM) ребёнка
      // придёт как новый ход и подхватится сразу после раскрутки прерванного.
      case 'interrupt': { if (session.busy) session.interrupted = true; break }
      case 'end': try { ws.close(1000) } catch {} ; break
    }
  })
  ws.on('close', () => { for (const r of session.pending.values()) r('Error: соединение с учеником закрыто'); session.pending.clear(); console.log(`  sber-tutor close sid=${sid.slice(0, 8)}…`) })
  ws.on('error', (e) => console.error('  sber-tutor ws err:', e.message))
}

await ensureTokens().catch((e) => { console.error('[sber-tutor] initial OAuth failed:', e?.message || e); process.exit(1) })
httpServer.listen(PORT, '127.0.0.1', () => console.log(`klassio-sber-tutor on 127.0.0.1:${PORT} · model=${GIGA_MODEL} · voice=${VOICE} · default prompt ${DEFAULT_PROMPT.length} chars · prompt dir ${PROMPT_DIR}`))
for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => { httpServer.close(); wss.clients.forEach((c) => c.close(1001)); setTimeout(() => process.exit(0), 800).unref() })
process.on('uncaughtException', (e) => console.error('[sber-tutor] uncaught:', e?.message || e))
