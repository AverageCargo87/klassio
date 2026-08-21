#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════════════════
//  ПРОГОН УРОКА ЦЕЛИКОМ — как будто его проходит ребёнок
//
//  Зачем отдельно от check-*.mjs: те проверяют КУСКИ (панель, тренажёр, застревание),
//  каждый со своего места и со своими подменами. А застревает урок обычно на СТЫКАХ —
//  там, где один этап передаёт другому. Этот скрипт идёт от первого такта до итогов
//  и не проверяет ничего заранее заданного: он ведёт ДНЕВНИК — что показали, о чём
//  спросили, куда перешли — и ругается только на две вещи:
//    · урок встал (ничего не меняется дольше срока);
//    · страница ругнулась в консоль или запрос ушёл в ошибку.
//
//  Синтез по умолчанию подменён тишиной: прогон бесплатный и быстрый.
//  --golos  — настоящий Яндекс, но только на первых тактах (проверить, что голос жив).
//
//  node scripts/progon-uroka.mjs [--golos] [--minut 20]
// ═══════════════════════════════════════════════════════════════════════════
import { chromium } from 'playwright'
import fs from 'node:fs'

const argv = process.argv.slice(2)
const ГОЛОС = argv.includes('--golos')
const МИНУТ = Number((argv[argv.indexOf('--minut') + 1]) || 20)
const URL = process.env.KNIGA_URL || 'http://localhost:8781'
const OUT = '.tmp/shots-progon'
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe'
fs.mkdirSync(OUT, { recursive: true })

const wav = (sec = 0.12, rate = 16000) => {
  const n = Math.round(sec * rate), b = Buffer.alloc(44 + n * 2)
  b.write('RIFF', 0); b.writeUInt32LE(36 + n * 2, 4); b.write('WAVE', 8); b.write('fmt ', 12)
  b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(1, 22); b.writeUInt32LE(rate, 24)
  b.writeUInt32LE(rate * 2, 28); b.writeUInt16LE(2, 32); b.writeUInt16LE(16, 34); b.write('data', 36)
  b.writeUInt32LE(n * 2, 40); return b
}

const br = await chromium.launch({
  executablePath: fs.existsSync(CHROME) ? CHROME : undefined,
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader',
    '--autoplay-policy=no-user-gesture-required',
    // фальшивый микрофон: без него ветка «слушаю ответ» вообще не заводится, и стык
    // «Аня спросила → ждёт ребёнка» остаётся непроверенным
    '--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'],
})
const pg = await br.newPage({ viewport: { width: 1600, height: 900 } })

const ошибки = [], битые = []
pg.on('pageerror', (e) => ошибки.push('pageerror: ' + String(e).slice(0, 160)))
pg.on('console', (m) => { if (m.type() === 'error' && !/favicon|getUserMedia|esm\.sh|anam/i.test(m.text())) ошибки.push(m.text().slice(0, 160)) })
pg.on('requestfailed', (q) => { if (!/anam|esm\.sh/.test(q.url())) битые.push(q.url().replace(URL, '') + ' — ' + (q.failure() || {}).errorText) })
pg.on('response', (r) => { if (r.status() >= 400 && !/anam/.test(r.url())) битые.push(r.status() + ' ' + r.url().replace(URL, '')) })

// Синтез. Тишина — чтобы прогон шёл в реальном времени разметки, а не голоса.
let синтезов = 0, знаков = 0
await pg.route('**/api/tts', async (r) => {
  синтезов++
  try { знаков += (JSON.parse(r.request().postData() || '{}').text || '').length } catch {}
  if (ГОЛОС && синтезов <= 4) return r.continue()      // первые такты — настоящим голосом
  return r.fulfill({ status: 200, contentType: 'audio/wav', body: wav() })
})

