#!/usr/bin/env node
// Приёмка прототипа «урок по учебнику» (/kniga): книга листается, метки садятся
// на настоящие слова, учитель поднимается, прогон сам листает и подчёркивает.
// Синтез подменяем тишиной (page.route) — проверяем механику, а не голос.
//   node scripts/check-kniga.mjs [папка-для-снимков]
import { chromium } from 'playwright'
import fs from 'node:fs'

const OUT = process.argv[2] || '.tmp/shots-kniga'
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe'
fs.mkdirSync(OUT, { recursive: true })

function silentWav(sec = 0.12, rate = 16000) {
  const n = Math.round(sec * rate), b = Buffer.alloc(44 + n * 2)
  b.write('RIFF', 0); b.writeUInt32LE(36 + n * 2, 4); b.write('WAVE', 8)
  b.write('fmt ', 12); b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(1, 22)
  b.writeUInt32LE(rate, 24); b.writeUInt32LE(rate * 2, 28); b.writeUInt16LE(2, 32); b.writeUInt16LE(16, 34)
  b.write('data', 36); b.writeUInt32LE(n * 2, 40)
  return b
}
const browser = await chromium.launch({ executablePath: fs.existsSync(CHROME) ? CHROME : undefined,
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required'] })
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } })
const errs = []
page.on('pageerror', (e) => errs.push('pageerror: ' + e))
page.on('console', (m) => { if (m.type() === 'error' && !/favicon|getUserMedia/i.test(m.text())) errs.push(m.text().slice(0, 140)) })
await page.route('**/api/tts', (r) => r.fulfill({ status: 200, contentType: 'audio/wav', body: silentWav(2.4) }))

const ok = [], bad = []
const say = (good, t) => (good ? ok : bad).push(t)
const st = () => page.evaluate(() => window.__kniga.state())

await page.goto('http://localhost:8781/kniga', { waitUntil: 'domcontentloaded', timeout: 60000 })
await page.waitForFunction(() => window.__kniga, null, { timeout: 60000 })
await page.mouse.click(800, 850)

// 1. книга собралась
await page.waitForTimeout(1500)
const sp = await page.evaluate(() => window.__kniga.sheet())
say(sp.страница === 120, 'открыта страница ' + sp.страница)
const imgOk = await page.evaluate(() => {
  const a = document.querySelector('#leftImg')
  return a.naturalWidth > 400 ? [a.naturalWidth, a.naturalHeight] : null })
say(!!imgOk, 'страница учебника отрисована ' + (imgOk ? imgOk.join('×') : '—'))
// правая половина — рабочая панель, а не вторая страница (правка по фидбэку 03.08)
const pnl = await page.evaluate(() => {
  const p = document.querySelector('#panel'), l = document.querySelector('#left')
  const rp = p.getBoundingClientRect(), rl = l.getBoundingClientRect()
  return { есть: !!p, справа: rp.left >= rl.right - 2, ширина: Math.round(rp.width), страницаШирина: Math.round(rl.width),
    зоны: [!!document.querySelector('#demo'), !!document.querySelector('#keep')] } })
say(pnl.есть && pnl.справа && pnl.зоны[0] && pnl.зоны[1],
  'справа от страницы стоит панель ' + pnl.ширина + 'px: показ + тизеры')
const nMarks = await page.evaluate(() => window.__kniga.marks().length)
say(nMarks >= 30, 'меток из текстового слоя: ' + nMarks)

// 2. подчёркивание садится на слова (ширина метки = ширина фразы, не ноль)
await page.evaluate(() => window.__kniga.mark('q_main', 'under'))
await page.waitForTimeout(900)
const shown = await page.evaluate(() => window.__kniga.shown())
say(shown.length > 0 && parseFloat(shown[0].ширина) > 20, 'подчёркивание нарисовано, ширина ' + (shown[0] ? shown[0].ширина : '—'))
await page.screenshot({ path: OUT + '/1-podcherk.png' })

await page.evaluate(() => window.__kniga.mark('photo_knossos', 'spot'))
await page.waitForTimeout(900)
await page.screenshot({ path: OUT + '/2-prozhektor.png' })
say((await page.evaluate(() => document.querySelectorAll('.mk.spot.on').length)) === 1, 'прожектор на фотографии дворца')

// 3. листание
await page.evaluate(() => window.__kniga.turn(1))
await page.waitForTimeout(1500)
const sp2 = await page.evaluate(() => window.__kniga.sheet())
say(sp2.страница === 121, 'перелистнулось на ' + sp2.страница)
await page.screenshot({ path: OUT + '/3-razvorot2.png' })

