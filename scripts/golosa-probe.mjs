#!/usr/bin/env node
/**
 * ПРОСЛУШКА ГОЛОСОВ ЯНДЕКСА — одна и та же фраза урока каждым голосом.
 *
 * Зачем: голос Ани выбирается ОДИН раз и навсегда (правило «один голос»: записанная
 * читка и живые ответы обязаны звучать одинаково, иначе слышен шов). Выбирать надо
 * ушами и на НАШЕМ тексте, а не по названиям в документации.
 *
 * Что делает: перебирает каталог голос×амплуа, синтезирует фразу из §20, складывает
 * mp3 и собирает страницу с плеерами — открыл, послушал подряд, выбрал.
 * Неподдерживаемые сочетания Яндекс отвергает — они просто не попадают в страницу.
 *
 * Запуск:  node scripts/golosa-probe.mjs
 *          node scripts/golosa-probe.mjs --text "своя фраза" --out .tmp/golosa
 */
import fs from 'node:fs'
import path from 'node:path'

const КОРЕНЬ = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '..')
const арг = (имя, поум) => { const i = process.argv.indexOf('--' + имя); return i > 0 ? process.argv[i + 1] : поум }

// Фраза из настоящего урока: на ней слышно и обращение к ребёнку, и чтение учебника,
// и трудные для синтеза слова (Пелопоннес, Фессалия) — там голоса и расходятся.
const ФРАЗА = арг('text',
  'Привет! Меня зовут Аня. Сегодня мы читаем параграф двадцать, «Начало греческой цивилизации». ' +
  'Древняя Греция занимала южную часть Балканского полуострова. На территории Южной Греции — ' +
  'полуострове Пелопоннес — располагалась область Лакония с центром в Спарте.')
const ВЫХОД = path.resolve(КОРЕНЬ, арг('out', '.tmp/golosa'))
const ТЕМП = +арг('speed', '0.95')

// ⚠️ У Яндекса ДВА разных синтеза, и голоса между ними не пересекаются:
//   v1 (/speech/v1/tts:synthesize) — старые: alena, jane, omazh, oksana, marina…
//   v3 (/tts/v3/utteranceSynthesis) — новые нейросетевые: masha, dasha, julia, lera…
// Позвать v3-голос через v1 нельзя: приходит 400 BAD_REQUEST, и выглядит это как
// «такого голоса нет». Поэтому у каждой строки каталога помечено, куда стучаться.
const КАТАЛОГ_V3 = [
  ['masha', ['neutral', 'good', 'strict', 'friendly']],
  ['dasha', ['neutral', 'good', 'friendly']],
  ['julia', ['neutral', 'strict']],
  ['lera', ['neutral', 'friendly']],
]
// Каталог женских русских голосов SpeechKit. Амплуа поддерживаются не всеми —
// что не поддерживается, отсеется само по ответу сервиса.
const КАТАЛОГ = [
  ['alena', ['neutral', 'good']],
  ['jane', ['neutral', 'good', 'evil']],
  ['omazh', ['neutral', 'evil']],
  ['oksana', ['neutral', 'good', 'evil']],
  ['marina', ['neutral', 'whisper', 'friendly']],
  ['dasha', ['neutral', 'good', 'friendly']],
  ['julia', ['neutral', 'strict']],
  ['lera', ['neutral', 'friendly']],
  ['masha', ['neutral', 'good', 'strict', 'friendly']],
  ['kseniya', ['neutral']],
  ['tatyana', ['neutral']],
  // мужские — для полноты картины, вдруг захочется учителя-мужчину
  ['filipp', ['neutral']],
  ['ermil', ['neutral', 'good']],
  ['zahar', ['neutral', 'good']],
  ['alexander', ['neutral', 'good']],
  ['kirill', ['neutral', 'good', 'strict']],
  ['anton', ['neutral', 'good']],
  ['madi_ru', ['neutral']],
]
const ЖЕНСКИЕ = new Set(['alena', 'jane', 'omazh', 'oksana', 'marina', 'dasha', 'julia', 'lera', 'masha', 'kseniya', 'tatyana'])

