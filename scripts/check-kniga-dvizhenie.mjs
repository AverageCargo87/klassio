#!/usr/bin/env node
// Приёмка ДВИЖЕНИЯ (v2.12). До неё анимация не была закрыта ни одной из четырёхсот
// проверок: любая правка ломала её молча, а «вроде плавно» на видеозаписи не
// отличает работающий перелёт от тихо отвалившегося.
//
// Проверяем не красоту, а четыре обещания, которые движение даёт уроку:
//   1. доска ПРИБАВЛЯЕТ карточки, а не пересобирается (иначе ни перелёта, ни слоёв);
//   2. картинка ПРИЛЕТАЕТ с показа — то есть средний и правый экраны говорят об одном;
//   3. в кадре не больше одного длинного движения (закон одного движения);
//   4. «спокойно» действительно выключает движение, не трогая информацию.
//
//   node scripts/check-kniga-dvizhenie.mjs [папка-для-снимков]
//   KNIGA_URL=https://5.35.90.219.nip.io node scripts/check-kniga-dvizhenie.mjs
import { chromium } from 'playwright'
import fs from 'node:fs'

const OUT = process.argv[2] || '.tmp/shots-dvizhenie'
const URL = process.env.KNIGA_URL || 'http://localhost:8781'
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe'
const МИНУТ = +(process.env.KNIGA_MINUT || 4)
fs.mkdirSync(OUT, { recursive: true })

const wav = (sec = 0.5, rate = 16000) => {
  const n = Math.round(sec * rate), b = Buffer.alloc(44 + n * 2)
  b.write('RIFF', 0); b.writeUInt32LE(36 + n * 2, 4); b.write('WAVE', 8)
  b.write('fmt ', 12); b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(1, 22)
  b.writeUInt32LE(rate, 24); b.writeUInt32LE(rate * 2, 28); b.writeUInt16LE(2, 32); b.writeUInt16LE(16, 34)
  b.write('data', 36); b.writeUInt32LE(n * 2, 40)
  return b
}

const browser = await chromium.launch({ executablePath: fs.existsSync(CHROME) ? CHROME : undefined,
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader',
         '--autoplay-policy=no-user-gesture-required'] })

const ok = [], bad = []
const say = (good, t) => { (good ? ok : bad).push(t); console.log((good ? '✅ ' : '❌ ') + t) }

// ── общая заготовка страницы ───────────────────────────────────────────────
async function открыть(хвост) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } })
  const errs = []
  page.on('pageerror', (e) => errs.push('pageerror: ' + e))
  page.on('console', (m) => { if (m.type() === 'error' && !/favicon|getUserMedia|429/i.test(m.text())) errs.push(m.text().slice(0, 160)) })
  await page.route('**/api/tts', (r) => r.fulfill({ status: 200, contentType: 'audio/wav', body: wav() }))
  await page.goto(URL + '/kniga?teacher=off' + хвост, { waitUntil: 'domcontentloaded', timeout: 90000 })
  await page.waitForFunction(() => window.__kniga && window.__kniga.beats() > 10, null, { timeout: 90000 })
  await page.waitForFunction(() => { const b = document.querySelector('#boot')
    return (!b || b.classList.contains('off')) && document.querySelector('#left')
      && document.querySelector('#left').clientHeight > 120 }, null, { timeout: 120000 })
  // темп как у прогона: смотрим логику движения, а не тайминги голоса
  await page.evaluate(() => {
    const h = document.querySelector('#sHold'), s = document.querySelector('#sSpeed')
    if (h) h.value = '0'
    if (s) s.value = '2.5'
    try { localStorage.removeItem('kn_progress_p20') } catch (e) {}
  })
  return { page, errs }
}

// ── 1. ЖИВОЙ УРОК: доска прибавляет, картинка прилетает ────────────────────
const { page, errs } = await открыть('')

