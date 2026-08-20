#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════════════════
//  КАРТИНКИ ДЛЯ ВЫБОРА УЧИТЕЛЯ (кнопка рядом с аватаром)
//
//  Зачем скрипт, а не «положить файлы руками»: лицо выбирают ГЛАЗАМИ, а лежат
//  исходники в четырёх разных местах и в четырёх разных видах —
//    · Anam: портрет 768×1152 по сети + ролик простоя 1152×768 (ЛАНДШАФТ!);
//    · bitHuman: кадр 768×1368 и десятисекундный ролик на 10 МБ;
//    · 3D: вообще не картинка, а модель — снимок делаем браузером.
//  Руками это не повторить одинаково, а карточки обязаны быть одного размера и
//  одной обрезки, иначе выбор превращается в разнобой.
//
//  Что на выходе (.tmp/sketches/tutor/lica/):
//    <ключ>.jpg  — портрет 3:4, 300×400, для карточки
//    <ключ>.mp4  — 6-секундная петля простоя, 300×400, БЕЗ звука, ~100 КБ
//
//  ⚠️ Ролик простоя — самое ценное в выборе: по нему видно, ЖИВЁТ ли лицо, когда
//  молчит. Ровно на этом bitHuman и провалился (замер .planning/SESSION-2026-08-19-ANAM.md).
//
//  node scripts/make-avatar-cards.mjs            # всё
//  node scripts/make-avatar-cards.mjs --no-3d    # без браузера (быстро)
// ═══════════════════════════════════════════════════════════════════════════
import fs from 'node:fs'
import path from 'node:path'
import { execFileSync } from 'node:child_process'

const OUT = '.tmp/sketches/tutor/lica'
const СТЕНД = process.env.KNIGA_URL || 'http://localhost:8781'
const БЕЗ3D = process.argv.includes('--no-3d')

// Карточка = 300×400 (3:4). Больше не нужно: в панели она показывается на 150 px,
// удвоение — под экраны с плотными точками.
const Ш = 300, В = 400

if (!fs.existsSync('scripts/yandex-test-server.mjs')) {
  console.error('Запускать из корня репозитория Klassio')
  process.exit(2)
}
fs.mkdirSync(OUT, { recursive: true })

const ff = (args) => execFileSync('ffmpeg', ['-y', '-loglevel', 'error', ...args], { stdio: ['ignore', 'ignore', 'inherit'] })
const кб = (f) => Math.round(fs.statSync(f).size / 1024) + ' КБ'

// ── обрезка «портрет из чего угодно» ───────────────────────────────────────
// Ландшафтный кадр Anam (1152×768) режем по центру в 3:4 — лицо у них посередине.
// Портретный (768×1152) просто ужимаем. Одна строка фильтра на оба случая:
// сначала увеличиваем по короткой стороне, потом отрезаем лишнее по центру.
const ФИЛЬТР = `scale=${Ш}:${В}:force_original_aspect_ratio=increase,crop=${Ш}:${В}`

