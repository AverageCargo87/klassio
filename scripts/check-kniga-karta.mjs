#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════════════════
//  ПРИЁМКА КАРТЫ: то ли место горит и видно ли его название
//
//  Карта — самый частый показ урока: 37 привязок из 113. И ошибиться в ней проще
//  всего, потому что ошибка МОЛЧАЛИВАЯ: горит соседняя область, подпись уехала за
//  край окна — картинка при этом есть, урок идёт, приёмка довольна.
//  Ровно такой дефект и нашёлся 21.08: на словах «переселение с СЕВЕРА БАЛКАНСКОГО
//  ПОЛУОСТРОВА» подсвечивалась Северная Греция, то есть ребёнку показывали, что
//  дорийцы пришли ИЗНУТРИ Греции.
//
//  Что проверяем на каждой из 37 привязок:
//   1. место с таким идентификатором на карте вообще есть;
//   2. после показа горит ИМЕННО ОНО и ровно одно;
//   3. его подпись видна В ОКНЕ ЦЕЛИКОМ — иначе горит точка без названия;
//   4. остальные места приглушены (иначе «ничего не подсвечено» — разбор 13.08).
//
//  node scripts/check-kniga-karta.mjs
// ═══════════════════════════════════════════════════════════════════════════
import { chromium } from 'playwright'
import fs from 'node:fs'

const URL = process.env.KNIGA_URL || 'http://localhost:8781'
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe'
const OUT = '.tmp/shots-karta'
fs.mkdirSync(OUT, { recursive: true })

const ПАНЕЛЬ = JSON.parse(fs.readFileSync('.tmp/sketches/tutor/book/panel.json', 'utf8'))
const показы = []
for (const p of ПАНЕЛЬ) for (const d of p.demos || []) {
  if (String(d.art || '').startsWith('map')) показы.push({ page: p.page, ...d })
}

const br = await chromium.launch({
  executablePath: fs.existsSync(CHROME) ? CHROME : undefined,
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required'],
})
const pg = await br.newPage({ viewport: { width: 1600, height: 900 } })
const errs = []
pg.on('pageerror', (e) => errs.push(String(e).slice(0, 140)))
await pg.goto(URL + '/kniga?teacher=off', { waitUntil: 'domcontentloaded', timeout: 90000 })
await pg.waitForFunction(() => window.__kniga && window.__kniga.beats() > 10, null, { timeout: 90000 })
await pg.mouse.click(800, 860)

const ok = [], bad = []
const say = (г, т) => (г ? ok : bad).push(т)

// какие места вообще есть на обеих картах
const естьМесто = async (art) => pg.evaluate(async (a) => {
  const файл = a.startsWith('map-europe') ? 'map-europe.svg' : 'map-greece.svg'
  const t = await fetch('/book/' + файл).then((r) => r.text())
  const id = a.includes(':') ? a.split(':')[1] : ''
  if (!id) return true
  return t.includes('id="' + (id.startsWith('zone-') ? id : 'mk-' + id) + '"')
}, art)

console.log('привязок карты в уроке: ' + показы.length + '\n')
let прошлаяСтр = 0
for (const d of показы) {
  const id = d.art.includes(':') ? d.art.split(':')[1] : ''
  const имя = 'стр' + d.page + ' n' + d.n + ' «' + d.cap + '»'
  if (!(await естьМесто(d.art))) { say(false, имя + ': такого места на карте НЕТ — ' + d.art); continue }
  // Кадр страницы ставится один раз на страницу — повторяем это поведение урока.
  if (d.page !== прошлаяСтр) { прошлаяСтр = d.page; await pg.evaluate((p) => window.__kniga.картаКадр(p), d.page) }
  await pg.evaluate(([a, p]) => window.__kniga.mapDemo(a, p), [d.art, d.page])
  await pg.waitForTimeout(1400)                       // наезд карты идёт 1.1 с
  const m = await pg.evaluate(() => window.__kniga.map())
  const L = await pg.evaluate(() => window.__kniga.mapLabel())

  if (!id) {                                          // «вся карта» — гореть не должно ничего
    say(!m.метка && !m.зона, имя + ': общий план карты, ничего не подсвечено'
      + (m.метка || m.зона ? ' — а горит ' + (m.метка || m.зона) : ''))
    continue
  }
  const ждём = id.startsWith('zone-') ? id : 'mk-' + id
  const горит = m.метка || m.зона
  say(горит === ждём, имя + ': горит ' + (горит || 'НИЧЕГО') + (горит === ждём ? '' : ' — а должно ' + ждём))
  if (!id.startsWith('zone-')) {
    say(m.приглушено > 0, имя + ': остальные места приглушены (' + m.приглушено + ')')
    say(L && L.внутри, имя + ': подпись «' + ((L && L.подпись) || '?') + '» видна целиком'
      + (L && !L.внутри ? ' — вылезает ' + JSON.stringify(L.вылезло) : ''))
  }
}

// снимок самого важного места — того, что чинили
await pg.evaluate(() => window.__kniga.mapDemo('map-europe:nbalkans', 125))
await pg.waitForTimeout(1500)
await pg.screenshot({ path: OUT + '/dorijcy-s-severa.png' })

console.log('✅ ' + ok.join('\n✅ '))
if (bad.length) console.log('\n❌ ' + bad.join('\n❌ '))
if (errs.length) console.log('\n⚠ ошибки страницы:\n  ' + [...new Set(errs)].slice(0, 5).join('\n  '))
console.log(`\nитог: ${ok.length} ок, ${bad.length} мимо, ошибок ${errs.length} · снимки → ${OUT}`)
await br.close()
process.exit(bad.length || errs.length ? 1 : 0)
