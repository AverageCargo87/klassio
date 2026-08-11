#!/usr/bin/env node
// Приёмка ПРОВЕРКИ СТРАНИЦЫ (/kniga): послушал → прочитал сам → пересказал → тест →
// не сдал → повтор именно того куска, где ошибся → тест снова.
// Проходим цикл целиком без человека: синтез подменён тишиной, ответы жмёт скрипт.
//   node scripts/check-kniga-control.mjs [папка-для-снимков]
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
const page = await browser.newPage({ viewport: { width: 1440, height: 820 } })
const errs = []
page.on('pageerror', (e) => errs.push('pageerror: ' + e))
page.on('console', (m) => { if (m.type() === 'error' && !/favicon|getUserMedia/i.test(m.text() + m.location().url)) errs.push(m.text().slice(0, 140)) })
await page.route('**/api/tts', (r) => r.fulfill({ status: 200, contentType: 'audio/wav', body: silentWav() }))

const ok = [], bad = []
const say = (good, t) => (good ? ok : bad).push(t)
const ctl = () => page.evaluate(() => window.__kniga.control())
// отвечать верно, пока идёт тест: answer возвращает false, когда на экране разбор
// прошлого ответа, — тогда просто ждём следующий вопрос
// ⚠️ Считаем РАЗНЫЕ вопросы, а не нажатия: после верного ответа появилась кнопка
// «следующий вопрос», и одно и то же место успевало засчитаться дважды.
async function answerAll(sec = 40) {
  const seen = new Set()
  for (let i = 0; i < sec * 8; i++) {
    const c = await ctl()
    if (!c.идёт || c.этап !== 'test') break
    // ⚠️ Ключ — НОМЕР вопроса («вопрос 3 из 4»), а не его текст: текст читается из
    // разметки и в момент замера бывает ещё пустым, два таких ответа слипались в один,
    // и приёмка ругалась «отвечено 2 из 3», хотя отвечены были все.
    if (await page.evaluate(() => window.__kniga.answer(true))) { seen.add(c.шаг || c.вопрос); await page.waitForTimeout(400) }
    else await page.waitForTimeout(125)
  }
  return seen.size
}
// ждём, пока проверка встанет на нужный этап
async function stage(name, sec = 30) {
  for (let i = 0; i < sec * 5; i++) {
    const c = await ctl()
    if (c.идёт && c.этап === name) return c
    await page.waitForTimeout(200)
  }
  return null
}

await page.goto('http://localhost:8781/kniga', { waitUntil: 'domcontentloaded', timeout: 60000 })
await page.waitForFunction(() => window.__kniga && window.__kniga.beats() > 10, null, { timeout: 60000 })
await page.mouse.click(700, 780)
await page.evaluate(() => { document.querySelector('#sHold').value = '0'; document.querySelector('#cAsk').checked = false })

const tests = await page.evaluate(() => window.__kniga.tests())
say(/120:/.test(tests), 'вопросы загрузились по страницам: ' + tests)

// прыгаем на последний такт стр. 120 — оттуда прогон сам заходит в проверку
// ⚠️ Не на САМЫЙ последний такт: разбор пересказа проверяется по карточкам «запомни»,
// а они появляются по ходу чтения — с последнего такта на экране не окажется ни одной,
// и судить будет не по чему. Заходим за три такта до конца страницы.
const jumped = await page.evaluate(() => {
  const sc = window.__kniga.fullScript().filter((b) => b.page === 120)
  return window.__kniga.goBeat(sc[Math.max(0, sc.length - 4)].n)
})
await page.evaluate(() => window.__kniga.run())
say(!!jumped, 'прогон начат с последнего такта стр. 120 (такт ' + jumped + ')')

