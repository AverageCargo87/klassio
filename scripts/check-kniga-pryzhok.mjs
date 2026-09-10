#!/usr/bin/env node
// Приёмка ПЕРЕХОДА ПО УРОКУ (v2.13).
//
// 🔴 Заказ Кратова 04.09: «чтобы можно было снизу, где точки страниц, для тестовых целей
// во время урока переключаться между его кусками — например по подпунктам параграфа или
// вообще с любого места начать, и чтобы Аня стала читать и вести урок оттуда».
//
// Проверяем ровно то, чем переход отличается от листания:
//   1. КУСКИ взяты из учебника, а не выдуманы, и покрывают урок без дыр;
//   2. попали ТУДА, КУДА просили — и на ходу тоже (голое присвоение beat промахивается
//      на такт вперёд: цикл прогона доводит итерацию и делает beat++);
//   3. Аня ЧИТАЕТ ОТТУДА — урок сам едет дальше, а не стоит на месте;
//   4. экран приехал вместе с уроком: страница, лист, доска, точка «где мы»;
//   5. ничего не сломалось: панель не выросла в третий ряд, точки той же геометрии,
//      прыжок посреди проверки страницы не вешает урок.
//
//   node scripts/check-kniga-pryzhok.mjs [папка-для-снимков]
//   KNIGA_URL=https://5.35.90.219.nip.io node scripts/check-kniga-pryzhok.mjs
import { chromium } from 'playwright'
import fs from 'node:fs'

const OUT = process.argv[2] || '.tmp/shots-pryzhok'
const URL = process.env.KNIGA_URL || 'http://localhost:8781'
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe'
fs.mkdirSync(OUT, { recursive: true })