await pg.goto(URL + '/kniga?teacher=off', { waitUntil: 'domcontentloaded', timeout: 90000 })
await pg.waitForFunction(() => window.__kniga && window.__kniga.beats() > 10, null, { timeout: 90000 })
await pg.mouse.click(800, 860)
// Паузы между тактами убираем и темп поднимаем: смотрим ЛОГИКУ, а не тайминги.
await pg.evaluate(() => {
  document.querySelector('#sHold').value = '0'
  document.querySelector('#sSpeed').value = '2.5'
  try { localStorage.removeItem('kn_progress') } catch (e) {}
})

const снимок = (имя) => pg.screenshot({ path: OUT + '/' + имя + '.png' }).catch(() => {})
const срез = () => pg.evaluate(() => {
  const k = window.__kniga
  const c = k.control(), s = k.state()
  return {
    такт: s.такт, всего: k.beats(), идёт: s.идёт, стр: s.страница,
    этап: c.идёт ? c.этап : '', заголовок: c.идёт ? c.заголовок : '', шаг: c.идёт ? c.шаг : '',
    кнопки: c.идёт ? c.кнопки : [],
    показ: k.panel().показ, файл: k.panel().файл, карточек: k.panel().тизеры.length,
    мозаика: k.mosaic().видна ? (k.mosaic().открыто + '/' + k.mosaic().плиток) : '',
    топики: k.topics().виден ? (k.topics().текущий + '/' + k.topics().всего) : '',
    итоги: !document.querySelector('#report')?.classList.contains('off'),
    статус: (document.querySelector('#runSt') || {}).textContent || '',
    микро: (document.querySelector('#micSt') || {}).textContent || '',
    субтитр: ((document.querySelector('#subs') || {}).textContent || '').slice(-110),
  }
})

// ── ДНЕВНИК ────────────────────────────────────────────────────────────────
const дневник = []
const запись = (что, чем) => { дневник.push({ что, чем }); console.log(('· ' + что).padEnd(34) + (чем || '')) }

console.log('── пошёл прогон ' + (ГОЛОС ? '(первые 4 такта настоящим голосом)' : '(синтез подменён тишиной)') + ' ──\n')
await pg.evaluate(() => window.__kniga.run())

const t0 = Date.now()
let прошлое = '', застыл = 0, тактБыл = 0, этапБыл = '', стрБыла = 0
const виделЭтапы = new Set(), виделСтр = new Set(), показы = new Set()
let встал = null, отвечено = 0, заданий = 0

