#!/usr/bin/env node
// Приёмка кликабельных иллюстраций в уроке-учебнике (/kniga):
// по картинке можно нажать, курсор над ней — лупа, открывается АПСКЕЙЛ, а не тот же
// мелкий растр, и рамка кнопки лежит ровно на картинке, а не на пустом поле.
//   node scripts/check-kniga-figures.mjs [папка-для-снимков]
import { chromium } from 'playwright'
import fs from 'node:fs'

const OUT = process.argv[2] || '.tmp/shots-figs'
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe'
fs.mkdirSync(OUT, { recursive: true })

const browser = await chromium.launch({ executablePath: fs.existsSync(CHROME) ? CHROME : undefined,
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] })
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } })
const errs = []
page.on('pageerror', (e) => errs.push('pageerror: ' + e))
// favicon у стенда нет — его 404 к уроку отношения не имеет; в тексте сообщения адреса
// нет, он лежит в location, поэтому фильтруем по обоим
page.on('console', (m) => {
  const where = (m.location() || {}).url || ''
  if (m.type() === 'error' && !/favicon|getUserMedia/i.test(m.text() + ' ' + where)) errs.push(m.text().slice(0, 140))
})

const ok = [], bad = []
const say = (good, t) => (good ? ok : bad).push(t)

await page.goto('http://localhost:8781/kniga', { waitUntil: 'domcontentloaded', timeout: 60000 })
await page.waitForFunction(() => window.__kniga, null, { timeout: 60000 })
await page.waitForTimeout(1500)

// 1. что вообще нашли в PDF и что подняли апскейлером
const figs = await page.evaluate(() => window.__kniga.figures())
const hi = figs.filter((f) => f.увеличено)
say(figs.length >= 5, 'иллюстраций найдено в §20: ' + figs.length)
say(hi.length >= 2, 'с апскейлом: ' + hi.map((f) => `${f.id} ${f.вучебнике}→${f.увеличено}`).join(' · '))

// 2. на первом развороте ровно две кнопки, и курсор над ними — лупа
const spots = await page.evaluate(() => window.__kniga.figSpots())
// страница одна: на 120-й апскейл есть ровно у одной картинки (Кносский дворец)
say(spots.length === 1, 'кнопка «рассмотреть» на странице 120: ' + spots.length)
// курсор именно «рука»: лупа читалась как инструмент увеличения, а не как кнопка
say(spots.every((s) => s.курсор === 'pointer'), 'курсор над картинкой: ' + [...new Set(spots.map((s) => s.курсор))].join(', '))

// 3. рамка кнопки лежит НА картинке, а не на пустом поле.
//    Сравниваем средний цвет куска страницы под кнопкой со средним цветом апскейла:
//    если это одна и та же картинка, цвета сойдутся; если рамка съехала на белое поле —
//    разойдутся сразу (бумага почти белая).
const colors = await page.evaluate(async () => {
  const mean = (img, sx, sy, sw, sh) => {
    const c = document.createElement('canvas'); c.width = 40; c.height = 40
    const g = c.getContext('2d'); g.drawImage(img, sx, sy, sw, sh, 0, 0, 40, 40)
    const d = g.getImageData(0, 0, 40, 40).data
    let r = 0, gg = 0, b = 0
    for (let i = 0; i < d.length; i += 4) { r += d[i]; gg += d[i + 1]; b += d[i + 2] }
    const n = d.length / 4
    return [Math.round(r / n), Math.round(gg / n), Math.round(b / n)]
  }
  const load = (src) => new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = src })
  const out = []
  for (const f of window.__kniga.figures().filter((x) => x.увеличено)) {
    const pageImg = await load('/book/p' + f.стр + '.jpg')
    const meta = (await (await fetch('/book/figures.json')).json()).find((x) => x.id === f.id)
    const [x, y, w, h] = meta.box
    const naPage = mean(pageImg, x * pageImg.naturalWidth, y * pageImg.naturalHeight,
      w * pageImg.naturalWidth, h * pageImg.naturalHeight)
    const hiImg = await load('/book/' + meta.hi)
    const naHi = mean(hiImg, 0, 0, hiImg.naturalWidth, hiImg.naturalHeight)
    const d = Math.hypot(naPage[0] - naHi[0], naPage[1] - naHi[1], naPage[2] - naHi[2])
    out.push({ id: f.id, страница: naPage, апскейл: naHi, разница: Math.round(d) })
  }
  return out
})
for (const c of colors) say(c.разница < 45, `${c.id}: кнопка стоит на своей картинке (цвет ${c.страница} ≈ ${c.апскейл}, разница ${c.разница})`)

// 4. наведение мышью подсвечивает рамку
const box = await page.locator('.fig[data-fig="p120-1"]').boundingBox()
const before = await page.evaluate(() => getComputedStyle(document.querySelector('.fig')).borderColor)
await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
await page.waitForTimeout(400)
const after = await page.evaluate(() => getComputedStyle(document.querySelector('.fig')).borderColor)
// лупа выезжает переходом, а под swiftshader кадры идут рвано — ждём конца анимации,
// а не «на глазок 400 мс», иначе приёмка ловит середину перехода
await page.waitForFunction(() => +getComputedStyle(document.querySelector('.fig .lupa')).opacity > .95,
  null, { timeout: 4000 }).catch(() => {})
