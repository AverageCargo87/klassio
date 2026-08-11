#!/usr/bin/env node
// ПРЕДРЕНДЕР УЧИТЕЛЯ: урок читается по учебнику ФИКСИРОВАННЫМ текстом, значит видео
// говорящей головы можно собрать ОДИН РАЗ и потом просто проигрывать.
//
// Что это даёт:
//   · ребёнку приезжают обычные MP4 (сотни килобайт), а не 13-мегабайтная 3D-модель,
//     и его ноутбуку не надо рендерить WebGL — работает на слабом железе и планшете;
//   · синтез речи тоже становится РАЗОВЫМ: звук лежит внутри ролика. Прогон урока
//     перестаёт стоить денег вообще;
//   · видеокарта нужна только НАМ и только на этапе подготовки.
//
// Липсинк подключается как внешняя команда (LIPSYNC_CMD), поэтому движок меняется без
// правки урока: сегодня это заглушка на ffmpeg (портрет + звук), завтра — MuseTalk или
// Wav2Lip на нашей RTX. Плейсхолдеры в команде: {face} {audio} {out}.
//
// ⚠️ Ролики именуются ХЕШЕМ ТЕКСТА, а не номером такта: стоит вставить в урок одну
// реплику — и вся нумерация сползёт. По хешу уже отрендеренное переиспользуется, и
// заново синтезируется только новое. Синтез — деньги, экономим на каждой правке.
//
// ⚠️ Одного хеша текста МАЛО. Ролик зависит ещё от ЛИЦА и от ДВИЖКА липсинка: сменишь
// портрет — текст тот же, а кеш обязан протухнуть, иначе урок молча покажет старое лицо
// (наступали 04.08). Поэтому в имя mp4 идёт ещё и подпись рендера — хеш файла лица плюс
// строка LIPSYNC_CMD. Звук от лица не зависит, поэтому mp3 остаётся на одном хеше текста
// и повторный синтез не оплачивается.
//
//   node scripts/make-teacher-clips.mjs                 # весь параграф
//   node scripts/make-teacher-clips.mjs --limit 5       # первые 5 тактов (проба)
//   LIPSYNC_CMD="python musetalk/infer.py --face {face} --audio {audio} --out {out}" \
//     node scripts/make-teacher-clips.mjs
//
// Выход: .tmp/sketches/tutor/clips/clip-<хеш>.mp4 + clips/index.json
import { chromium } from 'playwright'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import fs from 'node:fs'
import path from 'node:path'

const run = promisify(execFile)
const OUT = '.tmp/sketches/tutor/clips'
const FACE = process.env.TEACHER_FACE || '.tmp/sketches/tutor/face/teacher.png'
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe'
const LIMIT = (() => { const i = process.argv.indexOf('--limit'); return i > 0 ? +process.argv[i + 1] : 0 })()
// короткий устойчивый хеш текста (djb2) — ровно такой же считает страница урока
const hashText = (t) => { let h = 5381
  for (const ch of String(t)) h = ((h * 33) ^ ch.codePointAt(0)) >>> 0
  return h.toString(16).padStart(8, '0') }
// подпись рендера: что ещё, кроме текста, влияет на КАРТИНКУ ролика
const hashBytes = (buf) => { let h = 5381
  for (const b of buf) h = ((h * 33) ^ b) >>> 0
  return h.toString(16).padStart(8, '0') }
// Заглушка вместо липсинка: портрет + звук + лёгкое «дыхание» кадра (медленный зум).
// Губы не двигаются, но ролик живой и вся цепочка проверяется целиком.
const STUB = 'ffmpeg -y -loop 1 -i {face} -i {audio} -filter_complex ' +
  '"[0:v]scale=512:512,zoompan=z=\'min(1.06,1+0.0006*on)\':d=1:s=512x512:fps=25[v]" ' +
  '-map "[v]" -map 1:a -c:v libx264 -preset veryfast -crf 26 -pix_fmt yuv420p -c:a aac -b:a 64k -shortest {out}'
