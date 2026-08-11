#!/usr/bin/env node
// Приёмка правок 30.07: картинки к репликам, витрина находки, плавный перенос локаций.
//   node scripts/shot-krit-art.mjs [папка] [krit2|krit3]
//
// Что проверяет:
//   1. каждое имя картинки из сценария есть в наборе ART_SLIDES (иначе доска молча пуста);
//   2. каждая картинка рисуется без ошибок — и сохраняется PNG для глаза;
//   3. перенос локации реально проходит через белое пространство (TRANS.k падает и возвращается);
//   4. находка: карточка на доске → НАСТОЯЩИЙ клик мышью → витрина → НАСТОЯЩАЯ тяга мышью
//      → предмет встаёт в слот трофеев на парте.
// Мышь именно настоящая (mouse.move/down/up): dispatchEvent минует попадание курсора
// и пропускает ровно те поломки, что мешают ребёнку.
import { chromium } from 'playwright'
import fs from 'node:fs'
import path from 'node:path'
const OUT = process.argv[2] || '.tmp/shots-art'
const ROUTE = '/' + String(process.argv[3] || 'krit2').replace(/^.*[\/]/, '')
fs.mkdirSync(OUT, { recursive: true })
// Микрофон подсовываем настоящим сигналом: штатное фальшивое устройство Chrome
// отдаёт тишину, и урок честно говорит «ничего не расслышала» — проверить диалог
// на нём нельзя. Пишем короткий тон и скармливаем его как микрофон.
const FAKE_MIC = path.join(OUT, '_fake-mic.wav')
;(() => {
  const rate = 16000, sec = 4, n = rate * sec, d = Buffer.alloc(44 + n * 2)
  d.write('RIFF', 0); d.writeUInt32LE(36 + n * 2, 4); d.write('WAVE', 8); d.write('fmt ', 12)
  d.writeUInt32LE(16, 16); d.writeUInt16LE(1, 20); d.writeUInt16LE(1, 22)
  d.writeUInt32LE(rate, 24); d.writeUInt32LE(rate * 2, 28); d.writeUInt16LE(2, 32); d.writeUInt16LE(16, 34)
  d.write('data', 36); d.writeUInt32LE(n * 2, 40)
  for (let i = 0; i < n; i++) d.writeInt16LE(Math.round(Math.sin(i / rate * 2 * Math.PI * 220) * 9000), 44 + i * 2)
  fs.writeFileSync(FAKE_MIC, d)
})()
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe'
const browser = await chromium.launch({ executablePath: fs.existsSync(CHROME) ? CHROME : undefined,
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader',
         // микрофон: фальшивое устройство и авто-разрешение, иначе диалог не проверить
         '--use-fake-device-for-media-capture', '--use-fake-ui-for-media-stream',
         '--use-file-for-fake-audio-capture=' + path.resolve(FAKE_MIC),
         '--autoplay-policy=no-user-gesture-required'] })
const page = await browser.newPage({ viewport: { width: 1600, height: 900 }, permissions: ['microphone'] })
// Голос, распознавание и ответ учителя подменяем: приёмка не должна жечь квоту Яндекса.
function silentWav(sec = 0.25, rate = 8000) {
  const n = Math.round(sec * rate), d = Buffer.alloc(44 + n * 2)
  d.write('RIFF', 0); d.writeUInt32LE(36 + n * 2, 4); d.write('WAVE', 8); d.write('fmt ', 12)
  d.writeUInt32LE(16, 16); d.writeUInt16LE(1, 20); d.writeUInt16LE(1, 22)
  d.writeUInt32LE(rate, 24); d.writeUInt32LE(rate * 2, 28); d.writeUInt16LE(2, 32); d.writeUInt16LE(16, 34)
  d.write('data', 36); d.writeUInt32LE(n * 2, 40); return d
}
const HEARD = 'А почему у дворца не было стен?'
const ANSWER = 'Потому что Крит — остров: его защищало море и самый сильный флот.'
let sttBytes = 0, chatCalls = 0
await page.route('**/api/tts', r => r.fulfill({ status: 200, headers: { 'Content-Type': 'audio/wav' }, body: silentWav() }))
await page.route('**/api/stt', r => { sttBytes = (r.request().postDataBuffer() || Buffer.alloc(0)).length
  return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ text: HEARD, sec: 2.1 }) }) })