const язык = await page.evaluate(() => window.__kniga.движение().язык)
say(язык.приход > 0 && язык.путь > язык.приход && язык.путь <= 900,
  `язык движения на месте: приход ${язык.приход} мс · путь ${язык.путь} мс`)
say(язык.стаггер >= 40 && язык.стаггер <= 90,
  `шаг очереди читается глазом и не рассыпается: ${язык.стаггер} мс`)

// ЗАКОН ОДНОГО ДВИЖЕНИЯ. Считать «сколько всего анимаций идёт» бессмысленно: у
// одной карточки их пять (слои выходят очередью), и это ОДНО событие. Закон про
// другое — про то, чтобы движение, несущее чтение (доезд листа к строке), не
// шло одновременно с движением через весь экран (перелёт картинки, переезд вида).
// Ловим ровно это: в момент, когда призрак появился, лист не должен ехать.
await page.evaluate(() => {
  window.__совпало = { полётов: 0, поперёкЛиста: 0, случаи: [] }
  const листЕдет = () => {
    const s = document.querySelector('#sheet')
    return !!s && s.getAnimations().some((a) => a.playState === 'running')
  }
  new MutationObserver((сп) => {
    for (const з of сп) for (const у of з.addedNodes) {
      if (у.nodeType !== 1 || !у.classList || !у.classList.contains('призрак')) continue
      window.__совпало.полётов++
      if (листЕдет()) {
        window.__совпало.поперёкЛиста++
        window.__совпало.случаи.push(Math.round(performance.now()))
      }
    }
  }).observe(document.body, { childList: true })
})

await page.evaluate(() => window.__kniga.run())
const t0 = Date.now()
let последний = 0
while (Date.now() - t0 < МИНУТ * 60000) {
  await page.waitForTimeout(400)
  const д = await page.evaluate(() => window.__kniga.движение())
  if (д.карточек >= 6 && !последний) { последний = 1
    await page.screenshot({ path: OUT + '/доска-набралась.png' }).catch(() => {}) }
  if (д.карточек >= 12) break
}
await page.waitForTimeout(1200)

const д = await page.evaluate(() => window.__kniga.движение())
const синхро = await page.evaluate(() => window.__kniga.синхро())
const совпало = await page.evaluate(() => window.__совпало)

say(д.карточек >= 5, `доска набралась: ${д.карточек} карточек`)
say(д.прибавок >= д.карточек - 2,
  `доска прибавляла по одной, а не пересобиралась: прибавок ${д.прибавок} на ${д.карточек} карточек`)
say(д.пересборок <= 3,
  `полных пересборок мало (только смены раздела и режима): ${д.пересборок}`)

const летало = д.перелётов, могло = д.ждали
say(могло === 0 || летало / могло >= 0.6,
  `картинка прилетала с показа: ${летало} из ${могло} возможных`)
say(д.отказ.чужаяКартинка === 0,
  `не было случая «факт встал, а на показе другое»: ${д.отказ.чужаяКартинка}`)
say(д.вПолёте === 0, `призраки убраны, ни один не завис: ${д.вПолёте}`)

// Три времени, и каждое про своё (см. комментарий над __kniga.синхро):
//   разрыв — модельный: показ сменился ↔ факт положили в данные;
//   виден  — факт (слово + строка) появился на доске глазами ребёнка;
//   селаКартинка — картинка доехала в миниатюру. Это длительность перелёта,
//                  а НЕ отставание доски: слово к этому моменту давно на месте.
const медиана = (a) => a.slice().sort((x, y) => Math.abs(x) - Math.abs(y))[Math.floor(a.length / 2)]
const видны = синхро.map((s) => s.виден).filter((v) => typeof v === 'number')
if (видны.length) {
  const м = медиана(видны)
  say(Math.abs(м) <= 900,
    `факт виден почти вместе со своим показом: медиана ${м} мс (норматив 900)`)
} else say(true, 'фактов с картинками не набралось (не ошибка)')