const CMD = process.env.LIPSYNC_CMD || STUB
// Пакетный движок: получает СПИСОК работ и грузит веса один раз. Плейсхолдеры {jobs} {face}.
//   LIPSYNC_BATCH_CMD=".tmp/lipsync-venv/Scripts/python.exe scripts/lipsync-batch.py
//                      --jobs {jobs} --face {face} --idle .tmp/lipsync/idle-expressive.mp4"
const BATCH = process.env.LIPSYNC_BATCH_CMD || ''

fs.mkdirSync(OUT, { recursive: true })
if (!fs.existsSync(FACE)) {
  console.error('нет лица: ' + FACE + '\n  положи портрет учителя (png/jpg) или задай TEACHER_FACE')
  process.exit(1)
}
const SIG = hashBytes(Buffer.concat([fs.readFileSync(FACE), Buffer.from(BATCH || CMD)])).slice(0, 6)

// ── 1. берём такты урока из самой страницы: сценарий там собирается из учебника ──
const browser = await chromium.launch({ executablePath: fs.existsSync(CHROME) ? CHROME : undefined,
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] })
const page = await browser.newPage()
await page.goto('http://localhost:8781/kniga', { waitUntil: 'domcontentloaded', timeout: 60000 })
await page.waitForFunction(() => window.__kniga && window.__kniga.beats() > 0, null, { timeout: 60000 })
let beats = await page.evaluate(() => window.__kniga.fullScript())
await browser.close()
if (LIMIT) beats = beats.slice(0, LIMIT)
console.log('тактов к рендеру: ' + beats.length)

// ── 2. на каждый такт: синтез Яндекса → ролик ──────────────────────────────
// Два режима рендера. По умолчанию — процесс на реплику (LIPSYNC_CMD): просто, но одна
// загрузка весов стоит ~37 секунд, и на 70 тактах это 43 минуты простоя. Если задан
// LIPSYNC_BATCH_CMD с плейсхолдером {jobs} — сначала синтезируем ВЕСЬ звук, потом отдаём
// движку список работ разом, и модель грузится ОДИН раз (замер: ×12 против ×16–20).
const index = []
const todo = []
let chars = 0, reused = 0, made = 0
for (let i = 0; i < beats.length; i++) {
  const text = beats[i].say
  const h = hashText(text)
  const mp3 = path.join(OUT, `clip-${h}.mp3`), mp4 = path.join(OUT, `clip-${h}-${SIG}.mp4`)
  const row = { n: i + 1, h, page: beats[i].page, kind: beats[i].kind, file: `clip-${h}-${SIG}.mp4` }
  if (fs.existsSync(mp4)) {                       // уже отрендерено — берём как есть
    index.push({ ...row, bytes: fs.statSync(mp4).size }); reused++
    process.stdout.write(`\r  готово ${index.length}/${beats.length} · из кеша      `)
    continue
  }
  if (!fs.existsSync(mp3)) {
    chars += text.length
    const r = await fetch('http://localhost:8781/api/tts', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ voice: 'alena', role: 'good', speed: 0.95, text }),
    })
    if (!r.ok) { console.error(`\n  такт ${i + 1}: синтез не ответил (${r.status})`); continue }
    fs.writeFileSync(mp3, Buffer.from(await r.arrayBuffer()))
  }
  if (BATCH) { todo.push({ row, mp3, mp4 }); continue }   // рендер будет одной пачкой ниже
  const cmd = CMD.replace(/\{face\}/g, FACE).replace(/\{audio\}/g, mp3).replace(/\{out\}/g, mp4)
  const [exe, ...args] = splitCmd(cmd)
  try { await run(exe, args, { maxBuffer: 1 << 24 }) }
  catch (e) { console.error(`\n  такт ${i + 1}: рендер упал — ${String(e.stderr || e).slice(0, 160)}`); continue }
  const size = fs.statSync(mp4).size
  index.push({ ...row, bytes: size }); made++
  process.stdout.write(`\r  готово ${index.length}/${beats.length} · ${(size / 1024) | 0} КБ   `)
}

