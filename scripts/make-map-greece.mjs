#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════════════════
//  КАРТА ГРЕЦИИ ДЛЯ УРОКА ПО §20 — сборка SVG из Natural Earth
//
//  Зачем вообще: первая претензия руководителя к v1.0 — «текст, который она
//  рассказывает, не соответствует картинке». Абзац на 120-й странице — сплошная
//  география (три части Греции, Фессалия, Эпир, Беотия, Аттика с Афинами,
//  Пелопоннес, Лакония со Спартой, Коринфский перешеек), и никакая иллюстрация
//  сюда не подойдёт: под такой текст нужна карта.
//
//  🔑 В учебнике карты нет — проверен весь PDF (302 страницы): ни растровой, ни
//  векторной. Поэтому карта своя, и чтобы она не стала «своим материалом»:
//    · подписи — ТОЛЬКО те названия, что звучат в самом параграфе;
//    · никаких границ государств: рисуется физическая карта (суша и море), потому
//      что современная Греция ≠ Древняя Греция, и рисовать её границы значило бы
//      сказать ребёнку то, чего в учебнике нет;
//    · области подсвечиваются зонами, обрезанными по берегу, а не полигонами
//      «как было на самом деле»: учебник даёт их приблизительно, и карта врать
//      точностью не должна.
//
//  Источник берегов — Natural Earth 10m (public domain, права чистые).
//
//  Запуск:  node scripts/make-map-greece.mjs
//  Выход:   .tmp/sketches/tutor/book/map-greece.svg   (роут /book/map-greece.svg)
// ═══════════════════════════════════════════════════════════════════════════
import fs from 'fs'
import path from 'path'

const SRC = '.tmp/ne-countries.geojson'
const COAST = '.tmp/ne-coastline.geojson'
const URL = 'https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_10m_admin_0_countries.geojson'
const URL_COAST = 'https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_10m_coastline.geojson'
const OUT = '.tmp/sketches/tutor/book/map-greece.svg'

// Окно карты: юг Балкан + Эгейское море + Крит целиком.
// 🔴 «Справа почему-то обрезано всё» (05.08). Окно было почти квадратным (1.13:1), а
// коробка показа широкая (≈1.6:1): карта вписывалась по высоте и занимала две трети
// ширины, остальное — пустая вода по краям. Окно подогнано под коробку: север обрезан
// (Болгария к Древней Греции отношения не имеет), зато влезает берег Малой Азии.
const WIN = { lon0: 18.6, lon1: 30.8, lat0: 34.4, lat1: 40.6 }
const W = 1700                                   // ширина вывода, px
const LAT_MID = (WIN.lat0 + WIN.lat1) / 2
const KX = Math.cos(LAT_MID * Math.PI / 180)     // равнопромежуточная: сжатие по долготе

const sx = W / ((WIN.lon1 - WIN.lon0) * KX)
const H = Math.round((WIN.lat1 - WIN.lat0) * sx)
const P = ([lon, lat]) => [ (lon - WIN.lon0) * KX * sx, (WIN.lat1 - lat) * sx ]

// ── подписи: ровно то, что названо в §20 ─────────────────────────────────
// [id, подпись, широта, долгота, вид, широта подписи, долгота подписи]
// Вид: 'city' — точка с кружком, 'area' — область, 'sea' — море (курсивом).
// Две последние координаты необязательные: если подпись не помещается на самом
// месте, она отъезжает, и к точке от неё тянется выноска.
const MARKS = [
  ['thessaly',  'Фессалия',            39.60, 22.30, 'area'],
  ['epirus',    'Эпир',                39.55, 20.70, 'area'],
  ['boeotia',   'Беотия',              38.42, 23.05, 'area',  39.05, 22.30],
  ['attica',    'Аттика',              38.05, 23.85, 'area',  38.42, 24.45],
  ['athens',    'Афины',               37.98, 23.73, 'city',  37.80, 23.95],
  ['peloponnese','Пелопоннес',         37.45, 22.15, 'area',  36.80, 20.75],
  ['laconia',   'Лаконика',             36.90, 22.55, 'area',  36.30, 23.45],
  ['sparta',    'Спарта',              37.07, 22.43, 'city',  36.72, 22.00],
  ['isthmus',   'Коринфский перешеек', 37.93, 22.95, 'area',  38.62, 20.35],
  ['crete',     'Крит',                35.22, 24.30, 'area'],
  ['knossos',   'Кносс',               35.30, 25.16, 'city',  35.62, 25.55],
  ['mycenae',   'Микены',              37.73, 22.76, 'city',  37.66, 21.95],
  ['aegean',    'Эгейское море',       38.60, 25.40, 'sea'],
  ['ionian',    'Ионическое море',     37.30, 19.85, 'sea'],
]

