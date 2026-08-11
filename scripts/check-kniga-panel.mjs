#!/usr/bin/env node
// Проверка привязок правой половины урока (/kniga): каждый показ и каждый тизер
// обязан попадать РОВНО в один такт своей страницы, а файл картинки — существовать.
// Привязка живёт текстом (регулярка по реплике), поэтому от любой правки разбора PDF
// она может тихо перестать срабатывать — эта проверка ловит такое до прогона.
//   node scripts/check-kniga-panel.mjs
import fs from 'node:fs'

const ROOT = '.tmp/sketches/tutor'
const PANEL = JSON.parse(fs.readFileSync(ROOT + '/book/panel.json', 'utf8'))
const SCRIPT = JSON.parse(fs.readFileSync('.tmp/kniga-script.json', 'utf8'))

let bad = 0, ok = 0
const say = (good, msg) => { if (good) { ok++; console.log('✅ ' + msg) } else { bad++; console.log('❌ ' + msg) } }
const fileOf = (art) => art.startsWith('book:')
  ? ROOT + '/book/hi-' + art.slice(5) + '.jpg'
  : ROOT + '/art-' + art + '.jpg'

console.log('тактов в уроке: ' + SCRIPT.length + ' · страниц в панели: ' + PANEL.length)

for (const pg of PANEL) {
  const label = 'стр. ' + pg.page
  for (const kind of ['demos', 'teasers']) {
    for (const item of pg[kind]) {
      const what = (kind === 'demos' ? 'показ «' + item.cap : 'тизер «' + item.term) + '»'
      let re
      try { re = new RegExp(item.re, 'i') } catch (e) { say(false, label + ' · ' + what + ': регулярка не компилируется — ' + e.message); continue }
      if (/\\b/.test(item.re)) { say(false, label + ' · ' + what + ': в регулярке \\b — он не видит кириллицу'); continue }
      const hits = SCRIPT.filter((b) => re.test(b.say))
      // Единственное законное исключение — главный вопрос параграфа: он звучит
      // дословно в начале, в списке заданий и в конце урока, и показ там уместен
      // во всех трёх местах. Помечается в данных полем also, чтобы молча такое
      // не проходило: содержательные такты дословно не повторяются никогда.
      if (item.also) {
        const framing = hits.length <= 3 && hits.every((h) => h.kind === 'ask' || h.kind === 'own')
        say(framing, label + ' · ' + what + ': повтор разрешён (also) и все ' + hits.length + ' такта — служебные вопросы')
        continue
      }
      if (hits.length !== 1) { say(false, label + ' · ' + what + ': попаданий ' + hits.length + ' (нужно 1) — ' + hits.map((h) => '#' + h.n).join(',')); continue }
      if (hits[0].page !== pg.page) { say(false, label + ' · ' + what + ': попал в такт #' + hits[0].n + ' на стр. ' + hits[0].page); continue }
      ok++
    }
  }
  // длины: панель узкая, длинный текст в ней ломает вёрстку
  const long = [...pg.demos.filter((d) => d.sub.length > 96).map((d) => 'sub «' + d.sub + '»'),
    ...pg.teasers.filter((t) => t.term.length > 24).map((t) => 'term «' + t.term + '»'),
    ...pg.teasers.filter((t) => t.txt.length > 62).map((t) => 'txt «' + t.txt + '»')]
  say(!long.length, label + ': тексты влезают в панель' + (long.length ? ' — длинно: ' + long.join(' · ') : ''))
  say(pg.teasers.length >= 3 && pg.teasers.length <= 5, label + ': тизеров ' + pg.teasers.length + ' (3–5)')
}

// map:* — не файл на диске, а цель внутри карты; её существование проверяется ниже
const arts = [...new Set(PANEL.flatMap((p) => p.demos.map((d) => d.art)))].filter((a) => !a.startsWith('map'))
const missing = arts.filter((a) => !fs.existsSync(fileOf(a)))
say(!missing.length, 'все картинки показов на месте (' + arts.length + ' шт.)' + (missing.length ? ' — НЕТ: ' + missing.join(', ') : ''))

