#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════════════════
//  ДАННЫЕ ТРЕНАЖЁРА РАЗДЕЛА (v2.5) — по методичке руководителя от 08.08
//
//  Из документа «Промпт3»: на каждый раздел 6 заданий — 3 на активный словарь и
//  3 на общую историю; три РАЗНЫХ типа; вопрос самодостаточен (весь контекст в нём
//  самом); среди вариантов обязательно есть правильный; позиция правильного —
//  случайная; на первую ошибку короткая причина, на вторую — как решать, на третью —
//  правильный ответ с разъяснением и новое задание взамен.
//
//  🔑 ГЛАВНОЕ ОГРАНИЧЕНИЕ, которое здесь соблюдается. Методичка требует объяснений
//  («причина ошибки», «как решать», «наводящие»), а форма урока держится на том, что
//  90 % звучит учебник и своего мы не добавляем. Поэтому НИ ОДНО пояснение не
//  сочиняется: каждое собрано из того, что уже привязано к тексту —
//    · дословное предложение учебника, где факт и сказан (`src` топика);
//    · короткая мысль топика (`txt`), она же служит разбором неверного выбора;
//    · привязка к такту (`re`) — по ней урок умеет перечитать нужное место.
//  Своего в файле ровно два сорта строк: формулировки заданий («Что означает
//  слово…») и подсказки о ПОРЯДКЕ ДЕЙСТВИЙ. Это механика, а не материал.
//
//  Запуск: node scripts/make-drill-data.mjs
//  Выход:  .tmp/sketches/tutor/book/drill.json
// ═══════════════════════════════════════════════════════════════════════════
import fs from 'node:fs'

const ROOT = '.tmp/sketches/tutor'
const ZAK = JSON.parse(fs.readFileSync(ROOT + '/book/zakrep.json', 'utf8'))
const TEST = JSON.parse(fs.readFileSync(ROOT + '/book/test.json', 'utf8'))

const OUT = ROOT + '/book/drill.json'
const say = []

// ── ТИПЫ ЗАДАНИЙ ────────────────────────────────────────────────────────────
//  «По каждому разделу коротко показывается, как решать типовые тесты в количестве
//  не менее разных 3 типов». Это объяснение ПОРЯДКА ДЕЙСТВИЙ, а не материала.
const TYPES = [
  { id: 'vocab', name: 'Слово → значение',
    how: 'Дано слово из урока. Выбери, что оно означает. Читай все варианты до конца: похожие отличаются одним словом.' },
  { id: 'back', name: 'Значение → слово',
    how: 'Дано описание. Выбери слово, которым его называет учебник. Сначала вспомни слово сам, потом ищи его среди вариантов.' },
  { id: 'match', name: 'Соединить пары',
    how: 'Слева слова, справа значения. Нажми слово, потом его значение — они соединятся. Начинай с тех пар, в которых уверен.' },
]

// ── СЛУЖЕБНОЕ ───────────────────────────────────────────────────────────────
const norm = (s) => String(s || '').trim()
// ⚠️ Обрезаем по слову И убираем висячий знак: «…мешали объединиться. Высшая —…»
// читается как сбой вёрстки. Если перед обрывом кончилось предложение — обрываем там.
const short = (s, n) => {
  const t = norm(s)
  if (t.length <= n) return t
  let c = t.slice(0, n - 1).replace(/\s+\S*$/, '')
  const точка = c.search(/[.!?…](?=[^.!?…]*$)/)
  if (точка > n * 0.55) return c.slice(0, точка + 1)      // влезло целое предложение
  return c.replace(/\s*[—–\-,;:]+$/, '') + '…'
}
// Предложение учебника без хвостов: в подсказке оно читается вслух, и обрывок
// на середине слова слышится как сбой.
const clean = (s) => norm(s).replace(/\s+/g, ' ')

// Отвлекающие варианты. Правило одно: вариант не должен случайно оказаться верным —
// поэтому отсекаем то, что похоже на правильный ответ первыми словами (иначе «области
// Фессалия и Эпир» спорит с «области Беотия…»).
// 🔴 Сначала берём с ТОЙ ЖЕ страницы. Чужие темы («Что означает „Горы Греции“?» →
// «Так греки звали родину») отличаются настолько, что выбор делается не думая, а
// методичка прямо запрещает примитивные задания. Соседний топик заставляет читать.
const head = (s) => norm(s).toLowerCase().replace(/ё/g, 'е').split(/\s+/).slice(0, 3).join(' ')
function distractors(right, near, far, n) {
  const out = [], seen = new Set([head(right)])
  for (const p of [...near, ...far]) {
    const h = head(p)
    if (seen.has(h) || !norm(p)) continue
    seen.add(h); out.push(p)
    if (out.length >= n) break
  }
  return out
}

// ⚠️ Не всякая карточка «запомни» годится в задание. У «Мегарона и фрески» пояснение —
// «Два новых слова, встретим их дальше»: это анонс, а не определение, и в задании оно
// превращается в бессмыслицу («соедини слово с его значением» → с анонсом). На карточке
// в уроке такая подпись уместна, в тренажёре — нет.
const АНОНС = /(встрет|дальше|новых слов|позже|потом узна|пока не)/i
const служебная = (t) => АНОНС.test(norm(t.txt))

