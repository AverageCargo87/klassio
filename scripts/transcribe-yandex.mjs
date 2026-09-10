// Транскрипт длинной записи через Yandex SpeechKit — без Object Storage и без GPU.
//
// Зачем: локальный whisper упирается в закачку весов (CDN HuggingFace из РФ не отдаёт,
// зеркало ~640 КБ/с на 3 ГБ). Яндекс распознаёт русский сразу, но его синхронная ручка
// берёт максимум 30 с и 1 МБ за раз. Поэтому режем запись НА ПАУЗАХ (ffmpeg silencedetect),
// а не по таймеру: так ни одно слово не рвётся пополам, и таймкод каждого куска честный.
//
// ЗАПУСК:
//   node scripts/transcribe-yandex.mjs .tmp/video-in/razbor.wav
//   (wav обязан быть mono 16 кГц PCM16 — так его кладёт ffmpeg -ac 1 -ar 16000)
//
// Ключ ищется в: YC_API_KEY (env) → scripts/.yandex-secret.json → .env.local
import fs from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'

const SRC = process.argv[2] || '.tmp/video-in/razbor.wav'
const OUT = SRC.replace(/\.wav$/, '.transcript.md')
const MAX = 24 // секунд на кусок (потолок ручки — 30 с и 1 МБ)

// ── ключ ────────────────────────────────────────────────────────────────────
const readKey = () => {
  if (process.env.YC_API_KEY) return { key: process.env.YC_API_KEY, folder: process.env.YC_FOLDER_ID || '' }
  for (const p of ['scripts/.yandex-secret.json', '.tmp/keys/yandex.json']) {
    if (fs.existsSync(p)) {
      const j = JSON.parse(fs.readFileSync(p, 'utf8'))
      return { key: j.key, folder: j.folder || '' }
    }
  }
  if (fs.existsSync('.env.local')) {
    const env = fs.readFileSync('.env.local', 'utf8')
    const k = env.match(/^\s*YC_API_KEY\s*=\s*(.+)$/m)
    const f = env.match(/^\s*YC_FOLDER_ID\s*=\s*(.+)$/m)
    if (k) return { key: k[1].trim(), folder: f ? f[1].trim() : '' }
  }
  throw new Error('нет ключа Яндекса: положи YC_API_KEY в окружение или scripts/.yandex-secret.json')
}
const { key, folder } = readKey()

// ── 1. где паузы ────────────────────────────────────────────────────────────
// silencedetect печатает В STDERR (это лог фильтра, не данные) — забираем именно его
const { stderr } = spawnSync('ffmpeg',
  ['-nostdin', '-i', SRC, '-af', 'silencedetect=noise=-32dB:d=0.45', '-f', 'null', '-'],
  { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })

const gaps = []
for (const m of stderr.matchAll(/silence_start:\s*([\d.]+)[\s\S]*?silence_end:\s*([\d.]+)/g)) {
  gaps.push({ from: Number(m[1]), to: Number(m[2]) })
}

const pcm = fs.readFileSync(SRC)
const HDR = 44
const total = (pcm.length - HDR) / 2 / 16000
console.log(`запись ${(total / 60).toFixed(1)} мин, пауз найдено: ${gaps.length}`)

// ── 2. режем по паузам ──────────────────────────────────────────────────────
// Идём вперёд и берём последнюю паузу, которая укладывается в лимит куска.
const cuts = [0]
let pos = 0
while (pos < total) {
  const limit = pos + MAX
  const fit = gaps.filter((g) => g.from > pos + 4 && g.from <= limit)
  if (!fit.length) {
    // говорит без пауз дольше лимита — режем по таймеру, иначе ручка откажет
    pos = Math.min(limit, total)
  } else {
    const g = fit[fit.length - 1]
    pos = (g.from + g.to) / 2
  }
  cuts.push(pos)
}
const chunks = cuts.slice(0, -1).map((s, i) => ({ start: s, end: cuts[i + 1] }))
console.log(`кусков: ${chunks.length} (в среднем ${(total / chunks.length).toFixed(0)} с)`)

// ── 3. распознаём ───────────────────────────────────────────────────────────
const url = 'https://stt.api.cloud.yandex.net/speech/v1/stt:recognize?'
  + new URLSearchParams({ lang: 'ru-RU', format: 'lpcm', sampleRateHertz: '16000', topic: 'general', ...(folder ? { folderId: folder } : {}) })

const ts = (sec) => {
  const s = Math.floor(sec % 60), m = Math.floor(sec / 60) % 60, h = Math.floor(sec / 3600)
  return h ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}` : `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

const parts = []
for (const [i, c] of chunks.entries()) {
  const from = HDR + Math.floor(c.start * 16000) * 2
  const to = HDR + Math.floor(c.end * 16000) * 2
  const body = pcm.subarray(from, to)
  let text = ''
  for (let tryN = 1; tryN <= 3; tryN++) {
    try {
      const r = await fetch(url, {
        method: 'POST',
        headers: { Authorization: `Api-Key ${key}`, 'Content-Type': 'application/octet-stream' },
        body,
      })
      const j = await r.json()
      if (!r.ok) throw new Error(j.error_message || JSON.stringify(j).slice(0, 150))
      text = (j.result || '').trim()
      break
    } catch (e) {
      if (tryN === 3) { text = `[не распознано: ${e.message}]`; break }
      await new Promise((res) => setTimeout(res, 800 * tryN))
    }
  }
  parts.push({ start: c.start, text })
  process.stdout.write(`\r  ${i + 1}/${chunks.length}  ${ts(c.end)}   `)
}
console.log()

// ── 4. в абзацы ─────────────────────────────────────────────────────────────
// Кусок = 20-25 с речи; для чтения склеиваем по 3, чтобы абзац был «мыслью», а не строкой.
const paras = []
for (let i = 0; i < parts.length; i += 3) {
  const g = parts.slice(i, i + 3).filter((p) => p.text)
  if (g.length) paras.push({ start: g[0].start, text: g.map((p) => p.text).join(' ') })
}

const md = [`# Транскрипт — ${path.basename(SRC)}`, '',
  `Длительность ${(total / 60).toFixed(1)} мин · Yandex SpeechKit · кусков ${chunks.length}`, '', '---', '',
  ...paras.map((p) => `**[${ts(p.start)}]** ${p.text}\n`)].join('\n')
fs.writeFileSync(OUT, md, 'utf8')
console.log(`готово: ${OUT} — ${paras.length} абзацев, ${paras.reduce((s, p) => s + p.text.length, 0)} знаков`)
