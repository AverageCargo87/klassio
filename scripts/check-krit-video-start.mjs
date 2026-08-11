#!/usr/bin/env node
// Приёмка двух правок 31.07 по уроку §20 (/krit3):
//   1) «bitHuman выбираю — нет картинки другого учителя»: видео-учитель обязан
//      подняться САМ при выборе, лиц должно быть несколько, смена лица — работать;
//   2) «выбираю локацию, а урок всё равно с начала»: прогон обязан идти С ВЫБРАННОГО
//      МЕСТА — и от карточки хаба, и от кнопки «▶ начать урок».
//
// ⚠️ Синтез речи ПОДМЕНЁН тишиной (page.route на /api/tts): проверяем маршрут урока,
// а не голос, и не жжём символы Яндекса. Микрофон в headless не поднимается — это
// ожидаемо и на проверку не влияет.
//
//   node scripts/check-krit-video-start.mjs        (сервер :8781 должен быть поднят)
import { chromium } from 'playwright'
import fs from 'node:fs'

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe'

// 0.12 c тишины в WAV: браузер такое играет и честно шлёт `ended` — урок идёт дальше
function silentWav(sec = 0.12, rate = 16000) {
  const n = Math.round(sec * rate), b = Buffer.alloc(44 + n * 2)
  b.write('RIFF', 0); b.writeUInt32LE(36 + n * 2, 4); b.write('WAVE', 8)
  b.write('fmt ', 12); b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(1, 22)
  b.writeUInt32LE(rate, 24); b.writeUInt32LE(rate * 2, 28); b.writeUInt16LE(2, 32); b.writeUInt16LE(16, 34)
  b.write('data', 36); b.writeUInt32LE(n * 2, 40)
  return b
}
const WAV = silentWav()

const browser = await chromium.launch({ executablePath: fs.existsSync(CHROME) ? CHROME : undefined,
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required'] })
const page = await browser.newPage({ viewport: { width: 1400, height: 800 } })
const errs = []
page.on('pageerror', (e) => errs.push('pageerror: ' + e))
page.on('console', (m) => { if (m.type() === 'error' && !/favicon|getUserMedia|микрофон/i.test(m.text())) errs.push('console: ' + m.text()) })
await page.route('**/api/tts', (route) => route.fulfill({ status: 200, contentType: 'audio/wav', body: WAV }))

const ok = [], bad = []
const say = (good, t) => (good ? ok : bad).push(t)
const state = () => page.evaluate(() => window.__lesson.runState())
const stopRun = async () => { await page.evaluate(() => { if (window.__lesson.runState().идёт) document.querySelector('#btnRun').click() }); await page.waitForTimeout(300) }
// ждём условие, а не «секунду на глазок»: под swiftshader сборка HD-локации небыстрая
async function until(fn, ms, why) {
  const t0 = Date.now()
  for (;;) {
    if (await fn()) return true
    if (Date.now() - t0 > ms) { bad.push('не дождались: ' + why); return false }
    await page.waitForTimeout(400)
  }
}

await page.goto('http://localhost:8781/krit3', { waitUntil: 'domcontentloaded', timeout: 90000 })
await page.waitForFunction(() => window.__lesson && window.__bh && window.__krit, null, { timeout: 90000 })
await page.mouse.click(700, 700)                       // жест пользователя: без него нет звука

// ── 1. ВИДЕО-УЧИТЕЛЬ ──────────────────────────────────────────────────────
await page.selectOption('#tchWho', 'bh')
await until(() => page.evaluate(() => window.__bh.video().вкадре), 20000, 'видео-учитель в кадре')
let v = await page.evaluate(() => window.__bh.video())
say(v.лиц.length >= 2, `лиц в выпадашке: ${v.лиц.length} (${v.лиц.join(', ')})`)
say(v.вкадре, 'поток поднялся САМ, без кнопок · ' + v.статус)
say(v.кадр[0] > 0, 'кадр дошёл до браузера: ' + v.кадр.join('×'))

await page.waitForTimeout(800)
const painted = await page.evaluate(() => {          // кадр обязан лечь на экран учителя
  const c = window.__bh.canvas, x = c.getContext('2d')
  const d = x.getImageData(0, 0, c.width, c.height).data
  const uniq = new Set()
  for (let i = 0; i < d.length; i += 4 * 997) uniq.add(d[i] + ',' + d[i + 1] + ',' + d[i + 2])
  return uniq.size
})
say(painted > 4, 'на экране учителя настоящий кадр (цветов: ' + painted + ')')

const second = v.лиц[1]
await page.evaluate((id) => window.__bh.setFace(id), second)
await until(async () => { const s = await page.evaluate(() => window.__bh.video())
  return s.лицо === second && s.вкадре }, 20000, 'смена лица и новый поток')
v = await page.evaluate(() => window.__bh.video())
say(v.лицо === second && v.вкадре, `смена лица на «${second}» · ${v.статус}`)

// экран заглушки должен ОБЪЯСНЯТЬ, когда картинки нет: адрес несуществующего раннера
await page.selectOption('#bhSrc', 'run')
await page.fill('#bhBase', 'http://localhost:9') // порт, где никого нет
await page.evaluate(() => window.__bh.connect())
await page.waitForTimeout(2500)
const st1 = await page.evaluate(() => window.__bh.video().статус)
say(/не отвечает|ошибка|списка/i.test(st1), 'мёртвый раннер объяснён словами: ' + st1)
await page.selectOption('#bhSrc', 'mock')
await page.waitForTimeout(1500)

// ── 2. УРОК С ВЫБРАННОГО МЕСТА ────────────────────────────────────────────
await page.selectOption('#tchWho', 'av-avaturn')      // дальше проверяем маршрут, видео не нужно
await page.waitForTimeout(600)

for (const [scene, wantStep] of [[3, 11], [2, 5]]) {
  const first = await page.evaluate((s) => window.__lesson.sceneFirst(s), scene)
  say(first + 1 === wantStep, `первый шаг локации ${scene} = ${first + 1} (ждали ${wantStep})`)
  await page.evaluate((s) => window.__lesson.runFrom(s), scene)
  const got = await until(async () => (await state()).шаг === wantStep, 70000, `урок дошёл до шага ${wantStep} (локация ${scene})`)
  const s2 = await state()
  say(got && s2.идёт, `прогон с локации ${scene} → шаг ${s2.шаг} (ждали ${wantStep}) · «${s2.статус}»`)
  say(s2.сместа === scene, `выпадашка «урок с места» встала на ${s2.сместа}`)
  await stopRun()
}

// кнопка ▶ читает выпадашку, а не событие клика
await page.selectOption('#startFrom', '4')
await page.click('#btnRun')
const got4 = await until(async () => (await state()).шаг === 15, 70000, 'кнопка ▶ довела до шага 15')
const s4 = await state()
say(got4 && s4.идёт, '«▶ начать урок» уважает выбор места → шаг ' + s4.шаг + ' (ждали 15)')
await stopRun()

console.log('\n✅ ' + ok.join('\n✅ '))
if (bad.length) console.log('\n❌ ' + bad.join('\n❌ '))
if (errs.length) console.log('\n⚠ ошибки страницы:\n  ' + [...new Set(errs)].slice(0, 8).join('\n  '))
console.log(`\nитог: ${ok.length} ок, ${bad.length} мимо, ошибок страницы ${errs.length}`)
await browser.close()
process.exit(bad.length || errs.length ? 1 : 0)