await page.route('**/api/chat', r => { chatCalls++
  return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ text: ANSWER }) }) })
const errs = []
const http404 = []
page.on('pageerror', e => errs.push(String(e)))
page.on('console', m => { if (m.type() === 'error' && !/favicon|Failed to load resource/.test(m.text())) errs.push('console: ' + m.text()) })
page.on('response', r => { if (r.status() >= 400) http404.push(r.status() + ' ' + r.url()) })
page.on('requestfailed', r => http404.push('FAIL ' + r.url()))
await page.goto('http://localhost:8781' + ROUTE, { waitUntil: 'networkidle', timeout: 60000 })
await page.waitForFunction(() => window.__krit && window.__lesson, null, { timeout: 30000 })

const bad = []
const ok = (c, t) => { console.log((c ? '  ✅ ' : '  ❌ ') + t); if (!c) bad.push(t) }

// ── 1. все имена картинок из сценария существуют ───────────────────────────
const cover = await page.evaluate(() => {
  const have = new Set(Object.keys(window.__lesson.ART_SLIDES))
  const used = [], missing = []
  window.__lesson.LESSON.forEach(L => L.say.forEach(ln => {
    if (!ln[2]) return
    used.push(ln[2]); if (!have.has(ln[2])) missing.push(L.n + ':' + ln[2])
  }))
  const lines = window.__lesson.LESSON.reduce((a, L) => a + L.say.length, 0)
  return { used: used.length, uniq: [...new Set(used)].length, missing, have: have.size, lines,
           noArt: window.__lesson.LESSON.filter(L => !L.say.some(l => l[2])).map(L => L.n) }
})
console.log('\n── КАРТИНКИ К РЕПЛИКАМ ──')
console.log(`  реплик всего ${cover.lines}, из них с картинкой ${cover.used} (${(cover.used / cover.lines * 100) | 0}%)`)
console.log(`  разных картинок в сценарии ${cover.uniq}, в наборе ${cover.have}`)
ok(!cover.missing.length, 'все имена картинок из сценария есть в наборе' + (cover.missing.length ? ' — НЕТ: ' + cover.missing.join(', ') : ''))
ok(!cover.noArt.length, 'нет шагов совсем без картинок' + (cover.noArt.length ? ' — пустые шаги: ' + cover.noArt.join(', ') : ''))

// ── 2. каждая рисуется и сохраняется ───────────────────────────────────────
// ⚠️ ТОЛЬКО ВНЕ ХАБА: в хабе доска показывает карточки локаций и слайд не рисует,
// поэтому в первой версии проверки все 43 файла оказались одинаковой картинкой хаба.
await page.evaluate(() => window.__lesson.enterLocation(2))
await page.waitForTimeout(3500)
ok(!(await page.evaluate(() => window.__lesson.trans())).hub, 'вышли из хаба — доска рисует слайды')
const names = await page.evaluate(() => window.__lesson.arts())
fs.mkdirSync(path.join(OUT, 'art'), { recursive: true })
const errs0 = errs.length
for (const id of names) {
  await page.evaluate(n => window.__lesson.showArt(n), id)
  // ⚠️ у части слайдов фон — сгенерённая иллюстрация; снимать надо ПОСЛЕ её загрузки,
  // иначе в кадр попадает вектор-запаска и правка выглядит несделанной
  await page.waitForFunction(() => window.__lesson.pics().every(p => p.готова || p.сбой), null, { timeout: 6000 }).catch(() => { })
  await page.waitForTimeout(120)
  const b64 = await page.evaluate(() => window.__lesson.shot().board)
  fs.writeFileSync(path.join(OUT, 'art', id + '.png'), Buffer.from(b64.split(',')[1], 'base64'))
}
const pics = await page.evaluate(() => window.__lesson.pics())
console.log(`  фотоиллюстраций: ${pics.filter(p => p.готова).length} из ${pics.length}` +
  (pics.some(p => p.сбой) ? ' — НЕ ПРИШЛИ: ' + pics.filter(p => p.сбой).map(p => p.id).join(', ') : ''))
