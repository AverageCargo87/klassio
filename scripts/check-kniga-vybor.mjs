#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════════════════
//  ПРИЁМКА ВЫБОРА УЧИТЕЛЯ И ГОЛОСА (кнопка на окне Ани, 20.08)
//
//  Что здесь проверяется и почему именно это:
//   · кнопка стоит ВНУТРИ рамки окна учителя — просьба была «рядом с аватаром»,
//     и «в шестерёнке справа» её не выполняет;
//   · на кнопке ЛИЦО, а не слово: картинка выбранного и подпись его именем;
//   · у каждой карточки картинка реально отдаётся (200), а у живых лиц ещё и петля
//     простоя — по ней и выбирают, живёт ли лицо, когда молчит;
//   · выбор ДОЕЗЖАЕТ: сменили карточку — сменился режим урока и лицо, а не только рамка.
//     Ровно этого не было у списка «кто ведёт» 14.08 (обработчика не было вовсе);
//   · потолок минут Anam уходит В ЗАПРОС ТОКЕНА. Это единственная гарантия, что сессия
//     закроется, даже если вкладку убили: свой сторож в такой ситуации уже не сработает.
//
//  Anam НЕ поднимается: запрос токена перехвачен, живые минуты не тратятся.
//   node scripts/check-kniga-vybor.mjs
// ═══════════════════════════════════════════════════════════════════════════
import { chromium } from 'playwright'
import fs from 'node:fs'
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe'
const URL = process.env.KNIGA_URL || 'http://localhost:8781'
const ПРЕДЕЛ = 45                       // потолок сессии для этого прогона (?anamsec=)

const b = await chromium.launch({
  executablePath: fs.existsSync(CHROME) ? CHROME : undefined,
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required'],
})
const page = await b.newPage({ viewport: { width: 1600, height: 900 } })
const errs = []
page.on('pageerror', (e) => errs.push(String(e).slice(0, 140)))
page.on('console', (m) => { if (m.type() === 'error' && !/favicon|getUserMedia|esm\.sh/i.test(m.text())) errs.push(m.text().slice(0, 140)) })

// Токен Anam перехватываем: минуты платные, а проверить надо не сессию, а ПОТОЛОК в теле.
let токенТело = null
await page.route('**/api/anam-token', async (r) => {
  try { токенТело = JSON.parse(r.request().postData() || '{}') } catch { токенТело = {} }
  return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ error: 'приёмка: сессию не поднимаем' }) })
})

const ok = [], bad = []
const say = (г, т) => (г ? ok : bad).push(т)

await page.goto(`${URL}/kniga?anamsec=${ПРЕДЕЛ}`, { waitUntil: 'domcontentloaded', timeout: 60000 })
await page.waitForFunction(() => window.__kniga && window.__kniga.beats() > 0, null, { timeout: 60000 })
await page.mouse.click(800, 860)          // снять заставку загрузки
// ⚠️ Кнопку заполняет applyTeacher, а она идёт ПОСЛЕ разбора сценария: такты уже есть,
// а учитель ещё не выбран. Ждём именно кнопку, иначе проверка ловит полсекунды «сменить»
// и ругается на то, чего в живом уроке никто не увидит.
await page.waitForFunction(() => (window.__kniga.vybor().накнопке || '').length > 0, null, { timeout: 30000 })

// ── 1. кнопка стоит на самом окне учителя ─────────────────────────────────
const рамки = await page.evaluate(() => {
  const r = (s) => { const e = document.querySelector(s); if (!e) return null; const b = e.getBoundingClientRect(); return { x: b.x, y: b.y, w: b.width, h: b.height, r: b.right, b: b.bottom } }
  return { кнопка: r('#faceBtn'), окно: r('#tchWrap'), шестерёнка: r('#hudBtn') }
})
say(!!рамки.кнопка, 'кнопка выбора есть на странице')
if (рамки.кнопка && рамки.окно) {
  const внутри = рамки.кнопка.x >= рамки.окно.x - 2 && рамки.кнопка.r <= рамки.окно.r + 2
    && рамки.кнопка.y >= рамки.окно.y - 2 && рамки.кнопка.b <= рамки.окно.b + 2
  say(внутри, 'кнопка внутри рамки окна учителя, а не в стороне')
  say(рамки.кнопка.w >= 70 && рамки.кнопка.h >= 30, `кнопка не микроскопическая: ${Math.round(рамки.кнопка.w)}×${Math.round(рамки.кнопка.h)}`)
}

