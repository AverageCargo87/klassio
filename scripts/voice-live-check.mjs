// Живой контур на слух и по секундомеру: «в предрендере звучит хорошо, а в реалтайме?»
//
// Отвечает на два разных вопроса, которые легко спутать:
//   1. ЗВУК — станет ли голос хуже в живую? У Яндекса нет отдельного «реалтайм-режима»:
//      предрендер и живой ответ — один и тот же вызов tts:synthesize. Значит звук тот же,
//      и этот скрипт даёт его послушать на РЕАЛЬНОЙ реплике, которую написала модель.
//   2. ОЖИДАНИЕ — сколько ребёнок молчит после своего вопроса. Вот это и меряем: LLM + TTS.
//
// Запуск:  node scripts/voice-live-check.mjs
// Кладёт mp3 в .tmp/voice-live/ + index.html.
import fs from 'node:fs'
import path from 'node:path'

const OUT = '.tmp/voice-live'
fs.mkdirSync(OUT, { recursive: true })

const YC = JSON.parse(fs.readFileSync('scripts/.yandex-secret.json', 'utf8'))

// Голоса, которые Кратов отметил в слепом тесте 17.08 (C и F), плюс нынешний — для отсчёта.
const ГОЛОСА = [
  { voice: 'marina', подпись: 'marina (метка C в слепом тесте)' },
  { voice: 'jane', emotion: 'good', подпись: 'jane · good (метка F)' },
  { voice: 'alena', emotion: 'good', подпись: 'alena · good (что стоит сейчас)' },
]

// Настоящие вопросы, которые ребёнок задаёт по §20 — короткие, как в жизни.
const ВОПРОСЫ = [
  'А почему греки называли себя эллинами, а не греками?',
  'Зачем им было так много плавать по морю?',
  'А Пелопоннес это остров или нет?',
]

const SYSTEM = `Ты — Аня, учительница истории. Отвечаешь одному ученику 11 лет по ходу урока
про Древнюю Грецию, параграф 20. Отвечай коротко: две-три фразы, максимум 250 знаков.
Живым разговорным языком, без канцелярита и без списков. Не сюсюкай.
Если уместно — закончи коротким встречным вопросом, чтобы ребёнок думал дальше.`

async function llm(вопрос) {
  const t0 = Date.now()
  const r = await fetch('https://llm.api.cloud.yandex.net/v1/chat/completions', {
    method: 'POST',
    headers: { Authorization: `Api-Key ${YC.key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: `gpt://${YC.folder}/deepseek-v4-flash/latest`,
      messages: [{ role: 'system', content: SYSTEM }, { role: 'user', content: вопрос }],
      temperature: 0.4, max_tokens: 200, reasoning_effort: 'none',
    }),
  })
  const мс = Date.now() - t0
  if (!r.ok) throw new Error(`LLM ${r.status} ${(await r.text()).slice(0, 180)}`)
  const j = await r.json()
  return { текст: (j.choices?.[0]?.message?.content || '').trim(), мс }
}

async function tts({ voice, emotion }, text) {
  const t0 = Date.now()
  const body = new URLSearchParams({ text, lang: 'ru-RU', voice, format: 'mp3', speed: '1.0' })
  if (emotion) body.set('emotion', emotion)
  const r = await fetch('https://tts.api.cloud.yandex.net/speech/v1/tts:synthesize', {
    method: 'POST',
    headers: { Authorization: `Api-Key ${YC.key}`, 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  })
  const мс = Date.now() - t0
  if (!r.ok) throw new Error(`TTS ${r.status} ${(await r.text()).slice(0, 180)}`)
  return { buf: Buffer.from(await r.arrayBuffer()), мс }
}

const строки = []
for (const [iv, вопрос] of ВОПРОСЫ.entries()) {
  console.log(`\n❓ «${вопрос}»`)
  let ответ
  try { ответ = await llm(вопрос) }
  catch (e) { console.log('   ❌ ' + e.message); continue }
  console.log(`   🧠 модель думала ${ответ.мс} мс → «${ответ.текст.slice(0, 110)}…» (${ответ.текст.length} знаков)`)

  for (const г of ГОЛОСА) {
    try {
      const { buf, мс } = await tts(г, ответ.текст)
      const id = `q${iv + 1}-${г.voice}`
      fs.writeFileSync(path.join(OUT, id + '.mp3'), buf)
      const всего = ответ.мс + мс
      строки.push({ вопрос, ответ: ответ.текст, голос: г.подпись, файл: id + '.mp3', llm: ответ.мс, tts: мс, всего })
      console.log(`   🔊 ${г.подпись.padEnd(34)} синтез ${String(мс).padStart(4)} мс · ВСЕГО ЖДАТЬ ${всего} мс`)
    } catch (e) { console.log(`   ❌ ${г.подпись}: ${e.message}`) }
  }
}

const ср = (xs) => Math.round(xs.reduce((a, b) => a + b, 0) / xs.length)
if (строки.length) {
  console.log(`\n── ИТОГ ──`)
  console.log(`   модель в среднем: ${ср(строки.map((s) => s.llm))} мс`)
  console.log(`   синтез в среднем: ${ср(строки.map((s) => s.tts))} мс`)
  console.log(`   ребёнок ждёт:     ${ср(строки.map((s) => s.всего))} мс (без распознавания его речи)`)
}

const порп = [...new Set(строки.map((s) => s.вопрос))]
const html = `<!doctype html><meta charset=utf-8><title>Живой ответ Ани — как это звучит и сколько ждать</title>
<style>
body{font:16px/1.6 -apple-system,Segoe UI,Roboto,sans-serif;max-width:820px;margin:0 auto;padding:28px;background:#12151a;color:#e6e9ef}
h1{font-size:21px;margin-bottom:4px}p.sub{color:#8d97a6;margin-top:0}
.q{background:#1b2029;border:1px solid #2a3240;border-radius:12px;padding:16px 18px;margin:18px 0}
.q h3{margin:0 0 4px;font-size:16px;color:#54c9b6}
.otv{color:#c3ccd9;font-style:italic;margin:6px 0 12px;padding-left:12px;border-left:2px solid #2a3240}
.v{display:flex;align-items:center;gap:12px;padding:8px 0}
.v b{width:250px;font-weight:500;font-size:14px}audio{flex:1;height:34px}
.t{font-size:13px;color:#8d97a6;white-space:nowrap}
.big{background:#16241f;border:1px solid #2b5c4d;border-radius:12px;padding:14px 18px;margin:20px 0}
</style>
<h1>Живой ответ Ани — как это звучит и сколько ждать</h1>
<p class=sub>Текст написала модель прямо сейчас, не учебник. Синтез — тот же вызов API, что и в предрендере.</p>
<div class=big><b>Секундомер.</b> Модель ${ср(строки.map((s) => s.llm))} мс · синтез ${ср(строки.map((s) => s.tts))} мс ·
<b>ребёнок ждёт в среднем ${ср(строки.map((s) => s.всего))} мс</b> после своего вопроса (распознавание речи сверху не считано).</div>
${порп.map((в) => {
  const гр = строки.filter((s) => s.вопрос === в)
  return `<div class=q><h3>❓ ${в}</h3><div class=otv>${гр[0].ответ}</div>
${гр.map((s) => `<div class=v><b>${s.голос}</b><audio controls preload=none src="${s.файл}"></audio><span class=t>${s.всего} мс</span></div>`).join('\n')}</div>`
}).join('\n')}`

fs.writeFileSync(path.join(OUT, 'index.html'), html)
console.log(`\nСлушать: ${OUT}/index.html`)
