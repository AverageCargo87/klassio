// Локальный клик-тест Yandex: голос + LLM. Никакой консоли — открой страницу,
// вставь ключ + Folder ID, жми кнопки. Ключ живёт только в браузере/этом
// процессе (на твоей машине), в сеть уходит лишь к Яндексу. Деплой не нужен.
//
// Запускается через preview (launch.json → klassio-yandex-test) или:
//   node scripts/yandex-test-server.mjs   → http://localhost:8781
import http from 'node:http'
import fs from 'node:fs'
import crypto from 'node:crypto'
import { Readable } from 'node:stream'
import { handleMock } from './bhmock-core.mjs'   // лицо-заглушка bitHuman прямо в стенде, без ключа и без второго процесса

const PORT = process.env.PORT || 8781

// Демо-стенд не должен падать от разрыва MJPEG-стрима или чужого стрея — глушим на верхнем уровне.
process.on('uncaughtException', (e) => console.error('⚠ uncaught:', e?.message || e))
process.on('unhandledRejection', (e) => console.error('⚠ unhandledRejection:', e?.message || e))

// ── Серверный ключ Яндекса (локальное удобство: не вводить в браузере каждый раз) ──
// Приоритет: scripts/.yandex-secret.json (пишется кнопкой «Запомнить») → .env.local
// (те же имена, что у probe-скриптов: YC_API_KEY / YC_FOLDER_ID). Оба файла gitignored,
// только на этой машине; в браузер ключ не отдаётся, уходит лишь к Яндексу. Стенд НЕ деплоится.
const SECRET_FILE = 'scripts/.yandex-secret.json'
const SRV = { key: '', folder: '' }
function loadServerCreds() {
  try { for (const line of fs.readFileSync('.env.local', 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)=(.*)$/); if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].trim()
  } } catch {}
  try { const j = JSON.parse(fs.readFileSync(SECRET_FILE, 'utf8')); if (j.key) SRV.key = j.key; if (j.folder) SRV.folder = j.folder } catch {}
  if (!SRV.key) SRV.key = process.env.YC_API_KEY || process.env.YANDEX_API_KEY || ''
  if (!SRV.folder) SRV.folder = process.env.YC_FOLDER_ID || process.env.YANDEX_FOLDER_ID || 'b1gv2rjnpgt8fkveuq2f' // каталог default (из .planning, не секрет)
}
loadServerCreds()

// ── Промпт + инструменты + сценарии из живого конфига (серверная сторона) ────
// ⚠️ Конфиг остался от эпохи 11labs и нужен только старым страницам стенда. На сервере
// с витриной его нет — и раньше это роняло ВЕСЬ процесс на старте: урок не открывался
// из-за файла, к которому он не имеет отношения. Нет конфига — работаем без него.
let cfg = { conversation_config: { agent: { prompt: { prompt: '', tools: [] } } } }
try { cfg = JSON.parse(fs.readFileSync('.planning/tutor-agent-live-config-2026-06-09.json', 'utf8')) }
catch (e) { console.log('· живого конфига 11labs нет — часть старых страниц стенда будет без промпта') }
let SYSTEM = cfg.conversation_config.agent.prompt.prompt
for (const [k, v] of Object.entries({
  teacher_name: 'Аня', lesson_title: 'Мир глазами астронома', lesson_topic: 'астрономия, 4 класс',
  is_first_lesson_phrase: 'первый урок', prior_lessons_done: '0', is_first_lesson: 'да',
})) SYSTEM = SYSTEM.replaceAll(`{{${k}}}`, v)

const TOOLS = cfg.conversation_config.agent.prompt.tools.filter((t) => t.type === 'client').map((t) => {
  const props = {}
  for (const [k, v] of Object.entries(t.parameters?.properties || {})) {
    props[k] = { type: v.type, description: v.description }
    if (Array.isArray(v.enum) && v.enum) props[k].enum = v.enum
  }
  return { type: 'function', function: { name: t.name, description: t.description, parameters: { type: 'object', properties: props, required: t.parameters?.required || [] } } }
})

const A = (content) => ({ role: 'assistant', content }), U = (content) => ({ role: 'user', content })
// expect: должна вызвать один из этих tool'ов · expectNoTool: НЕ должна звать tool
// (просто разговор) · qualityOnly: не оцениваем tool, просто читаем ответ.
const SCENARIOS = [
  { name: 'Назвал имя → set_child_name', expect: ['set_child_name'],
    messages: [A('Привет! Меня зовут Аня. А тебя как зовут?'), U('Меня зовут Гриша')] },
  { name: 'Разминка: болтает, НЕ лезет к инструментам', expectNoTool: true,
    messages: [A('Привет! Меня зовут Аня. А тебя как зовут?'), U('Гриша'), A('Приятно! Как настроение, что делал после школы?'), U('Гулял с собакой, потом делал уроки')] },
  { name: 'Готов начать → сама ведёт (next_slide)', expect: ['next_slide', 'show_board', 'set_phase'],
    messages: [A('Привет! Меня зовут Аня. А тебя как зовут?'), U('Гриша'), A('Как дела?'), U('Хорошо'), A('Сегодня урок про космос — звёзды и планеты. Начнём?'), U('да')] },
  { name: 'Вопрос ребёнка → живой ответ (оцени текст)', qualityOnly: true, expect: [],
    messages: [A('Солнце — это огромная звезда.'), U('А почему Солнце такое горячее?')] },
  { name: 'Верный ответ → похвала + след. шаг', expect: ['show_trainer', 'next_slide'],
    messages: [A('Реши: какая планета третья от Солнца?'), U('[ПЛАТФОРМА] Ответ на task-5 — ПРАВИЛЬНЫЙ')] },
  { name: 'Ошибся → помогает словами, НЕ листает', expectNoTool: true,
    messages: [A('Какая планета третья от Солнца?'), U('[ПЛАТФОРМА] Ответ на task-5 — НЕВЕРНЫЙ (выбрал Марс)')] },
]

// Женские голоса-кандидаты. role необязателен; невалидные комбинации просто
// пропустятся с ошибкой. Нейросетевые (alena/dasha/julia/lera/masha/marina)
// обычно приятнее старых (oksana/nastya/tatyana_abramova) — но слушай сам.
const VOICES = [
  // v1 (проверенные тёплые женские)
  { voice: 'alena', role: 'good' }, { voice: 'alena', role: 'neutral' },
  { voice: 'jane', role: 'good' }, { voice: 'jane', role: 'neutral' },
  { voice: 'omazh', role: 'neutral' }, { voice: 'marina' }, { voice: 'oksana' },
  // v3 (новые нейросетевые — обычно приятнее; amplua где поддерживается)
  { voice: 'masha', role: 'friendly', v3: true }, { voice: 'masha', role: 'good', v3: true },
  { voice: 'dasha', v3: true }, { voice: 'julia', v3: true }, { voice: 'lera', v3: true },
]
// Цены — синхронный режим, ₽/1k, из офиц. aistudio.yandex.ru/docs/ru/ai-studio/pricing
// (снимок 2026-07-16). cacheIn = цена кэшированного входа (для повторяемого промпта).
const MODELS = [
  { label: 'YandexGPT 5 Pro', id: 'yandexgpt/latest', price: { in: 1.2, out: 1.2, cacheIn: 1.2 } },
  { label: 'YandexGPT Lite', id: 'yandexgpt-lite/latest', price: { in: 0.2, out: 0.2, cacheIn: 0.2 } },
  { label: 'DeepSeek V4 Flash', id: 'deepseek-v4-flash/latest', price: { in: 0.3, out: 0.5, cacheIn: 0.075 }, extra: { reasoning_effort: 'none' } },
  { label: 'Alice AI LLM', id: 'aliceai-llm/latest', price: { in: 0.5, out: 1.2, cacheIn: 0.5 } },
  { label: 'Alice AI LLM Flash', id: 'aliceai-llm-flash/latest', price: { in: 0.1, out: 0.2, cacheIn: 0.025 } },
  { label: 'Qwen3 235B', id: 'qwen3-235b-a22b-fp8/latest', price: { in: 0.5, out: 0.5, cacheIn: 0.5 } },
]
const LINES = 'Привет! Меня зовут Аня. А тебя как зовут?\nСмотри: астрономия — это наука о звёздах и планетах. Слово греческое: «астрон» значит звезда.\nМолодец, ты отлично справился! Давай задание чуть посложнее.'