const lupa = await page.evaluate(() => +getComputedStyle(document.querySelector('.fig .lupa')).opacity)
say(before !== after, `наведение подсвечивает рамку (${before} → ${after})`)
say(lupa > .8, 'при наведении появляется значок «развернуть», прозрачность ' + lupa)
await page.screenshot({ path: OUT + '/1-navedenie.png' })

// 5. НАСТОЯЩИЙ клик мышью открывает апскейл
await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2)
await page.waitForTimeout(900)
const lens = await page.evaluate(() => window.__kniga.lens())
say(lens.открыто, 'клик открыл окно просмотра')
say(/^hi-p120-1\.jpg$/.test(lens.файл), 'показывается апскейл: ' + lens.файл)
say(lens.кадр[0] >= 2000, 'разрешение картинки в окне: ' + lens.кадр.join('×') + ' (в учебнике было 421×223)')
say(/Кносский/.test(lens.подпись), 'подпись из учебника: «' + lens.подпись + '»')
await page.screenshot({ path: OUT + '/2-okno.png' })

// 6. «нажал — открылось, нажал ещё раз — закрылось»: закрывать должен любой клик,
//    в том числе по самой картинке (мимо неё — тем более), и Esc
const curLens = await page.evaluate(() => getComputedStyle(document.querySelector('#lensImg')).cursor)
say(curLens === 'pointer', 'курсор над открытой картинкой: ' + curLens)
await page.locator('#lensImg').click({ position: { x: 30, y: 30 } })
await page.waitForTimeout(500)
say(!(await page.evaluate(() => window.__kniga.lens().открыто)), 'следующий клик по картинке закрывает окно')
await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2)
await page.waitForTimeout(700)
await page.mouse.click(20, 500)                                  // клик мимо картинки
await page.waitForTimeout(500)
say(!(await page.evaluate(() => window.__kniga.lens().открыто)), 'клик мимо картинки тоже закрывает')
await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2)
await page.waitForTimeout(700)
await page.keyboard.press('Escape')
await page.waitForTimeout(500)
say(!(await page.evaluate(() => window.__kniga.lens().открыто)), 'Esc закрывает окно')

// 7. вторая картинка — она на СЛЕДУЮЩЕЙ странице
// ⚠️ Раньше здесь её искали, не листая: книга показывала разворот, и 121-я была
// видна справа. С тех пор страница одна, а место второй занимает рабочая панель —
// без перехода локатор ждал картинку, которой на экране нет, и падал по таймауту.
await page.evaluate(() => window.__kniga.goPage(121))
await page.waitForTimeout(1600)
const box2 = await page.locator('.fig[data-fig="p121-1"]').boundingBox()
await page.mouse.click(box2.x + box2.width / 2, box2.y + box2.height / 2)
await page.waitForTimeout(900)
const lens2 = await page.evaluate(() => window.__kniga.lens())
say(lens2.открыто && /^hi-p121-1\.jpg$/.test(lens2.файл) && lens2.кадр[0] >= 2000,
  'вторая картинка открывается тоже: ' + lens2.файл + ' ' + lens2.кадр.join('×'))
await page.screenshot({ path: OUT + '/4-vtoraya.png' })
await page.keyboard.press('Escape')
await page.waitForTimeout(400)

// 8. на летящем листе нажимать нечего, а на странице без апскейла кнопок нет
// ⚠️ Проверка тоже осталась от разворота: у неё был __kniga.spread() и «кнопок 2»,
// потому что видны были обе страницы сразу. Страница теперь одна — спрашиваем
// state() и ждём одну кнопку.
await page.evaluate(() => window.__kniga.turn(1))
await page.waitForTimeout(300)
say((await page.evaluate(() => document.querySelectorAll('.fig').length)) === 0, 'во время переворота кнопки убраны')
await page.waitForTimeout(1600)
const pg2 = await page.evaluate(() => +document.querySelector('#leftImg').dataset.page)
const n2 = await page.evaluate(() => window.__kniga.figSpots().length)
// на 122-й появился апскейл фрески (05.08) — значит и кнопка «рассмотреть» там одна
say(pg2 === 122 && n2 === 1, `на странице ${pg2} кнопка «рассмотреть»: ${n2}`)
await page.evaluate(() => window.__kniga.turn(-1))
await page.waitForTimeout(1600)
say((await page.evaluate(() => window.__kniga.figSpots().length)) === 1, 'вернулись назад — кнопка на месте')

console.log('\n✅ ' + ok.join('\n✅ '))
if (bad.length) console.log('\n❌ ' + bad.join('\n❌ '))
if (errs.length) console.log('\n⚠ ошибки страницы:\n  ' + [...new Set(errs)].slice(0, 6).join('\n  '))
console.log(`\nитог: ${ok.length} ок, ${bad.length} мимо, ошибок ${errs.length} · снимки → ${OUT}`)
await browser.close()
process.exit(bad.length || errs.length ? 1 : 0)