// ── зоны: три части Греции ───────────────────────────────────────────────
// Полигоны в градусах, обрезаются по суше Греции (clip-path). Южная граница
// Средней Греции ведёт по Коринфскому заливу — иначе север Пелопоннеса попал бы
// в «Среднюю Грецию». Север обрезан 40.3° — севернее лежит то, что Древней
// Грецией в учебнике не называется.
const ZONES = {
  north:  [[19.4,40.30],[23.4,40.30],[23.4,38.95],[22.6,39.15],[21.6,39.05],[20.2,39.35],[19.4,39.60]],
  middle: [[20.2,39.35],[21.6,39.05],[22.6,39.15],[23.4,38.95],[24.3,38.75],[24.3,37.90],[23.45,37.85],
           [23.05,38.02],[22.0,38.35],[20.6,38.15]],
  south:  [[20.6,38.15],[22.0,38.35],[23.05,38.02],[23.45,37.85],[23.6,36.20],[20.6,36.20]],
}

// ── геометрия ────────────────────────────────────────────────────────────
// обрезка кольца прямоугольником окна (Сазерленд–Ходжман, по одной стороне за проход)
function clipRing(ring, edge, val, keep) {
  const inside = p => keep === 'gt' ? p[edge] >= val : p[edge] <= val
  const cross = (a, b) => {
    const t = (val - a[edge]) / (b[edge] - a[edge])
    return edge === 0 ? [val, a[1] + (b[1] - a[1]) * t] : [a[0] + (b[0] - a[0]) * t, val]
  }
  const out = []
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i], b = ring[(i + 1) % ring.length]
    const ia = inside(a), ib = inside(b)
    if (ia) out.push(a)
    if (ia !== ib) out.push(cross(a, b))
  }
  return out
}
const clipWin = r => {
  let o = r
  o = clipRing(o, 0, WIN.lon0, 'gt'); if (!o.length) return o
  o = clipRing(o, 0, WIN.lon1, 'lt'); if (!o.length) return o
  o = clipRing(o, 1, WIN.lat0, 'gt'); if (!o.length) return o
  return clipRing(o, 1, WIN.lat1, 'lt')
}
// Дуглас–Пойкер в ПИКСЕЛЯХ вывода: допуск тогда значит «на глаз не отличить»
function simplify(pts, tol) {
  if (pts.length < 3) return pts
  const d2 = (p, a, b) => {
    let x = a[0], y = a[1], dx = b[0] - x, dy = b[1] - y
    if (dx || dy) {
      const t = ((p[0] - x) * dx + (p[1] - y) * dy) / (dx * dx + dy * dy)
      if (t > 1) { x = b[0]; y = b[1] } else if (t > 0) { x += dx * t; y += dy * t }
    }
    return (p[0] - x) ** 2 + (p[1] - y) ** 2
  }
  const keep = new Uint8Array(pts.length); keep[0] = keep[pts.length - 1] = 1
  const stack = [[0, pts.length - 1]], t2 = tol * tol
  while (stack.length) {
    const [i, j] = stack.pop()
    let far = -1, best = t2
    for (let k = i + 1; k < j; k++) { const d = d2(pts[k], pts[i], pts[j]); if (d > best) { best = d; far = k } }
    if (far > 0) { keep[far] = 1; stack.push([i, far], [far, j]) }
  }
  return pts.filter((_, i) => keep[i])
}
const ringPath = ring => {
  const pts = simplify(ring.map(P), 0.5)
  if (pts.length < 3) return ''
  const n = v => Math.round(v * 10) / 10
  return 'M' + pts.map(p => n(p[0]) + ' ' + n(p[1])).join('L') + 'Z'
}
// площадь в пикселях — по ней выбрасываем острова мельче булавочной головки
const area = ring => {
  const p = ring.map(P); let a = 0
  for (let i = 0; i < p.length; i++) { const q = p[(i + 1) % p.length]; a += p[i][0] * q[1] - q[0] * p[i][1] }
  return Math.abs(a / 2)
}
function landPath(features, minArea) {
  const parts = []
  for (const f of features) {
    const polys = f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.coordinates
    for (const poly of polys) {
      for (const ring of poly) {
        const c = clipWin(ring)
        if (c.length < 3 || area(c) < minArea) continue
        const d = ringPath(c); if (d) parts.push(d)
      }
    }
  }
  return parts.join('')
}
// Берег отдельным слоем-ЛИНИЕЙ, а не обводкой стран: страны обведены каждая по
// себе, и на карте проступают государственные границы — их здесь быть не должно
// (современные границы к Древней Греции отношения не имеют). В слое coastline
// линия уже склеена по берегу и границ не знает.
function coastPath(features) {
  const parts = []
  const n = v => Math.round(v * 10) / 10
  for (const f of features) {
    const lines = f.geometry.type === 'LineString' ? [f.geometry.coordinates] : f.geometry.coordinates
    for (const line of lines) {
      // линию нельзя гонять через клип многоугольника — режем на куски по окну
      let run = []
      const flush = () => {
        if (run.length > 1) {
          const pts = simplify(run.map(P), 0.5)
          if (pts.length > 1) parts.push('M' + pts.map(p => n(p[0]) + ' ' + n(p[1])).join('L'))
        }
        run = []
      }
      for (const c of line) {
        const [lon, lat] = c
        if (lon >= WIN.lon0 - .2 && lon <= WIN.lon1 + .2 && lat >= WIN.lat0 - .2 && lat <= WIN.lat1 + .2) run.push(c)
        else flush()
      }
      flush()
    }
  }
  return parts.join('')
}

