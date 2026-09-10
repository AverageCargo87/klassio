// Слепое сравнение голосов Ани на настоящем такте урока (§20, стр. 120).
// Повод: «голос Яндекса недостаточно естественный». Разведка 03.08 поставила диагноз:
// дело не в тембре, а в том, что интонацией нечем управлять по ходу фразы — у Яндекса
// один ярлык (амплуа) на весь запрос. У gpt-4o-mini-tts есть параметр `instructions`,
// то есть просодией можно рулить словами. Этот скрипт проверяет диагноз на слух.
//
// Запуск:  node scripts/voice-ab.mjs
// Кладёт mp3 в .tmp/voice-ab/ + index.html, чтобы слушать подряд одной кнопкой.
import fs from 'node:fs'
import path from 'node:path'

const OUT = '.tmp/voice-ab'
fs.mkdirSync(OUT, { recursive: true })

// Настоящий такт чтения из урока — не выдуманная фраза: имена собственные и длинные
// перечисления, на которых слышно ровно то, на что жалуется заказчик.
const SCRIPT = JSON.parse(fs.readFileSync('.tmp/kniga-script.json', 'utf8'))
const TEXT = SCRIPT['2'].say

const YC = JSON.parse(fs.readFileSync('scripts/.yandex-secret.json', 'utf8'))
const OA = (fs.readFileSync('.env.local', 'utf8').match(/^OPENAI_API_KEY=(.+)$/m) || [])[1]?.trim().replace(/^"|"$/g, '')

// Инструкция по подаче — то, чего у Яндекса нет в принципе.
// Писана под 11-летнего: обращаться, а не умиляться (вывод разведки 03.08, §6 п.6).
const MANNER = `Ты — учительница истории Аня, тебе около тридцати, ты ведёшь урок для одного
одиннадцатилетнего ученика. Читай текст учебника вслух: спокойно, тепло и заинтересованно,
как будто тебе самой это интересно рассказать. Не диктор новостей и не аудиокнига.
Держи умеренный темп, делай осмысленные паузы на границах мыслей, а не на каждой запятой.
Географические названия произноси отчётливо и чуть выделяй голосом — ребёнок слышит их впервые.
Не сюсюкай и не играй голосом преувеличенно: к ребёнку обращаются, а не умиляются им.`

const ВАРИАНТЫ = [
  { id: '1-yandex-alena-good', подпись: 'Яндекс alena · амплуа good — ТО, ЧТО СЕЙЧАС В УРОКЕ', движок: 'yandex-v1', voice: 'alena', emotion: 'good' },
  { id: '2-yandex-alena-neutral', подпись: 'Яндекс alena · нейтрально', движок: 'yandex-v1', voice: 'alena', emotion: 'neutral' },
  // v3 отказался синтезировать 330 знаков («Too long text») — у него лимит жёстче, чем у v1.
  // Поэтому те же голоса берём через v1, где длина такта проходит.
  { id: '3-yandex-marina', подпись: 'Яндекс marina · нейтрально', движок: 'yandex-v1', voice: 'marina' },
  { id: '4-yandex-jane-good', подпись: 'Яндекс jane · амплуа good', движок: 'yandex-v1', voice: 'jane', emotion: 'good' },
  { id: '4b-yandex-dasha', подпись: 'Яндекс dasha', движок: 'yandex-v1', voice: 'dasha' },
  { id: '4c-yandex-lera', подпись: 'Яндекс lera', движок: 'yandex-v1', voice: 'lera' },
  { id: '5-openai-nova-goliy', подпись: 'OpenAI nova · БЕЗ инструкции по подаче', движок: 'openai', voice: 'nova' },
  { id: '6-openai-nova-manera', подпись: 'OpenAI nova · С инструкцией «учительница ребёнку»', движок: 'openai', voice: 'nova', manner: MANNER },
  { id: '7-openai-shimmer-manera', подпись: 'OpenAI shimmer · С инструкцией', движок: 'openai', voice: 'shimmer', manner: MANNER },
  { id: '8-openai-coral-manera', подпись: 'OpenAI coral · С инструкцией', движок: 'openai', voice: 'coral', manner: MANNER },
  { id: '9-openai-sage-manera', подпись: 'OpenAI sage · С инструкцией', движок: 'openai', voice: 'sage', manner: MANNER },
]

