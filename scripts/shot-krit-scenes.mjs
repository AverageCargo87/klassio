#!/usr/bin/env node
// Снимает сцены урока §20 в headless Chromium и печатает статистику.
// Панель браузера в Claude Code открыта не всегда, а видеть результат обязательно —
// поэтому проверка идёт через playwright, а не через глазами-в-окне.
//
//   node scripts/shot-krit-scenes.mjs [папка_вывода] [--views]
//
// --views: каждую сцену снять в трёх поворотах (−42°, 0°, +42°), а не только по центру.

import { chromium } from 'playwright'
import fs from 'node:fs'
import path from 'node:path'

const OUT = process.argv[2] || '.tmp/shots'
const ALL_VIEWS = process.argv.includes('--views')
fs.mkdirSync(OUT, { recursive: true })

const SCENES = [
  [1, 'sloped', 'Каменистый склон'],
  [2, 'knossos', 'Кносский дворец'],
  [3, 'mycenae', 'Микены'],
  [4, 'dig', 'Раскоп'],
]
// (yaw, pitch) — центр, левое окно, правое окно
const VIEWS = ALL_VIEWS
  ? [['c', 0, -6], ['l', -42, -4], ['r', 42, -4]]
  : [['c', 0, -6]]

// Свои браузеры playwright не скачаны (npx playwright install не запускали),
// поэтому берём системный Chrome. Для WebGL в headless обязателен ANGLE-бэкенд.
const CHROME = process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe'
const browser = await chromium.launch({
  executablePath: fs.existsSync(CHROME) ? CHROME : undefined,
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
})
const page = await browser.newPage({ viewport: { width: 1600, height: 900 }, deviceScaleFactor: 1 })
const pageErrors = []
page.on('pageerror', e => pageErrors.push(String(e)))
page.on('console', m => { if (m.type() === 'error') pageErrors.push('console: ' + m.text()) })
page.on('response', r => { if (r.status() >= 400) pageErrors.push(`${r.status()} ${r.url()}`) })

await page.goto('http://localhost:8781/krit2', { waitUntil: 'networkidle', timeout: 60000 })
await page.waitForFunction(() => window.__krit, null, { timeout: 30000 })

const report = []
for (const [n, slug, title] of SCENES) {
  await page.evaluate(n => window.__krit.buildScene(n), n)
  await page.waitForTimeout(3500)               // модели тянутся асинхронно
  await page.evaluate(() => window.__krit.settle())
  await page.waitForTimeout(400)

  const stats = await page.evaluate(() => window.__krit.stats())
  report.push({ n, title, ...stats })

  for (const [vs, yaw, pitch] of VIEWS) {
    await page.evaluate(([y, p]) => window.__krit.look(y, p), [yaw, pitch])
    await page.waitForTimeout(320)
    // с HUD — для приёмки, без HUD — чистый кадр
    await page.screenshot({ path: path.join(OUT, `krit-${n}-${slug}-${vs}-hud.png`) })
    await page.evaluate(() => window.__krit.hud(false))
    await page.waitForTimeout(120)
    await page.screenshot({ path: path.join(OUT, `krit-${n}-${slug}-${vs}.png`) })
    await page.evaluate(() => window.__krit.hud(true))
  }
  // вид сверху — проверка пересечений и заполнения кольца
  await page.evaluate(() => { document.querySelector('#cTop').checked = true; document.querySelector('#cTop').onchange({ target: { checked: true } }) })
  await page.waitForTimeout(320)
  await page.evaluate(() => window.__krit.hud(false))
  await page.screenshot({ path: path.join(OUT, `krit-${n}-${slug}-top.png`) })
  await page.evaluate(() => { window.__krit.hud(true); document.querySelector('#cTop').checked = false; document.querySelector('#cTop').onchange({ target: { checked: false } }) })
}

console.log('\n сцена                 объектов  мешей   треуг.  текстур  панорама')
for (const r of report) {
  console.log(` ${String(r.n)}. ${r.title.padEnd(20)} ${String(r.objects).padStart(6)} ${String(r.meshes).padStart(7)} ${String(r.tris).padStart(8)} ${String(r.textures).padStart(7)}   ${r.pano}`)
  if (r.errors.length) console.log(`    ⚠ ошибки сцены: ${r.errors.join(' · ')}`)
}

// ЗАКОН ПУСТОГО КОРИДОРА: между партой и доской только пол. Пустой список обязателен.
console.log('\n── коридор между партой и доской ──')
let dirty = 0
for (const r of report) {
  if (!r.corridor || !r.corridor.length) { console.log(` ${r.n}. ${r.title.padEnd(20)} ✅ чисто`); continue }
  dirty += r.corridor.length
  console.log(` ${r.n}. ${r.title.padEnd(20)} ❌ ЗАНЯТ, ${r.corridor.length}:`)
  for (const v of r.corridor) console.log(`      ${v.name} — x ${v.x}, z ${v.z}, верх ${v.y} м`)
}

console.log('\n── пересечения габаритов (>12% меньшего) ──')
let cross = 0
for (const r of report) {
  if (!r.overlaps || !r.overlaps.length) { console.log(` ${r.n}. ${r.title.padEnd(20)} ✅ нет`); continue }
  cross += r.overlaps.length
  console.log(` ${r.n}. ${r.title.padEnd(20)} ⚠ ${r.overlaps.length}:`)
  for (const o of r.overlaps.slice(0, 6)) console.log(`      ${o.a} ↔ ${o.b} — ${o.pct}%`)
}
if (!dirty && !cross) console.log('\n✅ приёмка по расстановке пройдена')
if (pageErrors.length) {
  console.log('\n⚠ ОШИБКИ СТРАНИЦЫ:')
  ;[...new Set(pageErrors)].slice(0, 20).forEach(e => console.log('   ' + e))
} else console.log('\n✅ ошибок страницы нет')
console.log(`\nкадры: ${path.resolve(OUT)}`)

await browser.close()