// ── сборка ───────────────────────────────────────────────────────────────
if (!fs.existsSync(SRC)) {
  console.error('нет ' + SRC + '\nскачай: curl -sL -o ' + SRC + ' ' + URL)
  process.exit(1)
}
if (!fs.existsSync(COAST)) {
  console.error('нет ' + COAST + '\nскачай: curl -sL -o ' + COAST + ' ' + URL_COAST)
  process.exit(1)
}
const gj = JSON.parse(fs.readFileSync(SRC, 'utf8'))
const inWin = gj.features.filter(f => {
  const b = f.bbox
  return b && b[0] < WIN.lon1 && b[2] > WIN.lon0 && b[1] < WIN.lat1 && b[3] > WIN.lat0
})
const grc = inWin.filter(f => f.properties.ADM0_A3 === 'GRC')
console.log('в окне стран:', inWin.length, '· Греция найдена:', grc.length === 1)

// вся суша — ЗАЛИВКОЙ без обводки (иначе проступают границы государств),
// а берег поверх — отдельным склеенным слоем
const dAll = landPath(inWin, 1.2)
const dGrc = landPath(grc, 0.8)          // тот же берег, но только Греция — под обрезку зон
const coast = JSON.parse(fs.readFileSync(COAST, 'utf8'))
const dCoast = coastPath(coast.features.filter(f => {
  const b = f.bbox
  return !b || (b[0] < WIN.lon1 && b[2] > WIN.lon0 && b[1] < WIN.lat1 && b[3] > WIN.lat0)
}))

const zonePath = pts => 'M' + pts.map(c => { const p = P(c); return Math.round(p[0]) + ' ' + Math.round(p[1]) }).join('L') + 'Z'
const esc = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;')

const marks = MARKS.map(([id, name, lat, lon, kind, llat, llon]) => {
  const [x, y] = P([lon, lat]).map(Math.round)
  const off = llat != null
  const [lx, ly] = off ? P([llon, llat]).map(Math.round) : [x, y + (kind === 'city' ? -13 : 5)]
  return `<g class="mk ${kind}" id="mk-${id}" data-x="${x}" data-y="${y}">`
    + `<circle class="halo" cx="${x}" cy="${y}" r="52"/>`
    + (off ? `<path class="lead" d="M${lx} ${ly - 6}L${x} ${y}"/>` : '')
    + (kind !== 'sea' ? `<circle class="dot" cx="${x}" cy="${y}" r="${kind === 'city' ? 9 : 7}"/>` : '')
    + `<text x="${lx}" y="${ly}">${esc(name)}</text></g>`
}).join('\n')

const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid meet">
<!-- Карта собрана scripts/make-map-greece.mjs из Natural Earth 10m (public domain).
     Подписи — только названия из §20 учебника. Границ государств нет намеренно. -->
<defs>
  <clipPath id="clipGreece"><path d="${dGrc}"/></clipPath>
  <filter id="soft" x="-20%" y="-20%" width="140%" height="140%">
    <feGaussianBlur stdDeviation="13"/>
  </filter>
  <filter id="blur" x="-5%" y="-5%" width="110%" height="110%">
    <feGaussianBlur stdDeviation="5"/>
  </filter>
