#!/usr/bin/env node
// Рисует НЕСКОЛЬКО лиц-заглушек для мока bitHuman: по папке на лицо, в каждой
// шесть кадров (talk0…talk4 — рот от закрытого к распахнутому, blink — моргание).
//
// Зачем: в уроке появился ВЫБОР лица видео-учителя, а настоящие лица bitHuman —
// это .imx из их галереи, для которых нужен ключ bh_. Пока ключа нет, выбор надо
// на чём-то проверять: мок отдаёт эти кадры и ведёт себя ровно как боевой раннер.
// Кадры плоские, нарочно: их видно как «заглушку», а не как настоящего человека.
//
//   node scripts/make-bhmock-faces.mjs
//   → .tmp/sketches/tutor/m/bhmock/<id>/{talk0..talk4,blink}.jpg
import { chromium } from 'playwright'
import fs from 'node:fs'
import path from 'node:path'

const OUT = '.tmp/sketches/tutor/m/bhmock'
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe'

// Пять непохожих друг на друга «учителей»: разная причёска, кожа, одежда, очки, борода.
// Порядок = порядок в выпадающем списке урока; первый — тот, что был раньше одним лицом.
const FACES = [
  { id: 'anya',   name: 'Аня · тёмное каре',     skin: '#E8BE99', hair: '#5B3A2A', style: 'bob',   cloth: '#46687C', bg: '#1B2430' },
  { id: 'marina', name: 'Марина · пучок, очки',  skin: '#F0CDAE', hair: '#C9A24B', style: 'bun',   cloth: '#4E7A5E', bg: '#1E2A28', glasses: true },
  { id: 'viktor', name: 'Виктор · борода',       skin: '#D9A87C', hair: '#2E2A28', style: 'short', cloth: '#5A5560', bg: '#232028', beard: true },
  { id: 'zarina', name: 'Зарина · длинные',      skin: '#B98058', hair: '#1F1A20', style: 'long',  cloth: '#7A3B4A', bg: '#241E26' },
  { id: 'oleg',   name: 'Олег Петрович · седой', skin: '#E3C0A4', hair: '#C8C4BE', style: 'short', cloth: '#6B5233', bg: '#262218', glasses: true },
]

const browser = await chromium.launch({ executablePath: fs.existsSync(CHROME) ? CHROME : undefined })
const page = await browser.newPage({ viewport: { width: 400, height: 440 } })
await page.setContent('<canvas id=c width=360 height=400></canvas>')