// 3b. два листания подряд не вешают вкладку и не проскакивают цель.
// Раньше turn во время другого поворота возвращал «готово», и goPage крутился вхолостую —
// страница вставала намертво. Ловилось только двумя листаниями подряд.
await page.evaluate(() => { window.__kniga.turn(1); window.__kniga.turn(1) })
await page.waitForTimeout(2600)
const sp3 = await page.evaluate(() => window.__kniga.sheet())
say(sp3.страница === 123, 'два листания подряд отработали оба: ' + sp3.страница)
await page.evaluate(() => { window.__kniga.goPage(121); window.__kniga.goPage(120) })
await page.waitForTimeout(4200)
const sp4 = await page.evaluate(() => window.__kniga.sheet())
say(sp4.страница === 120, 'две команды «на страницу» подряд привели на последнюю цель: ' + sp4.страница)

// 3c. голос Ани выбирается, и выбор реально уходит в синтез
const v0 = await page.evaluate(() => window.__kniga.voice())
say(v0.вариантов >= 6, 'в настройках есть выбор голоса: ' + v0.вариантов + ' шт.')
const v1 = await page.evaluate(() => {
  const sel = document.querySelector('#sVoice')
  sel.value = [...sel.options].map((o) => o.value).find((x) => !x.startsWith('alena'))
  sel.onchange()
  return window.__kniga.voice()
})
say(JSON.stringify(v1.вэфир) !== JSON.stringify(v0.вэфир), 'смена голоса меняет то, что уходит в синтез: '
  + v0.вэфир.voice + '/' + v0.вэфир.role + ' → ' + v1.вэфир.voice + '/' + v1.вэфир.role)
// нейросетевые голоса отдают только MP3 — видео-учителю с ними нельзя, ему нужен PCM
const vv = await page.evaluate(() => {
  const sel = document.querySelector('#sVoice')
  const neuro = [...sel.options].map((o) => o.value).find((x) => /masha|julia|dasha|lera/.test(x))
  sel.value = neuro; sel.onchange()
  return window.__kniga.voice()
})
say(vv.вэфир.v3 === true && vv.длявидео.voice === 'alena',
  'нейросетевой голос идёт в урок, но не в видео-учителя (' + vv.вэфир.voice + ' / ' + vv.длявидео.voice + ')')
await page.evaluate(() => { const s = document.querySelector('#sVoice'); s.value = 'alena-good'; s.onchange() })

// 3d. учительницу зовут Аня — ребёнка так звать нельзя
const nn = await page.evaluate(() => [
  window.__kniga.noName('Молодец, Аня! Ты всё верно вспомнил.'),
  window.__kniga.noName('Аня, посмотри на карту.'),
  window.__kniga.noName('Привет! Меня зовут Аня, я поведу урок.'),
])
say(!/Ан[яею]/.test(nn[0]) && /Молодец/.test(nn[0]), 'обращение «молодец, Аня» вычищено: «' + nn[0] + '»')
say(!/^Ан[яею]/.test(nn[1]) && /карту/.test(nn[1]), 'обращение в начале фразы вычищено: «' + nn[1] + '»')
say(/зовут Аня/.test(nn[2]), 'но своё имя она называть не перестала: «' + nn[2] + '»')

// 4. учитель
const tch = await page.evaluate(() => window.__kniga.teacher())
say(tch.есть && tch.мешей > 0, 'учитель загрузился (' + tch.модель + ', мешей ' + tch.мешей + ')')
// в кадре она стоит намертво по вертикали: «дыхание» сдвигом всей модели в портретном
// кадре читается как дёрганье головы вверх-вниз (правка 03.08)
const poses = []
for (let i = 0; i < 6; i++) { poses.push(await page.evaluate(() => window.__kniga.teacherPose())); await page.waitForTimeout(220) }
const ys = [...new Set(poses.filter(Boolean).map((p) => p.y))]
const turns = [...new Set(poses.filter(Boolean).map((p) => p.поворот))]
say(ys.length === 1 && ys[0] === 0, 'модель не ездит вверх-вниз, y = ' + ys.join('/'))
say(turns.length > 1, 'при этом живая: поворот меняется (' + turns.length + ' разных значений за 1.3 с)')