async function яндексV1({ voice, emotion }) {
  const body = new URLSearchParams({ text: TEXT, lang: 'ru-RU', voice, format: 'mp3', speed: '1.0' })
  if (emotion) body.set('emotion', emotion)
  const r = await fetch('https://tts.api.cloud.yandex.net/speech/v1/tts:synthesize', {
    method: 'POST',
    headers: { Authorization: `Api-Key ${YC.key}`, 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  })
  if (!r.ok) throw new Error(`${r.status} ${(await r.text()).slice(0, 200)}`)
  return Buffer.from(await r.arrayBuffer())
}

async function яндексV3({ voice }) {
  const r = await fetch('https://tts.api.cloud.yandex.net/tts/v3/utteranceSynthesis', {
    method: 'POST',
    headers: { Authorization: `Api-Key ${YC.key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      text: TEXT, hints: [{ voice }],
      outputAudioSpec: { containerAudio: { containerAudioType: 'MP3' } },
      loudnessNormalizationType: 'LUFS',
    }),
  })
  const raw = await r.text()
  if (!r.ok) throw new Error(`${r.status} ${raw.slice(0, 200)}`)
  let objs = []
  try { const p = JSON.parse(raw); objs = Array.isArray(p) ? p : [p] }
  catch { for (const l of raw.split('\n')) { const s = l.trim(); if (s) try { objs.push(JSON.parse(s)) } catch {} } }
  const chunks = objs.map((j) => j.result?.audioChunk?.data).filter(Boolean).map((d) => Buffer.from(d, 'base64'))
  if (!chunks.length) throw new Error('v3 вернул пусто: ' + raw.slice(0, 150))
  return Buffer.concat(chunks)
}

async function опенаи({ voice, manner }) {
  const body = { model: 'gpt-4o-mini-tts', voice, input: TEXT, response_format: 'mp3' }
  if (manner) body.instructions = manner
  const r = await fetch('https://api.openai.com/v1/audio/speech', {
    method: 'POST',
    headers: { Authorization: `Bearer ${OA}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!r.ok) throw new Error(`${r.status} ${(await r.text()).slice(0, 200)}`)
  return Buffer.from(await r.arrayBuffer())
}

const ДВИЖКИ = { 'yandex-v1': яндексV1, 'yandex-v3': яндексV3, openai: опенаи }

console.log(`Текст (${TEXT.length} знаков): «${TEXT.slice(0, 90)}…»\n`)

const готовые = []
for (const в of ВАРИАНТЫ) {
  const файл = path.join(OUT, в.id + '.mp3')
  // Уже лежит — не пересинтезируем. Так сюда доезжают файлы OpenAI: с российского
  // адреса их API отвечает 403 unsupported_country_region_territory, поэтому они
  // синтезируются на нашем франкфуртском сервере и кладутся в эту же папку.
  if (fs.existsSync(файл)) {
    const кб = Math.round(fs.statSync(файл).size / 1024)
    готовые.push({ ...в, файл: в.id + '.mp3', кб, мс: null })
    console.log(`  ↩️  ${в.подпись}\n     уже есть, ${кб} КБ`)
    continue
  }
  const t0 = Date.now()
  try {
    const buf = await ДВИЖКИ[в.движок](в)
    fs.writeFileSync(файл, buf)
    const мс = Date.now() - t0
    готовые.push({ ...в, файл: в.id + '.mp3', кб: Math.round(buf.length / 1024), мс })
    console.log(`  ✅ ${в.подпись}\n     ${Math.round(buf.length / 1024)} КБ · синтез ${мс} мс`)
  } catch (e) {
    console.log(`  ❌ ${в.подпись}\n     ${e.message}`)
  }
}

// Слушалка: варианты вперемешку и БЕЗ подписей — иначе слушают ярлык, а не звук.
// Порядок тасуем детерминированно (по хешу id), чтобы Яндекс и OpenAI не шли
// двумя кучами подряд, но при пересборке метки не разъезжались.
const хеш = (s) => [...s].reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7)
const перемешано = [...готовые]
  .sort((a, b) => хеш(a.id) - хеш(b.id))
  .map((г, i) => ({ ...г, метка: String.fromCharCode(65 + i) }))
const html = `<!doctype html><meta charset=utf-8><title>Голос Ани — слепое сравнение</title>
<style>
body{font:16px/1.6 -apple-system,Segoe UI,Roboto,sans-serif;max-width:760px;margin:0 auto;padding:28px;background:#12151a;color:#e6e9ef}
h1{font-size:21px;margin-bottom:4px}p.sub{color:#8d97a6;margin-top:0}
.q{background:#1b2029;border:1px solid #2a3240;border-radius:12px;padding:14px 16px;margin:16px 0}
.v{display:flex;align-items:center;gap:14px;padding:11px 0;border-bottom:1px solid #232a35}
.v:last-child{border-bottom:none}.m{font-weight:700;font-size:19px;width:26px;color:#54c9b6}
audio{flex:1;height:36px}
button{background:#2ba39b;border:none;color:#06120f;font:inherit;font-weight:600;padding:9px 16px;border-radius:9px;cursor:pointer}
.otvet{margin-top:22px}.otvet summary{cursor:pointer;color:#8d97a6}
table{width:100%;border-collapse:collapse;font-size:14px;margin-top:10px}
td,th{border:1px solid #2a3240;padding:6px 9px;text-align:left}th{color:#8d97a6}
</style>
<h1>Голос Ани — слепое сравнение</h1>
<p class=sub>Один и тот же такт урока, §20 «Начало греческой цивилизации», страница 120.</p>
<div class=q><b>Как слушать.</b> Подписи скрыты намеренно — иначе слушаешь ярлык, а не звук.
Пройди подряд, поставь себе пометку «этот голос я готов слушать сорок минут» — и только потом раскрой ответы внизу.</div>
${перемешано.map((г) => `<div class=v><span class=m>${г.метка}</span><audio controls preload=none src="${г.файл}"></audio></div>`).join('\n')}
<details class=otvet><summary>Показать, что есть что</summary>
<table><tr><th>метка</th><th>движок и голос</th><th>синтез</th></tr>
${перемешано.map((г) => `<tr><td><b>${г.метка}</b></td><td>${г.подпись}</td><td>${г.мс} мс</td></tr>`).join('\n')}
</table></details>`

fs.writeFileSync(path.join(OUT, 'index.html'), html)
console.log(`\nГотово: ${готовые.length} из ${ВАРИАНТЫ.length}. Слушать: ${OUT}/index.html`)
