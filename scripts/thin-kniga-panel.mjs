#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════════════════
//  ПРОРЕЖИВАНИЕ ПОКАЗОВ: чтобы картинки не возвращались
//
//  🔴 «Не очень понравилось, что есть картинки, которые повторяются (лодки,
//  например, были два раза)» — 05.08.
//
//  Иллюстраций на весь параграф 28, показов 120, поэтому какие-то картинки неизбежно
//  используются не по разу. Но глаз замечает не «использована дважды», а ВОЗВРАТ:
//  А → Б → А. Особенно на 121-й, где почти каждая фраза про природу и картинки
//  чередовались (горы → карта → горы → карта → корабли → берег с лодкой).
//
//  Правило: показ выбрасывается, если его картинка встречалась среди двух предыдущих
//  РАЗНЫХ картинок. Выброшенный показ не оставляет дыры — на экране просто держится
//  предыдущая картинка, а это и есть правда: разговор продолжается про то же самое.
//  (Смена подписи у той же картинки повтором не считается вовсе — урок с 05.08 меняет
//  подпись, не пересобирая показ.)
//
//  Запуск: node scripts/thin-kniga-panel.mjs [--dry]
// ═══════════════════════════════════════════════════════════════════════════
import fs from 'node:fs'

const ROOT = '.tmp/sketches/tutor'
const F = ROOT + '/book/panel.json'
const DRY = process.argv.includes('--dry')
const SCRIPT = JSON.parse(fs.readFileSync('.tmp/kniga-script.json', 'utf8'))
const PANEL = JSON.parse(fs.readFileSync(F, 'utf8'))

// показы в порядке урока: такт за тактом, внутри такта — по месту фразы
const order = []
for (const b of SCRIPT) {
  const list = []
  for (const pg of PANEL) for (const d of pg.demos) {
    const m = new RegExp(d.re, 'i').exec(b.say || '')
    if (m) list.push({ at: m.index, d, b, pg })
  }
  list.sort((x, y) => x.at - y.at)
  order.push(...list)
}

// 🔑 Ребёнок узнаёт не файл, а СЮЖЕТ. «Лодки два раза» — это три разных файла:
// корабли Миноса, Греция у моря и картинка учебника «Природа Греции» (там тоже
// лодка у берега). Поэтому возвраты считаем по семьям, а не по именам файлов.
const FAMILY = {
  ellada: 'море', fleet: 'море', 'book:p121-1': 'море',
  mountains: 'пейзаж', dryland: 'пейзаж',
  burn: 'гибель', volcano: 'гибель',
  achaeans: 'войско', dorians: 'войско',
  tablets: 'письмо', count: 'письмо', disc: 'письмо',
}
const fam = (art) => FAMILY[art] || art

const kill = new Set(), dropped = []
let recent = []                                  // две последние РАЗНЫЕ картинки
for (const item of order) {
  const art = fam(item.d.art)
  if (recent.includes(art) && recent[recent.length - 1] !== art) {
    kill.add(item.d); dropped.push('#' + item.b.n + ' ' + item.d.art + ' «' + item.d.cap + '»')
    continue
  }
  if (recent[recent.length - 1] !== art) recent.push(art)
  if (recent.length > 2) recent.shift()
}

// ⚠️ Такт не должен остаться совсем без показа, если он длинный: тогда на нём
// провисит картинка предыдущего такта, а это ровно та беда, которую чинили в v2.0.
const byBeat = new Map()
for (const item of order) {
  if (!byBeat.has(item.b.n)) byBeat.set(item.b.n, [])
  byBeat.get(item.b.n).push(item)
}
// Прореживание не должно откатить то, ради чего затевалась v2.0: длинная реплика
// обязана менять картинку хотя бы раз и начинаться со своей, а не с предыдущей.
// Поэтому у тактов от 240 знаков возвращаем выброшенное, пока не станет двух живых
// показов и первый из них — в первой половине реплики.
let saved = 0
for (const [, items] of byBeat) {
  const b = items[0].b
  if (b.say.length < 240) continue
  const live = () => items.filter((i) => !kill.has(i.d))
  if (live().length && live()[0].at / b.say.length > 0.5) { kill.delete(items[0].d); saved++ }
  for (const it of items) {
    if (live().length >= 2) break
    if (kill.has(it.d)) { kill.delete(it.d); saved++ }
  }
  if (!live().length) { kill.delete(items[0].d); saved++ }
}

let n = 0
for (const pg of PANEL) {
  const before = pg.demos.length
  pg.demos = pg.demos.filter((d) => !kill.has(d))
  n += before - pg.demos.length
}
console.log('выброшено возвратов: ' + n + (saved ? ' · возвращено, чтобы длинный такт не осиротел: ' + saved : ''))
console.log('  ' + dropped.join('\n  '))
console.log('\nосталось показов: ' + PANEL.reduce((a, p) => a + p.demos.length, 0))
for (const p of PANEL) console.log('  стр. ' + p.page + ': ' + p.demos.length)
if (DRY) { console.log('\n(--dry: файл не тронут)'); process.exit(0) }
fs.writeFileSync(F, JSON.stringify(PANEL, null, 1))
console.log('\n→ ' + F)
