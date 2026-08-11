#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════════════════
//  ПРИЁМКА ТРЕНАЖЁРА РАЗДЕЛА (v2.5) — по методичке руководителя от 08.08
//
//  Методичка написана как список требований, и половина из них — про то, что
//  «нужно проверить»: что варианты кликабельны, что среди них есть правильный, что
//  нет зацикливания, что всё влезает в ноутбук. Здесь каждый такой пункт — строка
//  приёмки. Проходим тренажёр целиком без человека.
//
//  node scripts/check-kniga-drill.mjs [папка-для-снимков]
// ═══════════════════════════════════════════════════════════════════════════
import { chromium } from 'playwright'
import fs from 'node:fs'

const OUT = process.argv[2] || '.tmp/shots-drill'
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
// 1280×720 — ноутбук руководителя. Методичка требует, чтобы ВСЁ влезало именно сюда.
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } })
const errs = []
page.on('pageerror', (e) => errs.push('pageerror: ' + String(e).slice(0, 160)))
page.on('console', (m) => { if (m.type() === 'error' && !/favicon|getUserMedia|AudioContext/i.test(m.text())) errs.push(m.text().slice(0, 140)) })
await page.route('**/api/tts', (r) => r.fulfill({ status: 200, contentType: 'audio/wav', body: silentWav() }))

const ok = [], bad = []
const say = (good, t) => (good ? ok : bad).push(t)
const ctl = () => page.evaluate(() => window.__kniga.control())
const dr = () => page.evaluate(() => window.__kniga.drill())
const stats = () => page.evaluate(() => window.__kniga.stats())
async function stage(name, sec = 90) {
  for (let i = 0; i < sec * 5; i++) {
    const c = await ctl(); if (c.идёт && c.этап === name) return c
    await page.waitForTimeout(200)
  }
  return null
}
// дождаться, пока на экране появится задание с вариантами
async function waitTask(sec = 30) {
  for (let i = 0; i < sec * 5; i++) {
    const d = await dr()
    if (d.этап === 'drill' && (d.вариантов > 0 || d.пары > 0)) return d
    await page.waitForTimeout(200)
  }
  return null
}

await page.goto('http://localhost:8781/kniga', { waitUntil: 'domcontentloaded', timeout: 60000 })
await page.waitForFunction(() => window.__kniga && window.__kniga.beats() > 10, null, { timeout: 60000 })
await page.mouse.click(640, 690)
await page.evaluate(() => { document.querySelector('#sHold').value = '0'; document.querySelector('#cAsk').checked = false })

// ── ДАННЫЕ ТРЕНАЖЁРА ────────────────────────────────────────────────────────
const D = await page.evaluate(() => [120, 121, 122, 123, 124, 125].map((p) => window.__kniga.drillData(p)))
say(D.every((d) => d && d.заданий === 6), 'на каждый раздел ровно 6 заданий: ' + D.map((d) => d && d.заданий).join(' '))
say(D.every((d) => d.словарных === 3 && d.исторических === 3),
  '3 на активный словарь + 3 на историю в каждом разделе')
say(D.every((d) => d.типы.length >= 3), 'в разделе не меньше трёх РАЗНЫХ типов заданий: '
  + (D[0] ? D[0].типы.join(', ') : ''))
say(D.every((d) => d.верныйЕсть), 'среди вариантов ВСЕГДА есть правильный ответ')
const слов = D.reduce((a, d) => a + d.словарь.length, 0)
say(слов >= 10, 'активный словарь урока: ' + слов + ' слов (методичка требует не менее 10)')
say(D.every((d) => d.запасных >= 3), 'есть запасные задания на замену проваленных: '
  + D.map((d) => d.запасных).join(' '))