// ── 0. КОРОТКОЕ САМАРИ (v2.4) ────────────────────────────────────────────────
//  🔴 «прочитали материал → сделал короткое самари → попросил прочитать самари».
//  Главное, что здесь проверяется, — не вёрстка, а ЗАКОН ФОРМЫ: самари не наше, оно
//  собрано из предложений учебника. Если сюда просочится своя фраза, урок перестаёт
//  быть «стопроцентным вариантом истины», ради которого форму и выбрали.
const c0 = await stage('sum')
say(!!c0, 'этап «короткое самари» начался' + (c0 ? ': ' + c0.заголовок : ''))
if (c0) {
  const S = await page.evaluate(() => window.__kniga.summary(120))
  say(!!S && S.фраз >= 2 && S.фраз <= 5, 'самари из 3–5 фраз (' + (S ? S.фраз : 0) + ')')
  say(!!S && S.знаков <= 520, 'самари короткое — около полуминуты чтения (' + (S ? S.знаков : 0) + ' знаков)')
  const свои = S ? S.пункты.filter((p) => !p.вучебнике) : [{}]
  say(свои.length === 0, 'КАЖДАЯ фраза самари — дословно из учебника, своего не добавлено'
    + (свои.length ? ': «' + String(свои[0].фраза).slice(0, 60) + '»' : ''))
  say(!!S && S.пункты.every((p) => p.термин), 'у каждой фразы есть свой топик: '
    + (S ? S.пункты.map((p) => p.термин).join(' · ') : ''))
  say(!!S && S.пункты.filter((p) => p.картинка).length >= 2,
    'фразы самари идут с картинками (' + (S ? S.пункты.filter((p) => p.картинка).length : 0) + ' из ' + (S ? S.фраз : 0) + ')')

  // зачитывание: ровно одна фраза горит за раз, страница при этом ОТКРЫТА,
  // а в коробке показа идёт картинка того топика, о котором фраза
  let горелоМакс = 0, былаКартинка = false, страницаБылаЗакрыта = false
  let фразВидно = 0, фразВсего = 0
  for (let i = 0; i < 160; i++) {
    const st = await page.evaluate(() => {
      // 🔴 Звучащая фраза обязана быть ВИДНА: коробка самари прокручивается, и фраза
      // легко уезжает за нижний край — тогда голос идёт, а показать пальцем не на что.
      const cur = document.querySelector('#ctrlBody .ss.on')
      let видна = null
      if (cur) {
        const box = cur.closest('.sumbox')
        if (box) { const cb = box.getBoundingClientRect(), rb = cur.getBoundingClientRect()
          видна = rb.top >= cb.top - 2 && rb.bottom <= cb.bottom + 2 }
      }
      return {
        горит: document.querySelectorAll('#ctrlBody .ss.on').length,
        видна,
        файл: window.__kniga.panel().файл,
        закрыта: window.__kniga.control().страницаЗакрыта,
        кнопки: window.__kniga.control().кнопки,
      }
    })
    горелоМакс = Math.max(горелоМакс, st.горит)
    if (st.видна !== null) { фразВсего++; if (st.видна) фразВидно++ }
    if (st.файл) былаКартинка = true
    if (st.закрыта) страницаБылаЗакрыта = true
    if (st.кнопки.includes('go')) break
    await page.waitForTimeout(150)
  }
  say(фразВсего > 0 && фразВидно >= фразВсего - 2,
    'звучащая фраза самари видна в коробке, а не уехала за край (' + фразВидно + ' из ' + фразВсего + ' замеров)')
  say(горелоМакс === 1, 'при зачитывании горит ровно одна фраза самари (максимум ' + горелоМакс + ')')
  say(!страницаБылаЗакрыта, 'самари читается при ОТКРЫТОЙ странице — видно, откуда оно взято')
  say(былаКартинка, 'в коробке показа идёт картинка топика, о котором фраза')
  await page.screenshot({ path: OUT + '/19-ctrl-sum.png' })
  say(await page.evaluate(() => window.__kniga.press('go')), 'кнопка «дальше — прочитаю сам» нажалась')
}