// на каждой странице читаемые такты не должны оставаться совсем без показа
for (const pg of PANEL) {
  const beats = SCRIPT.filter((b) => b.page === pg.page && b.kind === 'read' && b.say.length >= 80)
  const covered = beats.filter((b) => pg.demos.some((d) => new RegExp(d.re, 'i').test(b.say))).length
  say(covered >= Math.ceil(beats.length * 0.55),
    'стр. ' + pg.page + ': показ есть у ' + covered + ' из ' + beats.length + ' содержательных тактов')
}

// ── вопросы проверки страницы ────────────────────────────────────────────────
// Тот же риск, что у показов: привязка живёт текстом, и от правки разбора PDF вопрос
// молча перестанет находить кусок для повтора.
const TEST = JSON.parse(fs.readFileSync(ROOT + '/book/test.json', 'utf8'))
console.log('\nвопросов проверки: ' + TEST.reduce((a, p) => a + p.questions.length, 0))
for (const pg of TEST) {
  const label = 'тест стр. ' + pg.page
  say(pg.questions.length >= 3 && pg.questions.length <= 4, label + ': вопросов ' + pg.questions.length + ' (3–4)')
  for (const q of pg.questions) {
    const what = '«' + q.q.slice(0, 44) + '»'
    let re
    try { re = new RegExp(q.re, 'i') } catch (e) { say(false, label + ' ' + what + ': регулярка не компилируется'); continue }
    if (/\\b/.test(q.re)) { say(false, label + ' ' + what + ': в регулярке \\b'); continue }
    const hits = SCRIPT.filter((b) => re.test(b.say))
    if (hits.length !== 1) { say(false, label + ' ' + what + ': кусок для повтора найден ' + hits.length + ' раз'); continue }
    if (hits[0].page !== pg.page) { say(false, label + ' ' + what + ': кусок для повтора на стр. ' + hits[0].page); continue }
    if (!(q.ok >= 0 && q.ok < q.options.length)) { say(false, label + ' ' + what + ': верный вариант вне списка'); continue }
    if (new Set(q.options.map((o) => o.trim().toLowerCase())).size !== q.options.length) {
      say(false, label + ' ' + what + ': есть одинаковые варианты'); continue }
    if (q.q.length > 92 || q.options.some((o) => o.length > 57)) {
      say(false, label + ' ' + what + ': не влезет в панель (вопрос ' + q.q.length + ')'); continue }
    ok++
  }
  // Вопросы не должны перечитывать один и тот же кусок: тогда повтор после ошибки
  // прогоняет ребёнку одно и то же место дважды, а другое не звучит вовсе.
  const spots = pg.questions.map((q) => q.re)
  say(new Set(spots).size === spots.length,
    label + ': у каждого вопроса свой кусок для повтора' + (new Set(spots).size === spots.length ? '' : ' — дублей ' + (spots.length - new Set(spots).size)))
  // верный ответ не должен быть заметно длиннее неверных — дети выбирают самый длинный
  const tell = pg.questions.filter((q) => {
    const good = q.options[q.ok].length, others = q.options.filter((_, i) => i !== q.ok).map((o) => o.length)
    return good > Math.max(...others) + 12 })
  say(!tell.length, label + ': верный вариант не выдаёт себя длиной'
    + (tell.length ? ' — подозрительны: ' + tell.map((t) => '«' + t.options[t.ok] + '»').join(' · ') : ''))
}

// ═══════════════════════════════════════════════════════════════════════════
//  v2.0: ПОКАЗ ОБЯЗАН ИДТИ ЗА ФРАЗОЙ, А НЕ ЗА ТАКТОМ
//
//  Претензия руководителя к v1.0: «текст, который она рассказывает, не
//  соответствует картинке — она говорит про карту и расположение государств, а
//  показывается абстракция с кораблём». Ниже — механические правила, которые не
//  дают этому вернуться: плотность показов внутри такта, место первой привязки и
//  железное «звучит топоним — на экране карта».
// ═══════════════════════════════════════════════════════════════════════════
console.log('\n── показ по фразе (v2.0) ──')
const MAP = fs.existsSync(ROOT + '/book/map-greece.svg') ? fs.readFileSync(ROOT + '/book/map-greece.svg', 'utf8') : ''
say(!!MAP, 'карта собрана (scripts/make-map-greece.mjs)')