// 5. урок собран ИЗ УЧЕБНИКА, а не написан руками
const sc = await page.evaluate(() => window.__kniga.script())
const fromBook = sc.filter((b) => b.вид === 'read' || b.вид === 'ask' || b.вид === 'spot')
say(sc.length > 40 && fromBook.length > 40, `тактов ${sc.length}, из них прочитанных по учебнику ${fromBook.length}`)
say(sc.filter((b) => b.вопрос).length >= 5, 'вопросов учебника: ' + sc.filter((b) => b.вопрос).length)
say(sc.filter((b) => b.вид === 'spot').length >= 3, 'подписей с прожектором на картинку: ' + sc.filter((b) => b.вид === 'spot').length)
say(fromBook.every((b) => b.строк > 0), 'у каждого читаемого такта есть строки учебника с координатами')
const pagesCovered = [...new Set(sc.map((b) => b.стр))]
say(pagesCovered.length === 6, 'параграф охвачен целиком, страниц: ' + pagesCovered.join(', '))

// 6. прогон: сам листает и ведёт линию по читаемой строке
await page.evaluate(() => window.__kniga.run())
let reached = false
for (let i = 0; i < 60; i++) {
  await page.waitForTimeout(700)
  const s = await st()
  if (s.такт >= 2) { reached = true; break }
}
const s3 = await st()
say(reached && s3.идёт, 'прогон идёт сам: такт ' + s3.такт + ' · стр. ' + s3.страница)

// 6b. 🔴 ПАУЗА (правка 05.08). Была как «остановить»: доигрывала обещание, на котором
// ждёт реплика, — прогон считал такт дочитанным и после «продолжить» начинал со
// следующего. Плюс картинки продолжали меняться по своим таймерам «не в попад».
// ⚠️ Жать паузу надо, когда реплика ЗВУЧИТ: между тактами звука нет, и замер «звук
// стоит на 0.00 с» ничего не значит.
for (let i = 0; i < 60; i++) {
  const v = await page.evaluate(() => window.__kniga.voicePos())
  if (v.говорит && v.время > 0.15) break
  await page.waitForTimeout(200)
}
const beforePause = await st()
const qBefore = await page.evaluate(() => window.__kniga.demoQueue())
await page.evaluate(() => document.querySelector('#btnPause').click())
await page.waitForTimeout(300)
const p1 = await page.evaluate(() => window.__kniga.voicePos())
await page.waitForTimeout(2600)                       // дольше, чем держится показ
const p2 = await page.evaluate(() => window.__kniga.voicePos())
const afterWait = await st()
const qAfter = await page.evaluate(() => window.__kniga.demoQueue())
say(p1.пауза && p1.звукНаПаузе, 'пауза останавливает звук (' + p1.время + ' с)')
say(p2.время === p1.время, 'на паузе голос стоит на месте: ' + p1.время + ' → ' + p2.время)
say(afterWait.такт === beforePause.такт, 'на паузе прогон НЕ уезжает на следующий такт ('
  + beforePause.такт + ' → ' + afterWait.такт + ')')
say(qAfter >= qBefore || qAfter === 0, 'очередь показов на паузе не проматывается (' + qBefore + ' → ' + qAfter + ')')
await page.evaluate(() => document.querySelector('#btnPause').click())
await page.waitForTimeout(700)
const p3 = await page.evaluate(() => window.__kniga.voicePos())
const afterResume = await st()
say(!p3.пауза && afterResume.такт === beforePause.такт && p3.время >= p1.время,
  'после «продолжить» читает тот же такт с того же места (' + p1.время + ' → ' + p3.время + ' с)')
const back = await page.evaluate(() => window.__kniga.sheet())
say(back.страница === 120, 'прогон вернул книгу на страницу ' + back.страница)
// панель ведёт тот же такт: показ появился, карточки копятся
const pd = await page.evaluate(() => window.__kniga.panelData())
say(pd.показов > 30 && pd.тизеров > 20, 'привязок панели: показов ' + pd.показов + ', тизеров ' + pd.тизеров)
// линия под читаемой строкой должна ЖИТЬ: ширина меняется по ходу озвучки
const w1 = await page.evaluate(() => window.__kniga.readState())
await page.waitForTimeout(900)
const w2 = await page.evaluate(() => window.__kniga.readState())
say(w1.строк > 0 && (w1.линия !== w2.линия || parseFloat(w2.линия) > 0),
  `линия идёт за голосом (строк ${w2.строк}, ширина ${w1.линия} → ${w2.линия})`)
await page.screenshot({ path: OUT + '/4-progon.png' })
await page.evaluate(() => window.__kniga.stop())