// ── 1. прочитай ВСЛУХ (v2.0) ─────────────────────────────────────────────────
const c1 = await stage('read')
say(!!c1, 'этап «прочитай вслух» начался' + (c1 ? ': ' + c1.заголовок : ''))
if (c1) {
  const hl = await page.evaluate(() => document.querySelectorAll('#bookMarks .mk').length)
  say(hl > 0 && !c1.страницаЗакрыта, 'кусок подсвечен на ОТКРЫТОЙ странице (меток ' + hl + ')')
  say(c1.кнопки.includes('aloud') && c1.кнопки.includes('read'),
    'предложено читать вслух, но есть и обход без микрофона: ' + c1.кнопки.join(' '))
  await page.screenshot({ path: OUT + '/20-ctrl-read.png' })

  // 🔴 v2.4: читают САМАРИ, а не случайный кусок страницы
  const S1 = await page.evaluate(() => window.__kniga.summary(120))
  say(/САМАРИ/.test(c1.заголовок), 'читать просят именно самари: «' + c1.заголовок + '»')

  // 🔴 МОЗАИКА (правка руководителя 06.08: «чтобы был интерес выполнить задание»).
  // Плитки закрыты и открываются ПО ХОДУ чтения — награда должна быть заработанной,
  // поэтому пустую и сразу собранную мозаику приёмка обязана поймать.
  const m0 = await page.evaluate(() => window.__kniga.mosaic())
  say(m0.плиток >= 3, 'справа выложена мозаика закрытых плиток (' + m0.плиток + ')')
  say(m0.видна && m0.открыто === 0, 'в начале чтения все плитки закрыты (открыто ' + m0.открыто + ')')
  say(m0.подписи.length === m0.плиток && m0.подписи.every((s) => s),
    'под плитками картинки этой же страницы: ' + m0.подписи.join(' · '))
  const mHalf = await page.evaluate(() => { window.__kniga.mosaicTo(0.5); return window.__kniga.mosaic() })
  say(mHalf.открыто > 0 && mHalf.открыто < mHalf.плиток,
    'на половине прочитанного открыта половина мозаики (' + mHalf.открыто + '/' + mHalf.плиток + ')')
  await page.screenshot({ path: OUT + '/20a-ctrl-mosaic.png' })

  // сверка прочитанного — чистая функция, проверяется без микрофона вообще
  const ref = await page.evaluate(() => window.__kniga.keyText(120))
  say(ref.length > 40, 'эталон чтения — это кусок учебника (' + ref.length + ' знаков)')
  say(!!S1 && ref === S1.текст, 'эталон чтения — это ровно текст самари, слово в слово')
  const a = await page.evaluate((r) => ({
    целиком: window.__kniga.align(r, r),
    половина: window.__kniga.align(r, r.split(' ').slice(0, Math.floor(r.split(' ').length / 2)).join(' ')),
    мимо: window.__kniga.align(r, 'сегодня хорошая погода и мы пойдём гулять во двор'),
    сокращения: window.__kniga.align('Древняя Греция занимала южную часть', 'древняя греция занимала южную часть'),
  }), ref)
  // хвост из служебных слов после последнего значимого может остаться незакрытым —
  // сверка цепляется только за слова от 4 букв, и это правильно
  say(a.целиком.закрыто >= a.целиком.слов - 2, 'прочитал слово в слово — закрыт весь кусок (' + a.целиком.закрыто + '/' + a.целиком.слов + ')')
  say(a.половина.закрыто > a.целиком.слов * 0.35 && a.половина.закрыто < a.целиком.слов * 0.75,
    'прочитал половину — закрыта примерно половина (' + a.половина.закрыто + '/' + a.половина.слов + ')')
  say(a.мимо.закрыто <= 2, 'посторонняя речь кусок не закрывает (' + a.мимо.закрыто + ')')
  say(a.сокращения.закрыто === a.сокращения.слов, 'регистр и «ё» сверку не ломают')

  // само чтение вслух: микрофон подменяем расшифровкой
  await page.evaluate((r) => window.__kniga.read(r), ref)
  say(await page.evaluate(() => window.__kniga.press('aloud')), 'кнопка «читать вслух» нажалась')
  let sum = ''
  for (let i = 0; i < 60; i++) {
    sum = await page.evaluate(() => ((document.querySelector('#ctrlBody .cq') || {}).textContent || ''))
    if (/Прочитано/.test(sum)) break
    await page.waitForTimeout(120)
  }
  say(/Прочитано 100%/.test(sum), 'после чтения показано, сколько куска закрыто: «' + sum + '»')
  const tr = await page.evaluate(() => ((document.querySelector('#ctrlBody .rdtext') || {}).textContent || ''))
  say(tr.length > 40, 'на экране транскрибация того, что услышала (' + tr.length + ' знаков)')
  const line = await page.evaluate(() => {
    const els = [...document.querySelectorAll('#bookMarks .mk.line')]
    return els.length ? Math.max(...els.map((e) => parseFloat(e.style.width) || 0)) : -1
  })
  say(line > 0, 'линия под строкой доехала за голосом РЕБЁНКА (' + line.toFixed(1) + '%)')
  await page.screenshot({ path: OUT + '/20b-ctrl-aloud.png' })
  // 🔴 «Транскрипт сначала записался без пробелов, в одно длинное слово» (05.08).
  // Слова выкладываются по одному, и пробел жил ХВОСТОМ внутри слова — а у inline-block
  // концевой пробел схлопывается. Меряем не текст, а расстояние между двумя словами.
  const gap = await page.evaluate(() => {
    const box = document.createElement('div')
    box.className = 'rdtext'; box.style.cssText = 'position:fixed;left:-9999px;width:400px'
    document.body.appendChild(box)
    const put = (w) => { const s = document.createElement('span'); s.className = 'wd on'; s.textContent = w
      box.appendChild(s); box.appendChild(document.createTextNode(' ')) }
    put('Древняя'); put('Греция')
    const [a, b] = [...box.querySelectorAll('.wd')].map((e) => e.getBoundingClientRect())
    const d = b.left - a.right
    box.remove(); return d
  })
  say(gap > 2, 'слова транскрипции разделены пробелом (' + gap.toFixed(1) + ' px)')
  // дочитал до конца — мозаика собрана целиком, это и есть обещанная награда
  const m1 = await page.evaluate(() => window.__kniga.mosaic())
  say(m1.открыто === m1.плиток && m1.плиток > 0,
    'дочитал — мозаика открылась вся (' + m1.открыто + '/' + m1.плиток + ')')
  say(m1.собрана, 'показано, что мозаика собрана')
  await page.screenshot({ path: OUT + '/20c-ctrl-mosaic-done.png' })
  await page.evaluate(() => window.__kniga.press('go'))
}