// 🔴 Задание не имеет права содержать собственный ответ. Ловится это не на экране, а
// в данных: «„Бухты и острова“ — что это значит?» с ответом «Бухты укрывали корабли,
// острова были ориентирами» решается угадыванием, материала знать не надо. Методичка
// прямо запрещает примитивные задания. Проверяем ВСЕ задания, включая запасные:
// в прошлый раз правило дошло только до основных, а тавтология уехала в запас.
const drill = JSON.parse(fs.readFileSync('.tmp/sketches/tutor/book/drill.json', 'utf8'))
const корень = (w) => w.toLowerCase().replace(/[«»,.!?—–:;()]/g, '').slice(0, Math.max(4, w.length - 2))
const эхо = (вопрос, ответ) => String(вопрос).split(/\s+/)
  .filter((w) => w.replace(/[«»,.!?—–:;()]/g, '').length > 3 && !/^(значит|учебнике|сказано|названо|уроке|какое|какой|соедини|каждую)/i.test(w))
  .filter((w) => String(ответ).toLowerCase().includes(корень(w)))
const тавтология = []
for (const pg of drill.pages) {
  for (const t of [...(pg.tasks || []), ...(pg.spare || [])]) {
    if (t.kind === 'match') {
      for (const p of t.pairs || []) if (эхо(p.l, p.r).length >= 2) тавтология.push(pg.page + ' пара «' + p.l + '»')
      continue
    }
    if (t.kind !== 'vocab') continue          // «значение → слово» проверяет обратное, там эхо неизбежно
    const верный = (t.options || [])[t.ok] || ''
    const общие = эхо(t.q, верный)
    if (общие.length >= 2) тавтология.push(pg.page + ' «' + t.term + '» (' + общие.join(', ') + ')')
  }
}
say(!тавтология.length, 'ответ не повторяет слов самого задания (проверено ' + drill.pages.length + ' разделов, с запасными)'
  + (тавтология.length ? ' — ПОВТОРЯЕТ: ' + тавтология.join(' · ') : ''))

// ── ЗАХОДИМ В ТРЕНАЖЁР ──────────────────────────────────────────────────────
await page.evaluate(() => {
  const sc = window.__kniga.fullScript().filter((b) => b.page === 120)
  window.__kniga.goBeat(sc[Math.max(0, sc.length - 4)].n)
})
await page.evaluate(() => window.__kniga.run())

// ⚠️ Счётчик обязан стоять В НИЖНЕЙ ПАНЕЛИ и не пересекаться с панелью настроек.
// Ловим целый класс ошибок: одинаковый id у двух элементов (счётчик уехал в угол и
// стал открываться шестерёнкой) и сломанное правило, которым настройки прячутся.
const place = await page.evaluate(() => {
  const h = document.querySelector('#drHud'), bar = document.querySelector('#bar')
  const set = document.querySelectorAll('#hud')
  const r = h.getBoundingClientRect(), b = bar.getBoundingClientRect()
  return { родитель: h.parentElement.id, позиция: getComputedStyle(h).position,
    внутриПанели: r.top >= b.top - 2 && r.bottom <= b.bottom + 2,
    настроек: set.length,
    настройкиСпрятаны: set.length === 1 && getComputedStyle(set[0]).display === 'none' }
})
say(place.родитель === 'bar' && place.позиция !== 'fixed', 'счётчик стоит в нижней панели урока')
say(place.настроек === 1, 'идентификатор панели настроек никем не занят (найдено: ' + place.настроек + ')')
say(place.настройкиСпрятаны, 'панель настроек по умолчанию спрятана и не закрывает урок')

// счётчик обязан быть виден с начала урока, а не только на тесте
const s0 = await stats()
say(s0.счётчикВиден, 'счётчик виден с самого начала урока')
say(s0.урокСек >= 0 && s0.урокСек < 600, 'часы урока пошли (' + s0.урокСек + ' с)')

