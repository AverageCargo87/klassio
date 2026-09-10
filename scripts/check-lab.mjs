#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════════════════
//  ПРИЁМКА ВИТРИНЫ СБОРОК (/lab)
//  Проверяем ровно то, ради чего она сделана: руководитель видит три сборки,
//  каждая ОТКРЫВАЕТСЯ, у каждой есть «что изменилось», и замечание доходит.
//  node scripts/check-lab.mjs [папка-для-снимков]
// ═══════════════════════════════════════════════════════════════════════════
import { chromium } from 'playwright'
import fs from 'node:fs'

const OUT = process.argv[2] || '.tmp/shots-lab'
// Приёмку можно навести на боевой адрес — те же проверки, но снаружи:
//   LAB_URL=https://5.35.90.219.nip.io LAB_USER=klassio LAB_PASS=... node scripts/check-lab.mjs
const BASE = (process.env.LAB_URL || 'http://127.0.0.1:8781').replace(/\/$/, '')
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe'
fs.mkdirSync(OUT, { recursive: true })
const browser = await chromium.launch({ executablePath: fs.existsSync(CHROME) ? CHROME : undefined,
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] })
const page = await browser.newPage({ viewport: { width: 1280, height: 720 },
  httpCredentials: process.env.LAB_USER ? { username: process.env.LAB_USER, password: process.env.LAB_PASS || '' } : undefined })
// 🔴 Записи приёмки помечаются служебными и в списке руководителя НЕ показываются.
// Раньше их выпалывали из файла руками — и однажды вместе с ними стёрли живое
// замечание. Правило: файл замечаний не чистят никогда, лишнее прячут.
await page.addInitScript(() => { window.__приёмка = true })
const errs = []
page.on('pageerror', (e) => errs.push(String(e).slice(0, 140)))
const ok = [], bad = []
const say = (g, t) => (g ? ok : bad).push(t)

await page.goto(BASE + '/lab', { waitUntil: 'networkidle', timeout: 30000 })

const cards = await page.evaluate(() => [...document.querySelectorAll('.card')].map((c) => ({
  метка: (c.querySelector('.tag i') || {}).textContent || '',
  версия: (c.querySelector('.tag') || {}).textContent || '',
  описание: ((c.querySelector('.desc') || {}).textContent || '').length,
  ссылка: (c.querySelector('a.go') || {}).getAttribute('href'),
  кнопкаЛога: !!c.querySelector('[data-log]'),
})))
say(cards.length === 2, 'на витрине две ветки подачи: ' + cards.map((c) => c.метка).join(' · '))
say(cards.every((c) => c.описание > 120), 'у каждой есть короткое описание своими словами')
say(cards.every((c) => c.ссылка), 'у каждой есть кнопка «пройти урок»: ' + cards.map((c) => c.ссылка).join(' '))
// «Что изменилось» есть у той ветки, которая развивается. У макета его нет намеренно:
// он собран один раз и с тех пор не менялся — врать про историю правок незачем.
say(cards.filter((c) => c.кнопкаЛога).length >= 1, 'у развивающейся ветки есть «что изменилось»')
say(cards.some((c) => /сейчас развиваем/.test(c.версия)), 'видно, какой вариант текущий')
// 🔑 Смысл витрины — параллельные варианты подачи, а не только история одной линии:
// макет «Закрепление» это другой визуальный язык на том же материале.
say(cards.some((c) => /БЕТА/.test(c.метка)), 'вторая ветка — другая подача (макет закрепления)')
// 🔑 Прошлые состояния ветки не выброшены, а собраны под её карточкой: это одна линия,
// а не отдельные варианты, но «было и стало» по ним по-прежнему смотрят.
const архив = await page.evaluate(() => [...document.querySelectorAll('.arch a')].map((a) => a.getAttribute('href')))
// 13.08: к v1.0 и v2.3 добавилась v2.6 — состояние ДО правок по разбору Владимира,
// на неё же откатываемся, если новое не понравится.
say(архив.length === 3 && архив.includes('/kniga/v1') && архив.includes('/kniga/v23')
  && архив.includes('/kniga/v26'),
  'прошлые состояния ветки рядом с ней: ' + архив.join(' '))