// 7. правая половина ведёт тот же такт: показ меняется, карточки копятся
await page.evaluate(() => window.__kniga.goPage(120))
await page.waitForTimeout(1400)
const seen = []
// ⚠️ Ждём не «на глазок», а пока очередь показов не опустеет: с 05.08 картинка
// держится не меньше полутора секунд, и опрос сразу после прыжка ловит середину очереди.
const drain = async () => {
  for (let i = 0; i < 40; i++) {
    if ((await page.evaluate(() => window.__kniga.demoQueue())) === 0) break
    await page.waitForTimeout(300)
  }
  await page.waitForTimeout(400)
}
for (const n of [2, 3, 9, 10]) {
  await page.evaluate((k) => window.__kniga.showBeatAt(k, true), n)
  await drain()
  seen.push(await page.evaluate(() => window.__kniga.panel()))
}
const last = seen[seen.length - 1]
// последний показ 10-го такта — картинка учебника (фреска), но вообще показ может быть
// и картой: у неё файла нет, она рисуется сама
say(last.виден && (!!last.файл || /карт/i.test(last.показ || '')), 'в панели показ «' + last.показ + '» (' + (last.файл || 'карта') + ')')
// смена показа — перекрёстное затухание: в момент подмены на экране ДВА слоя,
// старый досматривает свой наезд, новый проявляется поверх
// ⚠️ Мерить это надо на двух ФОТО-показах. Карта (v2.0) живёт отдельным слоем и
// слоёв .dimg у неё нет вовсе — на переходе «карта → фото» замер покажет ноль,
// хотя перекрёстное затухание в порядке.
// ⚠️ И выждать больше полутора секунд: показ с 05.08 держится DEMO_MIN, а всё, что
// прилетело раньше, встаёт в очередь — замер поймал бы очередь, а не переход.
await page.evaluate(() => window.__kniga.showBeatAt(8))
await page.waitForTimeout(2700)  // > DEMO_MIN (2.5 с)
const both = await page.evaluate(async () => {
  const seen = []
  const t = setInterval(() => seen.push(document.querySelectorAll('#demoBox .dimg.on').length), 40)
  window.__kniga.showBeatAt(10, true)
  // ⚠️ Ждать надо не «столько-то миллисекунд»: переход стартует по onload картинки, а
  // она бывает в полмегабайта. Ждём, пока уходящий слой не досмотрит своё затухание,
  // и только потом считаем, сколько слоёв осталось.
  const till = Date.now() + 4000
  while (Date.now() < till) {
    await new Promise((r) => setTimeout(r, 60))
    if (seen.some((n) => n === 2) && !document.querySelector('#demoBox .dimg.out')) break
  }
  clearInterval(t)
  return { макс: Math.max(...seen, 0), финал: document.querySelectorAll('#demoBox .dimg.on').length }
})
say(both.макс === 2 && both.финал === 1,
  'показ меняется перекрёстным затуханием (слоёв в переходе ' + both.макс + ', после ' + both.финал + ')')
// Уходящий слой обязан гаснуть, НЕ теряя своего наезда: снимешь класс — исчезнет и
// анимация, и картинка прыгнет в исходный масштаб прямо посреди перехода.
const keepZoom = await page.evaluate(() => {
  const out = document.querySelector('#demoBox .dimg.out') || document.querySelector('#demoBox .dimg.on')
  return { анимаций: out ? out.getAnimations().filter((a) => a.constructor.name === 'CSSAnimation').length : 0 } })
say(keepZoom.анимаций > 0, 'гаснущий слой досматривает свой наезд (анимаций на нём ' + keepZoom.анимаций + ')')

// открытие и закрытие картинки — переходом, а не подменой кадра.
// getAnimations() видит сам переход независимо от того, сколько кадров успел
// нарисовать headless: замер по opacity здесь врёт, а этот — нет.
// ⚠️ Ждём готовности, а не «900 мс на всё про всё»: картинка тут 2560 px, и под
// нагрузкой (например, когда рядом крутится вторая приёмка) она за фиксированную
// паузу просто не успевает — проверка падала на ровном месте и врала про урок.
const lensOpen = await page.evaluate(async () => {
  window.__kniga.openFig('p120-1')
  const I0 = document.querySelector('#lensImg'), L0 = document.querySelector('#lens')
  // Ждём ОБА события: картинка догрузилась И подложка дотемнела. Каждое по
  // отдельности приёмка уже ловила — и каждый раз промах выглядел как поломка урока.
  for (let i = 0; i < 60; i++) {
    if (I0.classList.contains('ready') && +getComputedStyle(L0).opacity > 0.99) break
    await new Promise((r) => setTimeout(r, 100))
  }
  const L = document.querySelector('#lens'), I = document.querySelector('#lensImg')
  return { фон: +(+getComputedStyle(L).opacity).toFixed(2), готова: I.classList.contains('ready'),
    переходы: getComputedStyle(I).transitionProperty,
    длительность: getComputedStyle(I).transitionDuration } })