if (BATCH && todo.length) {
  const jobsFile = path.join(OUT, 'jobs.json')
  fs.writeFileSync(jobsFile, JSON.stringify(todo.map((t) => ({ audio: t.mp3, out: t.mp4 })), null, 1))
  console.log(`\n  пачкой: ${todo.length} реплик, модель грузится один раз…`)
  const [exe, ...args] = splitCmd(BATCH.replace(/\{jobs\}/g, jobsFile).replace(/\{face\}/g, FACE))
  // ⚠️ stdio:'inherit' сюда передавать НЕЛЬЗЯ — это опция spawn, а не execFile: процесс
  // отработает, но промис отвергнется с ПУСТОЙ ошибкой, и прогон ложно отрапортует о
  // падении при готовых роликах (ловили 05.08). Забираем вывод обычным способом.
  try {
    const r = await run(exe, args, { maxBuffer: 1 << 26 })
    const tail = String(r.stdout || '').split('\n').filter((s) => s.trim()).slice(-3).join('\n  ')
    if (tail) console.log('  ' + tail)
  } catch (e) { console.error(`  пачка упала — ${String(e.stderr || e.message || e).slice(0, 300)}`) }
  for (const t of todo) {
    if (!fs.existsSync(t.mp4)) { console.error(`  нет ролика для такта ${t.row.n}`); continue }
    index.push({ ...t.row, bytes: fs.statSync(t.mp4).size }); made++
  }
  index.sort((x, y) => x.n - y.n)
}
fs.writeFileSync(path.join(OUT, 'index.json'), JSON.stringify({ beats: index }, null, 1))

// Мусор от прошлых прогонов (переименованные такты, снятые реплики) — убираем сами.
// ⚠️ ТОЛЬКО на полном прогоне: при --limit в индексе лежит горстка тактов, и чистка
// снесёт кеш всего остального параграфа вместе с оплаченным синтезом (снесли 112 файлов
// 04.08, пока это не починили). Проба не должна ничего удалять.
const live = new Set(index.flatMap((b) => [b.file, `clip-${b.h}.mp3`]))
let dropped = 0
if (!LIMIT) {
  for (const f of fs.readdirSync(OUT)) {
    if (f === 'index.json' || live.has(f)) continue
    fs.unlinkSync(path.join(OUT, f)); dropped++
  }
}

const total = index.reduce((a, b) => a + b.bytes, 0)
console.log(`\n✅ роликов ${index.length} · снято заново ${made}, из кеша ${reused}` +
  (dropped ? `, удалено лишних ${dropped}` : '') +
  (LIMIT ? ' · проба: чистка кеша пропущена' : ''))
console.log(`   подпись рендера: ${SIG} (лицо ${path.basename(FACE)} + движок)`)
console.log(`   весь урок ${(total / 1048576).toFixed(1)} МБ · в среднем ${(total / index.length / 1024) | 0} КБ на реплику`)
console.log(`   синтез в этот раз: ${chars} символов ≈ ${(chars / 1000 * 0.4).toFixed(2)} ₽ (прогон урока — 0 ₽)`)
console.log(`   движок: ${BATCH ? 'липсинк пачкой (одна загрузка модели)'
  : process.env.LIPSYNC_CMD ? 'внешний липсинк (процесс на реплику)'
  : 'заглушка ffmpeg (губы не двигаются)'}`)

// ffmpeg-строку нельзя рвать по пробелам наивно: внутри кавычек живёт filter_complex
function splitCmd(s) {
  const out = []; let cur = '', q = null
  for (const ch of s) {
    if (q) { if (ch === q) q = null; else cur += ch; continue }
    if (ch === '"' || ch === "'") { q = ch; continue }
    if (ch === ' ') { if (cur) out.push(cur); cur = ''; continue }
    cur += ch
  }
  if (cur) out.push(cur)
  return out
}