for (const u of архив) {
  const r = await page.request.get(BASE + u)
  say(r.ok(), 'архив ' + u + ' открывается (' + r.status() + ')')
}

// каждая ссылка обязана открываться — иначе руководитель упрётся в 404
for (const c of cards) {
  const r = await page.request.get(BASE + c.ссылка)
  const html = await r.text()
  say(r.ok() && /УЧЕБНИК/i.test(html), 'сборка ' + c.метка + ' открывается (' + c.ссылка + ', ' + r.status() + ')')
}

// чейнджлог — отдельным окном поверх страницы (раньше разворачивался внутри карточки
// шириной 300 px, и руководитель сказал, что читать невозможно)
await page.click('.card.now [data-log]')
// ⚠️ Не «700 мс»: окно ждёт ДВА запроса (журнал версий и список релизов), и на боевом
// адресе они дольше, чем на localhost. Ждём, пока «загружаю…» сменится содержимым.
await page.waitForFunction(() => {
  const b = document.querySelector('#mbody')
  return b && b.textContent.length > 40 && !/загружаю/.test(b.textContent)
}, null, { timeout: 20000 })
const log = await page.evaluate(() => {
  const m = document.querySelector('#modal'), b = document.querySelector('#mbody')
  const r = b.getBoundingClientRect()
  return { видно: m.classList.contains('on'), знаков: b.textContent.length,
    заголовков: b.querySelectorAll('h3').length, пунктов: b.querySelectorAll('li').length,
    ширина: Math.round(r.width), высота: Math.round(r.height),
    метка: (document.querySelector('#mver') || {}).textContent || '' } })
say(log.видно && log.знаков > 400, 'чейнджлог открывается и не пустой (' + log.знаков + ' знаков)')
say(log.пунктов >= 3, 'в нём список правок (' + log.пунктов + ' пунктов, ' + log.заголовков + ' подзаголовка)')
// ⚠️ Ради этого его и переделывали: читать надо в широком окне, а не в колонке карточки
say(log.ширина >= 600 && log.высота >= 380,
  'и его правда можно читать: окно ' + log.ширина + '×' + log.высота + ' px')