// Убираем v3-голоса из v1-каталога, чтобы не долбиться в них дважды.
const ИМЕНА_V3 = new Set(КАТАЛОГ_V3.map(([v]) => v))
for (let i = КАТАЛОГ.length - 1; i >= 0; i--) if (ИМЕНА_V3.has(КАТАЛОГ[i][0])) КАТАЛОГ.splice(i, 1)

function ключи() {
  // Тот же порядок, что у стенда: .yandex-secret.json → .env.local
  try {
    const j = JSON.parse(fs.readFileSync(path.join(КОРЕНЬ, 'scripts/.yandex-secret.json'), 'utf8'))
    if (j.key) return { key: j.key, folder: j.folder || '' }
  } catch {}
  try {
    const env = {}
    for (const s of fs.readFileSync(path.join(КОРЕНЬ, '.env.local'), 'utf8').split(/\r?\n/)) {
      const m = s.match(/^\s*([A-Za-z0-9_]+)=(.*)$/); if (m) env[m[1]] = m[2].trim()
    }
    if (env.YC_API_KEY) return { key: env.YC_API_KEY, folder: env.YC_FOLDER_ID || '' }
  } catch {}
  return { key: '', folder: '' }
}

async function синтез(voice, role, { key, folder }) {
  const тело = new URLSearchParams({
    text: ФРАЗА, lang: 'ru-RU', voice, format: 'mp3', speed: String(ТЕМП),
  })
  if (role && role !== 'neutral') тело.set('emotion', role)
  if (folder) тело.set('folderId', folder)
  const r = await fetch('https://tts.api.cloud.yandex.net/speech/v1/tts:synthesize', {
    method: 'POST',
    headers: { Authorization: `Api-Key ${key}`, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: тело,
  })
  if (!r.ok) return { error: `${r.status} ${(await r.text()).slice(0, 120)}` }
  const buf = Buffer.from(await r.arrayBuffer())
  if (buf.length < 2000) return { error: 'подозрительно короткий ответ' }
  return { buf }
}

const { key, folder } = ключи()
if (!key) { console.error('нет ключа Яндекса (scripts/.yandex-secret.json или YC_API_KEY в .env.local)'); process.exit(1) }
fs.mkdirSync(ВЫХОД, { recursive: true })

// 🔴 У v3 жёсткий предел длины запроса — около 250 знаков, дальше «Too long text».
//  У v1 такого нет. Значит любой такт урока (а они по 4–7 строк) через v3-голос
//  пройдёт ТОЛЬКО разрезанным. Режем по концам предложений, чтобы шов пришёлся
//  на естественную паузу и не резал слово посередине.
const ПРЕДЕЛ_V3 = 230
function разбей(текст, предел = ПРЕДЕЛ_V3) {
  const куски = []
  let текущий = ''
  for (const пред of текст.split(/(?<=[.!?…])\s+/)) {
    if ((текущий + ' ' + пред).trim().length > предел && текущий) { куски.push(текущий.trim()); текущий = пред }
    else текущий = (текущий + ' ' + пред).trim()
  }
  if (текущий) куски.push(текущий.trim())
  // Если одно предложение само длиннее предела — режем по запятым, потом жёстко.
  const итог = []
  for (const к of куски) {
    if (к.length <= предел) { итог.push(к); continue }
    let буфер = ''
    for (const часть of к.split(/(?<=,)\s+/)) {
      if ((буфер + ' ' + часть).trim().length > предел && буфер) { итог.push(буфер.trim()); буфер = часть }
      else буфер = (буфер + ' ' + часть).trim()
    }
    if (буфер) итог.push(буфер.trim())
  }
  return итог.flatMap((к) => к.length <= предел ? [к] : (к.match(new RegExp(`.{1,${предел}}`, 'gs')) || []))
}

async function одинV3(текст, voice, role, key) {
  const hints = [{ voice }]
  if (role && role !== 'neutral') hints.push({ role })
  hints.push({ speed: ТЕМП })
  const r = await fetch('https://tts.api.cloud.yandex.net/tts/v3/utteranceSynthesis', {
    method: 'POST',
    headers: { Authorization: `Api-Key ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      text: текст, hints,
      outputAudioSpec: { containerAudio: { containerAudioType: 'MP3' } },
      loudnessNormalizationType: 'LUFS',
    }),
  })
  const raw = await r.text()
  if (!r.ok) return { error: `${r.status} ${raw.slice(0, 120)}` }
  // Ответ — поток JSON-строк, звук приходит кусками в base64.
  let objs = []
  try { const p = JSON.parse(raw); objs = Array.isArray(p) ? p : [p] }
  catch { for (const l of raw.split('\n')) { const s = l.trim(); if (s) try { objs.push(JSON.parse(s)) } catch {} } }
  const куски = objs.map((j) => j.result?.audioChunk?.data).filter(Boolean).map((d) => Buffer.from(d, 'base64'))
  if (!куски.length) return { error: 'пустой ответ v3' }
  return { buf: Buffer.concat(куски) }
}

async function синтезV3(voice, role, { key }) {
  const части = разбей(ФРАЗА)
  const собрано = []
  for (const часть of части) {
    const r = await одинV3(часть, voice, role, key)
    if (r.error) return r
    собрано.push(r.buf)
  }
  return { buf: Buffer.concat(собрано), частей: части.length }
}

const готовые = []
let отсеяно = 0
const работа = [
  ...КАТАЛОГ.map(([v, r]) => [v, r, 'v1']),
  ...КАТАЛОГ_V3.map(([v, r]) => [v, r, 'v3']),
]
for (const [voice, роли, апи] of работа) {
  for (const role of роли) {
    const имя = role === 'neutral' ? voice : `${voice}-${role}`
    const файл = path.join(ВЫХОД, `${имя}.mp3`)
    process.stdout.write(`  ${(имя + ' [' + апи + ']').padEnd(26)} `)
    const r = апи === 'v3' ? await синтезV3(voice, role, { key })
                           : await синтез(voice, role, { key, folder })
    if (r.error) { console.log('— не поддерживается (' + r.error.slice(0, 40) + ')'); отсеяно++; continue }
    fs.writeFileSync(файл, r.buf)
    готовые.push({ имя, voice, role, апи, файл: `${имя}.mp3`, кб: Math.round(r.buf.length / 1024), жен: ЖЕНСКИЕ.has(voice) })
    console.log(`✓ ${Math.round(r.buf.length / 1024)} КБ`)
  }
}

// Страница прослушки: всё на одной фразе, подряд, с пометкой «нравится».
// Отметки живут в браузере — вернулся через час, они на месте.
const карточка = (g) => `
  <div class="g${g.жен ? '' : ' m'}" data-имя="${g.имя}">
    <div class="hd"><b>${g.voice}</b>${g.role !== 'neutral' ? `<i>${g.role}</i>` : ''}
      ${g.апи === 'v3' ? '<span class="nov">новый</span>' : ''}
      <span class="pol">${g.жен ? 'женский' : 'мужской'}</span></div>
    <audio controls preload="none" src="${g.файл}"></audio>
    <button class="like" data-имя="${g.имя}">☆ нравится</button>
  </div>`

const html = `<!doctype html><meta charset=utf-8><title>Голоса Ани — прослушка</title>
<style>
:root{--bg:#171A21;--card:#20242E;--line:#2E3440;--ink:#E6EAF0;--dim:#98A0AE;--ok:#8FD08A}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--ink);font:15px/1.5 "Segoe UI",system-ui,sans-serif;padding:26px}
h1{font-size:22px;margin:0 0 6px}
.sub{color:var(--dim);font-size:13px;margin-bottom:18px;max-width:70ch}
.fraza{background:var(--card);border:1px solid var(--line);border-radius:10px;padding:12px 14px;
  margin-bottom:18px;color:var(--dim);font-size:13.5px;max-width:80ch}
.flt{display:flex;gap:8px;margin-bottom:14px}
.flt button{background:var(--card);color:var(--ink);border:1px solid var(--line);border-radius:8px;
  padding:5px 12px;font-size:13px;cursor:pointer;opacity:.5}
.flt button.on{opacity:1;border-color:var(--ok)}
.grid{display:grid;gap:12px;grid-template-columns:repeat(auto-fill,minmax(290px,1fr))}
.g{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:12px 14px}
.g.liked{border-color:var(--ok);box-shadow:0 0 0 1px var(--ok) inset}
.hd{display:flex;align-items:baseline;gap:8px;margin-bottom:8px}
.hd b{font-size:16px}
.hd i{color:var(--dim);font-style:normal;font-size:13px}
.pol{margin-left:auto;font-size:11px;color:var(--dim)}
.nov{font-size:10px;color:#0F1116;background:var(--ok);border-radius:4px;padding:1px 5px;font-weight:700}
audio{width:100%;height:34px}
.like{margin-top:8px;background:transparent;color:var(--dim);border:1px solid var(--line);
  border-radius:7px;padding:3px 10px;font-size:12px;cursor:pointer}
.g.liked .like{color:var(--ok);border-color:var(--ok)}
#итог{margin-top:22px;padding:14px;background:var(--card);border:1px solid var(--line);border-radius:10px;font-size:14px}
</style>
<h1>Голоса Ани — прослушка</h1>
<div class=sub>Одна и та же фраза из §20, ${готовые.length} вариантов. Голос выбирается ОДИН раз и навсегда:
записанная читка и живые ответы обязаны звучать одинаково, иначе слышен шов. Отмечайте «нравится» — отметки сохраняются.</div>
<div class=fraza>«${ФРАЗА}»</div>
<div class=flt>
  <button data-f=жен class=on>только женские</button>
  <button data-f=все>показать все</button>
</div>
<div class=grid id=grid>${готовые.map(карточка).join('')}</div>
<div id=итог>отмечено: <b id=скок>0</b> <span id=спис></span></div>
<script>
const К='golosa_like'
const взять=()=>{try{return JSON.parse(localStorage[К]||'[]')}catch(e){return[]}}
let любимые=взять()
function перерисуй(){
  for(const el of document.querySelectorAll('.g')) el.classList.toggle('liked',любимые.includes(el.dataset.имя))
  document.getElementById('скок').textContent=любимые.length
  document.getElementById('спис').textContent=любимые.length?('— '+любимые.join(', ')):''
}
document.getElementById('grid').onclick=e=>{
  const b=e.target.closest('.like'); if(!b)return
  const n=b.dataset.имя
  любимые=любимые.includes(n)?любимые.filter(x=>x!==n):[...любимые,n]
  localStorage[К]=JSON.stringify(любимые); перерисуй()
}
document.querySelector('.flt').onclick=e=>{
  const b=e.target.closest('button'); if(!b)return
  for(const x of document.querySelectorAll('.flt button')) x.classList.toggle('on',x===b)
  const толькоЖен=b.dataset.f==='жен'
  for(const el of document.querySelectorAll('.g')) el.style.display=(толькоЖен&&el.classList.contains('m'))?'none':''
}
// Один играет — остальные молчат: иначе сравнивать невозможно.
document.addEventListener('play',e=>{
  for(const a of document.querySelectorAll('audio')) if(a!==e.target) a.pause()
},true)
for(const el of document.querySelectorAll('.g.m')) el.style.display='none'
перерисуй()
</script>`
fs.writeFileSync(path.join(ВЫХОД, 'index.html'), html, 'utf8')

console.log(`\nготово: ${готовые.length} голосов (женских ${готовые.filter(g => g.жен).length}), отсеяно ${отсеяно}`)
console.log(`страница: ${path.join(ВЫХОД, 'index.html')}`)
console.log(`символов на голос: ${ФРАЗА.length} · всего ${готовые.length * ФРАЗА.length} — это копейки по тарифу TTS`)
