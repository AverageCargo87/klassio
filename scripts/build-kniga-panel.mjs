#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════════════════
//  СБОРКА ПРИВЯЗОК ПОКАЗА (v2.0): фразы агентов → panel.json
//
//  Агенты возвращают привязку ТЕКСТОМ («at» — дословная подстрока реплики), а не
//  регуляркой: регулярку человек и модель одинаково легко пишут неправильно, и
//  ошибка всплывает уже на прогоне. Здесь она экранируется механически.
//
//  🔑 Матчер урока ищет привязку по ВСЕМУ параграфу и без учёта регистра. Поэтому
//  фраза, единственная внутри своего такта, может встретиться ещё в двух местах
//  (главный вопрос параграфа повторяется дословно в начале и в заданиях). Такие
//  привязки здесь удлиняются сами — по словам вправо, потом влево, — а если
//  однозначной не выходит, показ выбрасывается с объяснением.
//
//  Тизеры («запомни») не трогаем: они уже выверены, меняется только момент их
//  появления — теперь по концу фразы, а не в начале такта.
//
//  Запуск: node scripts/build-kniga-panel.mjs <журнал workflow> [--dry]
// ═══════════════════════════════════════════════════════════════════════════
import fs from 'node:fs'

const ROOT = '.tmp/sketches/tutor'
const JOURNAL = process.argv[2]
const DRY = process.argv.includes('--dry')
const SCRIPT = JSON.parse(fs.readFileSync('.tmp/kniga-script.json', 'utf8'))
const OLD = JSON.parse(fs.readFileSync(ROOT + '/book/panel.json', 'utf8'))
const MAP = fs.readFileSync(ROOT + '/book/map-greece.svg', 'utf8')
const MAP_IDS = new Set([...MAP.matchAll(/id="(?:mk|zone)-([\w-]+)"/g)].map((m) => m[1])
  .concat([...MAP.matchAll(/id="zone-([\w-]+)"/g)].map((m) => 'zone-' + m[1])))

// из журнала берём ПОСЛЕДНИЙ результат по каждой странице — это выход сверки
const results = fs.readFileSync(JOURNAL, 'utf8').trim().split('\n').map((l) => JSON.parse(l))
  .filter((l) => l.type === 'result').map((l) => l.value || l.result).filter((v) => v && v.demos)
const byPage = new Map()
for (const r of results) if (r.page) byPage.set(r.page, r)     // последний перезаписывает первый

const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
const hits = (re) => SCRIPT.filter((b) => re.test(b.say || ''))
const words = (s) => s.split(/(\s+)/)                          // с разделителями, чтобы склеить обратно

// удлинить фразу до однозначной: сначала вправо по словам, потом влево
function unique(at, beat) {
  const say = beat.say || ''
  const i = say.indexOf(at)
  if (i < 0) return null
  let re = new RegExp(esc(at), 'i')
  if (hits(re).length === 1) return at
  const tail = words(say.slice(i + at.length)).filter((w) => w.trim())
  let cur = at
  for (const w of tail.slice(0, 8)) {
    const j = say.indexOf(w, say.indexOf(cur) + cur.length)
    cur = say.slice(say.indexOf(cur), j + w.length)
    if (hits(new RegExp(esc(cur), 'i')).length === 1) return cur
  }
  const head = words(say.slice(0, i)).filter((w) => w.trim())
  cur = at
  for (const w of head.reverse().slice(0, 8)) {
    const j = say.lastIndexOf(w, say.indexOf(cur))
    if (j < 0) break
    cur = say.slice(j, say.indexOf(cur) + cur.length)
    if (hits(new RegExp(esc(cur), 'i')).length === 1) return cur
  }
  return null
}

const artOk = (art) => art === 'map' ? true
  : art.startsWith('map:') ? MAP_IDS.has(art.slice(4))
  : art.startsWith('book:') ? fs.existsSync(ROOT + '/book/hi-' + art.slice(5) + '.jpg')
  : fs.existsSync(ROOT + '/art-' + art + '.jpg')