say(/v\d/.test(log.метка), 'видно, чей это список правок: «' + log.метка + '»')
// 🔑 «Когда это вышло» — не подпись руками, а время релиза с сервера: у каждой выкладки
// лежит RELEASE.json, и дата в окне обязана совпадать с ним, иначе она через неделю соврёт.
const релизы = await (await page.request.get(BASE + '/api/releases')).json()
const когда = await page.evaluate(() => (document.querySelector('#mwhen') || {}).textContent || '')
if (релизы.length) {
  const последний = релизы[релизы.length - 1]
  const час = new Intl.DateTimeFormat('ru-RU', { timeZone: 'Europe/Moscow', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(последний.когда))
  say(/\d{2}\.\d{2}\.\d{4}/.test(когда) && когда.includes(час) && /МСК/.test(когда),
    'в окне видно, когда обновление вышло: «' + когда.trim() + '»')
  // 🔑 «Тут выглядит так, будто всё вышло в один момент» — поэтому правки разложены по
  // ДНЯМ РАБОТЫ (лента с 21.08), а рядом с каждым днём стоит, когда он уехал на сервер.
  // Дата дня — из хроники, время выкладки — из релизов: разойтись не могут.
  const лента = await page.evaluate(() => [...document.querySelectorAll('.tl .r.day')].map((r) => ({
    дата: (r.querySelector('time') || {}).textContent || '',
    тема: (r.querySelector('.th') || {}).textContent || '',
    вышло: (r.querySelector('.out') || {}).textContent || '',
    пунктов: r.querySelectorAll('.p').length })))
  say(лента.length >= 2 && лента.every((x) => /^\d{2}\.\d{2}$/.test(x.дата.trim()) && x.тема.length > 10 && x.пунктов > 0),
    'работы разложены по дням: ' + лента.length + ' дней, свежий — ' + (лента[0] || {}).дата)
  // ⚠️ День, который уже уехал, обязан это показывать. «Ещё не выкладывалось» у свежего
  // дня = в хронике забыли проставить номер релиза (в заголовке остался прочерк).
  const безВыкладки = лента.filter((x) => /не выкладывалось/i.test(x.вышло)).map((x) => x.дата)
  say(!/не выкладывалось/i.test((лента[0] || {}).вышло),
    'у свежего дня видно, когда он уехал на сервер: «' + ((лента[0] || {}).вышло || '').trim() + '»'
    + (безВыкладки.length ? ' · без выкладки пока: ' + безВыкладки.join(', ') : ''))
  const наКарточке = await page.evaluate(() => (document.querySelector('.card.now .when') || {}).textContent || '')
  say(наКарточке.includes(час), 'и на карточке текущей сборки та же дата: «' + наКарточке.trim() + '»')
} else {
  say(/собрана/.test(когда), 'в окне видно дату версии (релизов на стенде нет): «' + когда.trim() + '»')
}
await page.screenshot({ path: OUT + '/40-lab-changelog.png' })
await page.keyboard.press('Escape')
await page.waitForTimeout(300)
say(await page.evaluate(() => !document.querySelector('#modal').classList.contains('on')),
  'закрывается по Escape')
await page.screenshot({ path: OUT + '/40-lab.png', fullPage: true })

// замечание доходит до сервера
const было = (await (await page.request.get(BASE + '/api/feedback?all=1')).json()).length
await page.selectOption('#fbVer', { index: 0 })   // веток теперь две: АЛЬФА и БЕТА
await page.fill('#fbText', 'Приёмка витрины: проверка, что замечание доходит.')
await page.click('#fbSend')
await page.waitForTimeout(900)
const стало = await (await page.request.get(BASE + '/api/feedback?all=1')).json()
say(стало.length === было + 1, 'замечание записано на сервере (' + было + ' → ' + стало.length + ')')
const живые = await (await page.request.get(BASE + '/api/feedback')).json()
say(!живые.some((f) => /Приёмк/i.test(f.текст || '')),
  'записи приёмки в список руководителя не попадают (живых там ' + живые.length + ')')
say(стало[0] && /АЛЬФА/.test(стало[0].версия || ''), 'вместе с номером сборки: ' + (стало[0] || {}).версия)
const наЭкране = await page.evaluate(() => document.querySelectorAll('#fbList .item').length)
say(наЭкране >= 1, 'и сразу видно в списке под формой (' + наЭкране + ')')
say(await page.evaluate(() => /Записал/.test(document.querySelector('#fbSent').textContent)),
  'человеку сказано, что замечание принято')
// ⚠️ Время в замечании — МОСКОВСКОЕ. Сервер витрины живёт по UTC, и без явного пояса
// руководитель видел время на три часа раньше своего.
const мскСейчас = +(new Intl.DateTimeFormat('ru-RU', { timeZone: 'Europe/Moscow', hour: '2-digit', hour12: false })
  .format(new Date()).match(/\d+/) || [99])[0]
const часЗаписи = +(((стало[0] || {}).когда || '').match(/(\d+):\d+/) || [0, 99])[1]
say(Math.abs(часЗаписи - мскСейчас) <= 1,
  'время замечания московское: «' + (стало[0] || {}).когда + '» (в Москве сейчас ' + мскСейчас + ' ч)')

// ── ФОТО К ЗАМЕЧАНИЮ ───────────────────────────────────────────────────────
//  «Вот тут криво» + скриншот объясняет за секунду то, на что уходит абзац.
say(await page.isVisible('#fbPick'), 'у формы есть «приложить фото»')
await page.setInputFiles('#fbFile', '.tmp/sketches/tutor/book/fig-p120-1.jpg')
await page.waitForFunction(() => document.querySelector('#fbThumb').classList.contains('on'), null, { timeout: 15000 })
const превью = await page.evaluate(() => ({
  видно: document.querySelector('#fbThumb').classList.contains('on'),
  вес: (document.querySelector('#fbThumbName') || {}).textContent || '',
  данные: (document.querySelector('#fbThumbImg') || {}).src.slice(0, 22) }))
say(превью.видно && /^data:image\/jpeg/.test(превью.данные), 'выбранное фото сразу показано в форме (' + превью.вес + ')')
await page.fill('#fbText', 'Приёмка витрины: замечание с фото.')
await page.click('#fbSend')
await page.waitForTimeout(1200)
const сФото = (await (await page.request.get(BASE + '/api/feedback?all=1')).json())[0] || {}
say(!!сФото.фото, 'фото ушло вместе с замечанием (' + (сФото.фото || 'НЕТ') + ')')
if (сФото.фото) {
  const r = await page.request.get(BASE + '/api/feedback-photo/' + сФото.фото)
  const байт = (await r.body()).length
  say(r.ok() && /image\//.test(r.headers()['content-type'] || '') && байт > 5000,
    'и отдаётся с сервера: ' + r.status() + ', ' + Math.round(байт / 1024) + ' КБ')
}
const вСписке = await page.evaluate(() => {
  const im = document.querySelector('#fbList .item img.ph')
  return im ? { есть: true, лениво: im.getAttribute('loading') === 'lazy' } : { есть: false } })
say(вСписке.есть, 'фото видно в списке замечаний')
// ⚠️ Ленивая загрузка — требование постановки: пока список не на экране, за картинками
// не ходят. Без неё витрина тянула бы мегабайты при каждом открытии.
say(вСписке.лениво, 'и грузится ЛЕНИВО — только когда до него доходит взгляд')
await page.click('#fbList .item img.ph')
await page.waitForTimeout(400)
say(await page.evaluate(() => document.querySelector('#lightbox').classList.contains('on')),
  'по нажатию фото открывается во весь экран')
await page.screenshot({ path: OUT + '/41-lab-photo.png' })
await page.keyboard.press('Escape')
await page.waitForTimeout(250)
say(await page.evaluate(() => !document.querySelector('#lightbox').classList.contains('on')),
  'и закрывается по Escape')

// ничего не должно вылезать вбок на ноутбуке
const wide = await page.evaluate(() => document.body.scrollWidth - document.body.clientWidth)
say(wide <= 1, 'по горизонтали ничего не вылезает (' + wide + ' px)')

// ── замечание ПРЯМО ИЗ УРОКА ───────────────────────────────────────────────
//  Ценность кнопки не в форме, а в том, что вместе с текстом уходит МЕСТО:
//  иначе замечание звучит как «где-то в тесте мелкий шрифт».
await page.goto(BASE + '/kniga', { waitUntil: 'domcontentloaded', timeout: 60000 })
await page.waitForFunction(() => window.__kniga && window.__kniga.beats() > 10, null, { timeout: 60000 })
const было2 = (await (await page.request.get(BASE + '/api/feedback?all=1')).json()).length
say(await page.isVisible('#fbBtn'), 'в уроке есть кнопка «замечание»')
await page.click('#fbBtn')
await page.waitForTimeout(400)
say(await page.isVisible('#fbPic'), 'и прямо из урока тоже можно приложить фото')
const где = await page.textContent('#fbWhere')
say(/v\d/.test(где) && /стр\.|до начала/.test(где), 'окошко знает, где мы сейчас: «' + где + '»')
await page.fill('#fbTx', 'Приёмка: замечание из урока.')
await page.click('#fbOk')
// окошко прячется через секунду после отправки — «спасибо» должно успеть прочитаться
await page.waitForTimeout(1600)
const стало2 = await (await page.request.get(BASE + '/api/feedback?all=1')).json()
say(стало2.length === было2 + 1, 'замечание из урока дошло до сервера (' + было2 + ' → ' + стало2.length + ')')
say(стало2[0] && (стало2[0].место || '').length > 8,
  'вместе с местом, а не просто текстом: «' + ((стало2[0] || {}).место || '') + '»')
// ⚠️ Ждём условие, а не «полторы секунды»: на боевом адресе запрос идёт дольше, чем
// на localhost, и отсчёт до закрытия начинается позже. Фиксированная пауза врала.
let скрылось = false
for (let i = 0; i < 40; i++) {
  скрылось = await page.evaluate(() => !document.querySelector('#fbBox').classList.contains('on'))
  if (скрылось) break
  await page.waitForTimeout(200)
}
say(скрылось, 'после отправки окошко закрылось само')

// ── ОБЗОР МАТЕРИАЛОВ: посмотреть всё, не проходя урок ──────────────────────
await page.goto(BASE + '/lab', { waitUntil: 'domcontentloaded', timeout: 30000 })
say(await page.isVisible('a[href="/kniga/obzor"]'), 'с витрины есть вход в обзор материалов')
await page.goto(BASE + '/kniga/obzor', { waitUntil: 'networkidle', timeout: 45000 })
const обзор = await page.evaluate(() => ({
  разделов: document.querySelectorAll('section').length,
  показов: document.querySelectorAll('.tile').length,
  карточек: document.querySelectorAll('.card').length,
  заданий: document.querySelectorAll('.task').length,
  верных: document.querySelectorAll('.task li.ok').length,
  лениво: [...document.querySelectorAll('.tile img')].every((i) => i.getAttribute('loading') === 'lazy'),
  навигация: document.querySelectorAll('nav a').length }))
say(обзор.разделов === 6, 'в обзоре все шесть разделов параграфа (' + обзор.разделов + ')')
say(обзор.показов > 90, 'показаны все показы урока (' + обзор.показов + ')')
say(обзор.карточек > 20, 'и все карточки «запомни» (' + обзор.карточек + ')')
say(обзор.заданий > 50, 'и все задания тренажёра вместе с запасными (' + обзор.заданий + ')')
say(обзор.верных >= обзор.заданий - 12, 'у заданий видно, какой ответ верный (' + обзор.верных + ')')
say(обзор.навигация === 6, 'по страницам можно прыгать (' + обзор.навигация + ' ссылок)')
// ⚠️ Картинок здесь под сотню: без ленивой загрузки обзор тянул бы десятки мегабайт разом
say(обзор.лениво, 'картинки обзора грузятся лениво, а не все разом')
await page.screenshot({ path: OUT + '/42-obzor.png' })

// ── ЭКРАН ЗАГРУЗКИ УРОКА ───────────────────────────────────────────────────
//  Данных много, и первые секунды урок выглядел полупустым — «вроде сломалось».
// ⚠️ Ту же вкладку, а не новую: страница заведена через browser.newPage(), и просить
// у её контекста ещё одну playwright не даёт.
// ⚠️ Не 'commit': на нём HTML ещё не разобран, и заставки в DOM закономерно нет —
// проверка падала на исправном уроке. Ждём разбор документа.
await page.goto(BASE + '/kniga', { waitUntil: 'domcontentloaded', timeout: 60000 })
const заставка = await page.evaluate(() => !!document.querySelector('#boot')).catch(() => false)
say(заставка, 'при открытии урока показан экран загрузки')
await page.waitForFunction(() => !document.querySelector('#boot'), null, { timeout: 60000 })
say(true, 'и он уходит сам, когда урок готов')
say(await page.isVisible('#fbBtn'), 'урок открылся: кнопка замечания на месте')
await page.click('#fbBtn')
await page.waitForTimeout(300)
say(await page.isVisible('#fbCrop'), 'в замечании есть «выделить» — обвести место прямо на экране')
const губы = await page.evaluate(() => +document.querySelector('#sLips').value)
say(губы <= 1, 'сила губ по умолчанию не задрана (' + губы + ')')


console.log('\n✅ ' + ok.join('\n✅ '))
if (bad.length) console.log('\n❌ ' + bad.join('\n❌ '))
if (errs.length) console.log('\n⚠ ошибки страницы:\n  ' + [...new Set(errs)].slice(0, 4).join('\n  '))
console.log('\nитог: ' + ok.length + ' ок, ' + bad.length + ' мимо · снимки → ' + OUT)
await browser.close()
process.exit(bad.length ? 1 : 0)