// ── 2. на кнопке лицо и имя ───────────────────────────────────────────────
let в = await page.evaluate(() => window.__kniga.vybor())
say(/^lica\/.+\.jpg$/.test(в.накнопке), 'на кнопке картинка выбранного лица: ' + (в.накнопке || 'НЕТ'))
say(/▾$/.test(в.подпись) && в.подпись.length > 3, 'на кнопке имя того, кто ведёт: ' + в.подпись)
say(в.режим === 'anam' && !!в.лицо, 'по умолчанию урок ведёт Anam с заданным лицом: ' + в.лицо.slice(0, 8))

// ── 3. панель открывается и закрывается ───────────────────────────────────
await page.click('#faceBtn')
await page.waitForTimeout(400)
в = await page.evaluate(() => window.__kniga.vybor())
say(в.открыта, 'панель открылась по кнопке')
say(в.карточек >= 8, 'карточек на выбор: ' + в.карточек)
await page.screenshot({ path: '.tmp/shots-kniga/8-vybor.png' })

const пан = await page.evaluate(() => { const b = document.querySelector('#facePane').getBoundingClientRect(); return { r: b.right, b: b.bottom, w: innerWidth, h: innerHeight } })
say(пан.r <= пан.w + 1 && пан.b <= пан.h + 1, `панель не вылезает за экран (справа ${Math.round(пан.w - пан.r)}px, снизу ${Math.round(пан.h - пан.b)}px)`)

// ── 4. картинки карточек реально отдаются ─────────────────────────────────
const файлы = await page.evaluate(async () => {
  const из = [...document.querySelectorAll('#faceGrid .fc')].map((d) => ({
    имя: d.querySelector('b').textContent,
    фото: (d.querySelector('img') || {}).getAttribute ? d.querySelector('img').getAttribute('src') : null,
    петля: (d.querySelector('video') || {}).getAttribute ? d.querySelector('video').getAttribute('src') : null,
  }))
  const код = async (u) => { if (!u) return null; try { const r = await fetch(u); return r.status } catch { return 0 } }
  for (const к of из) { к.фотоКод = await код(к.фото); к.петляКод = await код(к.петля) }
  return из
})
const сФото = файлы.filter((к) => к.фотоКод === 200)
say(сФото.length >= 8, `фото приехали у ${сФото.length} карточек из ${файлы.length}`)
const битые = файлы.filter((к) => к.фото && к.фотоКод !== 200).map((к) => к.имя)
say(!битые.length, битые.length ? 'битые фото: ' + битые.join(', ') : 'битых фото нет')
const сПетлёй = файлы.filter((к) => к.петляКод === 200)
say(сПетлёй.length >= 6, `петля простоя есть у ${сПетлёй.length} лиц (по ней и видно, живёт ли лицо молча)`)

// ── 5. выбор доезжает до урока ────────────────────────────────────────────
// 3D: у неё видно и сам факт загрузки модели, поэтому проверяем именно ею.
await page.evaluate(() => window.__kniga.vyborPick('3d-avaturn'))
for (let i = 0; i < 40; i++) { await page.waitForTimeout(500); if ((await page.evaluate(() => window.__kniga.teacher())).есть) break }
const уч = await page.evaluate(() => window.__kniga.teacher())
в = await page.evaluate(() => window.__kniga.vybor())
say(в.режим === 'av-avaturn', 'выбор 3D переставил режим урока: ' + в.режим)
say(уч.есть && уч.мешей > 0, `3D-учительница действительно загрузилась (мешей ${уч.мешей})`)
say(в.ключ === '3d-avaturn' && /3d-avaturn/.test(в.накнопке), 'кнопка на окне обновилась под новый выбор')

