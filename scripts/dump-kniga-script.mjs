// Выгрузка сценария урока (такты в том виде, в каком их собирает сама страница из
// текстового слоя учебника) — чтобы привязку показов и тизеров писать по факту.
import { chromium } from 'playwright'
import fs from 'node:fs'
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe'
const b = await chromium.launch({ executablePath: fs.existsSync(CHROME) ? CHROME : undefined,
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] })
const p = await b.newPage({ viewport: { width: 1440, height: 900 } })
await p.goto('http://localhost:8781/kniga', { waitUntil: 'networkidle' })
await p.waitForFunction(() => window.__kniga && window.__kniga.beats() > 10, null, { timeout: 20000 })
const script = await p.evaluate(() => window.__kniga.fullScript())
fs.writeFileSync('.tmp/kniga-script.json', JSON.stringify(script, null, 1))
console.log('тактов:', script.length, '→ .tmp/kniga-script.json')
for (const pg of [...new Set(script.map(s => s.page))])
  console.log('  стр.', pg, '—', script.filter(s => s.page === pg).length, 'тактов')
await b.close()