// Для вопроса «по описанию назови» термин должен быть НАЗВАНИЕМ, а не пересказом
// описания. «Первая в Европе» ↔ «Самая ранняя цивилизация Европы жила на Крите» —
// ответ содержится в вопросе, спрашивать нечего. Берём короткое и непересекающееся.
const корни = (s) => new Set(norm(s).toLowerCase().replace(/ё/g, 'е')
  .split(/[^а-яa-z0-9]+/).filter((w) => w.length > 3).map((w) => w.slice(0, 5)))
function ценностьДляОбратного(t) {
  const a = корни(t.term), b = корни(t.txt)
  let общих = 0
  for (const w of a) if (b.has(w)) общих++
  const слов = norm(t.term).split(/\s+/).length
  return (общих ? -100 : 0) + (слов <= 2 ? 10 : 0) - слов
}
// Точку перед закрывающей кавычкой убираем: «…ориентирами.».» читается как опечатка.
const безТочки = (s) => norm(s).replace(/[.\s]+$/, '')

// ── СБОРКА ──────────────────────────────────────────────────────────────────
const allTerms = ZAK.pages.flatMap((p) => (p.terms || []).map((t) => ({ ...t, page: p.page })))
const pages = []

for (const pg of ZAK.pages) {
  const все = (pg.terms || []).filter((t) => norm(t.term) && norm(t.txt))
  const terms = все.filter((t) => !служебная(t))
  const пропущено = все.filter(служебная).map((t) => t.term)
  if (пропущено.length) say.push('  стр. ' + pg.page + ': в задания не взяты анонсы — ' + пропущено.join(', '))
  const hist = (TEST.find((x) => x.page === pg.page) || { questions: [] }).questions
  // сначала соседние темы той же страницы, потом чужие — так вариант труднее отбросить
  const nearTxt = terms.map((t) => t.txt), nearTerm = terms.map((t) => t.term)
  const alienTxt = allTerms.filter((t) => t.page !== pg.page).map((t) => t.txt)
  const alienTerm = allTerms.filter((t) => t.page !== pg.page).map((t) => t.term)

  const tasks = []
  const used = new Set()

  // 1. СЛОВАРЬ: тема → значение
  //  ⚠️ Не «слово»: почти все карточки параграфа — это темы в два-три слова («Три части
  //  Греции», «Оливы и виноград»), и «встретилось слово „Три части Греции“» звучит нелепо.
  const t1 = terms[0]
  if (t1) {
    used.add(t1.term)
    const opts = [clean(t1.txt), ...distractors(t1.txt, nearTxt.filter((x) => x !== t1.txt), alienTxt, 2)]
    tasks.push({
      id: pg.page + '-v1', kind: 'vocab', тип: 'vocab',
      q: '«' + t1.term + '» — что это значит?',
      options: opts, ok: 0,
      optTerm: [t1.term, null, null],
      term: t1.term, src: clean(t1.src), re: null, beat: t1.beat || null,
      hint: 'Вспомни, что показывали на экране рядом с этим. Искать — на странице ' + pg.page + '.',
    })
  }
  // 2. СЛОВАРЬ: описание → название. Термин выбираем не первый попавшийся, а тот, что
  //    действительно является НАЗВАНИЕМ и не повторяет своё же описание.
  const t2 = terms.filter((t) => !used.has(t.term))
    .sort((a, b) => ценностьДляОбратного(b) - ценностьДляОбратного(a))[0]
  if (t2) {
    used.add(t2.term)
    const opts = [t2.term, ...distractors(t2.term, nearTerm.filter((x) => x !== t2.term), alienTerm, 2)]
    tasks.push({
      id: pg.page + '-v2', kind: 'back', тип: 'back',
      q: 'В учебнике сказано: «' + безТочки(short(t2.txt, 90)) + '». Как это названо в уроке?',
      options: opts, ok: 0,
      optTerm: opts.slice(),
      term: t2.term, src: clean(t2.src), re: null, beat: t2.beat || null,
      hint: 'Сначала назови сам, вслух, и только потом читай варианты.',
    })
  }
  // 3. СЛОВАРЬ: соединить пары — закрывающее задание раздела, берёт ВЕСЬ его словарь
  if (terms.length >= 3) {
    const pairs = terms.slice(0, 5).map((t) => ({ l: t.term, r: безТочки(short(t.txt, 58)), src: clean(t.src) }))
    tasks.push({
      id: pg.page + '-v3', kind: 'match', тип: 'match',
      q: 'Соедини каждую тему раздела с её значением.',
      pairs, term: null, src: null, re: null,
      hint: 'Начинай с пары, в которой уверен: чем меньше останется, тем проще выбрать остальные.',
    })
  }
  // 4–6. ИСТОРИЯ: вопросы проверки, уже привязанные к тексту
  for (const q of hist.slice(0, 3)) {
    const own = terms.find((t) => t.term === q.term)
    tasks.push({
      id: pg.page + '-h' + q.n, kind: 'history', тип: 'history',
      q: clean(q.q), options: q.options.slice(), ok: q.ok,
      optTerm: q.options.map(() => null),
      term: q.term, src: own ? clean(own.src) : null, re: q.re, beat: own ? own.beat : null,
      hint: 'Ответ есть в тексте раздела — вспомни, о чём читал на странице ' + pg.page + '.',
    })
  }

  // ЗАПАСНЫЕ — их выдают взамен заданий, проваленных с трёх попыток
  const spare = []
  for (const t of terms) {
    if (used.has(t.term)) continue
    spare.push({
      id: pg.page + '-s' + spare.length, kind: 'vocab', тип: 'vocab',
      q: '«' + t.term + '» — что это значит?',
      options: [clean(t.txt), ...distractors(t.txt, nearTxt.filter((x) => x !== t.txt), alienTxt, 2)], ok: 0,
      optTerm: [t.term, null, null],
      term: t.term, src: clean(t.src), re: null, beat: t.beat || null,
      hint: 'Ищи это слово на странице ' + pg.page + '.',
    })
  }
  for (const q of hist.slice(3)) {
    const own = terms.find((t) => t.term === q.term)
    spare.push({
      id: pg.page + '-sh' + q.n, kind: 'history', тип: 'history',
      q: clean(q.q), options: q.options.slice(), ok: q.ok,
      optTerm: q.options.map(() => null),
      term: q.term, src: own ? clean(own.src) : null, re: q.re, beat: own ? own.beat : null,
      hint: 'Ответ есть в тексте раздела.',
    })
  }

  pages.push({
    page: pg.page,
    vocab: terms.map((t) => t.term),          // активный словарь раздела
    tasks, spare,
  })
}