// ── 1б. ЭКРАН ТОПИКОВ (v2.4) ─────────────────────────────────────────────────
//  🔴 «Далее должна происходить смена экрана, и топики уже без текста проговариваются
//  с показом картинки и коротким текстом… проходим точечно по каждому топику с
//  демонстрацией визуального ряда для запоминания».
//  Ключевое слово — СМЕНА ЭКРАНА: страница учебника должна уехать, иначе это не новый
//  экран, а ещё одна панель сбоку, и правка не выполнена.
let топикиСписок = []
const ct = await stage('topics', 40)
say(!!ct, 'этап «разбираем топики» начался' + (ct ? ': ' + ct.заголовок : ''))
if (ct) {
  // ⚠️ Этап включается РАНЬШЕ экрана: сначала Аня говорит «убираю страницу — смотри
  // сюда», и только потом книга уезжает. Прочитать состояние сразу по смене этапа —
  // значит поймать пустой экран и получить зелёное на нулях (0 из 0 всегда верно).
  let t0 = { виден: false, всего: 0 }
  for (let i = 0; i < 100; i++) {
    t0 = await page.evaluate(() => window.__kniga.topics())
    if (t0.виден && t0.всего > 0) break
    await page.waitForTimeout(200)
  }
  say(t0.виден, 'экран топиков занял сцену')
  say(t0.книгаУехала, 'страница учебника уехала — это СМЕНА экрана, а не панель сбоку')
  say(t0.всего >= 3, 'топиков на странице: ' + t0.всего)
  say(t0.список.length === t0.всего, 'слева список всех топиков: ' + t0.список.join(' · '))
  топикиСписок = t0.список
  // ⚠️ Кнопка настроек висит fixed в углу ОКНА и не знает про новый экран: она села
  // ровно на подпись «стр. N» правой колонки. Мелочь, но на демо смотрят именно туда.
  const нахлёст = await page.evaluate(() => {
    const g = document.querySelector('#hudBtn'), p = document.querySelector('#tpPage')
    if (!g || !p) return -1
    const a = g.getBoundingClientRect(), b = p.getBoundingClientRect()
    const w = Math.min(a.right, b.right) - Math.max(a.left, b.left)
    const h = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top)
    return w > 0 && h > 0 ? Math.round(w * h) : 0
  })
  say(нахлёст === 0, 'шестерёнка настроек не накрывает подпись страницы (нахлёст ' + нахлёст + ' px²)')

  // проходим по каждому: у топика обязаны быть картинка (или карта), короткая мысль
  // и ДОСЛОВНАЯ строка учебника — «показ не сообщает того, чего нет в тексте»
  const beats = await page.evaluate(() => window.__kniga.fullScript().map((b) => b.say || ''))
  const плохо = []
  let сКартинкой = 0, сЦитатой = 0, дословных = 0
  for (let i = 0; i < t0.всего; i++) {
    // ⚠️ Ждём, пока картинка топика ПРОЯВИТСЯ, а не «260 мс и хватит»: показы тут
    // до 2560 px, и под нагрузкой один топик из пяти не успевал — приёмка ругалась
    // на данные, хотя картинка была на месте.
    const t = await page.evaluate((k) => { window.__kniga.topicPick(k)
      return new Promise((r) => {
        const t0 = Date.now()
        const tick = () => { const s = window.__kniga.topics()
          if (s.картинкаВидна || s.картаВидна || Date.now() - t0 > 4000) return r(s)
          setTimeout(tick, 120) }
        setTimeout(tick, 260) }) }, i)
    if (!t.термин || !t.коротко) плохо.push(t.термин || '№' + (i + 1))
    if (t.картинкаВидна || t.картаВидна) сКартинкой++
    if (t.цитата && t.цитата.length > 20) {
      сЦитатой++
      const q = t.цитата.replace(/^[«"]|[»"]$/g, '').trim()
      if (beats.some((s) => s.includes(q.slice(0, 60)))) дословных++
    }
    if (i === 0) await page.screenshot({ path: OUT + '/20d-ctrl-topics.png' })
  }
  say(плохо.length === 0, 'у каждого топика есть название и короткая мысль'
    + (плохо.length ? ' — кроме: ' + плохо.join(', ') : ''))
  say(сКартинкой === t0.всего, 'у каждого топика свой визуальный ряд — картинка или карта ('
    + сКартинкой + '/' + t0.всего + ')')
  say(сЦитатой === t0.всего, 'у каждого топика показана строка учебника (' + сЦитатой + '/' + t0.всего + ')')
  say(дословных === сЦитатой, 'строки учебника на экране топиков ДОСЛОВНЫЕ ('
    + дословных + '/' + сЦитатой + ')')

  // экран проходится кнопкой и закрывается сам, вернув книгу
  await page.evaluate(() => window.__kniga.topicPick(0))
  let шагов = 0
  for (let i = 0; i < 200; i++) {
    const c = await ctl()
    if (!c.идёт || c.этап !== 'topics') break
    if (await page.evaluate(() => window.__kniga.topicNext())) шагов++
    await page.waitForTimeout(220)
  }
  say(шагов >= t0.всего, 'экран пройден по каждому топику кнопкой (' + шагов + ' нажатий)')
  const t1 = await page.evaluate(() => window.__kniga.topics())
  say(!t1.виден && !t1.книгаУехала, 'после разбора экран закрылся и книга вернулась')
}