// назад на Anam, лицом Sophie — проверяем, что лицо доезжает отдельно от режима
await page.evaluate(() => window.__kniga.vyborPick('anam-sophie'))
await page.waitForTimeout(600)
в = await page.evaluate(() => window.__kniga.vybor())
say(в.режим === 'anam' && в.лицо.startsWith('6dbc1e47'), 'выбор лица Anam доехал: ' + в.лицо.slice(0, 8))

// ── 6. голос ставится из той же панели ────────────────────────────────────
const голоса = await page.evaluate(() => [...document.querySelectorAll('#faceVoices .vc')].map((v) => v.textContent))
say(голоса.length >= 6, 'голосов на выбор: ' + (голоса.length - 1) + ' + «ещё»')
const былГолос = (await page.evaluate(() => window.__kniga.vybor())).голос
await page.evaluate(() => {
  const все = [...document.querySelectorAll('#faceVoices .vc')]
  const другой = все.find((v) => !v.classList.contains('on') && !/ещё|свернуть/.test(v.textContent))
  другой.click()
})
await page.waitForTimeout(300)
const сталГолос = (await page.evaluate(() => window.__kniga.vybor())).голос
say(сталГолос && сталГолос !== былГолос, `голос переключился: ${былГолос} → ${сталГолос}`)
const сохранён = await page.evaluate(() => { try { return localStorage.kn_voice || '' } catch { return '' } })
say(сохранён === сталГолос, 'выбранный голос пережил бы перезагрузку (localStorage)')

// ── 7. потолок минут уходит в токен ───────────────────────────────────────
в = await page.evaluate(() => window.__kniga.vybor())
say(в.предел === ПРЕДЕЛ, `потолок сессии читается из адреса: ${в.предел} с`)
say(в.простой > 0 && в.ушёл > 0, `сторожа простоя и «ушёл» на месте: ${в.простой} с / ${в.ушёл} с`)
await page.evaluate(() => document.querySelector('#anamGo').click())
for (let i = 0; i < 20; i++) { await page.waitForTimeout(300); if (токенТело) break }
say(!!токенТело, 'запрос токена Anam ушёл')
say(токенТело && токенТело.maxSessionLengthSeconds === ПРЕДЕЛ,
  'потолок вшит В САМ ТОКЕН — Anam закроет сессию даже с убитой вкладкой: ' + (токенТело ? токенТело.maxSessionLengthSeconds : '—'))
say(токенТело && String(токенТело.avatarId || '').startsWith('6dbc1e47'), 'в токен ушло выбранное лицо, а не сток')

// заставка обязана объяснить отказ, а не оставить пустое окно
await page.waitForTimeout(800)
const зст = await page.evaluate(() => ({ т: document.querySelector('#anamOvT').textContent, в: document.querySelector('#anamOv').style.display }))
say(зст.в === 'flex' && /НЕ ПОДКЛЮЧИЛОСЬ|НУЖЕН КЛЮЧ/.test(зст.т), 'отказ подключения написан на окне: ' + зст.т)

// ── 8. панель закрывается ─────────────────────────────────────────────────
await page.evaluate(() => window.__kniga.vyborOpen(true))
await page.keyboard.press('Escape')
await page.waitForTimeout(250)
say(!(await page.evaluate(() => window.__kniga.vybor())).открыта, 'панель закрывается по Escape')
await page.evaluate(() => window.__kniga.vyborOpen(true))
await page.mouse.click(1200, 700)
await page.waitForTimeout(250)
say(!(await page.evaluate(() => window.__kniga.vybor())).открыта, 'панель закрывается щелчком мимо неё')

console.log('\n✅ ' + ok.join('\n✅ '))
if (bad.length) console.log('\n❌ ' + bad.join('\n❌ '))
if (errs.length) console.log('\n⚠ ошибки страницы:\n  ' + [...new Set(errs)].slice(0, 6).join('\n  '))
console.log(`\nитог: ${ok.length} ок, ${bad.length} мимо, ошибок ${errs.length} · снимки → .tmp/shots-kniga`)
await b.close()
process.exit(bad.length || errs.length ? 1 : 0)
