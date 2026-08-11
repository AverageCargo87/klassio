// Сравнить LLM Яндекс AI Studio на ВАШЕМ промпте тьютора + function-calling.
// Прогоняет 3 сценария (когда Аня ДОЛЖНА вызвать инструмент) через несколько
// моделей и печатает таблицу: вызвала ли нужный tool, что именно, задержка,
// токены, примерная цена.
//
// Запуск:  node --env-file=.env.local scripts/yandex-llm-compare.mjs
//
// Нужны в .env.local:
//   YC_API_KEY=<API-ключ AI Studio>
//   YC_FOLDER_ID=b1g...  (ID каталога — обязателен, идёт в строку модели)
import fs from 'node:fs'

;(function loadEnv() {
  if (process.env.YC_API_KEY && process.env.YC_FOLDER_ID) return
  try {
    for (const line of fs.readFileSync('.env.local', 'utf8').split('\n')) {
      const m = line.match(/^\s*([\w.]+)\s*=\s*(.*)\s*$/)
      if (m && !process.env[m[1]]) {
        let v = m[2].trim()
        if ((v[0] === '"' && v.at(-1) === '"') || (v[0] === "'" && v.at(-1) === "'")) v = v.slice(1, -1)
        process.env[m[1]] = v
      }
    }
  } catch {}
})()

const KEY = process.env.YC_API_KEY
const FOLDER = process.env.YC_FOLDER_ID
if (!KEY || !FOLDER) { console.error('❌ Нужны YC_API_KEY и YC_FOLDER_ID в .env.local'); process.exit(1) }

// ── МОДЕЛИ ──────────────────────────────────────────────────────────────────
// Добавляй любые из Model Gallery: скопируй строку gpt://<folder>/<id>/latest со
// страницы модели и подставь id ниже. price — примерная (₽ за 1k ток. in/out),
// точное потребление смотри в консоли → Мониторинг/Детализация.
const MODELS = [
  { label: 'YandexGPT 5 Pro', id: 'yandexgpt/latest', price: { in: 2, out: 6 } },
  { label: 'YandexGPT Lite', id: 'yandexgpt-lite/latest', price: { in: 0.2, out: 0.4 } },
  { label: 'Qwen3 235B', id: 'qwen3-235b-a22b-fp8/latest', price: null },
  { label: 'gpt-oss-120b', id: 'gpt-oss-120b/latest', price: null },
  // { label: 'DeepSeek V4 Flash', id: '<скопируй-id-из-Gallery>/latest', price: null },
  // { label: 'Alice AI LLM',      id: '<скопируй-id-из-Gallery>/latest', price: null },
]

// ── ПРОМПТ + ИНСТРУМЕНТЫ из живого конфига ─────────────────────────────────
const cfg = JSON.parse(fs.readFileSync('.planning/tutor-agent-live-config-2026-06-09.json', 'utf8'))
const agent = cfg.conversation_config.agent
let systemPrompt = agent.prompt.prompt
const VARS = {
  teacher_name: 'Аня',
  lesson_title: 'Мир глазами астронома',
  lesson_topic: 'астрономия, 4 класс',
  is_first_lesson_phrase: 'первый урок',
  prior_lessons_done: '0',
  is_first_lesson: 'да',
}
for (const [k, v] of Object.entries(VARS)) systemPrompt = systemPrompt.replaceAll(`{{${k}}}`, v)

// клиентские tool'ы → OpenAI-формат
const TOOLS = cfg.conversation_config.agent.prompt.tools
  .filter((t) => t.type === 'client')
  .map((t) => {
    const props = {}
    for (const [k, v] of Object.entries(t.parameters?.properties || {})) {
      props[k] = { type: v.type, description: v.description }
      if (Array.isArray(v.enum) && v.enum) props[k].enum = v.enum
    }
    return {
      type: 'function',
      function: {
        name: t.name,
        description: t.description,
        parameters: { type: 'object', properties: props, required: t.parameters?.required || [] },
      },
    }
  })