// пропускаем всё, что до тренажёра — но по дороге проверяем правило чтения
let gateTested = false
for (let i = 0; i < 900; i++) {
  const c = await ctl()
  if (c.идёт && (c.этап === 'howto' || c.этап === 'drill')) break
  // 🔴 «Система прослушала и проверила, что 50 % текста прочитано, и после этого
  //  пропустила дальше; если текст не прочитан, переходить к тестированию нельзя».
  if (c.идёт && c.этап === 'read' && !gateTested && c.кнопки.includes('aloud')) {
    gateTested = true
    const ref = await page.evaluate(() => window.__kniga.keyText(120))
    const words = ref.split(/\s+/)
    const third = words.slice(0, Math.max(3, Math.floor(words.length / 4))).join(' ')
    await page.evaluate((r) => window.__kniga.read(r), third)
    await page.evaluate(() => window.__kniga.press('aloud'))
    let head = ''
    for (let k = 0; k < 100; k++) {
      head = await page.evaluate(() => ((document.querySelector('#ctrlBody .cq') || {}).textContent || ''))
      if (/Прочитано/.test(head)) break
      await page.waitForTimeout(120)
    }
    const pct = +(head.match(/(\d+)%/) || [0, 0])[1]
    const btns = (await ctl()).кнопки
    say(pct < 50, 'прочитано меньше половины (' + pct + '%) — это и проверяем')
    say(btns.includes('again') && !btns.includes('go'),
      'к заданиям не пускают, просят прочитать ещё раз: ' + btns.join(' '))
    const hint = await page.evaluate(() => ((document.querySelector('#ctrlBody .chint') || {}).textContent || ''))
    say(/половин/i.test(hint), 'сказано, сколько нужно прочитать: «' + hint.slice(0, 58) + '»')
    say(/ошибк/i.test(hint), 'и что ошибки при чтении не считаются')
    await page.screenshot({ path: OUT + '/29-read-gate.png' })
    // читаем целиком — теперь пускают
    await page.evaluate((r) => window.__kniga.read(r), ref)
    await page.evaluate(() => window.__kniga.press('again'))
    await page.waitForTimeout(1200)
    const after = (await ctl()).кнопки
    say(after.includes('go'), 'дочитал — путь к заданиям открылся: ' + after.join(' '))
    await page.waitForTimeout(200)
    continue
  }
  if (c.идёт && c.кнопки.length) {
    const b = c.кнопки
    const p = b.includes('skip') ? 'skip' : b.includes('read') ? 'read' : b.includes('go') ? 'go' : null
    if (p) await page.evaluate((x) => window.__kniga.press(x), p)
  }
  if (await page.evaluate(() => window.__kniga.topics().виден)) await page.evaluate(() => window.__kniga.topicNext())
  await page.waitForTimeout(200)
}

// ── КАК РЕШАТЬ ТИПОВЫЕ ЗАДАНИЯ ──────────────────────────────────────────────
const ch = await stage('howto', 40)
say(!!ch, 'перед заданиями показано, КАК их решать' + (ch ? ': ' + ch.заголовок : ''))
if (ch) {
  const types = await page.evaluate(() => document.querySelectorAll('#ctrlBody .dwhy').length)
  say(types >= 3, 'показаны все три типа заданий (' + types + ')')
  await page.screenshot({ path: OUT + '/30-howto.png' })
  await page.evaluate(() => window.__kniga.press('go'))
}

