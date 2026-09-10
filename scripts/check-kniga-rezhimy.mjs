#!/usr/bin/env node
// Приёмка двух режимов окна (v2.11): своя прокрутка колесом с полосой положения и
// дверью обратно, режим «половины» с переездом окон местами.
//   node scripts/check-kniga-rezhimy.mjs [папка-для-снимков]
import { chromium } from 'playwright'
import fs from 'node:fs'

const OUT = process.argv[2] || '.tmp/shots-rezhimy'
// боевой проверяется той же приёмкой: KNIGA_URL=https://5.35.90.219.nip.io node ...
const URL = process.env.KNIGA_URL || 'http://localhost:8781'
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe'
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
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } })
const errs = []
page.on('pageerror', (e) => errs.push('pageerror: ' + e))
page.on('console', (m) => { if (m.type() === 'error' && !/favicon|getUserMedia|429/i.test(m.text())) errs.push(m.text().slice(0, 160)) })
await page.route('**/api/tts', (r) => r.fulfill({ status: 200, contentType: 'audio/wav', body: wav() }))

const ok = [], bad = []
const say = (good, t) => { (good ? ok : bad).push(t); console.log((good ? '✅ ' : '❌ ') + t) }

// Учителя не поднимаем: проверяем ОКНО, а 13-мегабайтная модель на боевом грузится
// дольше, чем ждёт приёмка, и все замеры уходят по заставке.
await page.goto(URL + '/kniga?teacher=off', { waitUntil: 'domcontentloaded', timeout: 90000 })
await page.waitForFunction(() => window.__kniga, null, { timeout: 90000 })
// ⚠️ Ждём не секунды, а ГОТОВНОСТЬ: заставка загрузки висит поверх всего и съедает
// колесо — на боевом она держится дольше, чем локально (поймано 27.08).
await page.waitForFunction(() => { const b = document.querySelector('#boot')
  return (!b || b.classList.contains('off')) && document.querySelector('#left')
    && document.querySelector('#left').clientHeight > 120 }, null, { timeout: 120000 })
await page.waitForTimeout(900)
const режим = () => page.evaluate(() => window.__kniga.режим())
const лист = () => page.evaluate(() => window.__kniga.лист())
const коробки = () => page.evaluate(() => {
  const r = (s) => { const b = document.querySelector(s).getBoundingClientRect()
    return { top: Math.round(b.top), h: Math.round(b.height) } }
  return { окно: r('#book'), показ: r('#panel') } })

// ── 1. ЛЕНТА: колесо крутит страницу ─────────────────────────────────────
const р0 = await режим()
say(р0.режим === 'lenta', 'по умолчанию режим ленты: ' + р0.режим)
const было = (await лист()).сдвиг
const окно = await page.locator('#book').boundingBox()
await page.mouse.move(окно.x + окно.width / 2, окно.y + окно.height / 2)
await page.mouse.wheel(0, 400)
await page.waitForTimeout(500)
const стало = (await лист()).сдвиг
say(стало > было + 200, `колесо над окном крутит страницу: ${было} → ${стало}`)
const п1 = await режим()
say(п1.рукаВедёт, 'пока крутит ребёнок, лист слушается руки, а не голоса')
say(п1.полосаВидна, 'полоса положения показалась')
say(!!п1.ползунок[0] && !!п1.ползунок[1], 'ползунок стоит на своём месте: top ' + п1.ползунок.join(' высота '))
await page.screenshot({ path: OUT + '/1-lenta-krutili.png' })

// ── 2. дверь обратно ─────────────────────────────────────────────────────
await page.evaluate(() => { const b = window.__kniga.fullScript().find((x) => x.page === 120 && x.y !== null)
  window.__kniga.showBeatAt(b.n, true); window.__kniga.тактДо(1) })
await page.waitForTimeout(700)
await page.evaluate(() => window.__kniga.крутить(1400))
await page.waitForTimeout(600)
const п2 = await режим()
say(п2.дверьОбратно, 'уехал от читаемого места — появилась кнопка «вернуться к чтению»')
say(п2.риска !== null, 'на полосе видно риской, где сейчас читают: ' + п2.риска)
await page.screenshot({ path: OUT + '/2-dver-obratno.png' })
await page.locator('#pgBack').click()
await page.waitForTimeout(1100)
const п3 = await режим()
const видно = await page.evaluate(() => {
  const л = window.__kniga.лист(), b = window.__kniga.state().такт
  return { сдвиг: л.сдвиг, окно: л.высотаОкна } })