// ── 2. пересказ: микрофон подменяем текстом, судью — ответом ─────────────────
const c2 = await stage('tell')
say(!!c2, 'этап «расскажи своими словами» начался')
if (c2) {
  say(!c2.карточкиВидны, 'на пересказе карточки спрятаны — они были бы готовым ответом')
  say(c2.кнопки.includes('skip'), 'пересказ можно пропустить, если микрофона нет')
  // ⚠️ На пересказе карточки ПРЯЧУТ, и читать их список здесь — гонка: успел до —
  // получишь пять штук, не успел — пустоту, судья получит несуществующий номер, и
  // приёмка отрапортует «0 назвал / 0 забыл», хотя разбор работает. Берём список,
  // снятый на экране топиков: там те же самые карточки и они заведомо на месте.
  let shownBefore = await page.evaluate(() => window.__kniga.panel().тизеры)
  if (!shownBefore.length) shownBefore = топикиСписок
  await page.screenshot({ path: OUT + '/21-ctrl-tell.png' })
  // судья — DeepSeek; в приёмке отвечает заглушка: два пункта из пяти названы
  // Рубрика судьи — все карточки страницы из panel.json, а на экране сейчас только те,
  // что успели прозвучать (приёмка прыгнула в конец страницы). Поэтому «названный» пункт
  // считаем по файлу, иначе галочка легла бы на карточку, которой не видно.
  const panel = JSON.parse(fs.readFileSync('.tmp/sketches/tutor/book/panel.json', 'utf8'))
  const terms120 = (panel.find((p) => p.page === 120) || { teasers: [] }).teasers.map((t) => t.term)
  const shown = shownBefore
  const idx = terms120.findIndex((t) => shown.includes(t)) + 1
  await page.route('**/api/chat', (r) => r.fulfill({ status: 200, contentType: 'application/json',
    body: JSON.stringify({ text: '{"covered":[' + idx + '],"reply":"Молодец, это ты вспомнил. Кое-что забыл — вернёмся."}' }) }))
  await page.evaluate(() => window.__kniga.hear('Читали про дворец Кносс на Крите и про Минотавра в лабиринте'))
  await page.evaluate(() => window.__kniga.press('tell'))
  const c2b = await stage('told', 20)
  say(!!c2b, 'пересказ разобран' + (c2b ? ': ' + c2b.вопрос : ''))
  if (c2b) {
    say(c2b.карточкиВидны, 'на разборе карточки снова видны — по ним и показан итог')
    // ⚠️ Метки ставятся после ответа судьи, а он тут заглушка — но карточки успевают
    // перерисоваться. Один замер попадал то до, то после: проверка «ловила через раз».
    let marks = { назвал: 0, забыл: 0 }
    for (let i = 0; i < 50; i++) {
      marks = await page.evaluate(() => ({
        назвал: document.querySelectorAll('#keepList .kc.said').length,
        забыл: document.querySelectorAll('#keepList .kc.miss').length }))
      if (marks.назвал) break
      await page.waitForTimeout(150)
    }
    say(marks.назвал === 1 && marks.забыл >= 1,
      'на карточках отмечено, что назвал, а что забыл (' + marks.назвал + ' / ' + marks.забыл + ')')
    await page.screenshot({ path: OUT + '/21b-ctrl-told.png' })
    await page.evaluate(() => window.__kniga.press('go'))
  }
}