ok(pics.length > 0 && !pics.some(p => p.сбой), 'все фотоиллюстрации слайдов отдались сервером')
ok(errs.length === errs0, `все ${names.length} картинок нарисовались без ошибок`)
// карточки находок рисуются только на своих шагах — снимаем их отдельно
for (const n of [1, 8, 13, 16]) {
  await page.evaluate(i => window.__lesson.goStep(i), n - 1)
  await page.waitForTimeout(n === 1 ? 2500 : 1200)
  const r = await page.evaluate(() => { window.__lesson.showArt('artefact')
    return { b: window.__lesson.shot().board, box: window.__lesson.ST.artBox, a: window.__lesson.info().artefact } })
  fs.writeFileSync(path.join(OUT, 'art', `card-${n}-${r.a}.png`), Buffer.from(r.b.split(',')[1], 'base64'))
  ok(!!r.box, `карточка находки шага ${n} (${r.a}) нарисована`)
}
await page.evaluate(() => window.__lesson.showArt(null))

// ── 3. перенос локации проходит через белое пространство ───────────────────
// ⚠️ мерить перенос можно ТОЛЬКО выйдя из хаба: в хабе мира нет и растворять нечего
console.log('\n── ПЕРЕНОС ЛОКАЦИИ ──')
const before = await page.evaluate(() => window.__lesson.trans())
ok(!before.hub && before.k > .95, 'локация 2 открыта и проявлена: ' + JSON.stringify(before))
const t = await page.evaluate(async () => {
  const seen = []
  const iv = setInterval(() => seen.push(window.__lesson.trans().k), 40)
  const t0 = performance.now()
  await window.__krit.buildScene(3)
  const ms = Math.round(performance.now() - t0)          // растворение внутри — минимум 1.1 с
  // ⚠️ Ждём с запасом: проявление длится 1.7 с и начинается ПОСЛЕ панорамы, а рядом
  // с ним теперь идёт сборка предметов — под нагрузкой тюин доезжает не сразу.
  await new Promise(r => setTimeout(r, 3000))
  clearInterval(iv)
  return { min: Math.min(...seen), max: Math.max(...seen), n: seen.length, ms, end: window.__lesson.trans() }
})
// Минимум берём ИЗ СТРАНИЦЫ (TRANS.min): опрос по таймеру в HD под swiftshader
// не попадает в провал — страница считает 1–2 кадра в секунду. Опрос снаружи
// оставлен как второе мнение и для счётчика кадров.
const kMin = t.end.минимум != null ? t.end.минимум : t.min
console.log(`  сборка с переносом заняла ${t.ms} мс · замеров ${t.n} · минимум k ${kMin.toFixed(3)} (опросом ${t.min.toFixed(3)}) · в конце ${t.end.k}`)
ok(t.ms >= 1100, 'перенос действительно проигрывается, а не пропускается')
ok(kMin < 0.15, 'мир растворяется до белого пространства (k < 0.15)')
ok(t.end.k > 0.95, 'и проявляется обратно полностью (k > 0.95)')
ok(t.end.грунт, 'грунт вернулся на пол после переноса')
// раскадровка переноса — чтобы плавность можно было увидеть, а не только замерить
await page.evaluate(() => window.__krit.hud(false))
page.evaluate(() => window.__krit.buildScene(4))
let prevMs = 0
for (const ms of [0, 260, 520, 900, 1600, 2600]) {
  if (ms > prevMs) await page.waitForTimeout(ms - prevMs)
  prevMs = ms
  await page.screenshot({ path: path.join(OUT, `move-${String(ms).padStart(4, '0')}.png`) })
}
await page.waitForTimeout(1500)
await page.evaluate(() => window.__krit.hud(true))

// ── 4. находка: доска → витрина → парта ────────────────────────────────────
console.log('\n── НАХОДКА ──')
await page.evaluate(() => window.__lesson.enterLocation(1))
await page.waitForTimeout(4000)
await page.evaluate(() => window.__krit.settle())
const info = await page.evaluate(() => window.__lesson.info())
ok(info.artefact === 'vase', 'у шага 1 находка — сосуд')
ok(info.art === 'artefact', 'доска сама показывает карточку находки')
ok(!!info.artBox, 'карточка занимает прямоугольник на доске: ' + JSON.stringify(info.artBox))

