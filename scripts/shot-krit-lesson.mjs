#!/usr/bin/env node
// Проходит все 16 шагов урока §20 и снимает каждый: слайд доски, тетрадь, общий вид.
// Заодно печатает, где тетрадь есть, где нет, и какое задание в шаге.
//   node scripts/shot-krit-lesson.mjs [папка] [krit2|krit3]
import { chromium } from 'playwright'
import fs from 'node:fs'
import path from 'node:path'
const OUT = process.argv[2] || '.tmp/shots-lesson'
// Git Bash превращает аргумент вида /krit2 в путь C:/Program Files/... — берём без слеша
const ROUTE = '/' + String(process.argv[3] || 'krit2').replace(/^.*[\/]/, '')
fs.mkdirSync(OUT, { recursive: true })
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe'
const browser = await chromium.launch({ executablePath: fs.existsSync(CHROME) ? CHROME : undefined,
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] })
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } })
const errs = []
page.on('pageerror', e => errs.push(String(e)))
page.on('console', m => { if (m.type() === 'error' && !/favicon/.test(m.text())) errs.push('console: ' + m.text()) })
await page.goto('http://localhost:8781' + ROUTE, { waitUntil: 'networkidle', timeout: 60000 })
await page.waitForFunction(() => window.__krit && window.__lesson, null, { timeout: 30000 })

const rows = []
for (let i = 0; i < 16; i++) {
  await page.evaluate(n => window.__lesson.goStep(n), i)
  await page.waitForTimeout(i === 0 ? 3500 : 900)
  await page.evaluate(() => window.__krit.settle())
  const info = await page.evaluate(() => window.__lesson.info())
  rows.push(info)
  // слайд доски и страница тетради — прямо из канвасов, в натуральном разрешении
  const b64 = await page.evaluate(() => window.__lesson.shot())
  fs.writeFileSync(path.join(OUT, `slide-${String(info.n).padStart(2, '0')}-board.png`), Buffer.from(b64.board.split(',')[1], 'base64'))
  if (b64.page) fs.writeFileSync(path.join(OUT, `slide-${String(info.n).padStart(2, '0')}-notebook.png`), Buffer.from(b64.page.split(',')[1], 'base64'))
  await page.evaluate(() => window.__krit.hud(false)); await page.waitForTimeout(150)
  await page.screenshot({ path: path.join(OUT, `step-${String(info.n).padStart(2, '0')}.png`) })
  await page.evaluate(() => window.__krit.hud(true))
}
console.log('\n шаг  мин     сцена  тетрадь  задание      слайд')
for (const r of rows)
  console.log(` ${String(r.n).padStart(3)}  ${r.min.padEnd(6)} ${String(r.scene).padStart(4)}   ${(r.nb || '—').padEnd(9)}${(r.task || '—').padEnd(12)} ${r.board}`)
const nb = rows.filter(r => r.nb).map(r => r.n)
console.log(`\nтетрадь на столе в шагах: ${nb.join(', ')} (${nb.length} из 16)`)
console.log(`заданий с кликом: ${rows.filter(r => r.task).length}`)
if (errs.length) { console.log('\n⚠ ОШИБКИ:'); [...new Set(errs)].slice(0, 10).forEach(e => console.log('   ' + e.slice(0, 200))) }
else console.log('\n✅ ошибок нет')
console.log(`\nкадры: ${path.resolve(OUT)}`)
await browser.close()