// ── helpers ─────────────────────────────────────────────────────────────────
const readBody = (req) => new Promise((res) => { let b = ''; req.on('data', (c) => (b += c)); req.on('end', () => res(b)) })
// Сырые байты — для распознавания речи: там приходит PCM, а не текст.
const readRaw = (req) => new Promise((res) => { const c = []; req.on('data', (x) => c.push(x)); req.on('end', () => res(Buffer.concat(c))) })
const json = (r, code, o) => { r.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8' }); r.end(JSON.stringify(o)) }

// LiveKit access-token = стандартный HS256 JWT — минтим руками, SDK не нужен.
const b64u = (buf) => Buffer.from(buf).toString('base64').replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_')
function lkToken({ key, secret, identity, room, kind, attributes, grants }) {
  const now = Math.floor(Date.now() / 1000)
  const payload = {
    iss: key, sub: identity, jti: identity, nbf: now - 10, exp: now + 3600,
    video: grants || { roomJoin: true, room, canPublish: true, canSubscribe: true, canPublishData: true },
  }
  if (attributes) payload.attributes = attributes
  if (kind) payload.kind = kind
  const h = b64u(JSON.stringify({ alg: 'HS256', typ: 'JWT' }))
  const p = b64u(JSON.stringify(payload))
  const sig = b64u(crypto.createHmac('sha256', secret).update(h + '.' + p).digest())
  return h + '.' + p + '.' + sig
}

// URL раннера bitHuman (мок или боевой на VPS): нормализуем, пускаем только http(s).
function cleanBase(u) { if (!u) return null; u = String(u).trim().replace(/\/+$/, ''); return /^https?:\/\//i.test(u) ? u : null }
// выбор лица bitHuman едет к раннеру тем же параметром; пустой — не добавляем вовсе
function avatarQ(q) { const a = (q.get('avatar') || '').trim(); return a ? '?avatar=' + encodeURIComponent(a) : '' }

async function ttsSynth({ voice, role, speed, text, key, pcm }) {
  const url = 'https://tts.api.cloud.yandex.net/speech/v1/tts:synthesize'
  const headers = { Authorization: `Api-Key ${key}`, 'Content-Type': 'application/x-www-form-urlencoded' }
  const base = { text: text || LINES, lang: 'ru-RU', voice, format: pcm ? 'lpcm' : 'mp3', speed: String(speed || 1.05) }
  if (pcm) base.sampleRateHertz = '16000' // pcm_s16le 16k mono — для Anam audio passthrough
  // folderId НЕ шлём — при ключе сервис-аккаунта каталог берётся из ключа.
  // Эмоция в v1 — поле `emotion` (не `role`); её поддерживают не все голоса,
  // поэтому при ошибке повторяем БЕЗ неё, чтобы голос всё равно проиграл.
  const go = (withEmo) => {
    const body = new URLSearchParams(base)
    if (withEmo && role) body.set('emotion', role)
    return fetch(url, { method: 'POST', headers, body })
  }
  let res = await go(true)
  if (!res.ok && role) res = await go(false)
  if (!res.ok) throw new Error(`${res.status} ${(await res.text()).slice(0, 220)}`)
  return Buffer.from(await res.arrayBuffer())
}

// v3 (новые нейросетевые голоса: masha, dasha, julia, lera…). Стрим JSON-чанков.
async function ttsV3({ voice, role, speed, text, key }) {
  const hints = [{ voice }]
  if (role) hints.push({ role })
  if (speed) hints.push({ speed: Number(speed) })
  const res = await fetch('https://tts.api.cloud.yandex.net/tts/v3/utteranceSynthesis', {
    method: 'POST', headers: { Authorization: `Api-Key ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ text: text || LINES, hints, outputAudioSpec: { containerAudio: { containerAudioType: 'MP3' } }, loudnessNormalizationType: 'LUFS' }),
  })
  const raw = await res.text()
  if (!res.ok) throw new Error(`${res.status} ${raw.slice(0, 220)}`)
  let objs = []
  try { const p = JSON.parse(raw); objs = Array.isArray(p) ? p : [p] }
  catch { for (const l of raw.split('\n')) { const s = l.trim(); if (s) try { objs.push(JSON.parse(s)) } catch {} } }
  const chunks = objs.map((j) => j.result?.audioChunk?.data).filter(Boolean).map((d) => Buffer.from(d, 'base64'))
  if (!chunks.length) throw new Error('v3: пустой ответ ' + raw.slice(0, 150))
  return Buffer.concat(chunks)
}

async function llmCall({ key, folder, model, messages, extra }) {
  const t0 = Date.now()
  const res = await fetch('https://llm.api.cloud.yandex.net/v1/chat/completions', {
    method: 'POST', headers: { Authorization: `Api-Key ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: `gpt://${folder}/${model}`, messages: [{ role: 'system', content: SYSTEM }, ...messages], tools: TOOLS, tool_choice: 'auto', temperature: 0.3, max_tokens: 400, ...(extra || {}) }),
  })
  const ms = Date.now() - t0
  if (!res.ok) return { ms, error: `${res.status} ${(await res.text()).slice(0, 160)}` }
  const j = await res.json(), msg = j.choices?.[0]?.message || {}
  const calls = (msg.tool_calls || []).map((c) => `${c.function?.name}(${c.function?.arguments || ''})`)
  return { ms, calls, text: (msg.content || '').replace(/\s+/g, ' ').trim(), usage: j.usage }
}

// Свободный чат: СВОЯ система-промпт + полная история, БЕЗ инструментов (для /site).
async function llmCallRaw({ key, folder, model, system, messages, extra }) {
  const res = await fetch('https://llm.api.cloud.yandex.net/v1/chat/completions', {
    method: 'POST', headers: { Authorization: `Api-Key ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: `gpt://${folder}/${model}`, messages: [{ role: 'system', content: system || '' }, ...messages], temperature: 0.4, max_tokens: 300, ...(extra || {}) }),
  })
  if (!res.ok) return { error: `${res.status} ${(await res.text()).slice(0, 160)}` }
  const j = await res.json(), msg = j.choices?.[0]?.message || {}
  return { text: (msg.content || '').trim() }
}

// ── HTML ─────────────────────────────────────────────────────────────────────
const PAGE = `<!doctype html><meta charset=utf-8><title>Yandex тест — голос + LLM</title>
<style>
*{box-sizing:border-box}body{font:15px/1.5 -apple-system,Segoe UI,Roboto,sans-serif;max-width:1000px;margin:0 auto;padding:24px;background:#0f1216;color:#e6e9ef}
h1{font-size:20px}h2{font-size:16px;margin-top:28px;border-bottom:1px solid #2a3038;padding-bottom:6px}
input,button,textarea,select{font:inherit;color:inherit;background:#1a1f26;border:1px solid #2a3038;border-radius:8px;padding:8px 10px}
input,textarea{width:100%}label{font-size:13px;color:#9aa4b2}
button{background:#2ba39b;border:none;cursor:pointer;font-weight:600;color:#06120f}button:hover{filter:brightness(1.08)}button:disabled{opacity:.5;cursor:default}
.row{display:flex;gap:12px;flex-wrap:wrap}.row>div{flex:1;min-width:220px}
.card{background:#161b22;border:1px solid #232a33;border-radius:12px;padding:14px;margin:10px 0}
table{width:100%;border-collapse:collapse;font-size:13px}th,td{border:1px solid #232a33;padding:6px 8px;text-align:left;vertical-align:top}th{color:#9aa4b2}
.v{display:flex;align-items:center;gap:10px;margin:6px 0}.v b{width:130px}audio{height:32px}
.muted{color:#7c8798;font-size:13px}.ok{color:#41d19a}.warn{color:#e0a94b}.bad{color:#e0685b}
code{background:#1a1f26;padding:1px 5px;border-radius:4px}
</style>
<h1>🧪 Yandex тест — голос Ани + сравнение LLM</h1>
<p style="background:#241a10;border:2px solid #e0894b;border-radius:10px;padding:14px 18px;font-size:17px">
  🏛 <a href="/krit3" style="color:#8FD08A;font-weight:800;font-size:20px">УРОК §20 «НАЧАЛО ГРЕЧЕСКОЙ ЦИВИЛИЗАЦИИ» — HD (фотограмметрия + PBR) →</a><br>
  🧱 <a href="/krit2" style="color:#f2a33c;font-weight:700;font-size:16px">он же в low-poly (лёгкий, для слабых машин) →</a><br>
  <span style="color:#9aa4b2;font-size:14px">склон · Кносс · Микены · раскоп — переключаются кнопками слева вверху</span>
</p>
<p style="background:#10241d;border:1px solid #1f7a5f;border-radius:10px;padding:10px 14px">
  🧊 <a href="/hub" style="color:#e6c06a;font-weight:700">ХАБ — белое пространство симуляций (мир собирается под тему) →</a><br>
  🎥 <a href="/avatars" style="color:#4fd1c5;font-weight:700">Стенд аватаров — альтернативы Anam →</a>
  &nbsp;·&nbsp; 🤖 <a href="/klass" style="color:#4fd1c5;font-weight:700">Иммерсив-класс v2 (робот-учитель) →</a><br>
  🧑‍🏫 <a href="/teacher" style="color:#e0894b;font-weight:700">3D-учитель с липсинком (wawa-висемы, $0/мин — тест «забыть Anam») →</a><br>
  🏛 <a href="/showcase" style="color:#e0c07a;font-weight:700">Витрина для созвона — модели+Anam рядом, стоимость для нас →</a><br>
  ✍️ <a href="/tetrad" style="color:#8FD08A;font-weight:700">Тетрадь — ребёнок пишет мышкой, ИИ смотрит (OCR + жест + судья) →</a>
</p>
<p class=muted>Ключ и Folder ID хранятся только у тебя в браузере (localStorage) и уходят лишь к Яндексу. Деплой не нужен — всё локально.</p>
<div class=card>
  <div class=row>
    <div><label>API-ключ (AI Studio)</label><input id=key type=password placeholder="AQVN... / ...ZeX9AA"></div>
    <div><label>Folder ID (каталог default)</label><input id=folder placeholder="b1g..."></div>
  </div>
  <p class=muted id=warn>⚠️ Если получишь 401/403 — у ключа мало прав: создай ключ сервис-аккаунта с ролями <code>ai.languageModels.user</code> + <code>ai.speechkit-tts.user</code>.</p>
</div>

<h2>🔊 Голос Ани</h2>
<div class=card>
  <label>Текст для озвучки (можно менять)</label>
  <textarea id=ttsText rows=3>${LINES.replace(/</g, '&lt;')}</textarea>
  <div class=muted style="margin:8px 0">Скорость <input id=speed type=number value=1.05 step=0.05 min=0.5 max=2 style="width:80px"> · жми ▶ у голоса</div>
  <div id=voices></div>
</div>

<h2>🧠 Сравнение LLM (ваш промпт + function-calling)</h2>
<div class=card>
  <div id=models></div>
  <p class=muted>3 сценария, где Аня обязана вызвать инструмент. Прогон ~10–30 сек.</p>
  <button id=runLlm>Запустить сравнение</button>
  <div id=llmOut></div>
</div>

<h2>🎥 Видео-аватар: Anam vs Simli — голос Яндекс + мозг DeepSeek</h2>
<div class=card>
  <b>🛡 Защита от «сжёг токены»</b>
  <p class=muted><b>Гарантия — на сервере:</b> жёсткий потолок сессии зашит в токен (Anam <code>maxSessionLengthSeconds</code> / Simli <code>maxSessionLength</code>) — вендор сам убьёт сессию по времени, даже если браузер/ноут вырубился. Хуки в браузере (стоп при закрытии вкладки, авто-стоп по простою) — быстрый путь, НЕ гарантия.</p>
  <div class=row>
    <div><label>Жёсткий потолок сессии, сек (в токене = гарантия)</label><input id=avCap type=number value=600></div>
    <div><label>Авто-стоп по простою, сек</label><input id=avIdle type=number value=120></div>
  </div>
  <div id=billMeter style="display:none;margin-top:10px;padding:10px 12px;border-radius:10px;background:#10241d;border:1px solid #1f7a5f"></div>
  <p class=muted style="margin-bottom:0">Идёт только ОДИН аватар за раз (подключение второго отключит первый). Для теста ставь потолок 60–120 сек.</p>
</div>
<div class=row>
 <div class=card style="flex:1;min-width:300px">
  <b>Anam</b> <span class=muted>биллит ВСЮ сессию, включая простой</span>
  <div style="margin-top:6px"><label>Anam API-ключ</label><input id=anamKey type=password placeholder="ключ Anam (локально)"></div>
  <p class=muted>⚠️ Облако US/EU → для РФ-юзера иностранный хоп (задержка). Простой оплачивается — спасает только потолок сессии.</p>
  <button id=anamConnect>Подключить</button> <button id=anamDisconnect>Отключить (стоп)</button> <span id=anamStatus class=muted></span>
  <div style="margin-top:12px"><video id=anam-video autoplay playsinline style="width:100%;border-radius:12px;background:#000;aspect-ratio:1/1"></video></div>
  <div style="margin-top:10px"><input id=anamText value="Привет! Меня зовут Аня, твой репетитор. Сегодня изучаем космос — это очень интересно!"></div>
  <div style="margin-top:8px"><button id=anamSayVoice>Сказать (Яндекс)</button> <button id=anamSayBrain>DeepSeek → сказать</button></div>
 </div>
 <div class=card style="flex:1;min-width:300px">
  <b>Simli</b> <span class=muted>handleSilence:false — ЗАМОРАЖИВАет видео в тишине</span>
  <div class=row style="margin-top:6px"><div><label>Simli API-ключ</label><input id=simliKey type=password placeholder="ключ Simli (локально)"></div><div><label>faceId</label><input id=simliFace value="5fc23ea5-8175-4a82-aaaf-cdd8c88543dc"></div></div>
  <p class=muted>Дешевле (~$0.05/мин). <code>maxIdleTime</code> сам роняет сессию в тишине; <code>handleSilence:false</code> не генерит кадры в простое. faceId = твой аватар Secret Parakeet (Trinity), задеплоен в Simli Studio.</p>
  <button id=simliConnect>Подключить</button> <button id=simliDisconnect>Отключить (стоп)</button> <span id=simliStatus class=muted></span>
  <div style="margin-top:12px"><video id=simli-video autoplay playsinline style="width:100%;border-radius:12px;background:#000;aspect-ratio:1/1"></video><audio id=simli-audio autoplay></audio></div>
  <div style="margin-top:10px"><input id=simliText value="Привет! Меня зовут Аня, твой репетитор. Сегодня изучаем космос — это очень интересно!"></div>
  <div style="margin-top:8px"><button id=simliSayVoice>Сказать (Яндекс)</button> <button id=simliSayBrain>DeepSeek → сказать</button></div>
 </div>
</div>

<script>
const $=s=>document.querySelector(s)
const K=()=>$('#key').value.trim(), F=()=>$('#folder').value.trim()
for(const id of ['key','folder']){const el=$('#'+id);el.value=localStorage['yt_'+id]||'';el.oninput=()=>localStorage['yt_'+id]=el.value}
const VOICES=${JSON.stringify(VOICES)}, MODELS=${JSON.stringify(MODELS)}, SCEN=${JSON.stringify(SCENARIOS.map(s => ({ name: s.name, qualityOnly: !!s.qualityOnly, expectNoTool: !!s.expectNoTool })))}

// voices UI
$('#voices').innerHTML=VOICES.map((v,i)=>{const n=v.role?v.voice+' · '+v.role:v.voice;return \`<div class=v><b>\${n}</b><button data-i="\${i}">▶ Синтез</button><span id=va\${i}></span></div>\`}).join('')
$('#voices').onclick=async e=>{const b=e.target.closest('button');if(!b)return;const i=+b.dataset.i,v=VOICES[i];if(!K()){alert('Вставь API-ключ');return}
  b.disabled=true;$('#va'+i).textContent=' синтез…'
  try{const r=await fetch('/api/tts',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({key:K(),folder:F(),voice:v.voice,role:v.role,v3:v.v3,speed:$('#speed').value,text:$('#ttsText').value})})
    if(!r.ok){$('#va'+i).innerHTML=' <span class=bad>'+(await r.text())+'</span>';return}
    const url=URL.createObjectURL(await r.blob());$('#va'+i).innerHTML='';const a=new Audio(url);const el=document.createElement('audio');el.controls=true;el.src=url;$('#va'+i).appendChild(el);el.play()
  }catch(err){$('#va'+i).innerHTML=' <span class=bad>'+err.message+'</span>'}finally{b.disabled=false}}

// models UI
$('#models').innerHTML=MODELS.map((m,i)=>\`<label style="display:inline-block;margin:4px 12px 4px 0"><input type=checkbox data-i="\${i}" checked> \${m.label} <span class=muted>\${m.id}</span></label>\`).join('')

$('#runLlm').onclick=async()=>{if(!K()||!F()){alert('Нужны API-ключ и Folder ID');return}
  const sel=[...document.querySelectorAll('#models input:checked')].map(c=>MODELS[+c.dataset.i])
  const btn=$('#runLlm');btn.disabled=true;$('#llmOut').innerHTML='<p class=muted>Выполняется… (это ~10–30 сек)</p>'
  try{const r=await fetch('/api/llm',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({key:K(),folder:F(),models:sel})})
    const data=await r.json();if(data.error){$('#llmOut').innerHTML='<p class=bad>'+data.error+'</p>';return}
    render(data.rows,sel)
  }catch(err){$('#llmOut').innerHTML='<p class=bad>'+err.message+'</p>'}finally{btn.disabled=false}}

function render(rows,models){
  const esc=s=>(s||'').replace(/[&<>]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;'}[c]))
  const cell=r=>r.hit==='✅'?'ok':(r.hit==='ERR'||r.hit==='❌')?'bad':r.hit==='ℹ️'?'muted':'warn'
  let h='<table><tr><th>Модель</th><th>Сценарий</th><th>Оценка</th><th>Что вызвала</th><th>Ответ Ани (оцени общение)</th><th>мс</th><th>ток.</th><th>₽</th></tr>'
  for(const r of rows) h+='<tr><td>'+r.model+'</td><td>'+esc(r.sc)+'</td><td class="'+cell(r)+'">'+r.hit+'</td><td><code>'+esc(r.tool)+'</code></td><td style="max-width:360px">'+esc(r.text)+'</td><td>'+(r.ms||'')+'</td><td>'+(r.tok||'')+'</td><td>'+(r.rub??'')+'</td></tr>'
  const denom=SCEN.filter(s=>!s.qualityOnly).length
  h+='</table><h3 style="font-size:14px">Итог</h3><table><tr><th>Модель</th><th>правильно</th><th>~мс (LLM)</th><th>~₽/прогон</th></tr>'
  for(const m of models){const mine=rows.filter(r=>r.model===m.label),hits=mine.filter(r=>r.hit==='✅').length
    const avg=Math.round(mine.reduce((a,r)=>a+(r.ms||0),0)/(mine.length||1)),rub=mine.reduce((a,r)=>a+(parseFloat(r.rub)||0),0).toFixed(3)
    h+='<tr><td>'+m.label+'</td><td>'+hits+'/'+denom+'</td><td>'+avg+'</td><td>'+rub+'</td></tr>'}
  h+='</table><p class=muted>✅ верно (вызвала нужный tool ИЛИ правильно смолчала) · ⚠️ вызвала другой tool · ❌ ошибка (позвала зря / не позвала когда надо) · ℹ️ только текст — оцени сам. «мс» = задержка ТОЛЬКО LLM (без STT/TTS; в бою со стримингом ощущается меньше). Цена ~, точную смотри в консоли → Мониторинг.</p>'
  $('#llmOut').innerHTML=h
}

// ── Видео-аватары: Anam vs Simli + защита от «сжёг токены» ──
// ГАРАНТИЯ = на сервере (потолок в токене): вендор сам убьёт сессию по времени, даже если
// браузер умер/выключился. Хуки ниже (уход со вкладки, простой) — быстрый путь, НЕ гарантия.
const anamKeyEl=$('#anamKey'); anamKeyEl.value=localStorage.yt_anam||''; anamKeyEl.oninput=()=>localStorage.yt_anam=anamKeyEl.value
const simliKeyEl=$('#simliKey'); simliKeyEl.value=localStorage.yt_simli||''; simliKeyEl.oninput=()=>localStorage.yt_simli=simliKeyEl.value
let anamClient=null, anamStream=null, simliClient=null, billGuard=null

function stopBillGuard(){ if(!billGuard)return; clearInterval(billGuard.iv); clearInterval(billGuard.iv2)
  document.removeEventListener('visibilitychange',billGuard.onHide); window.removeEventListener('pagehide',billGuard.onGone); window.removeEventListener('beforeunload',billGuard.onGone)
  billGuard.el.style.display='none'; billGuard=null }
function startBillGuard(name,onStop,idleSec){ stopBillGuard()
  const t0=Date.now(), el=$('#billMeter'); el.style.display='block'
  const g={last:Date.now(),hideAt:0,el:el}
  const tick=()=>{ const sec=Math.floor((Date.now()-t0)/1000)
    const mmss=String(Math.floor(sec/60)).padStart(2,'0')+':'+String(sec%60).padStart(2,'0')
    const rate=name==='Anam'?0.14:0.05, rub=(sec/60*rate*90).toFixed(1)
    const idleLeft=Math.max(0,Math.ceil(idleSec-(Date.now()-g.last)/1000))
    el.innerHTML='🟢 '+name+' на связи · <b>'+mmss+'</b> · ~'+rub+' ₽ · авто-стоп по простою через '+idleLeft+' с'
    if((Date.now()-g.last)/1000>=idleSec) onStop('простой '+idleSec+' с') }
  g.onHide=()=>{ g.hideAt=document.hidden?Date.now():0 }
  g.onGone=()=>onStop('уход со страницы')
  document.addEventListener('visibilitychange',g.onHide)
  window.addEventListener('pagehide',g.onGone); window.addEventListener('beforeunload',g.onGone)
  g.iv=setInterval(tick,1000)
  g.iv2=setInterval(()=>{ if(g.hideAt&&Date.now()-g.hideAt>30000) onStop('вкладка скрыта >30 с') },5000)
  billGuard=g; tick() }
function bumpSpeak(){ if(billGuard)billGuard.last=Date.now() }

function anamDisconnect(reason){ try{anamClient&&anamClient.stopStreaming&&anamClient.stopStreaming()}catch(e){}
  anamClient=null; anamStream=null; const v=$('#anam-video'); if(v)v.srcObject=null
  stopBillGuard(); $('#anamStatus').textContent=' отключён — биллинг остановлен'+(reason?(' ('+reason+')'):'') }
function simliDisconnect(reason){ try{simliClient&&simliClient.close&&simliClient.close()}catch(e){}
  simliClient=null; const v=$('#simli-video'); if(v)v.srcObject=null
  stopBillGuard(); $('#simliStatus').textContent=' отключён — биллинг остановлен'+(reason?(' ('+reason+')'):'') }

$('#anamConnect').onclick=async()=>{ const ak=anamKeyEl.value.trim(); if(!ak){alert('Вставь ключ Anam');return}
  if(simliClient)simliDisconnect('переключение'); const st=$('#anamStatus'); st.textContent=' подключаю…'
  try{ const cap=Number($('#avCap').value)||600
    const tr=await fetch('/api/anam-token',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({key:ak,maxSessionLengthSeconds:cap})})
    const tj=await tr.json(); if(tj.error){st.textContent=' ошибка токена: '+tj.error;return}
    const mod=await import('https://esm.sh/@anam-ai/js-sdk')
    const createClient=mod.createClient||(mod.default&&mod.default.createClient)
    anamClient=createClient(tj.sessionToken,{disableInputAudio:true})
    await anamClient.streamToVideoElement('anam-video')
    anamStream=anamClient.createAgentAudioInputStream({encoding:'pcm_s16le',sampleRate:16000,channels:1})
    st.textContent=' ✅ на связи'; startBillGuard('Anam',anamDisconnect,Number($('#avIdle').value)||120)
  }catch(e){st.textContent=' ошибка: '+e.message} }
async function anamSpeak(text){ if(!anamClient||!anamStream){alert('Сначала подключи Anam');return}
  const st=$('#anamStatus'); st.textContent=' синтез голоса…'
  const r=await fetch('/api/tts',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({key:K(),voice:'alena',role:'good',pcm:true,text})})
  const j=await r.json(); if(j.error||!j.b64){st.textContent=' TTS ошибка: '+(j.error||'нет аудио');return}
  anamStream.sendAudioChunk(j.b64); anamStream.endSequence(); bumpSpeak(); st.textContent=' 🗣 говорит' }
$('#anamSayVoice').onclick=()=>anamSpeak($('#anamText').value)
$('#anamSayBrain').onclick=async()=>{ if(!K()||!F()){alert('Нужны ключ и Folder ID Яндекса');return}
  $('#anamStatus').textContent=' думает (DeepSeek)…'
  const r=await fetch('/api/chat',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({key:K(),folder:F(),model:'deepseek-v4-flash/latest',text:$('#anamText').value})})
  const j=await r.json(); if(j.error){$('#anamStatus').textContent=' LLM ошибка: '+j.error;return}
  $('#anamText').value=j.text||'(пусто)'; anamSpeak(j.text||'') }
$('#anamDisconnect').onclick=()=>anamDisconnect('вручную')

$('#simliConnect').onclick=async()=>{ const sk=simliKeyEl.value.trim(); if(!sk){alert('Вставь ключ Simli');return}
  if(anamClient)anamDisconnect('переключение'); const st=$('#simliStatus'); st.textContent=' подключаю…'
  try{ const cap=Number($('#avCap').value)||600, idle=Number($('#avIdle').value)||120, face=$('#simliFace').value.trim()||'5fc23ea5-8175-4a82-aaaf-cdd8c88543dc'
    // 2.0.0 = LiveKit-транспорт (как у Anam); 1.x = мёртвый WS-хендшейк api.simli.ai/StartWebRTCSession → 1006; 3.x на CDN не собирается (livekit-dep). apiKey-флоу: SDK сам минтит сессию.
    const mod=await import('https://esm.sh/simli-client@2.0.0')
    const SimliClient=mod.SimliClient||(mod.default&&mod.default.SimliClient)||mod.default
    simliClient=new SimliClient()
    simliClient.Initialize({apiKey:sk,faceID:face,handleSilence:false,maxSessionLength:cap,maxIdleTime:idle,videoRef:$('#simli-video'),audioRef:$('#simli-audio'),enableConsoleLogs:false})
    await simliClient.start()
    st.textContent=' ✅ на связи'; startBillGuard('Simli',simliDisconnect,idle)
  }catch(e){st.textContent=' ошибка: '+e.message} }
async function simliSpeak(text){ if(!simliClient){alert('Сначала подключи Simli');return}
  const st=$('#simliStatus'); st.textContent=' синтез голоса…'
  const r=await fetch('/api/tts',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({key:K(),voice:'alena',role:'good',pcm:true,text})})
  const j=await r.json(); if(j.error||!j.b64){st.textContent=' TTS ошибка: '+(j.error||'нет аудио');return}
  const bin=atob(j.b64), u8=new Uint8Array(bin.length); for(let i=0;i<bin.length;i++)u8[i]=bin.charCodeAt(i)
  for(let i=0;i<u8.length;i+=12000) simliClient.sendAudioData(u8.subarray(i,i+12000))
  bumpSpeak(); st.textContent=' 🗣 говорит' }
$('#simliSayVoice').onclick=()=>simliSpeak($('#simliText').value)
$('#simliSayBrain').onclick=async()=>{ if(!K()||!F()){alert('Нужны ключ и Folder ID Яндекса');return}
  $('#simliStatus').textContent=' думает (DeepSeek)…'
  const r=await fetch('/api/chat',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({key:K(),folder:F(),model:'deepseek-v4-flash/latest',text:$('#simliText').value})})
  const j=await r.json(); if(j.error){$('#simliStatus').textContent=' LLM ошибка: '+j.error;return}
  $('#simliText').value=j.text||'(пусто)'; simliSpeak(j.text||'') }
$('#simliDisconnect').onclick=()=>simliDisconnect('вручную')
</script>`

// ── server ────────────────────────────────────────────────────────────────
http.createServer(async (req, res) => {
  try {
    if (req.method === 'GET' && req.url === '/') { res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); return res.end(PAGE) }
    // Иммерсивный 3D-класс + Аня (Anam) — отдельная страница, тот же backend /api/*
    if (req.method === 'GET' && req.url === '/class') {
      try { const html = fs.readFileSync('.tmp/sketches/tutor/anam-class-3d.html', 'utf8'); res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); return res.end(html) }
      catch (e) { res.writeHead(500); return res.end('class demo not found: ' + e.message) }
    }
    // Урок 360: панорама Кратова + выбор 3D-персонажей + Anam на доске, зум/масштаб
    if (req.method === 'GET' && req.url === '/lesson360') {
      try { const html = fs.readFileSync('.tmp/sketches/tutor/lesson360.html', 'utf8'); res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); return res.end(html) }
      catch (e) { res.writeHead(500); return res.end('lesson360 not found: ' + e.message) }
    }
    if (req.method === 'GET' && req.url === '/pano.png') {
      try { const buf = fs.readFileSync('.tmp/sketches/tutor/pano-class-screen.png'); res.writeHead(200, { 'Content-Type': 'image/png', 'Cache-Control': 'no-cache' }); return res.end(buf) }
      catch (e) { res.writeHead(404); return res.end('no pano') }
    }
    // Сайт-версия урока: слева Anam-Аня + чат, справа доска с анимированным рисованием (дроби + столбик)
    if (req.method === 'GET' && req.url === '/site') {
      try { const html = fs.readFileSync('.tmp/sketches/tutor/site-lesson.html', 'utf8'); res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); return res.end(html) }
      catch (e) { res.writeHead(500); return res.end('site not found: ' + e.message) }
    }
    // Полный демо-урок: 3D-класс + Anam-учитель + 3D-ассистент с анимациями + свободное перемещение
    if (req.method === 'GET' && req.url === '/lesson3d') {
      try { const html = fs.readFileSync('.tmp/sketches/tutor/lesson3d.html', 'utf8'); res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); return res.end(html) }
      catch (e) { res.writeHead(500); return res.end('lesson3d not found: ' + e.message) }
    }
    // Текстуры планет для урока астрономии (из спайка space-lesson)
    {
      const pm = req.method === 'GET' && req.url.match(/^\/planets\/(sun|mercury|venus|earth|mars|jupiter|saturn|uranus|neptune|moon)\.png$/)
      if (pm) {
        try { const buf = fs.readFileSync('.tmp/spikes/space-lesson/planets/' + pm[1] + '.png'); res.writeHead(200, { 'Content-Type': 'image/png', 'Cache-Control': 'max-age=3600' }); return res.end(buf) }
        catch (e) { res.writeHead(404); return res.end('no planet') }
      }
    }
    // 3D-модель класса (Low Poly ClassRoom, Mumladze28, CC-BY) — окружение для /lesson360
    if (req.method === 'GET' && req.url === '/room.glb') {
      try { const buf = fs.readFileSync('.tmp/sketches/tutor/room-classroom.glb'); res.writeHead(200, { 'Content-Type': 'model/gltf-binary', 'Cache-Control': 'no-cache' }); return res.end(buf) }
      catch (e) { res.writeHead(404); return res.end('no room') }
    }
    // Браузерный 3D-аватар (GLB) в панораме — $0/мин, рендер на устройстве
    if (req.method === 'GET' && req.url === '/class3d') {
      try { const html = fs.readFileSync('.tmp/sketches/tutor/avatar3d-class.html', 'utf8'); res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); return res.end(html) }
      catch (e) { res.writeHead(500); return res.end('class3d demo not found: ' + e.message) }
    }
    // 3D-учитель с НАСТОЯЩИМ липсинком (wawa-lipsync висемы под яндекс-звук) — тест «можно ли забыть Anam».
    // A/B висемы↔амплитуда, idle/talk-анимации, крупный план на лицо. Всё $0/мин, рендер у клиента.
    if (req.method === 'GET' && (req.url === '/teacher' || req.url === '/lipsync')) {
      try { const html = fs.readFileSync('.tmp/sketches/tutor/teacher-lipsync.html', 'utf8'); res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' }); return res.end(html) }
      catch (e) { res.writeHead(500); return res.end('teacher-lipsync not found: ' + e.message) }
    }
    // Витрина для созвона: тосканская сцена, несколько 3D-моделей (разный липсинк) + живой Anam-экран, у каждого цена для нас.
    if (req.method === 'GET' && req.url === '/showcase') {
      try { const html = fs.readFileSync('.tmp/sketches/tutor/showcase.html', 'utf8'); res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' }); return res.end(html) }
      catch (e) { res.writeHead(500); return res.end('showcase not found: ' + e.message) }
    }
    // Стенд сравнения аватар-провайдеров (альтернативы Anam): матрица + живые плитки
    if (req.method === 'GET' && req.url === '/avatars') {
      try { const html = fs.readFileSync('.tmp/sketches/tutor/avatar-stand.html', 'utf8'); res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); return res.end(html) }
      catch (e) { res.writeHead(500); return res.end('avatar stand not found: ' + e.message) }
    }
    // ХАБ: белое пространство симуляций + сборка мира под тему урока
    if (req.method === 'GET' && (req.url === '/hub' || req.url === '/animus')) {
      try { const html = fs.readFileSync('.tmp/sketches/tutor/hub.html', 'utf8'); res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' }); return res.end(html) }
      catch (e) { res.writeHead(500); return res.end('hub not found: ' + e.message) }
    }
    // Урок §20 «Начало греческой цивилизации» — раскладка сущностей сцены 1 (каменистый склон)
    if (req.method === 'GET' && (req.url === '/krit' || req.url === '/krit-scene1')) {
      try { const html = fs.readFileSync('.tmp/sketches/tutor/krit-scene1.html', 'utf8'); res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' }); return res.end(html) }
      catch (e) { res.writeHead(500); return res.end('krit-scene1 not found: ' + e.message) }
    }
    // Тот же урок §20, сцены 2–4 (Кносс · Микены · раскоп) в одном файле с переключателем.
    // КРУГ — пол, доска, экран учителя, парта, слоты, робот — общий для всех сцен, поэтому один файл, а не три.
    if (req.method === 'GET' && (req.url === '/krit2' || req.url === '/krit-scenes')) {
      try { const html = fs.readFileSync('.tmp/sketches/tutor/krit-scenes.html', 'utf8'); res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' }); return res.end(html) }
      catch (e) { res.writeHead(500); return res.end('krit-scenes not found: ' + e.message) }
    }
    // HD-вариант тех же сцен: фотограмметрия музейных предметов + PBR-материалы + свет из панорамы.
    // Расстановка и закон пустого коридора унаследованы, подменён только слой ассетов.
    if (req.method === 'GET' && (req.url === '/krit3' || req.url === '/krit-hd')) {
      try { const html = fs.readFileSync('.tmp/sketches/tutor/krit-scenes-hd.html', 'utf8'); res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' }); return res.end(html) }
      catch (e) { res.writeHead(500); return res.end('krit-scenes-hd not found: ' + e.message) }
    }
    // ФОРМА ВТОРАЯ (02.08): урок ПО УЧЕБНИКУ — разворот листается, ИИ-учитель слева
    // сама листает, подчёркивает и выделяет то, о чём говорит. Референс — fliphtml5.
    if (req.method === 'GET' && (req.url === '/kniga' || req.url === '/uchebnik' || req.url === '/book')) {
      try { const html = fs.readFileSync('.tmp/sketches/tutor/kniga.html', 'utf8'); res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' }); return res.end(html) }
      catch (e) { res.writeHead(500); return res.end('kniga not found: ' + e.message) }
    }
    // МАКЕТ ЭКРАНА ЗАКРЕПЛЕНИЯ (05.08): после чтения страница учебника уходит, и её
    // место занимает экран разбора — по мотивам Anatomy Atelier, который прислал
    // руководитель. Отдельная страница: боевой урок /kniga не тронут.
    if (req.method === 'GET' && (req.url === '/zakrep' || req.url === '/zakreplenie')) {
      try { const html = fs.readFileSync('.tmp/sketches/tutor/zakrep.html', 'utf8'); res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' }); return res.end(html) }
      catch (e) { res.writeHead(500); return res.end('zakrep not found: ' + e.message) }
    }
    // ═══ ВИТРИНА СБОРОК (10.08) ═══════════════════════════════════════════════
    //  Руководитель заходит сам, выбирает сборку, проходит урок и оставляет замечание —
    //  вместо скриншотов в переписке. На следующий день видит «что изменилось».
    // ⚠️ Корень `/` уже занят стендом Яндекса (он выше по цепочке). Вход для
    // руководителя — `/lab`; на сервере корень перенаправляется сюда средствами nginx.
    if (req.method === 'GET' && req.url === '/lab') {
      try { const html = fs.readFileSync('.tmp/sketches/tutor/lab.html', 'utf8'); res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' }); return res.end(html) }
      catch (e) { res.writeHead(500); return res.end('lab not found: ' + e.message) }
    }
    // Чейнджлог НЕ пишется руками — он режется из журнала версий, который и так
    // заполняется при каждой нарезке. Рукописный протух бы на второй неделе.
    if (req.method === 'GET' && req.url === '/api/changelog') {
      const out = {}
      try {
        const md = fs.readFileSync('.planning/KNIGA-VERSIONS.md', 'utf8').split('\n')
        let key = null, buf = []
        const flush = () => { if (key) out[key] = buf.join('\n').trim(); buf = [] }
        for (const line of md) {
          const h = line.match(/^#{2,3}\s*\*{0,2}(v\d+\.\d+)/)
          if (h) { flush(); key = h[1]; continue }
          if (/^##\s/.test(line)) { flush(); key = null; continue }   // другой раздел журнала
          if (key) buf.push(line)
        }
        flush()
      } catch (e) { /* журнала нет — витрина просто скажет «записей нет» */ }
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' })
      return res.end(JSON.stringify(out))
    }
    // Замечания руководителя. Складываем строкой в файл: правится глазами, переживает
    // перезапуск, не требует базы. Читать — `.tmp/feedback.jsonl`.
    // Фото лежат рядом отдельными файлами: держать картинку в той же строке нельзя —
    // журнал перестанет читаться глазами, ради чего он и заведён.
    const FB = '.tmp/feedback.jsonl'
    const FOTO = '.tmp/feedback-photos'
    // ⚠️ Время — МОСКОВСКОЕ и явно: сервер витрины живёт по UTC, и в замечаниях стояло
    // на три часа раньше, чем было на часах у руководителя.
    const мск = (d) => {
      const ч = new Intl.DateTimeFormat('ru-RU', { timeZone: 'Europe/Moscow', day: '2-digit',
        month: '2-digit', hour: '2-digit', minute: '2-digit' }).formatToParts(d)
      const п = {}; for (const x of ч) п[x.type] = x.value
      return { дата: п.day + '.' + п.month, время: п.hour + ':' + п.minute }
    }
    if (req.method === 'POST' && req.url === '/api/feedback') {
      try {
        const p = JSON.parse(await readBody(req))
        const текст = String(p.текст || '').slice(0, 4000).trim()
        if (!текст) { res.writeHead(400); return res.end('пустое замечание') }
        const t = мск(new Date())
        // фото приходит data-URL'ом: страница сама ужимает его до 1600 px JPEG, поэтому
        // ни разбора multipart, ни обработки картинок на сервере не требуется
        let фото = null
        const dataUrl = String(p.фото || '')
        const m = dataUrl.match(/^data:image\/(jpeg|png|webp);base64,([A-Za-z0-9+/=]+)$/)
        if (m) {
          const байты = Buffer.from(m[2], 'base64')
          if (байты.length > 8 * 1024 * 1024) { res.writeHead(413); return res.end('фото больше 8 МБ') }
          fs.mkdirSync(FOTO, { recursive: true })
          фото = 'fb-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6) + '.' + (m[1] === 'jpeg' ? 'jpg' : m[1])
          fs.writeFileSync(FOTO + '/' + фото, байты)
        }
        const rec = { когда: t.дата + ' ' + t.время,
          версия: String(p.версия || '').slice(0, 40), место: String(p.место || '').slice(0, 120), текст }
        if (фото) rec.фото = фото
        fs.appendFileSync(FB, JSON.stringify(rec) + '\n')
        console.log('📝 замечание [' + rec.версия + (rec.место ? ' · ' + rec.место : '') + ']'
          + (фото ? ' 📷' : '') + ': ' + текст.slice(0, 90))
        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' })
        return res.end(JSON.stringify({ ok: true, фото }))
      } catch (e) { res.writeHead(500); return res.end('не сохранилось: ' + e.message) }
    }
    // Фото к замечанию. Имя проверяем белым списком: в него подставляется всё, что
    // угодно, а рядом лежат ключи Яндекса.
    const фм = req.url.match(/^\/api\/feedback-photo\/([A-Za-z0-9_.-]+)$/)
    if (req.method === 'GET' && фм && !фм[1].includes('..')) {
      try {
        const buf = fs.readFileSync(FOTO + '/' + фм[1])
        const ct = фм[1].endsWith('.png') ? 'image/png' : фм[1].endsWith('.webp') ? 'image/webp' : 'image/jpeg'
        res.writeHead(200, { 'Content-Type': ct, 'Cache-Control': 'max-age=86400' })
        return res.end(buf)
      } catch (e) { res.writeHead(404); return res.end('нет такого фото') }
    }
    if (req.method === 'GET' && req.url === '/api/feedback') {
      let list = []
      try {
        list = fs.readFileSync(FB, 'utf8').split('\n').filter(Boolean)
          .map((l) => { try { return JSON.parse(l) } catch (e) { return null } }).filter(Boolean)
          .slice(-60).reverse()
      } catch (e) { /* файла ещё нет — замечаний не было */ }
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' })
      return res.end(JSON.stringify(list))
    }

    // ПРОШЛЫЕ ВЕРСИИ УРОКА живут рядом и открываются по /kniga/vN — чтобы можно было
    // показать «было и стало» бок о бок, а не по памяти. Список — .planning/KNIGA-VERSIONS.md.
    // Свои данные у каждой версии (book/vN/), иначе правка привязок ломает прошлую сборку.
    const vm = req.method === 'GET' && req.url.match(/^\/kniga\/(v\d+)$/)
    if (vm) {
      try { const html = fs.readFileSync('.tmp/sketches/tutor/kniga-' + vm[1] + '.html', 'utf8'); res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' }); return res.end(html) }
      catch (e) { res.writeHead(404); return res.end('нет такой версии урока: ' + vm[1]) }
    }
    // Страницы учебника и координаты фраз (scripts/make-book-pages.py).
    // ⚠️ Учебник под копирайтом: файлы лежат в .tmp и наружу не деплоятся.
    // Записанный учитель: ролики по такту урока (scripts/make-teacher-clips.mjs).
    // Ребёнку это обычное видео по 100–300 КБ — ни 3D-модели, ни WebGL, ни платы за минуту.
    // ⚠️ Имена роликов сменились на clip-<хеш текста>-<подпись рендера>.mp4 — по номеру
    // такта нельзя, вставка одной реплики сдвигала бы всю нумерацию. Старый шаблон
    // beat-NN оставлен для совместимости; без clip-… урок получал 404 на каждый ролик.
    const clm = req.method === 'GET' && req.url.match(/^\/clips\/(index\.json|beat-\d{2,3}\.mp4|clip-[0-9a-f]{8}(?:-[0-9a-f]{6})?\.mp4)$/)
    if (clm) {
      const ct = clm[1].endsWith('.mp4') ? 'video/mp4' : 'application/json; charset=utf-8'
      try { const buf = fs.readFileSync('.tmp/sketches/tutor/clips/' + clm[1]); res.writeHead(200, { 'Content-Type': ct, 'Cache-Control': 'max-age=600' }); return res.end(buf) }
      catch (e) { res.writeHead(404); return res.end('нет ролика — прогони scripts/make-teacher-clips.mjs') }
    }
    // страницы учебника, координаты подсветок и ИЛЛЮСТРАЦИИ:
    // fig-* — растр, как он лежит в PDF; hi-* — он же после апскейла, его и открывают по клику
    // panel.json — привязки правой половины урока: что показать под реплику и какие
    // карточки «запомни» копить на этой странице
    // v\d+/ впереди — замороженные привязки прошлых версий урока (см. /kniga/vN выше)
    const bkm = req.method === 'GET' && req.url.match(/^\/book\/((?:v\d+\/)?(?:(?:p|fig-p|hi-p)[\w-]*\.(?:jpg|png)|marks\.json|pages\.json|blocks\.json|figures\.json|panel\.json|test\.json|zakrep\.json|drill\.json|map-greece\.svg))$/)
    if (bkm) {
      const ct = bkm[1].endsWith('.png') ? 'image/png'
        : bkm[1].endsWith('.jpg') ? 'image/jpeg'
        : bkm[1].endsWith('.svg') ? 'image/svg+xml; charset=utf-8' : 'application/json; charset=utf-8'
      try { const buf = fs.readFileSync('.tmp/sketches/tutor/book/' + bkm[1]); res.writeHead(200, { 'Content-Type': ct, 'Cache-Control': 'max-age=600' }); return res.end(buf) }
      catch (e) { res.writeHead(404); return res.end('нет страницы учебника — прогони scripts/make-book-pages.py') }
    }
    // Правки локаций урока §20: что подвинули/удалили в сцене и настройки фона.
    // Лежат отдельным файлом, поэтому переживают перегенерацию HD и не пачкают сам урок.
    if (req.method === 'GET' && req.url.startsWith('/krit-overrides.json')) {
      try { const s = fs.readFileSync('.tmp/sketches/tutor/krit-overrides.json', 'utf8')
        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }); return res.end(s) }
      catch { return json(res, 200, { board: {}, scenes: {} }) }
    }
    if (req.method === 'POST' && req.url === '/api/krit-save') {
      const body = await readBody(req)
      try {
        JSON.parse(body) // не пишем мусор
        fs.writeFileSync('.tmp/sketches/tutor/krit-overrides.json', body)
        return json(res, 200, { ok: true })
      } catch (e) { return json(res, 200, { error: 'не записалось: ' + e.message }) }
    }
    // ТЕТРАДЬ: ребёнок пишет мышкой — система смотрит (OCR-рукопись + разбор жестов + судья-LLM).
    // Стенд под режим «рабочая тетрадь»: проверяем, читается ли письмо мышью и что можно понять
    // из самой записи штрихов (обвёл/соединил/подчеркнул), не тратя денег на картинку.
    if (req.method === 'GET' && (req.url === '/tetrad' || req.url === '/pero' || req.url === '/notebook')) {
      try { const html = fs.readFileSync('.tmp/sketches/tutor/tetrad.html', 'utf8'); res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' }); return res.end(html) }
      catch (e) { res.writeHead(500); return res.end('tetrad not found: ' + e.message) }
    }
    // Лунный грунт (NASA LROC CGI Moon Kit, public domain) — текстура реголита для темы «Луна»
    if (req.method === 'GET' && req.url === '/moon.jpg') {
      try { const buf = fs.readFileSync('.tmp/spikes/space-lesson/moon_color_2k.jpg'); res.writeHead(200, { 'Content-Type': 'image/jpeg', 'Cache-Control': 'max-age=3600' }); return res.end(buf) }
      catch (e) { res.writeHead(404); return res.end('no moon') }
    }
    // Панорама звёздного неба (NASA Deep Star Map, public domain) — для темы «космос»
    if (req.method === 'GET' && req.url === '/starmap.jpg') {
      try { const buf = fs.readFileSync('.tmp/spikes/space-lesson/starmap_hd.jpg'); res.writeHead(200, { 'Content-Type': 'image/jpeg', 'Cache-Control': 'max-age=3600' }); return res.end(buf) }
      catch (e) { res.writeHead(404); return res.end('no starmap') }
    }
    // Панорама античного храма (Poly Haven «colosseum», CC0) — фон темы «Храм», ужата до 4096×2048
    if (req.method === 'GET' && req.url === '/colosseum.jpg') {
      try { const buf = fs.readFileSync('.tmp/sketches/tutor/colosseum.jpg'); res.writeHead(200, { 'Content-Type': 'image/jpeg', 'Cache-Control': 'max-age=3600' }); return res.end(buf) }
      catch (e) { res.writeHead(404); return res.end('no colosseum') }
    }
    // Статуя-плейсхолдер (Венера Милосская, Scan the World / Wikimedia, CC BY-SA) — STL, заменить на CC0
    if (req.method === 'GET' && req.url === '/venus.stl') {
      try { const buf = fs.readFileSync('.tmp/sketches/tutor/venus.stl'); res.writeHead(200, { 'Content-Type': 'model/stl', 'Cache-Control': 'max-age=3600' }); return res.end(buf) }
      catch (e) { res.writeHead(404); return res.end('no venus') }
    }
    // Фоны сцен (Poly Haven CC0, ужаты до 4096×2048): храм cliff/hall · сад drymeadow/meadow2/countrytrax · лагерь grasssunset/belfastsunset/magaliessunset
    // ⚠️ дефис в slug обязателен: panorama matala-red / sky-day / sky-evening без него отдавали 404
    const pnm = req.url.match(/^\/pano\/([a-z0-9-]+)\.jpg$/)
    if (req.method === 'GET' && pnm) {
      try { const buf = fs.readFileSync('.tmp/sketches/tutor/pano-' + pnm[1] + '.jpg'); res.writeHead(200, { 'Content-Type': 'image/jpeg', 'Cache-Control': 'max-age=3600' }); return res.end(buf) }
      catch (e) { res.writeHead(404); return res.end('no pano') }
    }
    // Музейный мрамор (Cleveland Museum of Art, CC0, без атрибуции) — бюсты, амфора, кувшин для темы «Храм»
    if (req.method === 'GET' && (req.url === '/statue-alexander.glb' || req.url === '/statue-octavia.glb' || req.url === '/amphora.glb' || req.url === '/kandila.glb')) {
      try { const buf = fs.readFileSync('.tmp/sketches/tutor' + req.url); res.writeHead(200, { 'Content-Type': 'model/gltf-binary', 'Cache-Control': 'max-age=3600' }); return res.end(buf) }
      catch (e) { res.writeHead(404); return res.end('no model') }
    }
    // Иммерсив-класс v2: одноместная 3D-комната + робот-учитель (экран-лицо, voice-light, choreo)
    if (req.method === 'GET' && (req.url === '/klass' || req.url === '/lesson-v2')) {
      try { const html = fs.readFileSync('.tmp/sketches/tutor/lesson-v2.html', 'utf8'); res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); return res.end(html) }
      catch (e) { res.writeHead(500); return res.end('lesson-v2 not found: ' + e.message) }
    }
    // Робот-учитель (Quaternius Animated Robot, CC0) — локально, RU-safe
    if (req.method === 'GET' && req.url === '/robot-q.glb') {
      try { const buf = fs.readFileSync('.tmp/sketches/tutor/robot-q.glb'); res.writeHead(200, { 'Content-Type': 'model/gltf-binary', 'Cache-Control': 'no-cache' }); return res.end(buf) }
      catch (e) { res.writeHead(404); return res.end('no robot') }
    }
    // Одноместная детская комната (Child's Bedroom, Tiff Eidmann, CC-BY) — локально
    if (req.method === 'GET' && req.url === '/room-child.glb') {
      try { const buf = fs.readFileSync('.tmp/sketches/tutor/room-childbedroom.glb'); res.writeHead(200, { 'Content-Type': 'model/gltf-binary', 'Cache-Control': 'no-cache' }); return res.end(buf) }
      catch (e) { res.writeHead(404); return res.end('no room') }
    }
    // Ассеты сцен Сад/Лагерь (poly.pizza: Google Poly CC-BY / Quaternius+Kenney CC0) — tree-*, tent-*, campfire, barrel.
    // Общий роут ПОСЛЕ явных выше (robot-q/room-child/статуи), чтобы те выигрывали; имя ограничено [a-z0-9-] (без traversal).
    const glbm = req.method === 'GET' && req.url.match(/^\/([a-z0-9-]+)\.glb$/)
    if (glbm) {
      try { const buf = fs.readFileSync('.tmp/sketches/tutor/' + glbm[1] + '.glb'); res.writeHead(200, { 'Content-Type': 'model/gltf-binary', 'Cache-Control': 'max-age=3600' }); return res.end(buf) }
      catch (e) { res.writeHead(404); return res.end('no glb') }
    }
    // PNG-ассеты сцен (спрайт-лист пламени flame-sheet.png и пр.). Явный /pano.png выше выигрывает.
    const pngm = req.method === 'GET' && req.url.match(/^\/([a-z0-9-]+)\.png$/)
    if (pngm) {
      try { const buf = fs.readFileSync('.tmp/sketches/tutor/' + pngm[1] + '.png'); res.writeHead(200, { 'Content-Type': 'image/png', 'Cache-Control': 'max-age=3600' }); return res.end(buf) }
      catch (e) { res.writeHead(404); return res.end('no png') }
    }
    // Иллюстрации к слайдам доски (art-*.jpg). Отдельно от .png: фотокартинка в PNG
    // весит вдесятеро, а на доске их полтора десятка.
    const jpgm = req.method === 'GET' && req.url.match(/^\/([a-z0-9-]+)\.jpg$/)
    if (jpgm) {
      try { const buf = fs.readFileSync('.tmp/sketches/tutor/' + jpgm[1] + '.jpg'); res.writeHead(200, { 'Content-Type': 'image/jpeg', 'Cache-Control': 'max-age=3600' }); return res.end(buf) }
      catch (e) { res.writeHead(404); return res.end('no jpg') }
    }
    // Детальные gltf-модели папками (Sketchfab CC0/CC-BY): /m/{имя}/scene.gltf + .bin + текстуры. Путь ограничен, ../ отбит.
    const mm = req.method === 'GET' && req.url.match(/^\/m\/([A-Za-z0-9_\-/.]+)$/)
    if (mm && !mm[1].includes('..')) {
      const CT = { '.gltf': 'model/gltf+json', '.bin': 'application/octet-stream', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.glb': 'model/gltf-binary' }
      const ext = (mm[1].match(/\.[a-z]+$/i) || ['.bin'])[0].toLowerCase()
      try { const buf = fs.readFileSync('.tmp/sketches/tutor/m/' + mm[1]); res.writeHead(200, { 'Content-Type': CT[ext] || 'application/octet-stream', 'Cache-Control': 'max-age=3600' }); return res.end(buf) }
      catch (e) { res.writeHead(404); return res.end('no model file') }
    }
    // Есть ли серверный ключ (чтобы браузер не спрашивал) + сохранить ключ на сервере один раз.
    if (req.method === 'GET' && req.url === '/api/config') {
      return json(res, 200, { hasKey: !!SRV.key, hasFolder: !!SRV.folder })
    }
    if (req.method === 'POST' && req.url === '/api/save-key') {
      const p = JSON.parse(await readBody(req))
      if (!p.key && !p.folder) return json(res, 200, { error: 'нечего сохранять' })
      if (p.key) SRV.key = String(p.key).trim()
      if (p.folder) SRV.folder = String(p.folder).trim()
      try { fs.writeFileSync(SECRET_FILE, JSON.stringify({ key: SRV.key, folder: SRV.folder }, null, 2)) }
      catch (e) { return json(res, 200, { error: 'не удалось записать: ' + e.message }) }
      return json(res, 200, { ok: true, hasKey: !!SRV.key, hasFolder: !!SRV.folder })
    }
    if (req.method === 'POST' && req.url === '/api/tts') {
      const p = JSON.parse(await readBody(req))
      if (!p.key) p.key = SRV.key // фолбэк на серверный ключ
      if (!p.key) return json(res, 400, { error: 'no key' })
      try {
        const buf = p.v3 ? await ttsV3(p) : await ttsSynth(p)
        if (p.pcm) return json(res, 200, { b64: buf.toString('base64') }) // для Anam
        res.writeHead(200, { 'Content-Type': 'audio/mpeg' }); return res.end(buf)
      } catch (e) { res.writeHead(502, { 'Content-Type': 'text/plain; charset=utf-8' }); return res.end(e.message) }
    }
    // ── РАСПОЗНАВАНИЕ РЕЧИ ────────────────────────────────────────────────────
    // Ребёнок должен уметь ОТВЕЧАТЬ голосом, а не только слушать. SpeechKit v1,
    // короткое аудио: до 30 с и до 1 МБ за запрос — уроку хватает с запасом.
    // Формат берём LPCM 16 кГц моно: браузер отдаёт именно его (MediaRecorder в
    // Chrome умеет только WebM, а SpeechKit его не принимает — поэтому в уроке
    // сырой PCM собирается из WebAudio вручную).
    if (req.method === 'POST' && req.url.startsWith('/api/stt')) {
      const key = SRV.key
      if (!key) return json(res, 400, { error: 'нет ключа Яндекса на сервере' })
      const buf = await readRaw(req)
      if (!buf.length) return json(res, 200, { error: 'пустая запись' })
      if (buf.length > 1024 * 1024) return json(res, 200, { error: 'запись длиннее 30 секунд' })
      const q = new URLSearchParams({ lang: 'ru-RU', format: 'lpcm', sampleRateHertz: '16000', topic: 'general' })
      if (SRV.folder) q.set('folderId', SRV.folder)
      try {
        const r = await fetch('https://stt.api.cloud.yandex.net/speech/v1/stt:recognize?' + q, {
          method: 'POST', headers: { Authorization: `Api-Key ${key}` }, body: buf,
        })
        const raw = await r.text()
        if (!r.ok) return json(res, 200, { error: `${r.status} ${raw.slice(0, 180)}` })
        let j = {}; try { j = JSON.parse(raw) } catch { }
        // секунды считаем сами: тариф SpeechKit почасовой, а плашка трат в уроке честная
        return json(res, 200, { text: (j.result || '').trim(), sec: +(buf.length / 2 / 16000).toFixed(2) })
      } catch (e) { return json(res, 200, { error: e.message }) }
    }
    // LLM для аватара/чата. Если пришёл messages[]+system — свободный чат с историей (без тулов), иначе одиночный ход.
    if (req.method === 'POST' && req.url === '/api/chat') {
      const p = JSON.parse(await readBody(req))
      if (!p.key) p.key = SRV.key; if (!p.folder) p.folder = SRV.folder // фолбэк на серверные креды
      if (!p.key || !p.folder) return json(res, 200, { error: 'нужны ключ и Folder ID' })
      if (Array.isArray(p.messages)) {
        const r = await llmCallRaw({ key: p.key, folder: p.folder, model: p.model || 'deepseek-v4-flash/latest', system: p.system, messages: p.messages, extra: p.extra || { reasoning_effort: 'none' } })
        return json(res, 200, r.error ? { error: r.error } : { text: r.text })
      }
      const r = await llmCall({ key: p.key, folder: p.folder, model: p.model || 'deepseek-v4-flash/latest', messages: [{ role: 'user', content: p.text || 'Привет' }], extra: p.extra || { reasoning_effort: 'none' } })
      return json(res, 200, r.error ? { error: r.error } : { text: r.text, calls: r.calls || [] })
    }
    // ── Тетрадь ──────────────────────────────────────────────────────────────
    // Глаза: Yandex Vision OCR. model=handwritten (рукопись) | page (печатный лист).
    // Ключ серверный, в браузер не уезжает. Возвращаем и текст, и рамки — стенд рисует,
    // что именно «увидел» ИИ, поверх тетради.
    if (req.method === 'POST' && req.url === '/api/ocr') {
      const p = JSON.parse(await readBody(req))
      if (!SRV.key) return json(res, 200, { error: 'нет ключа Яндекса на сервере' })
      if (!p.image) return json(res, 200, { error: 'нет картинки' })
      const t0 = Date.now()
      // ⚠️ Квота Vision OCR — 1 запрос в СЕКУНДУ на каталог. Авто-проверка по паузе легко
      // упирается в 429, поэтому ждём и повторяем: пользователю это видно как +секунда,
      // а не как «ошибка». В проде на класс детей одной квоты не хватит — поднимать лимит.
      const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
      try {
        let raw = '', status = 0, retried = 0
        for (let attempt = 0; attempt < 3; attempt++) {
          const r = await fetch('https://ocr.api.cloud.yandex.net/ocr/v1/recognizeText', {
            method: 'POST',
            headers: { Authorization: `Api-Key ${SRV.key}`, 'Content-Type': 'application/json', 'x-folder-id': SRV.folder, 'x-data-logging-enabled': 'true' },
            body: JSON.stringify({ mimeType: 'image/png', languageCodes: p.langs || ['ru', 'en'], model: p.model || 'handwritten', content: p.image }),
          })
          raw = await r.text(); status = r.status
          if (r.ok) break
          if (r.status !== 429) break
          retried++; await sleep(1100 * (attempt + 1))
        }
        if (status !== 200) {
          // 403 обычно = у ключа нет роли ai.vision.user; 429 = квота 1 rps исчерпана.
          const hint = status === 403 ? ' — добавь сервис-аккаунту роль ai.vision.user'
            : status === 429 ? ' — квота Vision OCR 1 запрос/сек, не помогли 3 попытки' : ''
          return json(res, 200, { error: `OCR ${status}: ${raw.slice(0, 140)}${hint}`, ms: Date.now() - t0, retried })
        }
        const ta = JSON.parse(raw).result?.textAnnotation || {}
        return json(res, 200, { ms: Date.now() - t0, retried, text: (ta.fullText || '').trim(), blocks: ta.blocks || [] })
      } catch (e) { return json(res, 200, { error: e.message, ms: Date.now() - t0 }) }
    }
    // Судья: смотрит НЕ на картинку, а на то, что увидели глаза и жест-разбор,
    // плюс на то, КАК ребёнок писал (думал/стирал). Отдаёт вердикт + фразу Ани + цену хода.
    if (req.method === 'POST' && req.url === '/api/judge') {
      const p = JSON.parse(await readBody(req))
      if (!SRV.key || !SRV.folder) return json(res, 200, { error: 'нет ключа/каталога Яндекса на сервере' })
      const m = p.metrics || {}
      const system = `Ты — Аня, тёплая учительница 4–5 класса. Ты НЕ видишь экран: тебе передали, что разглядела система.
Правила: рукопись мышкой распознаётся криво — если текст похож на верный ответ с точностью до почерка, засчитывай.
ЦЕНА ОШИБКИ НЕСИММЕТРИЧНА. Незаслуженное «неверно» из-за кривого распознавания обиднее, чем лишний переспрос.
Поэтому: если распознанное отличается от правильного ответа РОВНО НА ОДИН символ (19↔14, Кносс↔Кносc) —
это скорее сбой глаз, чем ошибка ребёнка: verdict = "не понял", и мягко попроси прочитать ответ вслух
или написать крупнее. «неверно» ставь только когда ответ отличается по сути.
ГЛАВНОЕ ПРАВИЛО ЯЗЫКА. Пол ребёнка неизвестен. В поле "anya" ЗАПРЕЩЕНЫ глаголы прошедшего времени
про ребёнка и родовые слова: нельзя «справился», «справилась», «обвёл», «обвела», «выбрал», «написала»,
«умница», «молодчина». Пиши в настоящем времени и про сам ответ:
  ✗ «Ты правильно посчитал» → ✓ «Верно, 19»
  ✗ «Ты отлично справился»  → ✓ «Отличная работа»
  ✗ «Ты обвела лишнее»      → ✓ «Пирамида и правда лишняя — это Египет»
Перед выдачей перечитай "anya": если там есть слово на -л/-ла/-лся/-лась про ребёнка — перепиши фразу.
«Молодец» и «давай проверим» — можно.
Верни СТРОГО JSON без markdown: {"verdict":"верно|почти|неверно|не понял","why":"одна короткая строка для разработчика","anya":"1–2 тёплые фразы ребёнку, без emoji, без сюсюканья"}`
      const user = `Задание: ${p.task}
Правильный ответ: ${p.expect}
Тип: ${p.kind === 'gesture' ? 'жест по карточкам' : p.kind === 'draw' ? 'свободный рисунок' : 'написать от руки'}
Распознано с рукописи (OCR): «${p.ocr || '(пусто)'}»
Разбор штрихов: ${p.gesture || '—'}${p.gestureOk === null || p.gestureOk === undefined ? '' : ` (жест ${p.gestureOk ? 'верный' : 'неверный'})`}
Как писал: думал ${((m.thinkMs || 0) / 1000).toFixed(1)} с, писал ${((m.writeMs || 0) / 1000).toFixed(1)} с, штрихов ${m.strokes || 0}, стираний ${m.erases || 0}, отмен ${m.undos || 0}, пауз ${m.pauses || 0}`
      const t0 = Date.now()
      try {
        const r = await fetch('https://llm.api.cloud.yandex.net/v1/chat/completions', {
          method: 'POST', headers: { Authorization: `Api-Key ${SRV.key}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ model: `gpt://${SRV.folder}/deepseek-v4-flash/latest`, reasoning_effort: 'none', temperature: 0.3, max_tokens: 300,
            messages: [{ role: 'system', content: system }, { role: 'user', content: user }] }),
        })
        const raw = await r.text()
        if (!r.ok) return json(res, 200, { error: `судья ${r.status}: ${raw.slice(0, 160)}`, ms: Date.now() - t0 })
        const j = JSON.parse(raw), txt = (j.choices?.[0]?.message?.content || '').trim()
        let out = {}
        try { out = JSON.parse(txt.replace(/^```(json)?|```$/g, '').trim()) }
        catch { out = { verdict: 'не понял', why: 'судья ответил не JSON', anya: txt.slice(0, 200) } }
        const u = j.usage || {}
        // DeepSeek V4 Flash, синхронный режим: 0.3 ₽/1k вход, 0.5 ₽/1k выход (прайс AI Studio 07.2026)
        let rub = ((u.prompt_tokens || 0) * 0.3 + (u.completion_tokens || 0) * 0.5) / 1000
        // Ремонт рода. Промпт сбивает «ты справился» с ~100% до ~17%, но не до нуля,
        // а показывать девочке «ты обвёл» нельзя. Дешевле один короткий доп-ход, чем риск.
        // ⚠️ \b в JS не видит кириллицу — границы слова задаём явно.
        const GEND = /(?:^|[^а-яёa-z])ты(?:\s+[а-яё]+){0,2}\s+[а-яё]{2,}(?:лся|лась|ла|л)(?![а-яё])/i
        let repaired = false
        if (out.anya && GEND.test(out.anya)) {
          repaired = true
          const rr = await fetch('https://llm.api.cloud.yandex.net/v1/chat/completions', {
            method: 'POST', headers: { Authorization: `Api-Key ${SRV.key}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ model: `gpt://${SRV.folder}/deepseek-v4-flash/latest`, reasoning_effort: 'none', temperature: 0.2, max_tokens: 120,
              messages: [{ role: 'system', content: 'Перепиши фразу учительницы так, чтобы в ней НЕ БЫЛО глаголов прошедшего времени и родовых слов про ребёнка («обвёл», «справилась», «написал»). Смысл и теплоту сохрани, длину не увеличивай. Ответь ТОЛЬКО новой фразой, без кавычек.' },
                { role: 'user', content: out.anya }] }),
          })
          if (rr.ok) {
            const rj = await rr.json(), fixed = (rj.choices?.[0]?.message?.content || '').trim()
            const ru = rj.usage || {}
            rub += ((ru.prompt_tokens || 0) * 0.3 + (ru.completion_tokens || 0) * 0.5) / 1000
            if (fixed && !GEND.test(fixed)) out.anya = fixed
            else out.anya = out.verdict === 'верно' ? 'Верно! Отличная работа.' : 'Давай посмотрим ещё раз вместе.'
          } else out.anya = out.verdict === 'верно' ? 'Верно! Отличная работа.' : 'Давай посмотрим ещё раз вместе.'
        }
        return json(res, 200, { ...out, ms: Date.now() - t0, usage: u, rub, repaired })
      } catch (e) { return json(res, 200, { error: e.message, ms: Date.now() - t0 }) }
    }
    // Копилка почерка: сохраняем запись штрихов с таймингами локально, чтобы потом
    // гонять по ней распознавание пачкой, без человека у мышки.
    if (req.method === 'POST' && req.url === '/api/tetrad-save') {
      const body = await readBody(req)
      try {
        fs.mkdirSync('.tmp/tetrad-samples', { recursive: true })
        const p = JSON.parse(body)
        const stem = `${new Date().toISOString().replace(/[:.]/g, '-')}-${String(p.task || 'x').replace(/[^a-z0-9-]/gi, '')}`
        const png = p.png; delete p.png // картинку кладём рядом файлом, а не в json
        fs.writeFileSync('.tmp/tetrad-samples/' + stem + '.json', JSON.stringify(p, null, 1))
        if (png) fs.writeFileSync('.tmp/tetrad-samples/' + stem + '.png', Buffer.from(String(png).split(',').pop(), 'base64'))
        return json(res, 200, { ok: true, file: stem + (png ? '.json + .png' : '.json') })
      } catch (e) { return json(res, 200, { error: 'не записалось: ' + e.message }) }
    }
    // Сессия-токен Anam (ключ Anam отдельный, идёт в запросе; не хранится).
    if (req.method === 'POST' && req.url === '/api/anam-token') {
      const p = JSON.parse(await readBody(req))
      if (!p.key) return json(res, 200, { error: 'нет ключа Anam' })
      const CARA = '30fa96d0-26c4-4e55-94a0-517025942e18'
      const avatarId = p.avatarId || CARA // Cara (сток) — по умолчанию
      const maxLen = Number(p.maxSessionLengthSeconds) || 600 // ЖЁСТКИЙ ПОТОЛОК в токене: Anam сам убьёт сессию через N сек, даже если вкладку/ноут вырубили. Это и есть «гарантия».
      // avatarModel = модель рендера (cara-4/cara-3/…); ЛИЦО задаёт avatarId. Поле опционально:
      // Cara → 'cara-4' (проверено, не регрессим корневую страницу), иное лицо → дефолт аватара (не шлём).
      const avatarModel = p.avatarModel || (avatarId === CARA ? 'cara-4' : null)
      const persona = { avatarId, enableAudioPassthrough: true, maxSessionLengthSeconds: maxLen }
      if (avatarModel) persona.avatarModel = String(avatarModel)
      const r = await fetch('https://api.anam.ai/v1/auth/session-token', {
        method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${p.key}` },
        body: JSON.stringify({ personaConfig: persona }),
      })
      const t = await r.text()
      if (!r.ok) return json(res, 200, { error: `${r.status} ${t.slice(0, 200)}` })
      try { const j = JSON.parse(t); return json(res, 200, { sessionToken: j.sessionToken || j.token || j }) } catch { return json(res, 200, { sessionToken: t }) }
    }
    // Список аватаров аккаунта Anam (для дропдауна «другие лица»). Ключ в теле, не хранится.
    if (req.method === 'POST' && req.url === '/api/anam-avatars') {
      const p = JSON.parse(await readBody(req))
      if (!p.key) return json(res, 200, { error: 'нет ключа Anam' })
      try {
        const r = await fetch('https://api.anam.ai/v1/avatars?perPage=100', { headers: { Authorization: `Bearer ${p.key}` } })
        const t = await r.text()
        if (!r.ok) return json(res, 200, { error: `${r.status} ${t.slice(0, 200)}` })
        let j; try { j = JSON.parse(t) } catch { return json(res, 200, { error: 'непарсибельный ответ' }) }
        const list = Array.isArray(j) ? j : (j.data || j.avatars || [])
        const avatars = list.map((a) => ({ id: a.id || a.avatarId, name: a.name || a.label || a.displayName || a.id, avatarModel: a.avatarModel || a.model || null })).filter((a) => a.id)
        return json(res, 200, { avatars })
      } catch (e) { return json(res, 200, { error: e.message }) }
    }
    // Сессия-токен HeyGen Streaming/LiveAvatar. Ключ HeyGen отдельный, идёт в запросе (не хранится).
    // Free-tier без карты → первый тест РФ-доступности realtime-видео из Российской сети.
    if (req.method === 'POST' && req.url === '/api/heygen-token') {
      const p = JSON.parse(await readBody(req))
      if (!p.key) return json(res, 200, { error: 'нет ключа HeyGen' })
      try {
        const r = await fetch('https://api.heygen.com/v1/streaming.create_token', {
          method: 'POST', headers: { 'Content-Type': 'application/json', 'x-api-key': p.key },
        })
        const t = await r.text()
        if (!r.ok) return json(res, 200, { error: `${r.status} ${t.slice(0, 200)}` })
        try { const j = JSON.parse(t); return json(res, 200, { token: j?.data?.token || j?.token || j }) }
        catch { return json(res, 200, { token: t }) }
      } catch (e) { return json(res, 200, { error: e.message }) }
    }
    // ── Tavus CVI: создать разговор (их пайплайн, русский через language) → iframe conversation_url ──
    // Проверено по live openapi.yaml 2026-07-19: face_id достаточно (Anna = r90bbd427f71). Кэп биллинга в properties.
    if (req.method === 'POST' && req.url === '/api/tavus-conversation') {
      const p = JSON.parse(await readBody(req))
      if (!p.key) return json(res, 200, { error: 'нет ключа Tavus' })
      const body = {
        face_id: p.faceId || 'r90bbd427f71',
        conversation_name: 'klassio-stand-test',
        conversational_context: p.context || 'Ты — Аня, тёплый репетитор для ребёнка 9 лет. Говори по-русски, коротко и дружелюбно.',
        custom_greeting: p.greeting || 'Привет! Я Аня. Слышишь меня хорошо?',
        properties: {
          language: 'russian',
          max_call_duration: Number(p.capSec) || 600,      // жёсткий потолок — Tavus сам закроет
          participant_left_timeout: 0,                      // ушёл из комнаты → комната закрывается сразу
          participant_absent_timeout: 120,                  // никто не зашёл 2 мин → закрыть
        },
      }
      if (p.testMode) body.test_mode = true
      const r = await fetch('https://tavusapi.com/v2/conversations', {
        method: 'POST', headers: { 'Content-Type': 'application/json', 'x-api-key': p.key }, body: JSON.stringify(body),
      })
      const t = await r.text()
      if (!r.ok) return json(res, 200, { error: `${r.status} ${t.slice(0, 300)}` })
      try { const j = JSON.parse(t); return json(res, 200, { url: j.conversation_url, id: j.conversation_id, status: j.status }) }
      catch { return json(res, 200, { error: 'непарсибельный ответ: ' + t.slice(0, 200) }) }
    }
    if (req.method === 'POST' && req.url === '/api/tavus-end') {
      const p = JSON.parse(await readBody(req))
      if (!p.key || !p.id) return json(res, 200, { error: 'нужны key и id' })
      const r = await fetch(`https://tavusapi.com/v2/conversations/${p.id}/end`, { method: 'POST', headers: { 'x-api-key': p.key } })
      return json(res, 200, r.ok ? { ok: true } : { error: `${r.status} ${(await r.text()).slice(0, 200)}` })
    }
    // ── D-ID: узкий прокси Talks Streams (create/sdp/ice/talk/delete). Auth = "Basic <ключ как есть>". ──
    if (req.method === 'POST' && req.url === '/api/did') {
      const p = JSON.parse(await readBody(req))
      if (!p.key) return json(res, 200, { error: 'нет ключа D-ID' })
      if (!/^\/talks\/streams/.test(p.path || '')) return json(res, 200, { error: 'путь не разрешён' })
      const r = await fetch('https://api.d-id.com' + p.path, {
        method: p.method || 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Basic ${p.key}` },
        body: p.body ? JSON.stringify(p.body) : undefined,
      })
      const t = await r.text()
      if (!r.ok) return json(res, 200, { error: `${r.status} ${t.slice(0, 300)}` })
      try { return json(res, 200, JSON.parse(t)) } catch { return json(res, 200, { ok: true, raw: t.slice(0, 200) }) }
    }
    // ── LiveKit: минт токена (для нас и для bey-воркера) + убийство комнаты (kill-switch bey) ──
    if (req.method === 'POST' && req.url === '/api/livekit-token') {
      const p = JSON.parse(await readBody(req))
      if (!p.key || !p.secret || !p.room || !p.identity) return json(res, 200, { error: 'нужны key/secret/room/identity' })
      return json(res, 200, { token: lkToken({ key: p.key, secret: p.secret, identity: p.identity, room: p.room, kind: p.kind, attributes: p.attributes }) })
    }
    if (req.method === 'POST' && req.url === '/api/livekit-delete-room') {
      const p = JSON.parse(await readBody(req))
      if (!p.url || !p.key || !p.secret || !p.room) return json(res, 200, { error: 'нужны url/key/secret/room' })
      const admin = lkToken({ key: p.key, secret: p.secret, identity: 'stand-admin', room: p.room, grants: { roomCreate: true, roomAdmin: true, room: p.room } })
      const base = p.url.replace(/^wss:/, 'https:').replace(/\/$/, '')
      const r = await fetch(base + '/twirp/livekit.RoomService/DeleteRoom', {
        method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${admin}` }, body: JSON.stringify({ room: p.room }),
      })
      return json(res, 200, r.ok ? { ok: true } : { error: `${r.status} ${(await r.text()).slice(0, 200)}` })
    }
    // ── Мок bitHuman ПРЯМО ЗДЕСЬ: /api/bhmock/{health,avatars,stream,push} ──
    // Тот же движок, что у отдельного scripts/bithuman-mock.mjs, только процесс поднимать
    // не надо. Урок берёт его источником по умолчанию, поэтому «выбрал ВИДЕО · bitHuman —
    // а на экране пусто» больше не случается: лицо-заглушка есть всегда.
    if (req.url.startsWith('/api/bhmock/')) {
      const u = new URL(req.url, 'http://x')
      if (handleMock(req, res, u.pathname.slice('/api/bhmock/'.length), u.searchParams)) return
      return json(res, 404, { error: 'bhmock: нет такого метода' })
    }
    // ── bitHuman: прокси к раннеру (scripts/bithuman-runner.py или мок bithuman-mock.mjs). ──
    // Видео идёт MJPEG'ом, звук — PCM'ом. Проксируем ЧЕРЕЗ нас, чтобы браузеру всё было
    // с одного origin (нет CORS, канвас не «протухает» → текстуру можно грузить в WebGL).
    // ⚠️ avatar пробрасываем как есть: у раннера с несколькими .imx это выбор лица.
    if (req.method === 'GET' && req.url.startsWith('/api/bithuman-health')) {
      const q = new URL(req.url, 'http://x').searchParams
      const base = cleanBase(q.get('base'))
      if (!base) return json(res, 400, { error: 'нужен base' })
      try { const r = await fetch(base + '/health' + avatarQ(q)); const t = await r.text(); try { return json(res, 200, JSON.parse(t)) } catch { return json(res, 200, { ok: r.ok }) } }
      catch (e) { return json(res, 200, { ok: false, error: e.message }) }
    }
    // Список лиц раннера — для выпадашки «кто в кадре». Раннер постарше метода не знает:
    // это не ошибка стенда, просто выбора у него нет.
    if (req.method === 'GET' && req.url.startsWith('/api/bithuman-avatars')) {
      const base = cleanBase(new URL(req.url, 'http://x').searchParams.get('base'))
      if (!base) return json(res, 400, { error: 'нужен base' })
      try { const r = await fetch(base + '/avatars')
        if (!r.ok) return json(res, 200, { avatars: [], error: 'раннер без выбора лиц (' + r.status + ')' })
        const j = JSON.parse(await r.text()); return json(res, 200, { avatars: j.avatars || [] })
      } catch (e) { return json(res, 200, { avatars: [], error: e.message }) }
    }
    if (req.method === 'GET' && req.url.startsWith('/api/bithuman-stream')) {
      const q = new URL(req.url, 'http://x').searchParams
      const base = cleanBase(q.get('base'))
      if (!base) return json(res, 400, { error: 'нужен base' })
      const ac = new AbortController()
      let up
      try { up = await fetch(base + '/stream' + avatarQ(q), { signal: ac.signal }) }
      catch (e) { return json(res, 502, { error: 'раннер недоступен: ' + e.message }) }
      if (!up.ok || !up.body) return json(res, 502, { error: 'раннер /stream: ' + up.status })
      res.writeHead(200, { 'Content-Type': up.headers.get('content-type') || 'multipart/x-mixed-replace; boundary=frame', 'Cache-Control': 'no-store' })
      const pipe = Readable.fromWeb(up.body)
      pipe.on('error', () => { try { res.destroy() } catch {} })          // раннер/сеть отвалились — не роняем сервер
      const shut = () => { try { ac.abort() } catch {}; try { pipe.destroy() } catch {} }
      req.on('close', shut); res.on('close', shut)                        // клиент ушёл → рвём upstream
      pipe.pipe(res)
      return
    }
    if (req.method === 'POST' && req.url === '/api/bithuman-push') {
      const p = JSON.parse(await readBody(req))
      const base = cleanBase(p.base); if (!base) return json(res, 400, { error: 'нужен base' })
      if (!p.b64) return json(res, 400, { error: 'нет аудио' })
      try {
        const r = await fetch(base + '/push', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ b64: p.b64, last: p.last !== false }) })
        const t = await r.text(); if (!r.ok) return json(res, 502, { error: `${r.status} ${t.slice(0, 200)}` })
        try { return json(res, 200, JSON.parse(t)) } catch { return json(res, 200, { ok: true }) }
      } catch (e) { return json(res, 502, { error: 'раннер недоступен: ' + e.message }) }
    }
    // ── Beyond Presence: создать S2V-сессию (bey-воркер приходит в НАШУ LiveKit-комнату) ──
    // Плагины бьют в /v1/session {avatar_id, livekit_url, livekit_token}; docs — /v1/sessions. Пробуем оба.
    if (req.method === 'POST' && req.url === '/api/bey-session') {
      const p = JSON.parse(await readBody(req))
      if (!p.key || !p.livekitUrl || !p.livekitToken) return json(res, 200, { error: 'нужны key/livekitUrl/livekitToken' })
      const avatarId = p.avatarId || '694c83e2-8895-4a98-bd16-56332ca3f449' // Nelly (сток)
      const hdrs = { 'Content-Type': 'application/json', 'x-api-key': p.key }
      let r = await fetch('https://api.bey.dev/v1/session', {
        method: 'POST', headers: hdrs,
        body: JSON.stringify({ avatar_id: avatarId, livekit_url: p.livekitUrl, livekit_token: p.livekitToken }),
      })
      if (!r.ok && (r.status === 404 || r.status === 405)) {
        r = await fetch('https://api.bey.dev/v1/sessions', {
          method: 'POST', headers: hdrs,
          body: JSON.stringify({ avatar_id: avatarId, transport: 'livekit', url: p.livekitUrl, token: p.livekitToken }),
        })
      }
      const t = await r.text()
      if (!r.ok) return json(res, 200, { error: `${r.status} ${t.slice(0, 300)}` })
      try { return json(res, 200, JSON.parse(t)) } catch { return json(res, 200, { ok: true }) }
    }
    // Сессия-токен Simli (BYO-audio, PCM16 — как у нас с Anam-passthrough). Ключевое отличие от Anam:
    //  · handleSilence:false → сервер ЗАМОРАЖИВАет видео в тишине (не генерит кадры ⇒ не жжёт «минуты вывода»).
    //  · maxSessionLength = жёсткий потолок (гарантия). maxIdleTime = сам роняет сессию в простое.
    if (req.method === 'POST' && req.url === '/api/simli-token') {
      const p = JSON.parse(await readBody(req))
      if (!p.key) return json(res, 200, { error: 'нет ключа Simli' })
      const body = {
        faceId: p.faceId || '5fc23ea5-8175-4a82-aaaf-cdd8c88543dc', apiVersion: 'v2',
        handleSilence: false, audioInputFormat: 'pcm16',
        maxSessionLength: Number(p.maxSessionLength) || 600,
        maxIdleTime: Number(p.maxIdleTime) || 120,
      }
      const r = await fetch('https://api.simli.ai/compose/token', {
        method: 'POST', headers: { 'Content-Type': 'application/json', 'x-simli-api-key': p.key },
        body: JSON.stringify(body),
      })
      const t = await r.text()
      if (!r.ok) return json(res, 200, { error: `${r.status} ${t.slice(0, 200)}` })
      try { const j = JSON.parse(t); return json(res, 200, { session_token: j.session_token || j.sessionToken || j }) } catch { return json(res, 200, { session_token: t }) }
    }
    if (req.method === 'POST' && req.url === '/api/llm') {
      const p = JSON.parse(await readBody(req))
      if (!p.key) p.key = SRV.key; if (!p.folder) p.folder = SRV.folder // фолбэк на серверные креды
      if (!p.key || !p.folder) return json(res, 200, { error: 'Нужны ключ и Folder ID' })
      const models = (p.models && p.models.length ? p.models : MODELS)
      const rows = []
      for (const m of models) for (const s of SCENARIOS) {
        const r = await llmCall({ key: p.key, folder: p.folder, model: m.id, messages: s.messages, extra: m.extra })
        if (r.error) { rows.push({ model: m.label, sc: s.name, hit: 'ERR', tool: r.error, text: '', ms: r.ms }); continue }
        const called = (r.calls || []).map((c) => c.split('(')[0])
        let hit
        if (s.qualityOnly) hit = 'ℹ️'
        else if (s.expectNoTool) hit = called.length ? '❌' : '✅'
        else hit = called.some((c) => s.expect.includes(c)) ? '✅' : (called.length ? '⚠️' : '❌')
        const rub = r.usage && m.price ? ((r.usage.prompt_tokens / 1000) * m.price.in + (r.usage.completion_tokens / 1000) * m.price.out).toFixed(3) : null
        rows.push({ model: m.label, sc: s.name, hit, tool: r.calls?.join(' ') || '(без вызова)', text: r.text, ms: r.ms, tok: r.usage ? `${r.usage.prompt_tokens}+${r.usage.completion_tokens}` : '', rub })
      }
      return json(res, 200, { rows })
    }
    res.writeHead(404); res.end('not found')
  } catch (e) { json(res, 500, { error: e.message }) }
}).listen(PORT, () => console.log(`✅ Yandex тест-стенд: http://localhost:${PORT}  (tools в схеме: ${TOOLS.length})`))