</defs>
<style>
  /* 🔴 «При переходе разного зума надписи трясутся» (05.08). Кегль подписи задаётся
     переменной, которую урок пересчитывает при каждом наезде; сама переменная менялась
     СКАЧКОМ, а карта в этот момент ехала две с лишним секунды — на едущей карте это
     читается как дрожь. Объявляем переменную через @property (иначе она не умеет
     интерполироваться) и везём её тем же переходом, что и наезд. У самой подписи
     перехода по кеглю больше нет: два перехода на одном свойстве и давали рывки. */
  /* ⚠️ Сами переменные регистрируются НЕ здесь, а в уроке через CSS.registerProperty.
     Запись syntax с угловыми скобками внутри style ломает SVG как XML: скобки
     разбираются как открывающий тег, и файл перестаёт быть картинкой вовсе —
     в панели оставалась чёрная дыра. */
  svg{transition:--fs 2.4s cubic-bezier(.32,.72,.28,1),--fsw 2.4s cubic-bezier(.32,.72,.28,1)}
  /* 🔴 «Хочется чуть более дорого: чётче шрифты, больше контраста, плавнее анимации».
     Море стало глубже, суша теплее и светлее, берег темнее — вода и земля больше не
     сливаются в одну пастель. Тень у берега (мягкая тёмная линия под сушей) даёт
     глубину, которой не бывает у плоской заливки. */
  .sea{fill:#A9CBE0}
  .land{fill:#F0E4C6}
  .shelf{fill:none;stroke:#7E9DB4;stroke-width:9;stroke-linejoin:round;opacity:.5;filter:url(#blur)}
  .coast{fill:none;stroke:#7A6540;stroke-width:1.9;stroke-linejoin:round;stroke-linecap:round}
  .zone{fill:#C4551F;opacity:0;transition:opacity 1.1s cubic-bezier(.3,.7,.3,1)}
  .zone.on{opacity:.44}
  /* Подписи по умолчанию приглушены: на карте их четырнадцать, и все разом читаются
     как каша. Голос ведёт по одной — она и загорается.
     Размер — через переменную: при наезде урок гасит его встречным масштабом,
     иначе на 2.4× подпись занимает всю коробку. */
  .mk text{font-family:Georgia,'Times New Roman',serif;font-weight:600;font-size:var(--fs,34px);
    letter-spacing:.6px;fill:#3A2C18;text-anchor:middle;
    paint-order:stroke;stroke:#F6EFDD;stroke-width:var(--fsw,7px);stroke-linejoin:round;
    opacity:.5;transition:opacity .8s cubic-bezier(.3,.7,.3,1),fill .8s ease}
  .mk.sea text{font-style:italic;fill:#33586F;stroke:#C7DEEC;font-weight:400;letter-spacing:1.4px}
  .mk .dot{fill:#8C3B1B;stroke:#F6EFDD;stroke-width:2.4;opacity:.5;transition:opacity .8s ease,r .8s cubic-bezier(.3,.7,.3,1)}
  .mk .lead{stroke:#7A6540;stroke-width:2.2;fill:none;opacity:.32;transition:opacity .8s ease}
  .mk .halo{fill:#C8442A;opacity:0;filter:url(#soft);transition:opacity .9s ease}
  .mk.on text{opacity:1;font-size:calc(var(--fs,34px)*1.26);fill:#8C3B1B}
  .mk.on .dot,.mk.on .lead{opacity:1}
  .mk.on .halo{opacity:.34}
  .mk.dim text,.mk.dim .dot,.mk.dim .lead{opacity:.14}
</style>
<rect class="sea" x="0" y="0" width="${W}" height="${H}"/>
<path class="shelf" d="${dCoast}"/>
<path class="land" d="${dAll}"/>
<g clip-path="url(#clipGreece)">
  <path class="zone" id="zone-north" d="${zonePath(ZONES.north)}"/>
  <path class="zone" id="zone-middle" d="${zonePath(ZONES.middle)}"/>
  <path class="zone" id="zone-south" d="${zonePath(ZONES.south)}"/>
</g>
<path class="coast" d="${dCoast}"/>
${marks}
</svg>
`
fs.mkdirSync(path.dirname(OUT), { recursive: true })
fs.writeFileSync(OUT, svg)
console.log('→ ' + OUT + '  ' + W + '×' + H + '  ' + (svg.length / 1024).toFixed(0) + ' КБ · меток ' + MARKS.length)