// экранная точка карточки считается в самой странице — тем же путём, что и клик
const pt = await page.evaluate(() => window.__lesson.artPoint())
ok(!!pt && pt.вкадре, 'карточка попадает в кадр: ' + JSON.stringify(pt && { x: pt.x | 0, y: pt.y | 0 }))
if (pt) {
  await page.mouse.move(pt.x, pt.y)
  await page.mouse.down(); await page.mouse.up()
  await page.waitForTimeout(500)
  const a1 = await page.evaluate(() => window.__lesson.art())
  ok(a1.on, 'настоящий клик мышью открыл витрину')
  // HD-сборка на программном рендере поднимается заметно медленнее — ждём дольше
  await page.waitForTimeout(4000)
  const a2 = await page.evaluate(() => window.__lesson.art())
  ok(a2.модель, 'модель находки загрузилась в витрину')
  ok(a2.fade > .8, 'затемнение поднялось (fade ' + a2.fade + ')')
  await page.screenshot({ path: path.join(OUT, 'artefact-open.png') })
  // крутим настоящей мышью
  await page.mouse.move(800, 450); await page.mouse.down()
  for (let i = 0; i < 40; i++) { await page.mouse.move(800 + i * 22, 450 + Math.sin(i / 5) * 8); await page.waitForTimeout(12) }
  await page.mouse.up()
  await page.waitForTimeout(400)
  const a3 = await page.evaluate(() => window.__lesson.art())
  console.log(`  накручено ${a3.spin} рад из 6.6`)
  ok(a3.spin > 3 || a3.done, 'тяга мышью реально крутит предмет')
  // добираем до конца
  await page.mouse.move(400, 450); await page.mouse.down()
  for (let i = 0; i < 60; i++) { await page.mouse.move(400 + i * 18, 450); await page.waitForTimeout(10) }
  await page.mouse.up()
  await page.waitForTimeout(2600)
  const got = await page.evaluate(() => window.__lesson.got())
  ok(got.includes('vase'), 'сосуд засчитан в находки: ' + JSON.stringify(got))
  await page.waitForTimeout(1500)
  const tr = await page.evaluate(() => window.__lesson.trophies())
  console.log('  слоты трофеев: ' + JSON.stringify(tr))
  ok(tr[0].есть, 'модель сосуда встала в слот трофеев на парте')
  ok(!tr[0].метка, 'камушек-заглушка в этом слоте погас')
  const g = tr[0].габарит || [0, 0, 0]
  ok(g[1] >= Math.max(g[0], g[2]), `сосуд СТОИТ, а не лежит (в × ш = ${g[1]} × ${Math.max(g[0], g[2]).toFixed(3)})`)
  ok(Math.max(g[0], g[2]) <= .09, 'находка помещается в кольцо слота (≤ 0.09 м)')
  const a4 = await page.evaluate(() => window.__lesson.art())
  ok(!a4.on, 'витрина закрылась сама')
  const inf2 = await page.evaluate(() => window.__lesson.info())
  ok(inf2.art !== 'artefact', 'доска вернулась к слайду шага')
  // общий вид парты с трофеем
  await page.evaluate(() => { window.__krit.hud(false); window.__krit.look(0, -26) })
  await page.waitForTimeout(600)
  await page.screenshot({ path: path.join(OUT, 'trophy-on-desk.png') })
  await page.evaluate(() => window.__krit.hud(true))
}