// ⚠️ Печатаем ВСЕ три слагаемых. Раньше сообщение показывало только переходы, а падала
// проверка по «фону» или «готова» — и промах читался как загадка вместо диагноза.
say(lensOpen.фон === 1 && lensOpen.готова && /opacity/.test(lensOpen.переходы),
  'картинка открывается переходом: ' + lensOpen.переходы + ' за ' + lensOpen.длительность
  + ' · фон ' + lensOpen.фон + ' · готова ' + lensOpen.готова)
const lensClose = await page.evaluate(() => {
  window.__kniga.closeLens()
  const L = document.querySelector('#lens'), I = document.querySelector('#lensImg')
  const names = (el) => el.getAnimations().map((a) => a.transitionProperty || a.animationName)
  return { фон: names(L), кадр: names(I) } })
say(lensClose.фон.includes('opacity') && lensClose.кадр.includes('opacity'),
  'и закрывается им же, а не пропадает рывком (фон: ' + lensClose.фон.join(',') + ' · картинка: ' + lensClose.кадр.join(',') + ')')
await page.waitForTimeout(500)
say([...new Set(seen.map((s) => s.файл))].length >= 2,
  'показ меняется вслед за репликой: ' + [...new Set(seen.map((s) => s.показ))].join(' → '))
say(last.тизеры.length >= 3, 'карточки «запомни» копятся: ' + last.тизеры.join(' · '))

// 🔴 МИНИАТЮРЫ НА КАРТОЧКАХ (правка руководителя 06.08, v2.4): «визуально карточки
// слева должны быть с небольшими картинками так, как сделано справа».
// Картинка обязана быть НЕ случайной: это тот же показ, что стоял на экране, когда
// факт прозвучал. Иначе карточка учит связке «слово ↔ чужая картинка».
const art = await page.evaluate(() => window.__kniga.keepArt())
const пусто = art.filter((k) => !k.файл && !k.значок)
say(art.length > 0 && пусто.length === 0, 'у каждой карточки «запомни» есть миниатюра'
  + (пусто.length ? ' — кроме: ' + пусто.map((k) => k.термин).join(', ') : ' (' + art.length + ')'))
say(art.filter((k) => k.файл).length >= 2, 'миниатюры — настоящие картинки страницы: '
  + art.filter((k) => k.файл).map((k) => k.термин + '→' + k.файл).slice(0, 3).join(' · '))
// у «мест на карте» картинки быть не может — карта живая, с наездом; там значок
say(art.every((k) => k.файл || k.значок), 'где картинки нет, стоит значок «место на карте»')
const своя = await page.evaluate(() => {
  const z = window.__kniga.zak().find((x) => x.стр === 120) || {}
  return { топиков: z.топиков || 0, скартинкой: z.скартинкой || 0 } })
say(своя.скартинкой >= Math.ceil(своя.топиков * 0.6),
  'картинка привязана к самому топику, а не к карточке на глаз ('
  + своя.скартинкой + ' из ' + своя.топиков + ' топиков стр. 120)')

// ── v2.0: показ идёт за ФРАЗОЙ, а не за тактом ───────────────────────────────
// 🔴 Претензия руководителя: «она говорит про карту и расположение государств, а
// показывается абстракция с кораблём». Такт 2 — тот самый: одна реплика, а в ней
// пять мест подряд. Проверяем, что за одну реплику показ меняется несколько раз и
// что на словах про Аттику на экране именно Аттика.
await page.evaluate(() => window.__kniga.showBeatAt(2))
await page.waitForTimeout(600)
const inside = []
// ⚠️ Шагать по реплике надо в темпе речи: такт звучит секунд двадцать пять, а показ
// с 05.08 держится не меньше полутора секунд, чтобы картинки не мелькали. Прогон «по
// 200 мс на шаг» меряет не поведение урока, а этот троттлинг.
for (const p of [0, 0.2, 0.4, 0.55, 0.7, 0.85, 1]) {
  await page.evaluate((v) => window.__kniga.tickTo(v), p)
  await drain()      // ждём не «столько-то мс», а пока очередь показов доиграет
  const s = await page.evaluate(() => ({ ...window.__kniga.panel(), карта: window.__kniga.map() }))
  inside.push({ p, показ: s.показ, метка: s.карта.метка, зона: s.карта.зона })
}
const шаги = [...new Set(inside.map((s) => s.показ))].filter(Boolean)
say(шаги.length >= 4, 'за одну реплику показ сменился ' + шаги.length + ' раз: ' + шаги.join(' → '))
const атт = inside.find((s) => /АТТИКА/i.test(s.показ || ''))
say(атт && атт.метка === 'mk-attica', 'на словах «Аттика с городом Афины» на карте горит Аттика'
  + (атт ? ' (' + атт.метка + ')' : ' — показа не было'))