const wav = (sec = 0.4, rate = 16000) => {
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
const errs = []

async function открыть (w = 1600, h = 900) {
  const page = await browser.newPage({ viewport: { width: w, height: h } })
  page.on('pageerror', (e) => errs.push('pageerror: ' + e))
  page.on('console', (m) => { if (m.type() === 'error' && !/favicon|getUserMedia|429/i.test(m.text())) errs.push(m.text().slice(0, 160)) })
  await page.route('**/api/tts', (r) => r.fulfill({ status: 200, contentType: 'audio/wav', body: wav() }))
  // ⚠️ Ключ прогресса именно kn_progress_p20 (kniga.html: КЛЮЧПРОГРЕССА). Если его не
  //  снять, на загрузке всплывает окно «продолжить с того же места» и накрывает панель.
  await page.addInitScript(() => { try { localStorage.removeItem('kn_progress_p20') } catch (e) {} })
  await page.goto(URL + '/kniga?teacher=off', { waitUntil: 'domcontentloaded', timeout: 90000 })
  await page.waitForFunction(() => window.__kniga && window.__kniga.beats() > 10, null, { timeout: 90000 })
  await page.waitForFunction(() => { const b = document.querySelector('#boot')
    return (!b || b.classList.contains('off')) && document.querySelector('#left')
      && document.querySelector('#left').clientHeight > 120 }, null, { timeout: 120000 })
  await page.evaluate(() => {
    const h = document.querySelector('#sHold'); if (h) h.value = '0'
    document.querySelector('#resume').classList.remove('on')
  })
  return page
}
// такт, у которого урок идёт дальше сам: ждём, пока номер вырастет
async function дождатьсяРоста (page, от, мс = 20000) {
  const t0 = Date.now()
  while (Date.now() - t0 < мс) {
    const n = await page.evaluate(() => window.__kniga.где().такт)
    if (n > от) return n
    await page.waitForTimeout(300)
  }
  return await page.evaluate(() => window.__kniga.где().такт)
}

const page = await открыть()

// ── 1. КУСКИ УРОКА ─────────────────────────────────────────────────────────
const куски = await page.evaluate(() => window.__kniga.куски())
const всего = await page.evaluate(() => window.__kniga.beats())
say(куски.length >= 4, `урок разложен на куски: ${куски.length} (${куски.map((k) => k.имя.slice(0, 22)).join(' · ')})`)
const дыры = куски.some((k, i) => (i === 0 ? k.от !== 1 : k.от !== куски[i - 1].до + 1))
say(!дыры && куски[куски.length - 1].до === всего, `куски покрывают все ${всего} тактов без дыр и нахлёстов`)
// Имена не выдуманы: три пункта параграфа названы самим учебником (ZEBRA берёт те же).
for (const имя of ['Природа и жизнь', 'Минойская цивилизация', 'Микенская цивилизация']) {
  say(куски.some((k) => k.имя.startsWith(имя)), `пункт учебника «${имя}» стал куском урока`)
}
say(куски.every((k) => k.стрОт >= 120 && k.стрДо <= 125 && k.стрОт <= k.стрДо),
  'у каждого куска свои страницы: ' + куски.map((k) => k.n + ':' + k.стрОт + '–' + k.стрДо).join(' '))

const точки = await page.evaluate(() => window.__kniga.точки())
say(точки.всего === всего, `точек столько же, сколько тактов: ${точки.всего}`)
say(точки.групп === куски.length, `точки разбиты по кускам параграфа: ${точки.групп} групп`)
say(точки.адресуются, 'у каждой точки есть адрес такта (data-n) — приёмка может нажать нужную')
const геом = await page.evaluate(() => {
  const b = document.querySelector('#steps b'), r = b.getBoundingClientRect()
  const c = getComputedStyle(b)
  return { h: Math.round(r.height), курсор: c.cursor, зона: Math.round(b.getBoundingClientRect().height) }
})
say(геом.h === 9 && геом.курсор === 'pointer', `точка осталась 9 px и стала нажимаемой (курсор ${геом.курсор})`)

// ── 2. ПЕРЕХОД С ХОЛОДНОГО СТАРТА: попали туда, куда просили ───────────────
const цель = куски.find((k) => k.имя.startsWith('Микенская цивилизация'))
const целевойY = await page.evaluate((n) => (window.__kniga.fullScript()[n - 1] || {}).y, цель.от)
await page.evaluate(() => { document.querySelector('#cCheck').checked = false })
await page.evaluate((n) => window.__kniga.прыжок(n, false), цель.от)
await page.waitForTimeout(900)
const после = await page.evaluate(() => window.__kniga.где())
say(после.такт === цель.от, `перешли ровно на первый такт куска: просили ${цель.от}, стоим на ${после.такт}`)
say(после.кусок === цель.имя, `урок знает, в каком он куске: «${после.кусок}»`)
const лист = await page.evaluate(() => window.__kniga.sheet())
say(лист.страница === после.стр, `страница учебника приехала за уроком: ${лист.страница}`)
const л = await page.evaluate(() => window.__kniga.лист())
say(целевойY === null || Math.abs(л.доляСтраницы - целевойY) < 0.34,
  `лист подвезён к строке такта: доля ${л.доляСтраницы} при цели ${целевойY}`)
const т2 = await page.evaluate(() => window.__kniga.точки())
say(т2.горит === цель.от, `точка «где мы» переехала на ${т2.горит}`)

// Доска-конспект: прыжок ВПЕРЁД догоняет собранное, иначе третий раздел открывается
// с пустой доской, а перепрыгнутые факты не появятся уже никогда.
say(после.наДоске > 5, `конспект догнан: на доске ${после.наДоске} фактов из прошлых разделов`)
say(после.раздел === 3, `доска показывает раздел цели: ${после.раздел}`)
say(после.вопросовСтраниц.length >= 2,
  'вопросы учебника с пройденных страниц собраны: ' + после.вопросовСтраниц.join(','))
await page.screenshot({ path: OUT + '/переход-с-холодного.png' }).catch(() => {})

// ── 3. АНЯ ВЕДЁТ УРОК ОТТУДА ──────────────────────────────────────────────
await page.evaluate((n) => window.__kniga.прыжок(n, true), цель.от)
await page.waitForTimeout(500)
const пошёл = await page.evaluate(() => window.__kniga.где())
say(пошёл.идёт, 'после перехода урок идёт сам, а не ждёт кнопки')
const вырос = await дождатьсяРоста(page, цель.от)
say(вырос > цель.от, `Аня читает дальше от места перехода: ${цель.от} → ${вырос}`)
const рядом = await page.evaluate(() => window.__kniga.state())
say(рядом.страница >= 123, `читает страницу нового места: ${рядом.страница}`)

// ── 4. ПЕРЕХОД НА ХОДУ: без промаха на такт ───────────────────────────────
// Голое присвоение beat здесь всегда мажет вперёд — цикл прогона доводит текущую
// итерацию и делает beat++. Меряем номер СРАЗУ после возврата перехода.
const назадN = await page.evaluate(() => window.__kniga.beatByText('Природа и жизнь'))
const доПрыжка = await page.evaluate(() => window.__kniga.где().наДоске)
await page.evaluate((n) => window.__kniga.прыжок(n, true), назадN)
const сразу = await page.evaluate(() => window.__kniga.где())
say(сразу.такт === назадN, `переход на ходу попал точно: просили ${назадN}, стоим на ${сразу.такт}`)
say(сразу.идёт, 'урок на ходу не выключился (run() — переключатель, легко получить «стоп»)')
say(сразу.раздел === 1, `доска вернулась к разделу места, куда перешли: ${сразу.раздел}`)
say(сразу.наДоске >= доПрыжка, `конспект не стёрт переходом назад: было ${доПрыжка}, стало ${сразу.наДоске}`)
const дубли = await page.evaluate(() => {
  const t = [...document.querySelectorAll('#keepList .kc')].map((e) => e.dataset.term)
  return t.length - new Set(t).size
})
say(дубли === 0, 'карточки на доске не задвоились после перехода назад')
const вырос2 = await дождатьсяРоста(page, назадN)
say(вырос2 > назадN, `и оттуда урок тоже поехал: ${назадN} → ${вырос2}`)
await page.evaluate(() => window.__kniga.stop())

// Нетерпеливое двойное нажатие. run() — переключатель: если оба перехода добегут до
// него, второй попадёт в «урок уже идёт» и ЧЕСТНО его остановит. Замерено до правки:
// прыжок(20) и сразу прыжок(64) оставляли урок на 64 со статусом «остановлено».
const дважды = await page.evaluate(async () => {
  window.__kniga.прыжок(20, true); window.__kniga.прыжок(64, true)
  await new Promise((r) => setTimeout(r, 2500))
  return window.__kniga.где()
})
say(дважды.такт === 64 && дважды.идёт,
  `два перехода подряд: урок на ${дважды.такт} и идёт (${дважды.идёт})`)
await page.evaluate(() => window.__kniga.stop())

// ── 5. ОКНО ПЕРЕХОДА И ТОЧКИ ──────────────────────────────────────────────
const кнопка = await page.evaluate(() => {
  const b = document.querySelector('#jmpBtn'); if (!b) return null
  const r = b.getBoundingClientRect(), br = document.querySelector('#bar').getBoundingClientRect()
  const т = document.querySelector('#steps').getBoundingClientRect()
  return { есть: true, вПанели: r.top >= br.top - 2 && r.bottom <= br.bottom + 2,
    приТочках: r.right <= т.left + 1 && т.left - r.right < 20,
    поЦентру: Math.abs((r.top + r.bottom) / 2 - (т.top + т.bottom) / 2) < 3, ш: Math.round(r.width) }
})
say(!!(кнопка && кнопка.вПанели), 'кнопка «перейти» стоит в нижней панели')
say(!!(кнопка && кнопка.приТочках && кнопка.поЦентру), 'и стоит вплотную к точкам, по центру их полосы')
await page.click('#jmpBtn')
await page.waitForTimeout(300)
const меню = await page.evaluate(() => window.__kniga.меню())
say(меню.открыто, 'кнопка открывает окно перехода')
say(меню.групп === куски.length && меню.строк === всего,
  `в окне все куски и все такты: ${меню.групп} заголовков, ${меню.строк} строк`)
say(/шаг \d+ из \d+/.test(меню.низ), `окно показывает, где урок сейчас: «${меню.низ}»`)
const найдено = await page.evaluate(() => window.__kniga.менюИскать('Минос'))
say(найдено > 0 && найдено < всего, `поиск по словам сужает список: «Минос» → ${найдено} тактов`)
await page.evaluate(() => window.__kniga.менюИскать(''))
await page.screenshot({ path: OUT + '/окно-перехода.png' }).catch(() => {})
// клик по строке меню — тот же переход, что и крючком
const строка = 5
await page.evaluate((i) => { document.querySelectorAll('#jmpList .тк')[i - 1].click() }, строка)
await page.waitForTimeout(800)
const поМеню = await page.evaluate(() => window.__kniga.где())
say(поМеню.такт === строка, `нажатие строки меню ведёт урок туда же: такт ${поМеню.такт}`)
say(!(await page.evaluate(() => window.__kniga.меню().открыто)), 'окно само закрывается после выбора')
await page.evaluate(() => window.__kniga.stop())

// нажатие по точке в панели
await page.locator('#steps b').nth(29).click()
await page.waitForTimeout(800)
const поТочке = await page.evaluate(() => window.__kniga.где())
say(поТочке.такт === 30, `нажатие точки в панели ведёт урок на её такт: ${поТочке.такт}`)
say(поТочке.идёт, 'и урок с этого места пошёл')
await page.evaluate(() => window.__kniga.stop())

await page.evaluate(() => window.__kniga.менюОткрыть())
await page.keyboard.press('Escape')
await page.waitForTimeout(200)
say(!(await page.evaluate(() => window.__kniga.меню().открыто)), 'Esc закрывает окно перехода')

// ── 6. НИЧЕГО НЕ СЛОМАНО ──────────────────────────────────────────────────
for (const [w, h] of [[1600, 900], [1280, 720]]) {
  await page.setViewportSize({ width: w, height: h })
  await page.waitForTimeout(400)
  // Панель до правки была 83 px в два ряда на обеих ширинах. Кнопка перехода обязана
  // стоить НОЛЬ: высоту она отняла бы у страницы и у доски, а третий ряд увёл бы
  // плашку версии под кнопки — ровно то, о чём в kniga.html три предупреждения.
  const п = await page.evaluate(() => {
    const bar = document.querySelector('#bar'), в = document.querySelector('#ver')
    const т = document.querySelector('#steps')
    return { высота: Math.round(bar.getBoundingClientRect().height),
      версияВыше: в.getBoundingClientRect().bottom <= т.getBoundingClientRect().top + 1 }
  })
  say(п.высота <= 84 && п.версияВыше, `на ${w}×${h} панель прежней высоты: ${п.высота} px, версия не уехала под кнопки`)
}
await page.setViewportSize({ width: 1600, height: 900 })

// Прыжок посреди проверки страницы: ожидание нажатия и микрофон обязаны отпуститься,
// иначе урок встанет молча — тот самый сорт поломки, ради которого заведён сторож.
await page.evaluate(() => { document.querySelector('#cCheck').checked = true })
const конецСтр = await page.evaluate(() => {
  const S = window.__kniga.fullScript()
  const i = S.findIndex((b, k) => b.page === 121 && (!S[k + 1] || S[k + 1].page !== 121))
  return i + 1
})
await page.evaluate((n) => window.__kniga.прыжок(n, true), конецСтр)
const t0 = Date.now()
let проверкаБыла = false
while (Date.now() - t0 < 45000) {
  await page.waitForTimeout(400)
  if (await page.evaluate(() => window.__kniga.control().идёт)) { проверкаБыла = true; break }
}
say(проверкаБыла, 'после перехода в конец страницы проверка страницы запускается как обычно')
const целевой2 = await page.evaluate(() => window.__kniga.beatByText('Микенская цивилизация'))
// ⚠️ Читаем номер СРАЗУ: с нулевой паузой между тактами урок за полсекунды уезжает
// на следующий, и строгая сверка «попали точно» превратилась бы в проверку скорости.
const изПроверки = await page.evaluate(async (n) => { await window.__kniga.прыжок(n, true)
  return { ...window.__kniga.где(), проверка: window.__kniga.control().идёт } }, целевой2)
say(изПроверки.такт === целевой2 && !изПроверки.проверка,
  `из проверки страницы урок уходит переходом чисто: такт ${изПроверки.такт}, проверка ${изПроверки.проверка}`)
const поехал = await дождатьсяРоста(page, целевой2, 25000)
say(поехал > целевой2, `и после проверки урок продолжает читать: ${целевой2} → ${поехал}`)
const застрял = await page.evaluate(() => document.querySelector('#stuck').classList.contains('on'))
say(!застрял, 'сторож не считает переход застреванием')
await page.evaluate(() => window.__kniga.stop())
await page.screenshot({ path: OUT + '/после-проверки.png' }).catch(() => {})

if (errs.length) { console.log('\n⚠ ошибки страницы:'); errs.slice(0, 6).forEach((e) => console.log('  ', e)) }
say(errs.length === 0, 'страница отработала без ошибок в консоли')

console.log(`\nитог: ${ok.length} ок, ${bad.length} мимо · снимки → ${OUT}`)
await browser.close()
process.exit(bad.length ? 1 : 0)