// ── 5. темп речи и пауза на слайд ──────────────────────────────────────────
console.log('\n── ТЕМП ──')
const sp = await page.evaluate(() => window.__lesson.speed())
console.log(`  ползунок отдаёт speed=${sp} (сервер по умолчанию 1.05 → ${((sp / 1.05 - 1) * 100).toFixed(1)}%)`)
ok(sp >= .90 && sp <= 1.0, 'темп сбавлен на 5–10% от прежнего')
const hold = await page.evaluate(() => window.__lesson.hold())
ok(hold >= 1500, `картинка держится после реплики ${hold} мс — есть время рассмотреть`)
// реально ли шаг стал дольше: у шага 1 четыре реплики с картинкой
const dur = await page.evaluate(async () => {
  window.__lesson.goStep(0); await new Promise(r => setTimeout(r, 800))
  const t0 = performance.now(); await window.__bh.say(); return Math.round(performance.now() - t0)
})
console.log(`  шаг 1 целиком (с подменённым голосом): ${dur} мс`)
ok(dur > 4 * hold * .8, 'паузы на слайды реально держатся, а не проскакивают')

// ── 6. разговор с учителем ─────────────────────────────────────────────────
console.log('\n── МИКРОФОН И ДИАЛОГ ──')
const m0 = await page.evaluate(() => window.__lesson.mic())
ok(m0.есть && m0.виден, 'кнопка микрофона есть и видна')
await page.evaluate(() => { window.__krit.hud(true); document.querySelector('#hudToggle').click() })
await page.waitForTimeout(300)
ok((await page.evaluate(() => window.__lesson.mic())).виден, 'кнопка микрофона переживает скрытие панели настроек')
await page.evaluate(() => document.querySelector('#hudToggle').click())
// расшифровка реплик прячется и возвращается
await page.evaluate(() => document.querySelector('#sayHide').click()); await page.waitForTimeout(200)
ok((await page.evaluate(() => window.__lesson.sayPanel())).скрыт, 'расшифровка реплик прячется кнопкой ✕')
await page.evaluate(() => document.querySelector('#sayToggle').click()); await page.waitForTimeout(200)
ok(!(await page.evaluate(() => window.__lesson.sayPanel())).скрыт, 'и возвращается кнопкой 💬 у микрофона')
// говорим
await page.click('#micBtn'); await page.waitForTimeout(1400)
const m1 = await page.evaluate(() => window.__lesson.mic())
ok(m1.пишет, 'нажатие на «Говорить» включает запись: ' + JSON.stringify(m1))
ok(m1.диалог, 'урок при этом уходит в режим диалога и ждёт ребёнка')
await page.screenshot({ path: path.join(OUT, 'mic-listen.png') })
await page.click('#micBtn')          // стоп → распознавание → ответ
await page.waitForTimeout(3500)
ok(sttBytes > 8000, `запись ушла на распознавание (${sttBytes} байт PCM)`)
ok(chatCalls > 0, 'расслышанное ушло в LLM за ответом')
const log = await page.evaluate(() => [...document.querySelectorAll('#micLog div')].map(d => d.textContent))
console.log('  лента диалога:', JSON.stringify(log))
ok(log.some(t => t.includes(HEARD)), 'что расслышали — показано ребёнку')
ok(log.some(t => t.includes(ANSWER.slice(0, 24))), 'ответ учителя показан и озвучен')
await page.screenshot({ path: path.join(OUT, 'mic-answer.png') })
const m2 = await page.evaluate(() => window.__lesson.mic())
ok(!m2.диалог && !m2.пишет, 'после ответа урок выходит из диалога сам: ' + JSON.stringify(m2))
const checks = await page.evaluate(() => window.__lesson.checks())
console.log('  шаги, где сама спрашивает «всё понятно?»:', JSON.stringify(checks))
ok(checks.length >= 4, 'в уроке расставлены остановки с вопросом «всё понятно?»')

console.log('\n' + (errs.length ? '⚠ ОШИБКИ СТРАНИЦЫ:' : '✅ ошибок страницы нет'))
;[...new Set(errs)].slice(0, 10).forEach(e => console.log('   ' + e.slice(0, 220)))
if (http404.length) { console.log('⚠ НЕ ЗАГРУЗИЛОСЬ:'); [...new Set(http404)].slice(0, 10).forEach(e => console.log('   ' + e)) }
else console.log('✅ все файлы отдались')
console.log(bad.length ? `\n❌ провалено проверок: ${bad.length}` : '\n✅ все проверки пройдены')
console.log(`кадры: ${path.resolve(OUT)}`)
await browser.close()
process.exit(bad.length || errs.length ? 1 : 0)