// ── ПРОВЕРКИ САМИХ ДАННЫХ ───────────────────────────────────────────────────
//  Методичка требует этого прямо: «проверять, чтобы среди предлагаемых ответов
//  обязательно был правильный», «варианты должны иметь понятные значения»,
//  «количество компонентов выбора не более 10».
const bad = []
for (const p of pages) {
  const v = p.tasks.filter((t) => t.kind !== 'history').length
  const h = p.tasks.filter((t) => t.kind === 'history').length
  if (v < 3) bad.push('стр. ' + p.page + ': словарных заданий ' + v + ' (надо 3)')
  if (h < 3) bad.push('стр. ' + p.page + ': исторических заданий ' + h + ' (надо 3)')
  if (p.vocab.length < 3) bad.push('стр. ' + p.page + ': словарь раздела всего ' + p.vocab.length)
  for (const t of [...p.tasks, ...p.spare]) {
    if (t.kind === 'match') {
      if (t.pairs.length < 3) bad.push(t.id + ': пар меньше трёх')
      if (t.pairs.length * 2 > 10) bad.push(t.id + ': компонентов выбора больше 10')
      if (new Set(t.pairs.map((x) => x.r)).size !== t.pairs.length) bad.push(t.id + ': одинаковые значения в парах')
      continue
    }
    if (!t.options || t.options.length < 3) bad.push(t.id + ': вариантов меньше трёх')
    if (t.options && t.options.some((o) => !norm(o))) bad.push(t.id + ': пустой вариант')
    if (t.options && new Set(t.options.map(head)).size !== t.options.length) bad.push(t.id + ': варианты неразличимы')
    if (!t.options || !t.options[t.ok]) bad.push(t.id + ': ПРАВИЛЬНОГО ВАРИАНТА НЕТ')
    if (!norm(t.q)) bad.push(t.id + ': пустой вопрос')
    if (t.q && t.q.length > 220) bad.push(t.id + ': вопрос длиннее 220 знаков')
  }
  // «Каждое задание должно быть новым» — один и тот же термин не спрашиваем дважды
  // одним и тем же способом.
  const key = p.tasks.filter((t) => t.term).map((t) => t.kind + '|' + t.term)
  if (new Set(key).size !== key.length) bad.push('стр. ' + p.page + ': задание повторяется')
}

fs.writeFileSync(OUT, JSON.stringify({ types: TYPES, pages }, null, 1))
console.log('→ ' + OUT)
console.log('разделов ' + pages.length
  + ' · заданий ' + pages.reduce((a, p) => a + p.tasks.length, 0)
  + ' · запасных ' + pages.reduce((a, p) => a + p.spare.length, 0)
  + ' · слов активного словаря ' + pages.reduce((a, p) => a + p.vocab.length, 0))
for (const p of pages) console.log('  стр. ' + p.page + ': заданий ' + p.tasks.length
  + ' (словарь ' + p.tasks.filter((t) => t.kind !== 'history').length
  + ' · история ' + p.tasks.filter((t) => t.kind === 'history').length + ')'
  + ' · запасных ' + p.spare.length + ' · словарь раздела ' + p.vocab.length)
if (bad.length) { console.log('\n❌ ПРОБЛЕМЫ В ДАННЫХ:'); for (const b of bad) console.log('  ' + b) }
else console.log('\n✅ данные прошли собственную проверку')
if (say.length) console.log(say.join('\n'))