// ── ЗАДАНИЕ 1: отвечаем ВЕРНО с первой попытки ──────────────────────────────
const t1 = await waitTask()
say(!!t1, 'тренажёр начался' + (t1 ? ': ' + t1.задание : ''))
if (t1) {
  say(!!t1.вопрос && t1.вопрос.length > 12, 'задание стоит в отдельном блоке: «' + t1.вопрос.slice(0, 58) + '»')
  say(t1.вариантов >= 3 && t1.вариантов <= 10, 'вариантов ' + t1.вариантов + ' (методичка: не больше 10)')
  say(t1.подписаны, 'у каждого варианта есть понятный текст')
  say(t1.кликабельны, 'все варианты кликабельны и видны на экране')
  say(t1.подсказка, 'есть кнопка «запросить подсказку»')
  say(t1.попытка === 1, 'показано, что идёт попытка 1 из 3')
  // блок задания и варианты стоят ВПЛОТНУЮ друг к другу
  const gap = await page.evaluate(() => {
    const q = document.querySelector('#ctrlBody .dqbox'), o = document.querySelector('#ctrlBody .dopts')
    if (!q || !o) return -1
    return Math.round(o.getBoundingClientRect().top - q.getBoundingClientRect().bottom)
  })
  say(gap >= 0 && gap < 26, 'поля ответа стоят сразу под текстом задания (' + gap + ' px)')
  const tm = await stats()
  say(!!tm.таймерЗадания, 'на задание идёт обратный отсчёт: ' + tm.таймерЗадания)
  await page.screenshot({ path: OUT + '/31-task.png' })

  // подсказка не должна выдавать ответ
  const before = (await dr()).варианты
  await page.evaluate(() => window.__kniga.drillHint())
  await page.waitForTimeout(500)
  const hint = await page.evaluate(() => {
    const e = [...document.querySelectorAll('#ctrlBody .dwhy')].pop()
    return e ? e.textContent : '' })
  say(!!hint, 'подсказка показана текстом: «' + hint.slice(0, 54) + '»')
  say(!before.some((v) => v.length > 12 && hint.includes(v)),
    'подсказка НЕ содержит готового ответа')

  const okStats = await stats()
  await page.evaluate(() => window.__kniga.drillPick('ok'))
  // ⚠️ Значок читаем СРАЗУ: после верного ответа урок сам уезжает на следующее
  // задание (так требует методичка), и через секунду проверять уже нечего.
  await page.waitForTimeout(220)
  const mark = await page.evaluate(() => {
    const b = document.querySelector('#ctrlBody .dopt.ok')
    return b ? (b.querySelector('.tick') || {}).textContent : '' })
  say(mark === '✓', 'на верном варианте появился значок ✓ (' + (mark || 'ничего') + ')')
  await page.waitForTimeout(800)
  const s1 = await stats()
  say(s1.верно === okStats.верно + 1, 'верный ответ засчитан (' + s1.верно + ')')
  say(s1.спервой === okStats.спервой + 1, 'засчитан именно как «с первой попытки» (' + s1.спервой + ')')
}

// ── ЗАДАНИЕ 2: три ошибки подряд — разбор растёт, тупика нет ─────────────────
const t2 = await waitTask()
say(!!t2, 'следующее задание пришло САМО, без нажатия «дальше»' + (t2 ? ': ' + t2.задание : ''))
if (t2 && t2.вариантов) {
  const seenWhy = []
  // ⚠️ Ждём ХОД ЦЕЛИКОМ, а не «900 мс». Разбор появляется после реакции Ани, а
  // варианты перерисовываются на новую попытку ещё позже. Нажатие, сделанное между
  // этими двумя моментами, урок кладёт в очередь (так и задумано — иначе на
  // сопоставлении терялись клики), и дальше вся проверка едет на шаг: попытка
  // отстаёт, разбор читается прошлый. Ход считается сделанным, когда появился новый
  // разбор И счётчик попыток сдвинулся; на третьей попытке сдвигаться уже нечему.
  // ⚠️ На третьей попытке разборов не ПРИБАВЛЯЕТСЯ: разбор второй убирается, когда
  // появляется сам ответ (так сделано намеренно — иначе кнопка уезжает за нижний край
  // на 720 px). Поэтому третий ход ждём по появлению разбора вида a3, а не по счёту.
  const ждиХод = async (a, было) => {
    for (let i = 0; i < 100; i++) {
      const d = await dr()
      const р = d.разборы || []
      if (a < 3 ? (р.length > было && d.попытка > a) : р.some((x) => /a3:/.test(x))) return d
      await page.waitForTimeout(200)
    }
    return await dr()
  }
  for (let a = 1; a <= 3; a++) {
    const d = await dr()
    if (!d.вариантов) break
    say(d.попытка === a, 'идёт попытка ' + a + ' из 3 (на экране: ' + d.попытка + ')')
    const было = (d.разборы || []).length
    await page.evaluate(() => window.__kniga.drillPick('no'))
    const w = (await ждиХод(a, было)).разборы
    seenWhy.push((w[w.length - 1] || '').slice(0, 46))
    if (a === 1) {
      say(/a1:/.test(w[w.length - 1] || ''), 'на первую ошибку — короткая причина: ' + seenWhy[0])
      // правильный ответ на первой попытке показывать НЕЛЬЗЯ, иначе вторая бессмысленна
      const shown = await page.evaluate(() => document.querySelectorAll('#ctrlBody .dopt.ok').length)
      say(shown === 0, 'верный вариант на первой попытке НЕ подсвечен')
    }
    if (a === 2) say(/a2:/.test(w[w.length - 1] || ''), 'на вторую — как решать: ' + seenWhy[1])
    if (a === 3) {
      say(/a3:/.test(w[w.length - 1] || ''), 'на третью — правильный ответ с разъяснением: ' + seenWhy[2])
      const quote = await page.evaluate(() => {
        const e = document.querySelector('#ctrlBody .dwhy.a3 .q'); return e ? e.textContent : '' })
      say(quote.length > 20, 'к разбору приложена строка УЧЕБНИКА: «' + quote.slice(0, 48) + '»')
    }
  }
  say(new Set(seenWhy).size === seenWhy.length, 'разбор на каждой попытке РАЗНЫЙ, а не один и тот же')
  await page.screenshot({ path: OUT + '/32-attempts.png' })
  // тупика быть не должно: после третьей попытки урок идёт дальше сам
  const moved = await (async () => {
    for (let i = 0; i < 90; i++) {
      const d = await dr()
      if (d.вариантов && d.попытка === 1) return true
      if (d.пары) return true
      await page.waitForTimeout(200)
    }
    return false
  })()
  say(moved, 'после трёх неудач урок пошёл дальше — зацикливания нет')
  const s2 = await stats()
  say(s2.замен >= 1, 'взамен проваленного выдано новое задание (замен: ' + s2.замен + ')')
}