for (let i = 0; i < МИНУТ * 60 * 4; i++) {
  const s = await срез()
  if (s.файл) показы.add(s.файл)

  if (s.итоги) { запись('ИТОГИ УРОКА показаны'); await снимок('9-itogi'); break }
  if (s.стр && s.стр !== стрБыла) { стрБыла = s.стр; виделСтр.add(s.стр); запись('страница ' + s.стр) }
  if (s.такт !== тактБыл) { тактБыл = s.такт }
  if (s.этап && s.этап !== этапБыл) {
    этапБыл = s.этап; виделЭтапы.add(s.этап)
    запись('этап «' + s.этап + '»', s.заголовок)
    await снимок('etap-' + виделЭтапы.size + '-' + s.этап)
  }
  if (!s.этап && этапБыл) { этапБыл = '' }

  // ── ведём урок вместо ребёнка ───────────────────────────────────────────
  await pg.evaluate(() => {
    const k = window.__kniga
    // мозаику собираем разом — она открывается по мере чтения, ждать нечего
    if (k.mosaic().видна && !k.mosaic().собрана) k.mosaicTo(1)
    // экран топиков листаем до конца
    if (k.topics().виден) k.topicNext()
  })
  if (s.этап === 'test') { if (await pg.evaluate(() => window.__kniga.answer(true))) отвечено++ }
  else if (s.этап === 'drill') {
    const d = await pg.evaluate(() => window.__kniga.drill())
    if (d.пары) { await pg.evaluate(() => window.__kniga.drillMatch(true)) }
    // 'ok' — это имя ВЕРНОГО варианта в drillPick. Ошибся именем — и прогон отвечает
    // мимо, а урок при этом честно доезжает до конца: путь «всё неверно» проверен так
    // случайно, но путь «всё верно» остаётся непроверенным. Имя брать из самого __kniga.
    else if (d.вариантов) { if (await pg.evaluate(() => window.__kniga.drillPick('ok'))) заданий++ }
    else await pg.evaluate(() => window.__kniga.press('go'))
  }
  // микрофон: подсовываем «услышанное», иначе ветка ответа ждёт вечно
  if (/слушаю|говори|скажи/i.test(s.микро)) {
    await pg.evaluate(() => { window.__kniga.hear('Крит и Микены объединяли дворцовые царства, письменность и торговля по морю.')
      window.__kniga.read('Древняя Греция делилась на три части.') })
  }
  // жмём то, что предложено: сначала «дальше», потом обходы
  if (s.кнопки.length) {
    const порядок = ['go', 'next', 'skip', 'read', 'done', 'ok', 'more']
    const жать = порядок.find((a) => s.кнопки.includes(a)) || (s.кнопки[0] || '').split(':')[0]
    if (жать) await pg.evaluate((a) => window.__kniga.press(a), жать)
  }

  // ── сторож застревания ──────────────────────────────────────────────────
  const слепок = [s.такт, s.этап, s.шаг, s.мозаика, s.топики, s.стр, s.субтитр].join('|')
  if (слепок === прошлое) застыл++; else { застыл = 0; прошлое = слепок }
  if (застыл > 4 * 90) {                       // полторы минуты без единого изменения
    встал = s
    запись('⛔ УРОК ВСТАЛ', 'такт ' + s.такт + ' · этап «' + s.этап + '» · ' + s.статус)
    await снимок('vstal')
    break
  }
  if (Date.now() - t0 > МИНУТ * 60000) { встал = { ...s, срок: true }; запись('⏱ вышло время прогона'); await снимок('srok'); break }
  await pg.waitForTimeout(250)
}

const итог = await срез()
const отчёт = await pg.evaluate(() => { try { return window.__kniga.report() } catch (e) { return null } })
const stats = await pg.evaluate(() => { try { return window.__kniga.stats() } catch (e) { return null } })

console.log('\n══════════ ЧТО ВЫШЛО ══════════')
console.log('дошли до такта   : ' + итог.такт + ' из ' + итог.всего)
console.log('страниц пройдено : ' + [...виделСтр].sort((a, b) => a - b).join(', '))
console.log('этапы проверки   : ' + [...виделЭтапы].join(' → '))
console.log('разных показов   : ' + показы.size)
console.log('вопросов теста   : ' + отвечено + ' · заданий тренажёра: ' + заданий)
console.log('синтезов         : ' + синтезов + ' на ' + знаков + ' знаков')
console.log('время прогона    : ' + ((Date.now() - t0) / 60000).toFixed(1) + ' мин')
if (stats) console.log('счётчики урока   : ' + JSON.stringify(stats))
if (отчёт) console.log('итоги            : ' + JSON.stringify(отчёт).slice(0, 400))
if (встал) console.log('\n⛔ ДОШЛИ НЕ ДО КОНЦА: ' + JSON.stringify(встал).slice(0, 400))

const уник = (a) => [...new Set(a)]
if (битые.length) console.log('\n⚠ битые запросы (' + уник(битые).length + '):\n  ' + уник(битые).slice(0, 12).join('\n  '))
else console.log('\n✅ битых запросов нет')
if (ошибки.length) console.log('\n⚠ ошибки страницы (' + уник(ошибки).length + '):\n  ' + уник(ошибки).slice(0, 12).join('\n  '))
else console.log('✅ ошибок в консоли нет')

fs.writeFileSync(OUT + '/dnevnik.json', JSON.stringify({ дневник, итог, отчёт, stats, битые: уник(битые), ошибки: уник(ошибки) }, null, 1))
console.log('\nдневник и снимки → ' + OUT)
await br.close()
process.exit(встал || ошибки.length || битые.length ? 1 : 0)