// ── 3. разбор вопросов перед тестом (v2.0) ───────────────────────────────────
const cp = await stage('pre', 40)
say(!!cp, 'перед тестом идёт РАЗБОР вопросов' + (cp ? ': ' + cp.заголовок : ''))
if (cp) {
  // 🔴 05.08: на разборе ребёнок НЕ отвечает — иначе те же четыре вопроса идут дважды.
  // Аня показывает вопрос, называет верный вариант и место в тексте, ребёнок жмёт «дальше».
  let asked = 0, withSrc = 0, opened = 0, clickable = 0
  const leads = new Set()
  for (let i = 0; i < 500; i++) {
    const c = await ctl()
    if (!c.идёт || c.этап !== 'pre') break
    if (c.кнопки.some((b) => b.startsWith('ans'))) clickable++
    const res = await page.evaluate(() => ({
      src: !!document.querySelector('#ctrlBody .csrc'),
      lead: ((document.querySelector('#ctrlBody .cres') || {}).textContent || ''),
      go: !!document.querySelector('#ctrlBody [data-act="go"]'),
      варианты: document.querySelectorAll('#ctrlBody .copt').length,
    }))
    if (res.go && res.варианты) {
      asked++
      if (res.src) withSrc++
      if (res.lead) leads.add(res.lead.replace(/«.*/, '').trim())
      if (!c.страницаЗакрыта) opened++
      if (asked === 1) await page.screenshot({ path: OUT + '/21c-ctrl-pre.png' })
      await page.evaluate(() => window.__kniga.press('go'))
      await page.waitForTimeout(350)
    } else await page.waitForTimeout(120)
  }
  say(asked >= 4, 'на разборе показаны все вопросы страницы (' + asked + ')')
  say(clickable === 0, 'на разборе ребёнок не отвечает — варианты показаны, но не нажимаются')
  say(opened >= asked && asked > 0, 'на разборе страница ОТКРЫТА — ответ можно найти в тексте')
  say(withSrc >= asked && asked > 0, 'к каждому вопросу показана строка учебника, где ответ (' + withSrc + ')')
  say(leads.size >= 3, 'подводка к ответу не повторяется слово в слово (' + [...leads].join(' · ') + ')')
}

// ── 4. ТРЕНАЖЁР РАЗДЕЛА (v2.5) ───────────────────────────────────────────────
//  Методичка 08.08 заменила прежний тест тренажёром. Глубокие проверки самого
//  тренажёра живут в check-kniga-drill.mjs; здесь — что он встал на своё место в
//  цепочке и что урок после него едет дальше.
//  ⚠️ Прежний тест из продукта не выброшен (он работает, когда drill.json не собран),
//  поэтому его проверки ниже не удалены, а спрятаны за этим же флагом.
const DRILLED = await page.evaluate(() => !!window.__kniga.drillData(120))
say(true, 'путь проверки: ' + (DRILLED ? 'тренажёр раздела (v2.5)' : 'прежний тест (drill.json нет)'))
if (DRILLED) {
  const ch = await stage('howto', 60)
  say(!!ch, 'перед заданиями показано, КАК их решать' + (ch ? ': ' + ch.заголовок : ''))
  if (ch) await page.evaluate(() => window.__kniga.press('go'))
  const cd = await stage('drill', 60)
  say(!!cd, 'начался тренажёр раздела' + (cd ? ': ' + cd.шаг : ''))
  if (cd) {
    await page.waitForTimeout(700)
    const s = await ctl()
    say(s.страницаЗакрыта, 'на тренажёре страница закрыта — отвечаем по памяти')
    say(!s.карточкиВидны, 'карточки на тренажёре спрятаны — они были бы подсказкой')
    await page.screenshot({ path: OUT + '/22-ctrl-drill.png' })
    // первое задание валим трижды — так проверяется и повтор, и что тупика нет
    let провалено = false, шагов = 0
    for (let i = 0; i < 700; i++) {
      const c = await ctl()
      if (!c.идёт || c.этап === 'again' || c.этап === 'done') break
      const d = await page.evaluate(() => window.__kniga.drill())
      if (d.вариантов) {
        const первое = /задание 1 из/.test(d.задание)
        if (первое && !провалено) {
          await page.evaluate(() => window.__kniga.drillPick('no'))
          if (d.попытка >= 3) провалено = true
        } else await page.evaluate(() => window.__kniga.drillPick('ok'))
        шагов++
      } else if (d.пары) { await page.evaluate(() => window.__kniga.drillMatch(true)); шагов++ }
      else if (c.кнопки.includes('go')) await page.evaluate(() => window.__kniga.press('go'))
      await page.waitForTimeout(240)
    }
    say(провалено, 'задание, проваленное трижды, закрылось разбором и не заперло урок')
    const st = await page.evaluate(() => window.__kniga.stats())
    const p120 = (st.разделы || []).find((x) => x.стр === 120) || {}
    say((p120.заданий || 0) >= 6, 'раздел прошёл все шесть заданий (' + (p120.заданий || 0) + ')')
    say((p120.замен || 0) >= 1, 'взамен проваленного выдано новое задание (' + (p120.замен || 0) + ')')
    say(st.счётчикВиден, 'счётчик верных и неверных виден на всём протяжении')
    // ── повтор: перечитываем то место учебника, где ответ ───────────────────
    const ca = await stage('again', 60)
    say(!!ca, 'после проваленного задания идёт ПОВТОР места в учебнике' + (ca ? ': ' + ca.шаг : ''))
    if (ca) {
      say(!ca.страницаЗакрыта, 'на повторе страница снова открыта — она перечитывается')
      let hl = 0
      for (let i = 0; i < 60; i++) {
        hl = Math.max(hl, await page.evaluate(() => document.querySelectorAll('#bookMarks .mk').length))
        const c = await ctl()
        if (!c.идёт || c.этап !== 'again') break
        await page.waitForTimeout(150)
      }
      say(hl > 0, 'на повторе кусок с ответом подсвечен (меток ' + hl + ')')
      await page.screenshot({ path: OUT + '/23-ctrl-again.png' })
    }
    const cdone = await stage('done', 60)
    say(!!cdone, 'страница закончена' + (cdone ? ': ' + cdone.заголовок : ''))
    await page.screenshot({ path: OUT + '/24-ctrl-done.png' })
  }
}