// ── СОПОСТАВЛЕНИЕ: работа мышкой и отметка, ГДЕ именно ошибка ───────────────
let matched = false
for (let i = 0; i < 40; i++) {
  const d = await dr()
  if (d.пары >= 6) {
    matched = true
    say(true, 'дошли до задания на сопоставление (' + d.пары + ' компонентов)')
    say(d.пары <= 10, 'компонентов выбора не больше 10 (' + d.пары + ')')
    // одну пару складываем верно, остальные со сдвигом
    await page.evaluate(() => window.__kniga.drillMatch('half'))
    await page.waitForTimeout(230)
    const marks = await page.evaluate(() => ({
      верные: document.querySelectorAll('#ctrlBody .mit.good').length,
      неверные: document.querySelectorAll('#ctrlBody .mit.bad').length,
      значки: [...document.querySelectorAll('#ctrlBody .mit .tick')].filter((e) => e.textContent).length }))
    say(marks.неверные > 0 && marks.значки > 0,
      'ошибка помечена у КОНКРЕТНОЙ пары (верных ' + marks.верные + ', неверных ' + marks.неверные + ')')
    // 🔴 и главное: на следующей попытке верная пара ОСТАЁТСЯ сложенной
    await page.waitForTimeout(1100)
    const kept = await page.evaluate(() => ({
      осталось: document.querySelectorAll('#ctrlBody .mit.good').length,
      заперты: document.querySelectorAll('#ctrlBody .mit[disabled]').length,
      попытка: +((document.querySelector('#ctrlBody .att') || {}).textContent || 0) }))
    say(kept.попытка === 2, 'после ошибки идёт вторая попытка того же задания (' + kept.попытка + ')')
    say(kept.осталось >= 2 && kept.заперты >= 2,
      'верно сложенная пара осталась на месте — перекладывать надо только ошибочное ('
      + kept.осталось + ' с галочкой)')
    await page.screenshot({ path: OUT + '/33-match.png' })
    break
  }
  if (d.вариантов) await page.evaluate(() => window.__kniga.drillPick('ok'))
  await page.waitForTimeout(300)
}
say(matched, 'задание на сопоставление есть в разделе')

// ── ДОВОДИМ РАЗДЕЛ ДО КОНЦА ────────────────────────────────────────────────
for (let i = 0; i < 400; i++) {
  const c = await ctl()
  if (!c.идёт) break
  const d = await dr()
  if (d.вариантов) await page.evaluate(() => window.__kniga.drillPick('ok'))
  else if (d.пары) await page.evaluate(() => window.__kniga.drillMatch(true))
  else if (c.кнопки.includes('go')) await page.evaluate(() => window.__kniga.press('go'))
  else if (c.кнопки.includes('skip')) await page.evaluate(() => window.__kniga.press('skip'))
  await page.waitForTimeout(250)
  if (c.этап === 'done') break
}
const s3 = await stats()
say(s3.разделы.length >= 1 && s3.разделы[0].заданий >= 6,
  'раздел пройден целиком: заданий ' + (s3.разделы[0] || {}).заданий)