const сели = синхро.map((s) => s.селаКартинка).filter((v) => typeof v === 'number')
if (сели.length) {
  const м = медиана(сели)
  say(Math.abs(м) <= язык.путь + 1600,
    `картинка доезжает с показа на карточку за разумное время: медиана ${м} мс`)
}

const модельные = синхро.map((s) => s.разрыв).filter((v) => typeof v === 'number')
if (модельные.length) {
  const м = медиана(модельные)
  say(Math.abs(м) <= 1500, `модельный разрыв (норматив круга 27.08) держится: медиана ${м} мс`)
}

say(совпало.поперёкЛиста === 0,
  `закон одного движения: ни один перелёт не пошёл поперёк едущего листа`
  + ` (полётов ${совпало.полётов}, наложений ${совпало.поперёкЛиста})`)

// грид: последняя карточка видна целиком, соседи не разъехались
const доска = await page.evaluate(() => {
  const l = document.querySelector('#keepList'), b = document.querySelector('#zBoard')
  const п = l.querySelector('.kc:last-child'); if (!п) return null
  const r = п.getBoundingClientRect(), rb = b.getBoundingClientRect()
  const все = [...l.querySelectorAll('.kc')]
  return { видна: r.top >= rb.top - 2 && r.bottom <= rb.bottom + 2,
    колонок: new Set(все.map((e) => Math.round(e.getBoundingClientRect().left))).size,
    номерВидно: !!п.querySelector('.nm') && п.querySelector('.nm').getBoundingClientRect().left >= rb.left - 1,
    раскладка: getComputedStyle(l).display }
})
say(доска && доска.раскладка === 'grid', `доска стоит на гриде, а не на мультиколонке: ${доска && доска.раскладка}`)
say(doskaOk(доска), `новая карточка видна целиком и номер не срезан о край`)
function doskaOk (d) { return !!d && d.видна && d.номерВидно }
say(доска && доска.колонок <= 2, `карточки стоят в два столбца: ${доска && доска.колонок}`)

await page.screenshot({ path: OUT + '/итог-движения.png' }).catch(() => {})
await page.close()

// ── 2. СПОКОЙНО: информация та же, движения нет ────────────────────────────
const тихо = await открыть('&anim=0')
const п2 = тихо.page
say(await п2.evaluate(() => window.__kniga.движение().покой) === true,
  'рычаг «спокойно» слышен: ?anim=0 выключает движение')
await п2.evaluate(() => window.__kniga.run())
const t2 = Date.now()
while (Date.now() - t2 < 70000) {
  await п2.waitForTimeout(400)
  const d = await п2.evaluate(() => window.__kniga.движение())
  if (d.карточек >= 3) break
}
const д2 = await п2.evaluate(() => window.__kniga.движение())
say(д2.карточек >= 2, `в покое факты всё равно встают на доску: ${д2.карточек}`)
say(д2.перелётов === 0 && д2.вПолёте === 0, `в покое ничего не летает: перелётов ${д2.перелётов}`)
const текстЦел = await п2.evaluate(() => {
  const к = [...document.querySelectorAll('#keepList .kc')]
  return к.every((e) => (e.querySelector('.t') || {}).textContent && (e.querySelector('.t')).textContent.trim().length > 1)
})
say(текстЦел, 'в покое подписи карточек на месте — выключено движение, а не информация')
await п2.screenshot({ path: OUT + '/спокойно.png' }).catch(() => {})
await п2.close()

const всеОшибки = [...errs, ...тихо.errs]
if (всеОшибки.length) { console.log('\n⚠ ошибки страницы:'); всеОшибки.slice(0, 6).forEach((e) => console.log('  ', e)) }

console.log(`\nитог: ${ok.length} ок, ${bad.length} мимо, ошибок ${всеОшибки.length} · снимки → ${OUT}`)
await browser.close()
process.exit(bad.length ? 1 : 0)
