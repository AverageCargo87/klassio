#!/usr/bin/env node
// Приёмка на САМОЕ ДОРОГОЕ замечание второго разбора (13.08):
//   «Урок физически не проходится до конца: в какой-то момент он замирает и не подаёт
//    признаков ошибки, при этом секундомер продолжает идти.»
// Проверяем не «работает ли синтез», а что урок ПЕРЕЖИВАЕТ его отказ: зависший запрос
// кончается сроком, ошибка становится видимой, у ребёнка есть дверь, а урок едет дальше
// по тексту — вместо того чтобы встать и обнулить двадцать пять минут работы.
//   node scripts/check-kniga-stuck.mjs
import { chromium } from 'playwright'
import fs from 'node:fs'

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe'
const browser = await chromium.launch({ executablePath: fs.existsSync(CHROME) ? CHROME : undefined,
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required'] })
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } })
const ok = [], bad = []
const say = (good, t) => (good ? ok : bad).push(t)

// синтез, который НИКОГДА не ответит: ни успеха, ни ошибки — самый злой случай.
// Именно он не ловится повтором: повтор срабатывает на отказ, а зависший запрос
// не отказывает.
let повисло = 0
await page.route('**/api/tts', () => { повисло++ /* ответа не будет вовсе */ })

await page.goto('http://localhost:8781/kniga', { waitUntil: 'domcontentloaded', timeout: 60000 })
await page.waitForFunction(() => window.__kniga && window.__kniga.beats() > 10, null, { timeout: 60000 })

// Красный статус живёт один такт — ловим его наблюдателем, а не опросом.
await page.evaluate(() => {
  window.__сбои = []
  const st = document.querySelector('#runSt')
  new MutationObserver(() => { if (st.classList.contains('err') && st.textContent) window.__сбои.push(st.textContent) })
    .observe(st, { childList: true, characterData: true, subtree: true, attributes: true })
})

const t0 = Date.now()
await page.evaluate(() => { document.querySelector('#sHold').value = '0'; window.__kniga.run() })

// ── 1. СТОРОЖ. Первый такт сейчас висит на синтезе — самое время проверить дверь.
await page.waitForTimeout(1500)
await page.evaluate(() => window.__kniga.заклинить())
const плашка = await page.waitForSelector('#stuck.on', { timeout: 15000 }).catch(() => null)
say(!!плашка, 'сторож показывает плашку «урок застрял»' + (плашка ? '' : ' — не дождались'))
if (плашка) {
  const текст = await page.evaluate(() => document.querySelector('#stuckWhat').textContent)
  say(/Шаг \d+ из \d+/.test(текст), 'в плашке сказано, на каком шаге встали: «' + текст + '»')
  const двери = await page.evaluate(() => [...document.querySelectorAll('#stuck [data-stuck]')].map((b) => b.dataset.stuck))
  say(двери.includes('skip') && двери.includes('stop'), 'у ребёнка есть выход: ' + двери.join(' '))
  await page.click('#stuck [data-stuck=skip]')
  // ⚠️ Ждать селектором нельзя: снятый класс прячет плашку (display:none), а
  //  waitForSelector по умолчанию ждёт ВИДИМЫЙ элемент и не дождётся никогда.
  const ушла = await page.waitForFunction(() => !window.__kniga.застрял(), null, { timeout: 5000 })
    .then(() => true).catch(() => false)
  say(ушла, 'кнопка «пропустить шаг» снимает плашку и отпускает ожидание')
}

// ── 2. СРОК. Зависший синтез обязан кончиться сам, и это обязано стать видно.
const сбои = await page.waitForFunction(() => window.__сбои.length ? window.__сбои : null,
  null, { timeout: 60000 }).then((h) => h.jsonValue()).catch(() => null)
say(!!сбои, 'зависший синтез кончается сроком, а не молчанием: «' + (сбои ? сбои[0] : 'урок так и молчит') + '»')
say(повисло > 0, 'запросов синтеза повисло: ' + повисло)
say(Date.now() - t0 < 60000, 'сбой показан за ' + Math.round((Date.now() - t0) / 1000) + ' с')

// ── 3. УРОК ЕДЕТ ДАЛЬШЕ. Голос — не единственный канал: текст перед глазами.
const поехал = await page.waitForFunction(() => window.__kniga.state().такт > 2, null, { timeout: 60000 })
  .then(() => true).catch(() => false)
say(поехал, 'без голоса урок едет дальше по тексту, а не останавливается')
const озвучка = await page.evaluate(() => document.querySelector('#cVoice').checked)
say(озвучка === false, 'после второго отказа озвучка выключена, чтобы не собирать сроки на каждом такте')
// и сбой назван своим именем, а не общим «застрял»: срок сработал именно на синтезе
const всеСбои = await page.evaluate(() => window.__сбои)
const проГолос = всеСбои.filter((t) => /синтез|не ответил|голос/i.test(t))
say(проГолос.length > 0, 'сбой назван своим именем: «' + (проГолос[0] || всеСбои.join(' | ')) + '»')

console.log('\n✅ ' + ok.join('\n✅ '))
if (bad.length) console.log('\n❌ ' + bad.join('\n❌ '))
console.log(`\nитог: ${ok.length} ок, ${bad.length} мимо`)
await browser.close()
process.exit(bad.length ? 1 : 0)