say(!п3.дверьОбратно, 'нажал — вернулся к чтению, кнопка ушла')
say(!п3.рукаВедёт, 'после возврата лист снова слушается голоса')

// ── 3. лента ходит в обе стороны ─────────────────────────────────────────
await page.evaluate(() => window.__kniga.goPage(122))
await page.waitForTimeout(900)
const дo = await лист()
await page.evaluate(() => window.__kniga.крутить(-2500))
await page.waitForTimeout(700)
const назад = await page.evaluate(() => window.__kniga.sheet())
say(назад.страница < 122, 'прокрутка вверх открывает предыдущую страницу: ' + назад.страница)

// ── 4. ПОЛОВИНЫ: окна меняются местами ───────────────────────────────────
await page.evaluate(() => window.__kniga.goPage(120))
await page.waitForTimeout(700)
// один клик по нужному виду — без обхода по кругу
const видом = async (имя) => { await page.locator('#modeSw [data-m="' + имя + '"]').click()
  await page.waitForTimeout(900); return (await режим()).режим === имя }
say(await видом('pol'), 'один клик ставит вид «половины»')
const р2 = await режим()
say(р2.половинки, 'половинки включились')
const k0 = await коробки()
say(k0.окно.top < k0.показ.top, `верхняя половина: окно сверху (${k0.окно.top}), показ под ним (${k0.показ.top})`)
const л0 = await лист()
say(л0.сдвиг < 10, 'лист стоит на верхней половине страницы, сдвиг ' + л0.сдвиг)
say(Math.abs(л0.высотаОкна * 2 - л0.высотаСтраницы) < 24,
  `в окно влезает ровно половина страницы (окно ${л0.высотаОкна}×2 ≈ страница ${л0.высотаСтраницы})`)
await page.screenshot({ path: OUT + '/3-poloviny-verh.png' })

// такт с нижней части страницы 120 — окна обязаны переехать
await page.evaluate(() => {
  const низ = window.__kniga.fullScript().filter((x) => x.page === 120 && x.y > 0.62)
  window.__kniga.showBeatAt(низ[низ.length - 1].n, true) })
await page.waitForTimeout(1400)
const k1 = await коробки()
const р3 = await режим()
say(р3.половина === 1, 'читаем низ страницы — окно перешло на нижнюю половину')
say(k1.окно.top > k1.показ.top, `окна переехали местами: показ сверху (${k1.показ.top}), текст под ним (${k1.окно.top})`)
const л1 = await лист()
say(Math.abs(л1.сдвиг - л1.высотаСтраницы / 2) < 24, `лист показывает нижнюю половину: сдвиг ${л1.сдвиг} ≈ ${Math.round(л1.высотаСтраницы / 2)}`)
await page.screenshot({ path: OUT + '/4-poloviny-niz.png' })

// назад к верхней части — возвращаются
await page.evaluate(() => {
  const верх = window.__kniga.fullScript().find((x) => x.page === 120 && x.y !== null && x.y < 0.3)
  window.__kniga.showBeatAt(верх.n, true) })
await page.waitForTimeout(1400)
const k2 = await коробки()
say(k2.окно.top < k2.показ.top, 'вернулись к верхней части — окна встали обратно')

// ── 5. выбор режима переживает перезагрузку ──────────────────────────────
await page.reload({ waitUntil: 'domcontentloaded' })
await page.waitForFunction(() => window.__kniga, null, { timeout: 60000 })
await page.waitForTimeout(1500)
const р4 = await режим()
say(р4.режим === 'pol', 'после перезагрузки режим сохранился: ' + р4.режим)
const доРежима = async (имя) => {
  await page.locator('#modeSw [data-m="' + имя + '"]').click()
  await page.waitForTimeout(800)
  return (await режим()).режим === имя
}
const подсветка = () => page.evaluate(() =>
  [...document.querySelectorAll('#modeSw .msw')].filter((b) => b.classList.contains('on')).map((b) => b.dataset.m))
say(await доРежима('sravn'), 'из половин одним кликом — сразу в сравнение')
say((await подсветка()).join() === 'sravn', 'подсвечен тот вид, который включён')
say(await доРежима('lenta'), 'и обратно в ленту — тоже одним кликом')
const k3 = await коробки()
say(k3.окно.h > k3.показ.h, `в ленте окно снова выше показа (${k3.окно.h} против ${k3.показ.h})`)
await page.screenshot({ path: OUT + '/5-nazad-v-lentu.png' })


