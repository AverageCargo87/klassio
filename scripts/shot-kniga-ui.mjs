#!/usr/bin/env node
// Глаза на раскладку урока v2.11 (ТЕКСТ + КАРТА + ЗЕБРА). Не приёмка, а снимки: гоняем
// такты параграфа сами (без живого прогона, чтобы не ждать проверок страницы) и щёлкаем
// экран там, где видно суть — как лист едет за голосом и как собирается доска.
//   node scripts/shot-kniga-ui.mjs [папка] [ширина] [высота]
import { chromium } from 'playwright'
import fs from 'node:fs'

const OUT = process.argv[2] || '.tmp/shots-ui'
const W = +(process.argv[3] || 1280), H = +(process.argv[4] || 720)
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe'
fs.rmSync(OUT, { recursive: true, force: true })
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
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader',
         '--autoplay-policy=no-user-gesture-required'] })
const page = await browser.newPage({ viewport: { width: W, height: H } })
const errs = []
page.on('pageerror', (e) => errs.push('pageerror: ' + e))
page.on('console', (m) => { if (m.type() === 'error' && !/favicon|getUserMedia|429/i.test(m.text())) errs.push(m.text().slice(0, 160)) })
await page.route('**/api/tts', (r) => r.fulfill({ status: 200, contentType: 'audio/wav', body: silentWav(0.6) }))

await page.goto('http://localhost:8781/kniga?teacher=av-avaturn', { waitUntil: 'domcontentloaded', timeout: 60000 })
await page.waitForFunction(() => window.__kniga, null, { timeout: 60000 })
await page.waitForTimeout(1600)
await page.mouse.click(W / 2, H - 40)

const снять = async (имя) => {
  const s = await page.evaluate(() => ({ лист: window.__kniga.лист(), стр: window.__kniga.sheet(), доска: window.__kniga.panel() }))
  await page.screenshot({ path: `${OUT}/${имя}.png` })
  console.log(`${имя}: стр ${s.стр.страница} (след ${s.лист.следующая}) · лист на ${s.лист.доляСтраницы} страницы`
    + ` · «${s.доска.раздел}» ${s.доска.тизеры.length} фактов`)
}
// такты параграфа прокручиваем сами: живой прогон встаёт на проверке страницы и ждёт
// ребёнка, а нам нужны кадры чтения
const такты = await page.evaluate(() => window.__kniga.fullScript().map((b) => ({ n: b.n, page: b.page })))
const прокрутить = async (страница, сколько) => {
  const список = такты.filter((b) => b.page === страница).slice(0, сколько)
  for (const b of список) {
    await page.evaluate((n) => window.__kniga.showBeatAt(n, true), b.n)
    await page.waitForTimeout(320)
  }
  await page.waitForTimeout(900)
}

await снять('1-старт')
await прокрутить(120, 4)
await снять('2-стр120-читаем')
await прокрутить(120, 20)
await снять('3-стр120-конец')
await прокрутить(121, 8)
await снять('4-стр121')
await прокрутить(122, 10)
await снять('5-раздел2-крит')
await прокрутить(124, 10)
await снять('6-раздел3-микены')
// возврат к собранной доске первого раздела — вкладки в шапке
await page.evaluate(() => document.querySelectorAll('#zTabs .ztab')[0].click())
await page.waitForTimeout(900)
await снять('7-возврат-к-разделу-1')
console.log(errs.length ? ('ОШИБКИ:\n' + [...new Set(errs)].slice(0, 6).join('\n')) : 'ошибок в консоли нет')
await browser.close()
