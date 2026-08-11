// Прослушать голоса Yandex SpeechKit на репликах Ани — один MP3 на голос.
// Запуск:  node --env-file=.env.local scripts/yandex-voice-sample.mjs
// (или просто node scripts/yandex-voice-sample.mjs — сам подхватит .env.local)
//
// Нужны в .env.local:
//   YC_API_KEY=<API-ключ из AI Studio (Создать API-ключ)>
//   YC_FOLDER_ID=b1g...   (ID каталога «default» из консоли; для SpeechKit
//                          часто необязателен, но лучше указать)
//
// Результат: scripts/voice-samples/<voice>[-<role>].mp3 — открой папку и слушай.
import fs from 'node:fs'
import path from 'node:path'

// ── .env.local fallback (если не запускали через --env-file) ────────────────
;(function loadEnv() {
  if (process.env.YC_API_KEY) return
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
const FOLDER = process.env.YC_FOLDER_ID || ''
if (!KEY) { console.error('❌ Нет YC_API_KEY в окружении/.env.local'); process.exit(1) }

const SPEED = 1.05 // чуть живее нейтрального; крути 0.9–1.2

// Кандидаты в голос Ани (тёплые, дружелюбные). role — необязателен; где не
// поддерживается, синтез просто вернёт ошибку и мы пропустим. Добавляй/убирай.
const VOICES = [
  { voice: 'alena', role: 'good' },     // мягкая, дружелюбная — топ-кандидат
  { voice: 'alena', role: 'neutral' },
  { voice: 'jane', role: 'good' },      // тёплая
  { voice: 'omazh', role: 'neutral' },
  { voice: 'marina' },
  { voice: 'dasha' },
  { voice: 'julia' },
  { voice: 'lera' },
  { voice: 'masha' },                    // «Маша» из плейграунда
]

// 3 реплики Ани: приветствие, объяснение, похвала — чтобы услышать тембр в деле.
const LINES = [
  'Привет! Меня зовут Аня. А тебя как зовут?',
  'Смотри: астрономия — это наука о звёздах и планетах. Слово пришло из греческого: «астрон» значит звезда.',
  'Молодец, ты отлично справился! Давай попробуем задание чуть посложнее.',
].join('\n')

const OUT = path.join('scripts', 'voice-samples')
fs.mkdirSync(OUT, { recursive: true })

async function synth({ voice, role }) {
  const body = new URLSearchParams({ text: LINES, lang: 'ru-RU', voice, format: 'mp3', speed: String(SPEED) })
  if (role) body.set('role', role)
  if (FOLDER) body.set('folderId', FOLDER)
  const res = await fetch('https://tts.api.cloud.yandex.net/speech/v1/tts:synthesize', {
    method: 'POST',
    headers: { Authorization: `Api-Key ${KEY}`, 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  })
  if (!res.ok) throw new Error(`${res.status} ${(await res.text()).slice(0, 200)}`)
  return Buffer.from(await res.arrayBuffer())
}

console.log(`🎙  Синтез ${VOICES.length} вариантов → ${OUT}\n`)
for (const v of VOICES) {
  const name = v.role ? `${v.voice}-${v.role}` : v.voice
  try {
    const buf = await synth(v)
    const file = path.join(OUT, `${name}.mp3`)
    fs.writeFileSync(file, buf)
    console.log(`✅ ${name.padEnd(16)} ${(buf.length / 1024).toFixed(0)} KB`)
  } catch (e) {
    console.log(`⏭  ${name.padEnd(16)} пропущен: ${e.message}`)
  }
}
console.log(`\nГотово. Открой папку и послушай: ${path.resolve(OUT)}`)