// ── 4б. прежний тест: первый вопрос заваливаем нарочно ───────────────────────
const c3 = DRILLED ? null : await stage('test')
if (!DRILLED) say(!!c3, 'этап «тест» начался')
if (c3) {
  await page.waitForTimeout(600)
  const c3b = await ctl()
  say(c3b.страницаЗакрыта, 'на тесте страница закрыта — отвечаем по памяти')
  say(!c3b.карточкиВидны, 'карточки на тесте тоже спрятаны')
  say(c3b.кнопки.length === 3, 'у вопроса три варианта: ' + c3b.кнопки.join(' '))
  await page.screenshot({ path: OUT + '/22-ctrl-test.png' })
  // 🔴 «В тесте выбираю ответ — и всё прыгает, потому что снизу рисуется значок» (05.08).
  // Содержимое теста центрировано, и строка итога сдвигала вопрос вверх. Меряем, стоит
  // ли вопрос на месте до и после ответа.
  const qTop = () => page.evaluate(() => {
    const q = document.querySelector('#ctrlBody .cq')
    return q ? Math.round(q.getBoundingClientRect().top) : -1 })
  const top1 = await qTop()
  say(await page.evaluate(() => window.__kniga.answer(false)), 'первый вопрос отвечен НЕВЕРНО нарочно')
  await page.waitForTimeout(320)
  const top2 = await qTop()
  say(top1 > 0 && Math.abs(top2 - top1) <= 2, 'вопрос не прыгает при ответе (' + top1 + ' → ' + top2 + ' px)')
  // разбор ответа держится ровно столько, сколько Аня его проговаривает, — а в приёмке
  // синтез это тишина на 0.12 с. Поэтому ловим сразу, а не «через секунду».
  let marked = { верный: 0, ошибка: 0, итог: '' }
  for (let i = 0; i < 30; i++) {
    const m = await page.evaluate(() => ({
      верный: document.querySelectorAll('#ctrlBody .copt.ok').length,
      ошибка: document.querySelectorAll('#ctrlBody .copt.no').length,
      итог: (document.querySelector('#ctrlBody .cres') || {}).textContent || '' }))
    if (m.итог) { marked = m; break }
    await page.waitForTimeout(60)
  }
  say(marked.верный === 1 && marked.ошибка === 1 && /не так/i.test(marked.итог),
    'ошибка показана и подсвечен верный вариант («' + marked.итог + '»)')
  // остальные вопросы круга отвечаем верно
  const n1 = await answerAll()
  say(n1 >= 3, 'остальные вопросы круга отвечены верно (' + n1 + ' шт.)')
  // ── 4. повтор ─────────────────────────────────────────────────────────────
  const c4 = await stage('again', 40)
  say(!!c4, 'после ошибки начался ПОВТОР' + (c4 ? ': ' + c4.шаг : ''))
  if (c4) {
    await page.screenshot({ path: OUT + '/23-ctrl-again.png' })
    // Состояние берём из ЗАМЕРА, поймавшего сам этап: с тишиной вместо синтеза повтор
    // проскакивает за полсекунды, и отдельный опрос уже застаёт следующий круг теста.
    say(!c4.страницаЗакрыта, 'на повторе страница снова открыта — она перечитывается')
    let hl = 0
    for (let i = 0; i < 60; i++) {
      hl = Math.max(hl, await page.evaluate(() => document.querySelectorAll('#bookMarks .mk').length))
      const c = await ctl()
      if (!c.идёт || c.этап !== 'again') break
      await page.waitForTimeout(150)
    }
    say(hl > 0, 'на повторе кусок с ответом подсвечен (меток ' + hl + ')')
  }
  // второй круг: отвечаем верно
  const c5 = await stage('test', 40)
  say(!!c5, 'после повтора тест пошёл ЗАНОВО' + (c5 ? ' (' + c5.шаг + ')' : ''))
  if (c5) {
    say(/круг 2/.test(c5.шаг), 'спрашивают только то, что не вышло: ' + c5.шаг)
    const n2 = await answerAll()
    say(n2 === 1, 'во втором круге задан ровно один вопрос — тот, что провалили (' + n2 + ')')
  }
  const c6 = await stage('done', 40)
  say(!!c6 && c6.сдано === true, 'страница сдана со второго круга' + (c6 ? ': ' + c6.заголовок : ''))
  await page.screenshot({ path: OUT + '/24-ctrl-done.png' })
}