// ── СЦЕНАРИИ: момент, где Аня обязана вызвать инструмент ────────────────────
const A = (content) => ({ role: 'assistant', content })
const U = (content) => ({ role: 'user', content })
const SCENARIOS = [
  {
    name: 'Ребёнок назвал имя → set_child_name',
    expect: ['set_child_name'],
    messages: [A('Привет! Меня зовут Аня. А тебя как зовут?'), U('Меня зовут Гриша')],
  },
  {
    name: 'После разминки сама начинает урок → next_slide',
    expect: ['next_slide', 'show_board', 'set_phase'],
    messages: [
      A('Привет! Меня зовут Аня. А тебя как зовут?'),
      U('Гриша'),
      A('Приятно познакомиться! Как настроение, что делал сегодня после школы?'),
      U('Нормально, играл в футбол'),
      A('Здорово! А сегодня у нас урок про космос — звёзды, планеты. Начнём?'),
      U('да'),
    ],
  },
  {
    name: 'Правильный ответ на задании → похвала + следующий шаг',
    expect: ['show_trainer', 'next_slide'],
    messages: [
      A('Смотри на доску: это карта Солнечной системы. Реши задание — какая планета третья от Солнца?'),
      U('[ПЛАТФОРМА] Ответ на task-5 — ПРАВИЛЬНЫЙ'),
    ],
  },
]

async function callModel(model, messages) {
  const t0 = Date.now()
  const res = await fetch('https://llm.api.cloud.yandex.net/v1/chat/completions', {
    method: 'POST',
    headers: { Authorization: `Api-Key ${KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: `gpt://${FOLDER}/${model.id}`,
      messages: [{ role: 'system', content: systemPrompt }, ...messages],
      tools: TOOLS,
      tool_choice: 'auto',
      temperature: 0.3,
      max_tokens: 400,
    }),
  })
  const ms = Date.now() - t0
  if (!res.ok) return { ms, error: `${res.status} ${(await res.text()).slice(0, 160)}` }
  const j = await res.json()
  const msg = j.choices?.[0]?.message || {}
  const calls = (msg.tool_calls || []).map((c) => `${c.function?.name}(${c.function?.arguments || ''})`)
  return { ms, calls, text: (msg.content || '').replace(/\s+/g, ' ').trim(), usage: j.usage }
}

const cost = (u, p) =>
  !u || !p ? null : ((u.prompt_tokens / 1000) * p.in + (u.completion_tokens / 1000) * p.out).toFixed(3)

console.log(`\n🧠 Сравнение ${MODELS.length} моделей × ${SCENARIOS.length} сценария. Инструментов в схеме: ${TOOLS.length}\n`)
const rows = []
for (const m of MODELS) {
  for (const s of SCENARIOS) {
    const r = await callModel(m, s.messages)
    if (r.error) {
      console.log(`❌ ${m.label} / ${s.name}: ${r.error}`)
      rows.push({ model: m.label, sc: s.name, hit: 'ERR', tool: r.error, ms: r.ms, tok: '', rub: '' })
      continue
    }
    const called = (r.calls || []).map((c) => c.split('(')[0])
    const hit = called.some((c) => s.expect.includes(c))
    const tok = r.usage ? `${r.usage.prompt_tokens}+${r.usage.completion_tokens}` : ''
    const rub = cost(r.usage, m.price)
    rows.push({
      model: m.label, sc: s.name.slice(0, 34),
      hit: hit ? '✅' : (r.calls?.length ? '⚠️ др.tool' : '❌ текст'),
      tool: r.calls?.join(' ') || `«${r.text.slice(0, 60)}…»`,
      ms: r.ms, tok, rub: rub ?? '?',
    })
    console.log(`${hit ? '✅' : '⚠️ '} ${m.label.padEnd(16)} | ${s.name.slice(0, 30).padEnd(30)} | ${r.ms}ms | ${(r.calls?.join(' ') || '(без tool) ' + r.text.slice(0, 50))}`)
  }
}

// ── Итоговая таблица + очки по function-calling ────────────────────────────
console.log('\n──────── ИТОГ (function-calling) ────────')
for (const m of MODELS) {
  const mine = rows.filter((r) => r.model === m.label)
  const hits = mine.filter((r) => r.hit === '✅').length
  const avgMs = Math.round(mine.reduce((a, r) => a + (r.ms || 0), 0) / mine.length)
  const rub = mine.reduce((a, r) => a + (parseFloat(r.rub) || 0), 0).toFixed(3)
  console.log(`${m.label.padEnd(18)} tools ${hits}/${SCENARIOS.length}   ~${avgMs}ms   ~${rub}₽ за прогон`)
}
console.log('\nЛегенда: ✅ вызвала нужный инструмент · ⚠️ вызвала другой · ❌ ответила текстом без tool.')
console.log('Цена приблизительная (у Qwen/gpt-oss нет прайса в скрипте) — точную смотри в Мониторинг→Детализация.')