// ── 6. ТРЕТИЙ РЕЖИМ: сравнение ───────────────────────────────────────────
say(await доРежима('sravn'), 'один клик — и мы в сравнении')
await page.waitForTimeout(600)
const р6 = await режим()
const местоПоказа = () => page.evaluate(() => ({
  где: document.querySelector('#panel').parentNode.id,
  колонок: document.querySelectorAll('.cmpCol').length,
  чипов: document.querySelectorAll('.cmpChips .chip').length }))
const м1 = await местоПоказа()
say(м1.где === 'zebra', 'показ переехал в правую колонку, к доске')
say(м1.колонок === 2, 'доска собрана в две колонки: Крит и Микены')
const k6 = await коробки()
say(k6.окно.h > 380, 'слева страница во всю высоту колонки: ' + k6.окно.h + ' px')
// Набиваем доску тактами всех трёх разделов.
// ⚠️ Такт с ДРУГОЙ страницы showBeatAt откладывает на 1.1 с (сначала лист доезжает).
// Если гнать быстрее, отложенные вызовы наслаиваются и половина фактов не срабатывает —
// поймано 27.08: доска показывала одиннадцать фактов вместо двадцати восьми.
await page.evaluate(async () => {
  let стр = 0
  for (const b of window.__kniga.fullScript()) {
    const сменаСтраницы = b.page !== стр
    стр = b.page
    window.__kniga.showBeatAt(b.n, true)
    await new Promise((r) => setTimeout(r, сменаСтраницы ? 1300 : 45))
  }
})
await page.waitForTimeout(900)
const набрано = await page.evaluate(() => ({
  общее: document.querySelectorAll('.cmpChips .chip').length,
  крит: document.querySelectorAll('.cmpCol:nth-child(1) .kc').length,
  микены: document.querySelectorAll('.cmpCol:nth-child(2) .kc').length,
  вопрос: (document.querySelector('#zPages') || {}).textContent || '' }))
say(набрано.общее > 5 && набрано.крит > 2 && набрано.микены > 2,
  `факты разошлись по сторонам: общее ${набрано.общее}, Крит ${набрано.крит}, Микены ${набрано.микены}`)
say(/Что объединяло/.test(набрано.вопрос), 'в шапке доски стоит главный вопрос параграфа')
await page.screenshot({ path: OUT + '/6-sravnenie.png' })
// проверка страницы забирает показ обратно налево — ей нужна вся левая колонка
await page.evaluate(() => { document.querySelector('#panel').className = 'pg ctrl st-sum'
  window.__kniga.панельНаМесто() })
await page.waitForTimeout(500)
const м2 = await местоПоказа()
say(м2.где === 'read', 'на проверке показ возвращается к странице: он в «' + м2.где + '»')
await page.evaluate(() => { document.querySelector('#panel').className = 'pg'
  window.__kniga.панельНаМесто() })
await page.waitForTimeout(400)


// ── 7. переключение посреди урока ────────────────────────────────────────
// 🔑 Три вида — это один урок, а не три сборки. Значит переключение обязано работать
// на ходу и НИЧЕГО не терять: ни собранных фактов, ни места, где читают.
const собрано = () => page.evaluate(() => window.__kniga.panel().собрано)
const былоСобрано = await собрано()
const тактДо = await page.evaluate(() => window.__kniga.state().такт)
for (const вид of ['lenta', 'pol', 'sravn', 'lenta']) {
  await page.locator('#modeSw [data-m="' + вид + '"]').click()
  await page.waitForTimeout(700)
}
const сталоСобрано = await собрано()
const тактПосле = await page.evaluate(() => window.__kniga.state().такт)
say(сталоСобрано === былоСобрано, 'после четырёх переключений доска цела: ' + сталоСобрано)
say(тактПосле === тактДо, 'место в уроке не потерялось: такт ' + тактПосле)
const пусто = await page.evaluate(() => document.querySelectorAll('#keepList .kc, #keepList .chip').length)
say(пусто > 10, 'факты на доске остались на месте: ' + пусто)
await page.screenshot({ path: OUT + '/7-pereklyuchenie.png' })

console.log(`\nитог: ${ok.length} ок, ${bad.length} мимо, ошибок ${errs.length} · снимки → ${OUT}`)
if (errs.length) console.log(errs.slice(0, 5).join('\n'))
await browser.close()
process.exit(bad.length || errs.length ? 1 : 0)