const drawn = await page.evaluate((faces) => {
  const c = document.getElementById('c'), x = c.getContext('2d')
  const rr = (X, Y, W, H, R) => { x.beginPath(); x.moveTo(X + R, Y)
    x.arcTo(X + W, Y, X + W, Y + H, R); x.arcTo(X + W, Y + H, X, Y + H, R)
    x.arcTo(X, Y + H, X, Y, R); x.arcTo(X, Y, X + W, Y, R); x.closePath() }
  const dark = (hex, k) => { const n = parseInt(hex.slice(1), 16)
    const r = Math.round(((n >> 16) & 255) * k), g = Math.round(((n >> 8) & 255) * k), b = Math.round((n & 255) * k)
    return `rgb(${r},${g},${b})` }

  function draw(f, open, blink) {
    x.fillStyle = f.bg; x.fillRect(0, 0, 360, 400)
    // длинные волосы лежат ЗА головой и плечами — рисуем первыми
    if (f.style === 'long') { x.fillStyle = dark(f.hair, .92)
      x.beginPath(); x.ellipse(180, 210, 104, 150, 0, 0, 6.283); x.fill() }
    // плечи
    x.fillStyle = f.cloth
    x.beginPath(); x.ellipse(180, 470, 140, 165, 0, 0, 6.283); x.fill()
    // шея
    x.fillStyle = dark(f.skin, .88); rr(158, 244, 44, 62, 16); x.fill()
    // голова
    x.fillStyle = f.skin
    x.beginPath(); x.ellipse(180, 186, 78, 92, 0, 0, 6.283); x.fill()
    x.beginPath(); x.ellipse(104, 192, 12, 16, 0, 0, 6.283); x.fill()
    x.beginPath(); x.ellipse(256, 192, 12, 16, 0, 0, 6.283); x.fill()
    // причёска
    x.fillStyle = f.hair
    if (f.style === 'bob') {
      x.beginPath(); x.ellipse(180, 152, 82, 76, 0, Math.PI, 0); x.fill()
      x.fillRect(98, 148, 26, 84); x.fillRect(236, 148, 26, 84)
    } else if (f.style === 'bun') {
      x.beginPath(); x.ellipse(180, 150, 80, 70, 0, Math.PI, 0); x.fill()
      x.beginPath(); x.arc(180, 74, 30, 0, 6.283); x.fill()
    } else if (f.style === 'short') {
      x.beginPath(); x.ellipse(180, 156, 80, 68, 0, Math.PI, 0); x.fill()
      rr(104, 150, 12, 30, 6); x.fill(); rr(244, 150, 12, 30, 6); x.fill()   // виски, а не квадраты
    } else {                                   // long — передние пряди
      x.beginPath(); x.ellipse(180, 150, 82, 74, 0, Math.PI, 0); x.fill()
      // пряди уводим ЗА силуэт лица и скругляем: вровень с щекой они делали лицо квадратным
      rr(92, 148, 24, 120, 12); x.fill(); rr(244, 148, 24, 120, 12); x.fill()
    }
    // борода
    // борода идёт ПО ЛИНИИ ЧЕЛЮСТИ: прямоугольниками по бокам лицо выходило квадратным
    if (f.beard) { x.fillStyle = dark(f.hair, 1.05)
      x.beginPath(); x.moveTo(112, 188)
      x.quadraticCurveTo(122, 272, 180, 280); x.quadraticCurveTo(238, 272, 248, 188)
      x.quadraticCurveTo(216, 220, 180, 220); x.quadraticCurveTo(144, 220, 112, 188)
      x.fill()
      x.beginPath(); x.ellipse(180, 214, 34, 11, 0, 0, 6.283); x.fill() }   // усы
    // брови
    x.strokeStyle = dark(f.hair, .9); x.lineWidth = 6; x.lineCap = 'round'
    x.beginPath(); x.moveTo(136, 152); x.lineTo(170, 148); x.stroke()
    x.beginPath(); x.moveTo(190, 148); x.lineTo(224, 152); x.stroke()
    // глаза
    if (blink) { x.strokeStyle = '#3A2E28'; x.lineWidth = 5
      x.beginPath(); x.moveTo(138, 176); x.lineTo(168, 176); x.stroke()
      x.beginPath(); x.moveTo(192, 176); x.lineTo(222, 176); x.stroke()
    } else {
      for (const ex of [153, 207]) {
        x.fillStyle = '#FFFFFF'; x.beginPath(); x.ellipse(ex, 176, 15, 12, 0, 0, 6.283); x.fill()
        x.fillStyle = '#26313D'; x.beginPath(); x.arc(ex + 2, 176, 6.5, 0, 6.283); x.fill()
        x.fillStyle = 'rgba(255,255,255,.85)'; x.beginPath(); x.arc(ex + 4.5, 173, 2.2, 0, 6.283); x.fill()
      }
    }
    // нос
    x.strokeStyle = dark(f.skin, .78); x.lineWidth = 4
    x.beginPath(); x.moveTo(181, 182); x.lineTo(175, 208); x.stroke()
    // рот: open 0…4 — от сомкнутых губ до распахнутого «а»
    const k = open / 4, mw = 44 + k * 10, mh = 5 + k * 30
    x.fillStyle = '#7A2630'
    x.beginPath(); x.ellipse(180, 232 + mh * .18, mw / 2, mh / 2, 0, 0, 6.283); x.fill()
    if (open >= 2) { x.fillStyle = '#F4EDE6'
      x.beginPath(); x.ellipse(180, 232 - mh * .28, mw / 2 - 5, Math.min(7, mh * .18), 0, 0, 6.283); x.fill() }
    if (open >= 3) { x.fillStyle = '#B84653'
      x.beginPath(); x.ellipse(180, 232 + mh * .30, mw / 2 - 9, mh * .20, 0, 0, 6.283); x.fill() }
    // очки — поверх лица
    if (f.glasses) { x.strokeStyle = '#2B2B31'; x.lineWidth = 4
      x.beginPath(); x.ellipse(153, 176, 26, 21, 0, 0, 6.283); x.stroke()
      x.beginPath(); x.ellipse(207, 176, 26, 21, 0, 0, 6.283); x.stroke()
      x.beginPath(); x.moveTo(179, 174); x.lineTo(181, 174); x.stroke()
      x.beginPath(); x.moveTo(127, 172); x.lineTo(108, 168); x.stroke()
      x.beginPath(); x.moveTo(233, 172); x.lineTo(252, 168); x.stroke() }
    // плашка «это заглушка» — чтобы мок никто не принял за боевого аватара
    x.fillStyle = 'rgba(255,255,255,.10)'; rr(14, 14, 168, 30, 10); x.fill()
    x.fillStyle = 'rgba(255,255,255,.72)'; x.font = '600 15px Segoe UI, sans-serif'; x.textAlign = 'left'
    x.fillText('bitHuman · МОК', 26, 34)
    return c.toDataURL('image/jpeg', .84)
  }

  const out = {}
  for (const f of faces) {
    out[f.id] = { name: f.name, frames: {} }
    for (let i = 0; i <= 4; i++) out[f.id].frames['talk' + i] = draw(f, i, false)
    out[f.id].frames.blink = draw(f, 0, true)
  }
  return out
}, FACES)

let n = 0
for (const [id, f] of Object.entries(drawn)) {
  const dir = path.join(OUT, id)
  fs.mkdirSync(dir, { recursive: true })
  for (const [frame, url] of Object.entries(f.frames)) {
    fs.writeFileSync(path.join(dir, frame + '.jpg'), Buffer.from(url.split(',')[1], 'base64'))
    n++
  }
  console.log('  ' + id.padEnd(8) + ' — ' + f.name)
}
// список лиц лежит рядом с кадрами: мок читает его и отдаёт браузеру как /avatars
fs.writeFileSync(path.join(OUT, 'faces.json'),
  JSON.stringify(FACES.map(({ id, name }) => ({ id, name })), null, 2))
console.log(`✅ ${n} кадров, ${FACES.length} лиц → ${OUT}`)
await browser.close()