const out = [], drops = [], grown = []
let kept = 0
for (const pg of OLD) {
  const src = byPage.get(pg.page)
  if (!src) { out.push(pg); drops.push('стр. ' + pg.page + ': агент не вернул показы — оставлены прежние'); continue }
  const demos = []
  for (const d of src.demos) {
    const beat = SCRIPT.find((b) => b.n === d.beat)
    if (!beat) { drops.push('стр. ' + pg.page + ' «' + d.cap + '»: такта #' + d.beat + ' нет'); continue }
    if (beat.page !== pg.page) { drops.push('стр. ' + pg.page + ' «' + d.cap + '»: такт #' + d.beat + ' на стр. ' + beat.page); continue }
    if (!(beat.say || '').includes(d.at)) { drops.push('стр. ' + pg.page + ' «' + d.cap + '»: фразы «' + d.at + '» нет в такте #' + d.beat); continue }
    if (!artOk(d.art)) { drops.push('стр. ' + pg.page + ' «' + d.cap + '»: нет картинки ' + d.art); continue }
    const at = unique(d.at, beat)
    // Главный вопрос параграфа звучит трижды дословно: в начале, в списке заданий и
    // в конце урока. Однозначной такую фразу не сделать — её такт целиком лежит
    // внутри другого. Это единственный случай, когда повтор разрешён, и разрешается
    // он явно: показ помечается «also», а приёмка знает, что тут так и задумано.
    // Условие узкое: повторяться могут только служебные такты-вопросы, содержательные
    // дословно не повторяются никогда.
    let also = false
    if (!at) {
      const hh = hits(new RegExp(esc(d.at), 'i'))
      if (hh.length <= 3 && hh.every((b) => b.kind === 'ask' || b.kind === 'own')) also = true
      else { drops.push('стр. ' + pg.page + ' «' + d.cap + '»: фраза «' + d.at + '» встречается в параграфе несколько раз, однозначной не выходит'); continue }
    }
    if (at && at !== d.at) grown.push('стр. ' + pg.page + ' «' + d.cap + '»: «' + d.at + '» → «' + at + '»')
    const item = { n: d.beat, re: esc(at || d.at), art: d.art, cap: d.cap, sub: d.sub }
    if (also) { item.also = true; grown.push('стр. ' + pg.page + ' «' + d.cap + '»: фраза повторяется в служебных тактах — помечено also') }
    demos.push(item)
    kept++
  }
  // порядок в файле — по такту и по месту фразы внутри него (урок всё равно сортирует сам,
  // но человеку файл читать сверху вниз)
  demos.sort((a, b) => a.n - b.n
    || (SCRIPT.find((x) => x.n === a.n).say.indexOf(a.re.replace(/\\/g, ''))
      - SCRIPT.find((x) => x.n === b.n).say.indexOf(b.re.replace(/\\/g, ''))))
  out.push({ page: pg.page, demos, teasers: pg.teasers })
}

console.log('показов собрано: ' + kept + ' (было ' + OLD.reduce((a, p) => a + p.demos.length, 0) + ')')
if (grown.length) console.log('\nудлинено до однозначных (' + grown.length + '):\n  ' + grown.join('\n  '))
if (drops.length) console.log('\nвыброшено (' + drops.length + '):\n  ' + drops.join('\n  '))
for (const p of out) console.log('  стр. ' + p.page + ': показов ' + p.demos.length + ' · карт ' + p.demos.filter((d) => d.art.startsWith('map')).length)

if (DRY) { console.log('\n(--dry: файл не тронут)'); process.exit(0) }
fs.copyFileSync(ROOT + '/book/panel.json', '.tmp/panel-v1-backup.json')
fs.writeFileSync(ROOT + '/book/panel.json', JSON.stringify(out, null, 1))
console.log('\n→ ' + ROOT + '/book/panel.json (прежний в .tmp/panel-v1-backup.json)')