// ── 5. после проверки урок продолжается ──────────────────────────────────────
let went = false
for (let i = 0; i < 60; i++) {
  await page.waitForTimeout(400)
  const s = await page.evaluate(() => window.__kniga.state())
  const c = await ctl()
  if (!c.идёт && s.идёт && s.страница === 121) { went = true; break }
}
say(went, 'после проверки урок сам поехал на следующую страницу')
const back = await page.evaluate(() => ({ панель: document.querySelector('#panel').className,
  закрыта: !document.querySelector('#veil').classList.contains('off') }))
say(back.панель === 'pg' && !back.закрыта, 'панель вернулась к показу и карточкам (' + back.панель + ')')

// ── 6. 🔴 ВОПРОСЫ УЧЕБНИКА ИДУТ ПЕРВЫМИ (правка 06.08) ───────────────────────
// «Сначала пусть задаёт те вопросы, которые есть в самом учебнике, а потом всё
// остальное». Урок сейчас читает 121-ю: у неё два своих вопроса — про природные
// условия и «опишите значение этой фразы». Ждём, что закрепление начнётся с них.
// тумблер «слушать ответ» приёмка выключает в начале (микрофона в headless нет), но
// этот шаг умеет обходиться кнопкой «пропустить» — включаем его обратно
await page.evaluate(() => { document.querySelector('#cAsk').checked = true })
const c7 = await stage('own', 150)
say(!!c7, 'закрепление 121-й начинается с ВОПРОСОВ УЧЕБНИКА' + (c7 ? ': ' + c7.заголовок : ''))
if (c7) {
  const собрано = await page.evaluate(() => window.__kniga.ownQ())
  say((собрано[121] || []).length >= 2, 'вопросы учебника собраны по странице: ' + JSON.stringify(собрано[121] || []))
  // ⚠️ Считаем РАЗНЫЕ вопросы, а не нажатия. Кнопки успевают отрисоваться раньше, чем
  // сменится текст вопроса, и один и тот же вопрос засчитывался дважды: счётчик
  // добирал до двух, приёмка уходила дальше — а урок так и стоял, ожидая ответа на
  // второй вопрос. Дальше всё сыпалось «по таймауту» и выглядело поломкой урока.
  // Тот же грабель уже ловили на тесте: «считаем разные вопросы, а не нажатия».
  const askedQ = new Set()
  for (let i = 0; i < 300; i++) {
    const c = await ctl()
    if (!c.идёт || c.этап !== 'own') break
    if (c.кнопки.includes('tell') && c.кнопки.includes('skip') && c.вопрос && !askedQ.has(c.вопрос)) {
      say(!c.страницаЗакрыта && /\?|опишите|расскажите/i.test(c.вопрос),
        'спрашивает словами учебника при открытой странице: «' + c.вопрос.slice(0, 60) + '»')
      askedQ.add(c.вопрос)
      await page.evaluate(() => window.__kniga.press('skip'))
      await page.waitForTimeout(500)
    } else await page.waitForTimeout(150)
  }
  say(askedQ.size >= 2, 'задано вопросов учебника, все разные: ' + askedQ.size)
  await page.screenshot({ path: OUT + '/25-ctrl-own.png' })
  // 🔴 Порядок цепочки (v2.4): вопросы учебника → САМАРИ → чтение самари вслух.
  // До v2.4 сразу за вопросами шло чтение; ждать здесь 'read' — значит проверять
  // вчерашний порядок и не заметить, если самари вообще выпало.
  const after = await stage('sum', 60)
  say(!!after, 'после вопросов учебника идёт самари' + (after ? ': ' + after.заголовок : ''))
  say(!!after && after.страница === 121, 'и это самари ИМЕННО 121-й страницы (стр. ' + (after ? after.страница : '—') + ')')
}
await page.evaluate(() => window.__kniga.stop())

console.log('\n✅ ' + ok.join('\n✅ '))
if (bad.length) console.log('\n❌ ' + bad.join('\n❌ '))
if (errs.length) console.log('\n⚠ ошибки страницы:\n  ' + [...new Set(errs)].slice(0, 6).join('\n  '))
console.log(`\nитог: ${ok.length} ок, ${bad.length} мимо, ошибок ${errs.length} · снимки → ${OUT}`)
await browser.close()
process.exit(bad.length || errs.length ? 1 : 0)