// цели карты, которые она действительно умеет показать
const mapIds = new Set([...MAP.matchAll(/id="(?:mk|zone)-([\w-]+)"/g)].map((m) => m[1]))
const zoneIds = new Set([...MAP.matchAll(/id="zone-([\w-]+)"/g)].map((m) => m[1]))
const mapTargets = new Set([...mapIds].concat([...zoneIds].map((z) => 'zone-' + z)))
const usedMap = [...new Set(PANEL.flatMap((p) => p.demos.map((d) => d.art)).filter((a) => a.startsWith('map')))]
const badMap = usedMap.filter((a) => a !== 'map' && !mapTargets.has(a.slice(4)))
say(!badMap.length, 'все цели карты существуют (' + usedMap.length + ' видов показа)' + (badMap.length ? ' — НЕТ: ' + badMap.join(', ') : ''))

// Слова-места из самой карты: если они звучат в такте, ребёнок должен видеть,
// ГДЕ это. Именно на этом версия и погорела.
const PLACES = [...MAP.matchAll(/<text[^>]*>([^<]+)<\/text>/g)].map((m) => m[1])
  .filter((t) => !/море/i.test(t)).map((t) => t.replace(/[аеиоуыэюя]$/i, ''))
// Требуем карту не от всякого упоминания места, а от РАССКАЗА ПРО МЕСТО: «занимала
// южную часть», «в центре Средиземного моря лежит», «переселились с севера». Там, где
// место лишь названо, а речь о вещи («ворота, увенчанные фигурами львов»), правильная
// картинка — сама вещь, и требовать карту значило бы гнать её вместо предмета.
const GEO = /(находил|располаг|лежит|лежал|занимал|на территории|в центре|севернее|южнее|с севера|с юга|переселил|соединял|полуостров|остров |за пределами|вокруг)/i
const geoMiss = []
for (const b of SCRIPT) {
  if (b.kind !== 'read' || b.say.length < 80) continue
  // географический оборот должен стоять РЯДОМ с названием, иначе правило ловит
  // «в центре дворца находился главный зал» — это про зал, а не про место на карте
  const hit = PLACES.filter((p) => {
    const m = new RegExp(p, 'i').exec(b.say)
    return m && GEO.test(b.say.slice(Math.max(0, m.index - 45), m.index + m[0].length + 45))
  })
  if (!hit.length) continue
  const demos = PANEL.flatMap((p) => p.demos).filter((d) => new RegExp(d.re, 'i').test(b.say))
  if (!demos.some((d) => d.art.startsWith('map'))) geoMiss.push('#' + b.n + ' (' + hit.slice(0, 3).join(', ') + ')')
}
say(!geoMiss.length, 'где рассказывают про место — на экране карта' + (geoMiss.length ? ' — без карты: ' + geoMiss.join(' · ') : ''))

// плотность и место привязок внутри такта
const thin = [], late = [], off = []
for (const b of SCRIPT) {
  // считаем только читаемый текст: список заданий и подписи к картинкам — не рассказ
  if (b.kind !== 'read') continue
  const at = PANEL.flatMap((p) => p.demos).map((d) => {
    const m = new RegExp(d.re, 'i').exec(b.say); return m ? { d, a: m.index / b.say.length } : null
  }).filter(Boolean).sort((x, y) => x.a - y.a)
  if (!at.length) continue
  if (b.say.length >= 240 && at.length < 2) thin.push('#' + b.n + ' (' + b.say.length + ' знаков, показов ' + at.length + ')')
  if (at[0].a > 0.5) late.push('#' + b.n + ' (первый показ на ' + Math.round(at[0].a * 100) + '%)')
  if (at.length > 6) off.push('#' + b.n + ' (показов ' + at.length + ')')
}
say(!thin.length, 'длинные такты не сидят на одной картинке' + (thin.length ? ' — редко: ' + thin.join(' · ') : ''))
say(!late.length, 'такт не начинается с чужой картинки' + (late.length ? ' — поздний первый показ: ' + late.join(' · ') : ''))
say(!off.length, 'картинки не мельтешат' + (off.length ? ' — частят: ' + off.join(' · ') : ''))

console.log('\nитог: ' + ok + ' ок, ' + bad + ' мимо')
process.exit(bad ? 1 : 0)