say(s3.счётчикВиден, 'счётчик оставался виден всё время')

// ── ОТЧЁТ ──────────────────────────────────────────────────────────────────
await page.evaluate(() => window.__kniga.showReport())
await page.waitForTimeout(700)
const rep = await page.evaluate(() => window.__kniga.report())
say(rep.виден, 'экран итогов показан')
say(/Начало:/.test(rep.когда) && /Окончание:/.test(rep.когда),
  'сверху точные дата и время начала и окончания: ' + rep.когда.slice(0, 72))
// 🔑 Экран закрепления включён ПОСЛЕ урока: «чтобы весь урок заново не слушать».
const повтор = await page.evaluate(() => {
  const b = document.querySelector('#repZak')
  return b ? { есть: true, виден: b.offsetParent !== null, текст: b.textContent.trim() } : { есть: false } })
say(повтор.есть && повтор.виден, 'на итогах есть вход в повтор параграфа: «' + (повтор.текст || 'НЕТ') + '»')
say(rep.колонок >= 7, 'в таблице есть попытки, верные, неверные и время (' + rep.колонок + ' колонок)')
say(rep.строк >= 3, 'в таблице строка на раздел и строка итога (' + rep.строк + ')')
say(/среднее|В среднем/i.test(rep.время), 'показано среднее время на раздел и на задание')
say(rep.советов >= 1, 'есть блок «на чём сосредоточиться» (' + rep.советов + ' пункта)')
say(rep.влезает, 'итоги влезают в один экран ноутбука 1280×720')
await page.screenshot({ path: OUT + '/34-report.png' })

// ── ОБЩИЕ ТРЕБОВАНИЯ ИНТЕРФЕЙСА ────────────────────────────────────────────
// «в интерфейсе нельзя делать белый шрифт на белом фоне»
const contrast = await page.evaluate(() => {
  const lum = (c) => { const m = c.match(/[\d.]+/g) || [255, 255, 255]
    const f = m.slice(0, 3).map((x) => { const v = +x / 255
      return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4) })
    return 0.2126 * f[0] + 0.7152 * f[1] + 0.0722 * f[2] }
  const bgOf = (el) => { let e = el
    while (e && e !== document.documentElement) {
      const b = getComputedStyle(e).backgroundColor
      if (b && !/rgba\(0, 0, 0, 0\)|transparent/.test(b)) return b
      e = e.parentElement }
    return 'rgb(255,255,255)' }
  const bad = []
  for (const el of document.querySelectorAll('#report *, #ctrlBody *')) {
    const t = (el.textContent || '').trim()
    if (!t || el.children.length) continue
    if (!el.offsetParent) continue
    const l1 = lum(getComputedStyle(el).color), l2 = lum(bgOf(el))
    const ratio = (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05)
    if (ratio < 2.2) bad.push(t.slice(0, 24) + ' (' + ratio.toFixed(1) + ')')
  }
  return bad
})
say(contrast.length === 0, 'нигде нет светлого текста на светлом фоне'
  + (contrast.length ? ': ' + contrast.slice(0, 3).join(' · ') : ''))
// ничего не должно вылезать за экран
const overflow = await page.evaluate(() => ({
  тело: document.body.scrollWidth - document.body.clientWidth,
  панель: (() => { const e = document.querySelector('#ctrlBody')
    return e ? e.scrollHeight - e.clientHeight : 0 })() }))
say(overflow.тело <= 1, 'по горизонтали ничего не вылезает (' + overflow.тело + ' px)')

console.log('\n✅ ' + ok.join('\n✅ '))
if (bad.length) console.log('\n❌ ' + bad.join('\n❌ '))
if (errs.length) console.log('\n⚠ ошибки страницы:\n  ' + [...new Set(errs)].slice(0, 6).join('\n  '))
console.log('\nитог: ' + ok.length + ' ок, ' + bad.length + ' мимо, ошибок ' + errs.length + ' · снимки → ' + OUT)
await browser.close()
process.exit(bad.length ? 1 : 0)