const зоны = [...new Set(inside.map((s) => s.зона).filter(Boolean))]
say(зоны.length >= 3, 'три части Греции подсвечиваются по очереди: ' + зоны.join(' → '))
const наезд = await page.evaluate(() => window.__kniga.map().наезд)
say(/scale\(/.test(наезд || ''), 'карта наезжает на названное место (' + (наезд || 'нет') + ')')
await page.screenshot({ path: OUT + '/16-karta.png' })
say(last.страница === 120, 'карточки подписаны своей страницей: ' + last.страница)
await page.screenshot({ path: OUT + '/15-panel.png' })
// карточки обязаны ВЛЕЗАТЬ: обрезанная сверху карточка читается как поломка вёрстки.
// Проверяем и в окне руководителя (1280×720) — там панель уже, а карточек столько же.
const fits = async () => page.evaluate(() => {
  const l = document.querySelector('#keepList')
  return { лишнее: l.scrollHeight - l.clientHeight, карточек: l.querySelectorAll('.kc').length } })
const fit1 = await fits()
say(fit1.лишнее <= 2, `все ${fit1.карточек} карточек влезают в панель (1600×900, лишнего ${fit1.лишнее}px)`)
await page.setViewportSize({ width: 1280, height: 720 })
await page.waitForTimeout(700)
const fit2 = await fits()
say(fit2.лишнее <= 2, `и в окне 1280×720 тоже (лишнего ${fit2.лишнее}px)`)
await page.screenshot({ path: OUT + '/15-panel-1280.png' })
await page.setViewportSize({ width: 1600, height: 900 })
await page.waitForTimeout(500)

// 8. переворот идёт КАК В КНИГЕ: лист приходит справа и ложится налево, на страницу.
// Наоборот (уход вправо) — это жест «назад», и руководитель считал его сразу.
const frames = []
for (const t of [0.02, 0.35, 0.6, 0.9]) {
  await page.evaluate(([d, tt]) => window.__kniga.freeze(d, tt), [1, t])
  await page.waitForTimeout(260)
  frames.push(await page.evaluate(() => {
    const f = document.querySelector('#flip'), b = document.querySelector('#book')
    const r = f.getBoundingClientRect(), rb = b.getBoundingClientRect()
    return { центр: Math.round(r.left + r.width / 2 - rb.left), ширинаКниги: Math.round(rb.width),
      прозрачность: +(+getComputedStyle(f).opacity).toFixed(2) } }))
  await page.screenshot({ path: OUT + '/16-flip-' + String(t).replace('.', '') + '.png' })
}
const half = frames[0].ширинаКниги / 2
say(frames[0].центр > half && frames[3].центр < half,
  'лист идёт справа налево, как в книге (центр ' + frames.map((f) => f.центр).join(' → ') + ' при середине ' + Math.round(half) + ')')
say(frames[0].прозрачность < 0.9, 'плашмя над панелью лист прозрачен и не закрывает показ (' + frames[0].прозрачность + ')')
say(frames[3].прозрачность > 0.9, 'а над страницей он уже плотный (' + frames[3].прозрачность + ')')
await page.reload({ waitUntil: 'domcontentloaded' })
await page.waitForFunction(() => window.__kniga, null, { timeout: 30000 })

console.log('\n✅ ' + ok.join('\n✅ '))
if (bad.length) console.log('\n❌ ' + bad.join('\n❌ '))
if (errs.length) console.log('\n⚠ ошибки страницы:\n  ' + [...new Set(errs)].slice(0, 6).join('\n  '))
console.log(`\nитог: ${ok.length} ок, ${bad.length} мимо, ошибок ${errs.length} · снимки → ${OUT}`)
await browser.close()
process.exit(bad.length || errs.length ? 1 : 0)
