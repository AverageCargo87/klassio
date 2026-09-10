#!/usr/bin/env node
// Какие амплуа Яндекс РЕАЛЬНО принимает для наших голосов — замер, а не доки.
// Зачем: в уроке из всех сочетаний оставлены только alena·good и alena·neutral,
// и непонятно, остальные не подошли на слух или просто не работают. Перед тем как
// строить пульт характера, надо знать палитру.
//
//   node scripts/proba-amplua.mjs            # короткая фраза на каждое сочетание
//
// Пишет mp3 в .tmp/amplua/<голос>-<амплуа>.mp3 — их потом можно послушать подряд.
import fs from 'node:fs'
import path from 'node:path'

const БАЗА = process.env.БАЗА || 'http://127.0.0.1:8781'
const ФРАЗА = 'Смотри, вот здесь про это написано. Как ты думаешь, что тут главное?'
const ПАПКА = '.tmp/amplua'

// v1: emotion = neutral|good|evil (по докам). v3: role — список шире и меняется.
const ПРОБЫ = [
  ...['alena', 'jane', 'omazh', 'marina', 'dasha', 'julia', 'lera'].flatMap(г =>
    ['neutral', 'good', 'evil', 'friendly', 'whisper', 'strict'].map(р => ({ voice: г, role: р, v3: false }))),
  ...['masha', 'alena', 'julia', 'dasha'].flatMap(г =>
    ['neutral', 'good', 'friendly', 'strict', 'whisper'].map(р => ({ voice: г, role: р, v3: true }))),
]

fs.mkdirSync(ПАПКА, { recursive: true })
const годные = [], мимо = []

for (const п of ПРОБЫ) {
  const имя = `${п.voice}-${п.role}${п.v3 ? '-v3' : ''}`
  try {
    const r = await fetch(БАЗА + '/api/tts', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ voice: п.voice, role: п.role, v3: п.v3, speed: 1, text: ФРАЗА }),
    })
    if (!r.ok) { мимо.push([имя, (await r.text()).slice(0, 90)]); continue }
    const buf = Buffer.from(await r.arrayBuffer())
    if (buf.length < 2000) { мимо.push([имя, 'пустой ответ ' + buf.length + ' Б']); continue }
    fs.writeFileSync(path.join(ПАПКА, имя + '.mp3'), buf)
    годные.push([имя, buf.length])
  } catch (e) {
    мимо.push([имя, e.message.slice(0, 90)])
  }
}

console.log('\n════ РАБОТАЮТ (' + годные.length + ') ════')
for (const [и, б] of годные) console.log('  ✅', и.padEnd(24), (б / 1024).toFixed(0) + ' КБ')
console.log('\n════ НЕ ПРИНЯТЫ (' + мимо.length + ') ════')
for (const [и, п] of мимо) console.log('  ✗ ', и.padEnd(24), п)
console.log('\nфайлы:', ПАПКА)
