#!/usr/bin/env node
// ПРИЁМКА ЗАПИСАННОГО УЧИТЕЛЯ: проверяет НЕ «файлы лежат на диске», а «урок их играет».
//
// Зачем отдельно: 05.08 ролики были собраны, лежали в папке и числились в index.json —
// а урок получал на каждый 404, потому что роут сервера разрешал только СТАРЫЕ имена
// beat-NN.mp4. Проверка «ls показывает файлы» этого не ловит в принципе.
//
//   node scripts/check-kniga-clips.mjs      (сервер :8781 должен быть поднят)

import fs from 'node:fs'
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe'
const b = await chromium.launch({ executablePath: fs.existsSync(CHROME) ? CHROME : undefined,
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required'] })
const p = await b.newPage()
const bad = []
p.on('response', (r) => { if (r.url().includes('/clips/') && r.status() >= 400) bad.push(r.status() + ' ' + r.url()) })
await p.goto('http://localhost:8781/kniga', { waitUntil: 'domcontentloaded', timeout: 60000 })
await p.waitForFunction(() => window.__kniga && window.__kniga.beats() > 0, null, { timeout: 60000 })
const opts = await p.$$eval('#tchWho option', (o) => o.map((x) => x.value))
console.log('источники учителя:', JSON.stringify(opts))
const vid = opts.find((v) => /video|clip|record|zapis/i.test(v)) || opts[1]
await p.evaluate((v) => {            // выпадашка спрятана в панели настроек — ставим значение напрямую
  const el = document.querySelector('#tchWho')
  el.value = v; el.dispatchEvent(new Event('change', { bubbles: true }))
}, vid)
await p.waitForTimeout(1500)
console.log('источник видео по мнению страницы:', JSON.stringify(await p.evaluate(() => window.__kniga.video?.())))
await p.click('#btnRun')                       // «▶ начать урок» — только он подставляет ролик
await p.waitForTimeout(9000)
const st = await p.evaluate(() => {
  const v = document.querySelector('video')
  return v ? { есть: true, src: (v.currentSrc || '').split('/').pop(), время: +v.currentTime.toFixed(2),
               играет: !v.paused && !v.ended, готовность: v.readyState } : { есть: false }
})
console.log('видео-элемент:', JSON.stringify(st, null, 1))
console.log('ошибки загрузки роликов:', bad.length ? bad : 'нет')
await b.close()