const ФОТО = (из, ключ) => { ff(['-i', из, '-vf', ФИЛЬТР, '-q:v', '4', path.join(OUT, ключ + '.jpg')]); return path.join(OUT, ключ + '.jpg') }
// Петля простоя: 6 секунд, без звука, 20 кадров в секунду. Дальше карточка крутит
// её сама (loop) — шести секунд хватает, чтобы увидеть моргание и микродвижение.
const ПЕТЛЯ = (из, ключ, ss = 0) => {
  const к = path.join(OUT, ключ + '.mp4')
  ff(['-ss', String(ss), '-t', '6', '-i', из, '-an', '-vf', ФИЛЬТР + ',fps=20',
    '-c:v', 'libx264', '-crf', '31', '-preset', 'slow', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', к])
  return к
}

// ═══ 1. Anam: пять лиц, отобранных 19.08 и отправленных Владимиру ═══════════
// Идентификаторы — из .planning/SESSION-2026-08-19-ANAM.md, раздел «что отправлено».
// ⚠️ Лица матчим ПО id, не по имени: у Anam два разных Chloe (illustrated и realistic).
const ANAM = [
  { ключ: 'anam-liv', id: '071b0286-4cce-4808-bee2-e642f1062de3' },
  { ключ: 'anam-mia', id: 'edf6fdcb-acab-44b8-b974-ded72665ee26' },
  { ключ: 'anam-cara', id: '960f614f-ea88-47c3-9883-f02094f70874' },
  { ключ: 'anam-chloe', id: '4b0cf5fe-812a-4611-b7ed-cf0c362860da' },
  { ключ: 'anam-sophie', id: '6dbc1e47-7768-403e-878a-94d7fcc3677b' },
]

console.log('── Anam: пять лиц ──')
let каталог = []
try { каталог = JSON.parse(fs.readFileSync('.tmp/anam-all.json', 'utf8')) } catch {
  console.log('  ⚠ нет .tmp/anam-all.json — сначала: node scripts/anam-galereya.mjs')
}
const ВРЕМ = '.tmp/facesrc'
fs.mkdirSync(ВРЕМ, { recursive: true })

for (const a of ANAM) {
  const зап = каталог.find((x) => x.id === a.id)
  // Портрет 768×1152 — ровно та рамка, в которой лицо потом ведёт урок.
  // Берём его, а не квадратный imageUrl: иначе на карточке одна обрезка, в уроке другая.
  const url = зап && (зап.portraitImageUrl || зап.imageUrl)
  const сырое = path.join(ВРЕМ, a.ключ + '-src.webp')
  if (url && !fs.existsSync(сырое)) {
    const r = await fetch(url)
    if (!r.ok) { console.log(`  ⚠ ${a.ключ}: портрет не скачался (HTTP ${r.status})`); continue }
    fs.writeFileSync(сырое, Buffer.from(await r.arrayBuffer()))
  }
  if (!fs.existsSync(сырое)) { console.log(`  ⚠ ${a.ключ}: нечем сделать фото`); continue }
  ФОТО(сырое, a.ключ)
  // Ролик простоя уже скачан галереей — сеть не трогаем.
  const idle = `.tmp/anam-galereya/idle/${a.id}.mp4`
  let ролик = ''
  if (fs.existsSync(idle)) ролик = ПЕТЛЯ(idle, a.ключ, 1)
  else console.log(`  ⚠ ${a.ключ}: нет ролика простоя — карточка будет без наведения`)
  console.log(`  ${a.ключ.padEnd(12)} фото ${кб(path.join(OUT, a.ключ + '.jpg'))}` + (ролик ? ` · петля ${кб(ролик)}` : ''))
}

// ═══ 2. bitHuman: одно живое лицо ══════════════════════════════════════════
// Живьём у bitHuman работает ТОЛЬКО essence-1 «anya» (раннер /avatars отдаёт её одну).
// essence-2 на чужом сервере не поддерживается — чёрное окно, поймано 19.08.
console.log('── bitHuman ──')
if (fs.existsSync('.tmp/bh/anya-bh-face.jpg')) {
  ФОТО('.tmp/bh/anya-bh-face.jpg', 'bh-anya')
  const из = fs.existsSync('.tmp/bh/anya-bh-idle.mp4') ? '.tmp/bh/anya-bh-idle.mp4' : ''
  const ролик = из ? ПЕТЛЯ(из, 'bh-anya', 1) : ''
  console.log(`  bh-anya      фото ${кб(path.join(OUT, 'bh-anya.jpg'))}` + (ролик ? ` · петля ${кб(ролик)}` : ''))
} else console.log('  ⚠ нет .tmp/bh/anya-bh-face.jpg — карточка bitHuman будет без картинки')

// ═══ 3. 3D-учительницы: снимок делает браузер ══════════════════════════════
// Модель нельзя «сфотографировать» без движка, поэтому открываем сам урок, ставим
// нужную учительницу и снимаем холст. Заодно это проверка, что модель вообще грузится.
if (!БЕЗ3D) {
  console.log('── 3D: снимаю холст через браузер ──')
  // ⚠️ Браузер playwright ставится отдельно (`npx playwright install chromium`).
  // Его отсутствие НЕ должно ронять весь скрипт: пять лиц Anam и bitHuman к этому
  // моменту уже нарезаны, и терять их из-за снимка 3D глупо.
  let br = null, pg = null
  try {
    const { chromium } = await import('playwright')
    br = await chromium.launch()
    pg = await br.newPage({ viewport: { width: 1280, height: 900 }, deviceScaleFactor: 2 })
  } catch (e) {
    console.log('  ⚠ браузер не поднялся: ' + (e.message || '').split('\n')[0])
    console.log('    поставить: npx playwright install chromium')
  }
  if (pg) try {
    await pg.goto(СТЕНД + '/kniga', { waitUntil: 'domcontentloaded', timeout: 60000 })
    await pg.waitForFunction('!!window.__kniga', null, { timeout: 60000 })
    // ⚠️ Снимок элемента у playwright — это вырез ЭКРАНА по рамке элемента, а не сам
    // элемент: плашка цены и кнопка выбора, которые лежат поверх окна учителя, попадали
    // прямо в карточку. Гасим всё, что висит над холстом.
    await pg.addStyleTag({ content: '#tchBadge,#faceBtn,#anamOv{display:none !important}' })
    for (const [ключ, slug] of [['3d-avaturn', 'av-avaturn'], ['3d-brunette', 'av-brunette']]) {
      await pg.evaluate((s) => window.__kniga.setTeacher(s), slug)
      // модель приезжает файлом на 3 МБ — ждём, пока в сцене появятся меши
      await pg.waitForFunction('window.__kniga.teacher().есть === true', null, { timeout: 60000 })
      await pg.waitForTimeout(2500)               // дать кадру отрисоваться и позе устояться
      const врем = path.join(ВРЕМ, ключ + '-src.png')
      await pg.locator('#tchCanvas').screenshot({ path: врем })
      ФОТО(врем, ключ)
      console.log(`  ${ключ.padEnd(12)} фото ${кб(path.join(OUT, ключ + '.jpg'))}`)
    }
  } catch (e) {
    console.log('  ⚠ снимок 3D не вышел: ' + e.message)
    console.log('    (стенд поднят? node scripts/yandex-test-server.mjs)')
  }
  if (br) await br.close()
}

const всего = fs.readdirSync(OUT).reduce((s, f) => s + fs.statSync(path.join(OUT, f)).size, 0)
console.log(`\n→ ${OUT}: ${fs.readdirSync(OUT).length} файлов, ${(всего / 1048576).toFixed(2)} МБ`)
