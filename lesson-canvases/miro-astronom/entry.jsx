// ============================================================================
// Klassio — канвас «Урок-карта» (Miro-режим) · урок «Мир глазами астронома»
// ----------------------------------------------------------------------------
// БОЕВАЯ live-версия Miro-спайка (.tmp/spikes/miro-lesson): один бесконечный
// холст tldraw 3.15.6, 7 фреймов-досок змейкой (cover → etymology → bodies →
// solar → sunEarth → facts → reward) + коннекторы-маршрут. Камера на рельсах,
// у ребёнка НЕТ пана/зума/редактирования (ЗАКОН). Работает ВНУТРИ iframe
// tutor-lesson[-ru].tsx через контракт window.__klassioEngine — голосовой слой
// (Sber/11labs) дёргает те же методы, что дёргала режиссёрская панель спайка.
//
// Live-отличия от спайка (несовместимости вскрыты разведкой 2026-07-03):
//   - engine = СТАБИЛЬНЫЙ объект, создаётся один раз (React назначает колбэки
//     как свойства СПУСТЯ время — пересоздание объекта их теряло);
//   - никакой фейковой речи: caption/status/чат только от React
//     (setCaption/setStatus/pushBubble); setStatus перезатирает caption — иначе
//     «Соединяюсь…» висит вечно (паттерн anya.html);
//   - pushBubble рисует ЧАТ и флипает статус (tutor→speaking, child→listening);
//   - кнопка старта скрыта до engine.showStartButton() (управляет React);
//   - TaskOverlay: нет «закрыть» (taskActiveRef в React иначе виснет навсегда),
//     step.explain НЕ показывается (его озвучивает Аня), onWrong дебаунс 1500мс;
//   - onPlanetClick шлёт РУССКОЕ имя («Земля»), не ключ;
//   - startTimer с гардом от повторного вызова (reconnect);
//   - reveal-группы проявляются АВТОМАТИЧЕСКИ после прилёта к доске (в голосовом
//     слое нет тулза reveal — v1-аппроксимация «в такт речи»);
//   - onSolve дедуп по step.id внутри канваса (как anya.html).
//
// ?debug=1 — режиссёрская панель/лог/демо для ручного теста без голоса.
//
// Сборка (из корня репо):
//   cmd /c "node_modules\tsx\node_modules\@esbuild\win32-x64\esbuild.exe lesson-canvases\miro-astronom\entry.jsx --bundle --outfile=public\tutor\miro\bundle.js --jsx=automatic --define:process.env.NODE_ENV=\"production\" --minify"
// ============================================================================

import React, { useCallback, useEffect, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { Tldraw, createShapeId, toRichText, EASINGS, AssetRecordType } from 'tldraw'

const DEBUG = new URLSearchParams(location.search).has('debug')

// ============================== ДАННЫЕ УРОКА ================================
// Контент 1:1 из боевого public/tutor/anya.html (window.LESSON). ПОРЯДОК задач
// менять НЕЛЬЗЯ: show_trainer резолвит task-N как N-й элемент массива.

const BOARD_ORDER = ['cover', 'etymology', 'bodies', 'solar', 'sunEarth', 'facts', 'reward']
// Слайды урока для счётчика «N / M» вверху — reward это финал, не слайд.
const CONTENT_BOARDS = ['cover', 'etymology', 'bodies', 'solar', 'sunEarth', 'facts']

const BOARD_TITLES = {
  cover: 'Обложка', etymology: 'Астрономия', bodies: 'Небесные тела',
  solar: 'Солнечная система', sunEarth: 'Солнце и Земля', facts: 'Факты', reward: 'Финал',
}

const TASKS = [
  { type: 'task', id: 'q1', board: 'etymology', variant: 'choice', skill: 'astronomy-meaning',
    intro: 'Проверим: что означает слово «астрономия»?',
    q: 'Что означает слово «астрономия» с греческого?',
    options: [{ t: 'Звезда + книга' }, { t: 'Звезда + закон', correct: true }, { t: 'Небо + наблюдение' }, { t: 'Солнце + измерение' }],
    hints: ['Слово составное: первая часть про небесные тела, вторая — про правила.', '«Астрон» — это звезда. А «номос» в Древней Греции значило «закон».'],
    explain: 'Точно! «Астрон» — звезда, «номос» — закон. Астрономия буквально значит «закон звёзд».' },
  { type: 'task', id: 'q3', board: 'etymology', variant: 'choice', skill: 'astronomy-history',
    intro: 'А как думаешь, давно ли появилась астрономия?',
    q: 'Когда возникла астрономия?',
    options: [{ t: 'Сто лет назад' }, { t: 'Тысячу лет назад' }, { t: 'Несколько тысяч лет назад', correct: true }, { t: 'Недавно — в XX веке' }],
    hints: ['Древние греки и египтяне уже умели наблюдать за звёздами.', 'Аристотель жил больше 2000 лет назад — и уже тогда изучали звёзды.'],
    explain: 'Точно! Астрономия — одна из самых древних наук.' },
  { type: 'task', id: 'q2', board: 'bodies', variant: 'blank', skill: 'celestial-bodies',
    intro: 'Впиши пропущенное слово.',
    q: 'Астрономия изучает ____ тела.', answer: 'небесные',
    hints: ['На ночном небе мы видим звёзды, Луну, планеты. Как назвать их одним словом?', 'Всё, что «висит в небе» — это … тела.'],
    explain: 'Верно! Небесные тела — это всё в космосе.' },
  { type: 'task', id: 'q4', board: 'bodies', variant: 'choice', skill: 'stars-vs-planets',
    intro: 'Важный вопрос про звёзды и планеты.',
    q: 'Чем звёзды отличаются от планет?',
    options: [{ t: 'Звёзды светят сами, планеты отражают свет', correct: true }, { t: 'Звёзды меньше планет' }, { t: 'Планеты горячее звёзд' }, { t: 'Звёзды не движутся, а планеты движутся' }],
    hints: ['Почему днём мы не видим звёзд, но видим Солнце?', 'Звёзды — раскалённые газовые шары. А планеты холодные.'],
    explain: 'Верно! Звёзды светят сами, планеты — отражённым светом.' },
  { type: 'task', id: 'q5', board: 'solar', variant: 'choice', skill: 'solar-system',
    intro: 'Можешь покрутить систему на доске. Итак…',
    q: 'Что такое Солнечная система?',
    options: [{ t: 'Все звёзды на небе' }, { t: 'Только Земля и Луна' }, { t: 'Солнце и всё, что движется вокруг него', correct: true }, { t: 'Только 8 планет, без Солнца' }],
    hints: ['В самом названии есть подсказка — система «вокруг Солнца».', 'Это Солнце + 8 планет + их спутники + кометы + астероиды.'],
    explain: 'Точно! Солнце и всё, что движется вокруг него.' },
  { type: 'task', id: 'q6', board: 'solar', variant: 'choice', skill: 'planets-count',
    intro: 'А сколько в ней планет?',
    q: 'Сколько планет в Солнечной системе?',
    options: [{ t: '7' }, { t: '8', correct: true }, { t: '9' }, { t: '10' }],
    hints: ['Раньше считали 9 — но Плутон отнесли к карликовым планетам.', 'Меркурий, Венера, Земля, Марс, Юпитер, Сатурн, Уран, Нептун — посчитай.'],
    explain: 'Верно! 8 планет.' },
  { type: 'task', id: 'q7', board: 'solar', variant: 'choice', skill: 'solar-center',
    intro: 'А что же в самом центре?',
    q: 'Что в центре Солнечной системы?',
    options: [{ t: 'Земля' }, { t: 'Солнце', correct: true }, { t: 'Юпитер' }, { t: 'Луна' }],
    hints: ['Подсказка в названии: «Солнечная система».', 'Все планеты вращаются вокруг этого жёлто-оранжевого шара.'],
    explain: 'Точно! В центре — звезда Солнце.' },
  { type: 'task', id: 'q8', board: 'sunEarth', variant: 'choice', skill: 'sun-is-star',
    intro: 'Тогда скажи мне…',
    q: 'Солнце — это…',
    options: [{ t: 'Планета' }, { t: 'Спутник' }, { t: 'Звезда', correct: true }, { t: 'Комета' }],
    hints: ['Оно излучает свет и тепло само — что это значит?', 'Только один тип небесных тел светит сам, а не отражает свет.'],
    explain: 'Верно! Солнце — ближайшая к нам звезда.' },
  { type: 'task', id: 'q9', board: 'sunEarth', variant: 'blank', skill: 'sun-diameter',
    intro: 'Впиши число.',
    q: 'Диаметр Солнца в ____ раз больше диаметра Земли.', answer: '109',
    hints: ['Это число близко к сотне — но больше.', 'Рядом с горошиной положить теннисный мяч — так выглядят Земля и Солнце.'],
    explain: 'Верно! В 109 раз.' },
  { type: 'task', id: 'q10', board: 'sunEarth', variant: 'blank', skill: 'sun-mass',
    intro: 'И ещё одно число.',
    q: 'Масса Солнца в ____ тысяч раз больше массы Земли.', answer: '330',
    hints: ['Это трёхзначное число.', 'Это 330 — действительно очень тяжёлое Солнце!'],
    explain: 'Точно! В 330 тысяч раз.' },
  { type: 'task', id: 'q11', board: 'facts', variant: 'blank', skill: 'sun-distance',
    intro: 'Сколько до Солнца? Впиши число.',
    q: 'Расстояние от Земли до Солнца — около ____ миллионов км.', answer: '150',
    hints: ['Это трёхзначное число.', '150 миллионов — невероятно далеко!'],
    explain: 'Верно! 150 миллионов км.' },
  { type: 'task', id: 'q12', board: 'facts', variant: 'choice', skill: 'sun-temperature',
    intro: 'А насколько там горячо?',
    q: 'Какая температура на поверхности Солнца?',
    options: [{ t: '100 °C' }, { t: '1 000 °C' }, { t: '6 000 °C', correct: true }, { t: '100 000 °C' }],
    hints: ['Вода кипит при 100 °C. В огне — больше 1000 °C. На Солнце ещё горячее.', 'Это четырёхзначное число, начинается с шестёрки.'],
    explain: 'Точно! ≈ 6 000 °C.' },
  { type: 'task', id: 'q13', board: 'facts', variant: 'choice', skill: 'sun-safety',
    intro: 'И самое важное правило безопасности.',
    q: 'Почему нельзя смотреть прямо на Солнце?',
    options: [{ t: 'Слишком далеко' }, { t: 'Можно сильно повредить глаза', correct: true }, { t: 'Это запрещено по закону' }, { t: 'Оно слишком маленькое' }],
    hints: ['Солнце светит очень-очень ярко.', 'Зрение можно повредить даже за минуту прямого взгляда.'],
    explain: 'Верно! Только через тёмные фильтры.' },
]

const PLANETS = [
  { key: 'mercury', name: 'Меркурий', size: 46, fact: 'Самая маленькая и быстрая планета: год на ней длится всего 88 дней.' },
  { key: 'venus', name: 'Венера', size: 60, fact: 'Самая горячая планета — плотные облака держат жару до +460 °C.' },
  { key: 'earth', name: 'Земля', size: 64, fact: 'Наш дом! Единственная известная планета, где есть жизнь.' },
  { key: 'mars', name: 'Марс', size: 54, fact: 'Красная планета: цвет — от ржавого железа в песке.' },
  { key: 'jupiter', name: 'Юпитер', size: 132, fact: 'Гигант! Юпитер тяжелее всех остальных планет вместе взятых.' },
  { key: 'saturn', name: 'Сатурн', size: 150, fact: 'Знаменит кольцами — они изо льда и камней.' },
  { key: 'uranus', name: 'Уран', size: 86, fact: 'Лежит на боку и «катится» по своей орбите.' },
  { key: 'neptune', name: 'Нептун', size: 82, fact: 'Самая ветреная планета: ветра до 2 000 км/ч.' },
]

const MIC_CAP = { listening: 'Слушаю тебя', speaking: 'говорит…', thinking: 'думает…' }

// Демо-реплики — ТОЛЬКО для ?debug=1 без подключённого голоса.
const DEBUG_LINES = {
  overview: ['Смотри — вот весь наш сегодняшний путь: шесть остановок.'],
  cover: ['Итак, наш первый урок — «Мир глазами астронома».'],
  etymology: ['Науку о небесных телах назвали астрономия: «астрон» — звезда, «номос» — закон.'],
  bodies: ['Звёзды светят сами, а планеты только отражают свет.'],
  solar: ['Вокруг Солнца по орбитам движутся 8 планет.'],
  sunEarth: ['Диаметр Солнца в 109 раз больше земного!'],
  facts: ['До Солнца — 150 миллионов километров.'],
  reward: ['Отлично! Урок пройден.'],
}

// ============================ ГЕОМЕТРИЯ КАРТЫ ===============================

const FW = 1500
const FH = 1000
const GX = 1900
const GY = 1400

const FRAME_POS = {
  cover: { x: 0, y: 0 }, etymology: { x: GX, y: 0 }, bodies: { x: GX * 2, y: 0 }, solar: { x: GX * 3, y: 0 },
  sunEarth: { x: GX * 3, y: GY }, facts: { x: GX * 2, y: GY }, reward: { x: GX, y: GY },
}

const FRAME_IDS = Object.fromEntries(BOARD_ORDER.map((b) => [b, createShapeId('frame-' + b)]))

// Сколько reveal-групп у каждой доски (для авто-reveal).
const REVEAL_GROUPS = { etymology: 3, bodies: 2, solar: 2, sunEarth: 2, facts: 3 }

// ============================ УТИЛИТЫ КАНВАСА ===============================

const FADE_MS = 750

function fadeShape(editor, id, target, delayMs = 0, ms = FADE_MS) {
  const run = () => {
    const from = editor.getShape(id)?.opacity ?? 0
    const start = performance.now()
    const tick = () => {
      const shape = editor.getShape(id)
      if (!shape) return
      const t = Math.min(1, (performance.now() - start) / ms)
      const eased = 1 - Math.pow(1 - t, 3)
      try { editor.updateShape({ id, type: shape.type, opacity: from + (target - from) * eased }) } catch { return }
      if (t < 1) requestAnimationFrame(tick)
    }
    requestAnimationFrame(tick)
  }
  if (delayMs > 0) setTimeout(run, delayMs)
  else run()
}

function txt(editor, parentId, x, y, text, opts = {}) {
  const id = createShapeId()
  editor.createShape({
    id, type: 'text', parentId, x, y,
    opacity: opts.reveal ? 0 : 1,
    meta: opts.reveal ? { revealGroup: opts.reveal } : {},
    props: {
      richText: toRichText(text),
      color: opts.color || 'black',
      size: opts.size || 'm',
      font: opts.font || 'sans',
      textAlign: opts.align || 'start',
      autoSize: true,
      scale: opts.scale || 1,
    },
  })
  return id
}

function note(editor, parentId, x, y, text, opts = {}) {
  const id = createShapeId()
  editor.createShape({
    id, type: 'note', parentId, x, y,
    opacity: opts.reveal ? 0 : 1,
    meta: opts.reveal ? { revealGroup: opts.reveal } : {},
    props: {
      richText: toRichText(text),
      color: opts.color || 'yellow',
      size: opts.size || 's',
      scale: opts.scale || 1.35,
    },
  })
  return id
}

function geo(editor, parentId, x, y, w, h, opts = {}) {
  const id = createShapeId()
  editor.createShape({
    id, type: 'geo', parentId, x, y,
    opacity: opts.reveal ? 0 : (opts.opacity ?? 1),
    meta: opts.reveal ? { revealGroup: opts.reveal } : {},
    props: {
      geo: opts.geo || 'rectangle', w, h,
      color: opts.color || 'black',
      fill: opts.fill || 'none',
      dash: opts.dash || 'solid',
      size: opts.strokeSize || 'm',
    },
  })
  return id
}

function img(editor, parentId, x, y, w, h, src, meta = {}, opts = {}) {
  const assetId = AssetRecordType.createId()
  editor.createAssets([{
    id: assetId, typeName: 'asset', type: 'image', meta: {},
    props: { name: src, src: new URL(src, location.href).href, w: 512, h: 512, mimeType: 'image/png', isAnimated: false },
  }])
  const id = createShapeId()
  editor.createShape({
    id, type: 'image', parentId, x, y,
    opacity: opts.reveal ? 0 : 1,
    meta: { ...meta, ...(opts.reveal ? { revealGroup: opts.reveal } : {}) },
    props: { assetId, w, h },
  })
  return id
}

// ========================== ПОСТРОЕНИЕ КАРТЫ УРОКА ==========================

function buildLessonMap(editor) {
  for (const b of BOARD_ORDER) {
    editor.createShape({
      id: FRAME_IDS[b], type: 'frame', x: FRAME_POS[b].x, y: FRAME_POS[b].y,
      props: { w: FW, h: FH, name: BOARD_TITLES[b] },
    })
  }

  // Коннекторы-маршрут. parentId=page ОБЯЗАТЕЛЕН: без него tldraw авто-парентит
  // стрелку к фрейму под якорем (0,0) и фрейм клипает её в невидимость.
  const conn = (from, to, x1, y1, x2, y2) => {
    const id = createShapeId('conn-' + from + '-' + to)
    editor.createShape({
      id, type: 'arrow', parentId: editor.getCurrentPageId(), x: 0, y: 0, opacity: 0.85,
      meta: { connector: from + '->' + to },
      props: {
        start: { x: x1, y: y1 }, end: { x: x2, y: y2 },
        color: 'orange', size: 'xl', dash: 'dashed',
        arrowheadStart: 'none', arrowheadEnd: 'arrow',
      },
    })
  }
  conn('cover', 'etymology', FW + 60, 500, GX - 60, 500)
  conn('etymology', 'bodies', GX + FW + 60, 500, GX * 2 - 60, 500)
  conn('bodies', 'solar', GX * 2 + FW + 60, 500, GX * 3 - 60, 500)
  conn('solar', 'sunEarth', GX * 3 + FW / 2, FH + 60, GX * 3 + FW / 2, GY - 60)
  conn('sunEarth', 'facts', GX * 3 - 60, GY + 500, GX * 2 + FW + 60, GY + 500)
  conn('facts', 'reward', GX * 2 - 60, GY + 500, GX + FW + 60, GY + 500)

  const cover = FRAME_IDS.cover
  img(editor, cover, 1050, 80, 360, 360, 'planets/sun.png')
  img(editor, cover, 120, 620, 200, 200, 'planets/moon.png')
  txt(editor, cover, 110, 220, 'Мир глазами\nастронома', { size: 'xl', scale: 2.2, color: 'violet' })
  txt(editor, cover, 115, 560, 'Окружающий мир · 4 класс · Урок 1', { size: 'l', color: 'grey' })
  note(editor, cover, 1080, 620, 'Сегодня: 6 остановок\nи 13 заданий', { color: 'light-blue' })

  const ety = FRAME_IDS.etymology
  txt(editor, ety, 90, 70, 'Что такое астрономия?', { size: 'xl', scale: 1.3, color: 'black' })
  txt(editor, ety, 300, 230, 'АСТРОНОМИЯ', { size: 'xl', scale: 1.6, color: 'violet', reveal: 'etymology:1' })
  note(editor, ety, 200, 450, '«астрон»\n= звезда', { color: 'yellow', reveal: 'etymology:2', scale: 1.5 })
  txt(editor, ety, 640, 520, '+', { size: 'xl', scale: 2, color: 'grey', reveal: 'etymology:2' })
  note(editor, ety, 820, 450, '«номос»\n= закон', { color: 'light-blue', reveal: 'etymology:2', scale: 1.5 })
  note(editor, ety, 430, 740, '= «закон звёзд»\nодна из древнейших наук!', { color: 'green', reveal: 'etymology:3', scale: 1.4 })

  const bod = FRAME_IDS.bodies
  txt(editor, bod, 90, 80, 'Небесные тела', { size: 'xl', scale: 1.3 })
  note(editor, bod, 110, 260, 'Звёзды\nраскалённые шары,\nсветят САМИ', { color: 'yellow', reveal: 'bodies:1', scale: 1.45 })
  note(editor, bod, 480, 260, 'Планеты\nхолодные, отражают\nсвет звёзд', { color: 'light-blue', reveal: 'bodies:1', scale: 1.45 })
  note(editor, bod, 110, 620, 'Спутники\nкрутятся вокруг планет\n(у Земли — Луна)', { color: 'grey', reveal: 'bodies:2', scale: 1.45 })
  note(editor, bod, 480, 620, 'Кометы\nледяные глыбы\nс хвостом', { color: 'light-violet', reveal: 'bodies:2', scale: 1.45 })
  img(editor, bod, 990, 300, 180, 180, 'planets/sun.png', {}, { reveal: 'bodies:1' })
  img(editor, bod, 1090, 560, 150, 150, 'planets/earth.png', {}, { reveal: 'bodies:1' })
  img(editor, bod, 960, 660, 110, 110, 'planets/moon.png', {}, { reveal: 'bodies:2' })

  const sol = FRAME_IDS.solar
  txt(editor, sol, 90, 60, 'Солнечная система', { size: 'xl', scale: 1.3 })
  img(editor, sol, 40, 330, 340, 340, 'planets/sun.png', { planet: 'sun', planetName: 'Солнце' })
  const sunCx = 210, sunCy = 500
  for (let i = 0; i < 8; i++) {
    const rx = 320 + i * 130
    geo(editor, sol, sunCx - rx, sunCy - rx * 0.72, rx * 2, rx * 1.44,
      { geo: 'ellipse', color: 'grey', dash: 'dotted', strokeSize: 's', reveal: 'solar:1' })
  }
  let px = 440
  for (const p of PLANETS) {
    img(editor, sol, px, sunCy - p.size / 2 - (p.key === 'saturn' ? 14 : 0), p.size, p.size,
      'planets/' + p.key + '.png', { planet: p.key, planetName: p.name }, { reveal: 'solar:2' })
    txt(editor, sol, px - 6, sunCy + 90, p.name, { size: 's', color: 'grey', reveal: 'solar:2' })
    px += p.size + 62
  }
  note(editor, sol, 1080, 120, 'Нажми на планету —\nрасскажу про неё!', { color: 'light-green', reveal: 'solar:2' })

  const se = FRAME_IDS.sunEarth
  txt(editor, se, 90, 70, 'Солнце и Земля', { size: 'xl', scale: 1.3 })
  img(editor, se, 90, 240, 560, 560, 'planets/sun.png', {}, { reveal: 'sunEarth:1' })
  img(editor, se, 850, 480, 46, 46, 'planets/earth.png', {}, { reveal: 'sunEarth:1' })
  txt(editor, se, 260, 830, 'Солнце', { size: 'l', color: 'orange', reveal: 'sunEarth:1' })
  txt(editor, se, 820, 560, 'Земля', { size: 'l', color: 'blue', reveal: 'sunEarth:1' })
  note(editor, se, 1010, 240, 'Диаметр\n× 109', { color: 'orange', reveal: 'sunEarth:2', scale: 1.5 })
  note(editor, se, 1010, 560, 'Масса\n× 330 000', { color: 'red', reveal: 'sunEarth:2', scale: 1.5 })

  const fac = FRAME_IDS.facts
  txt(editor, fac, 90, 70, 'Интересные факты', { size: 'xl', scale: 1.3 })
  note(editor, fac, 110, 250, 'До Солнца\n150 000 000 км\n(на машине — 170 лет!)', { color: 'light-blue', reveal: 'facts:1', scale: 1.5 })
  note(editor, fac, 560, 250, 'Поверхность 6 000 °C\nв центре —\nдо 20 миллионов', { color: 'orange', reveal: 'facts:2', scale: 1.5 })
  note(editor, fac, 1010, 250, 'Важно!\nНа Солнце нельзя\nсмотреть без тёмных\nфильтров', { color: 'red', reveal: 'facts:3', scale: 1.5 })
  img(editor, fac, 480, 640, 240, 240, 'planets/sun.png', {}, { reveal: 'facts:2' })

  const rew = FRAME_IDS.reward
  geo(editor, rew, 240, 120, 120, 120, { geo: 'star', color: 'yellow', fill: 'solid' })
  geo(editor, rew, 660, 70, 170, 170, { geo: 'star', color: 'orange', fill: 'solid' })
  geo(editor, rew, 1130, 130, 110, 110, { geo: 'star', color: 'yellow', fill: 'solid' })
  txt(editor, rew, 330, 350, 'Урок пройден!', { size: 'xl', scale: 2, color: 'green' })
  note(editor, rew, 180, 620, 'Ты узнал:\nастрономия · небесные тела\nСолнечная система · Солнце', { color: 'green', scale: 1.45 })
  note(editor, rew, 800, 620, 'Домашка:\nзапиши в словарик\n«астрономия» и «астроном»', { color: 'yellow', scale: 1.45 })
}

// ============================ ЗАМКИ ЗАКОНА ==================================

function lockCamera(editor) {
  editor.setCameraOptions({
    isLocked: true, wheelBehavior: 'none', panSpeed: 0, zoomSpeed: 0,
    constraints: {
      bounds: { x: -2000, y: -2000, w: GX * 3 + FW + 4000, h: GY + FH + 4000 },
      behavior: { x: 'free', y: 'free' },
      initialZoom: 'default', baseZoom: 'default',
      origin: { x: 0.5, y: 0.5 }, padding: { x: 0, y: 0 },
    },
  })
  editor.setCamera(editor.getCamera()) // «толчок», иначе лок не применяется
}

function unlockWithinFrame(editor, board) {
  const b = editor.getShapePageBounds(FRAME_IDS[board])
  if (!b) return
  editor.setCameraOptions({
    isLocked: false, wheelBehavior: 'pan', panSpeed: 1, zoomSpeed: 0.6,
    constraints: {
      bounds: { x: b.x, y: b.y, w: b.w, h: b.h },
      behavior: { x: 'contain', y: 'contain' },
      initialZoom: 'fit-max', baseZoom: 'fit-max',
      origin: { x: 0.5, y: 0.5 }, padding: { x: 40, y: 40 },
    },
  })
  editor.setCamera(editor.getCamera())
  const inner = { x: b.x + b.w * 0.18, y: b.y + b.h * 0.18, w: b.w * 0.64, h: b.h * 0.64 }
  editor.zoomToBounds(inner, { animation: { duration: 550, easing: EASINGS.easeInOutCubic }, force: true })
}

// ===================== СТАБИЛЬНЫЙ ДВИЖОК-КОНТРАКТ ===========================
// ЕДИНСТВЕННЫЙ объект на всю жизнь страницы. React (tutor-lesson[-ru].tsx)
// поллит window.__klassioEngine и назначает колбэки КАК СВОЙСТВА этого объекта
// один раз — поэтому объект нельзя пересоздавать. Методы делегируют в ACTIONS,
// который App обновляет каждый рендер.

let ACTIONS = null

const ENGINE = {
  setStatus: (s) => ACTIONS?.setStatus(s),
  setCaption: (t) => ACTIONS?.setCaption(t),
  setMuted: (m) => ACTIONS?.setMuted(m),
  setChildName: (n) => ACTIONS?.setChildName(n),
  setTeacherName: (n) => ACTIONS?.setTeacherName(n),
  showStartButton: () => ACTIONS?.showStartButton(),
  hideStartButton: () => ACTIONS?.hideStartButton(),
  setStartButtonText: (t, d) => ACTIONS?.setStartButtonText(t, d),
  startTimer: () => ACTIONS?.startTimer(),
  setVoiceMenu: (v, k) => ACTIONS?.setVoiceMenu(v, k),
  pushBubble: (w, t) => ACTIONS?.pushBubble(w, t),
  showBoard: (variant, animate) => ACTIONS?.showBoard(variant, animate),
  showTask: (step, animate) => ACTIONS?.showTask(step, animate),
  hideTool: (animate) => ACTIONS?.hideTool(animate),
  // Расширения Miro-режима (голосом пока не используются):
  revealNext: (b) => ACTIONS?.revealNext(b),
  lookAround: () => ACTIONS?.lookAround(),
  drawIntoFrame: () => ACTIONS?.drawIntoFrame(),
  // Колбэки — назначает React-слой:
  onStart: null, onMute: null, onSolve: null, onWrong: null,
  onVoiceSelect: null, onPlanetClick: null,
}

// ================================ ПРИЛОЖЕНИЕ ================================

const S = {
  panelBtn: {
    display: 'block', width: '100%', padding: '7px 10px', marginBottom: 6,
    border: '1px solid #d8cfc0', borderRadius: 10, background: '#fffdf8',
    color: '#3a3428', fontSize: 13, cursor: 'pointer', textAlign: 'left', fontFamily: 'inherit',
  },
}

function App() {
  const editorRef = useRef(null)
  const [ready, setReady] = useState(false)
  const [board, setBoard] = useState(null)
  const [status, setStatus] = useState('listening')
  const [caption, setCaption] = useState('')
  const [bubbles, setBubbles] = useState([])
  const [muted, setMuted] = useState(true)
  const [task, setTask] = useState(null)
  const [autoTask, setAutoTask] = useState(false)
  const [planetCard, setPlanetCard] = useState(null)
  const [lookAround, setLookAroundState] = useState(false)
  const [events, setEvents] = useState([])
  const [demoRunning, setDemoRunning] = useState(false)
  const [elapsed, setElapsed] = useState(null)
  const [teacherName, setTeacherName] = useState('Аня')
  const [childName, setChildName] = useState('Ты')
  const [startBtn, setStartBtn] = useState({ visible: false, text: 'Начать урок', disabled: false })
  const [voiceMenu, setVoiceMenuState] = useState({ voices: [], selected: '', open: false })

  const revealIdx = useRef({})
  const solvedRef = useRef(new Set())
  const visitedRef = useRef(new Set())
  const demoAbort = useRef({ aborted: false })
  const boardRef = useRef(null)
  const lookRef = useRef(false)
  const timerStartedRef = useRef(false)
  const wrongAtRef = useRef(0)
  const autoRevealTimers = useRef([])
  const bubbleSeq = useRef(0)

  useEffect(() => { boardRef.current = board }, [board])
  useEffect(() => { lookRef.current = lookAround }, [lookAround])

  const logEvent = useCallback((text) => {
    if (DEBUG) setEvents((prev) => ['· ' + text, ...prev].slice(0, 8))
    console.log('[klassio-miro]', text)
  }, [])

  // ---- Reveal ----

  const revealNext = useCallback((b) => {
    const editor = editorRef.current
    const target = b || boardRef.current
    if (!editor || !target) return false
    const idx = (revealIdx.current[target] || 0) + 1
    const groupKey = target + ':' + idx
    const ids = Array.from(editor.getCurrentPageShapeIds()).filter((id) => {
      const s = editor.getShape(id)
      return s?.meta?.revealGroup === groupKey
    })
    if (!ids.length) return false
    revealIdx.current[target] = idx
    ids.forEach((id, i) => fadeShape(editor, id, 1, i * 130))
    logEvent('reveal(' + groupKey + ')')
    return true
  }, [logEvent])

  // Авто-reveal после прилёта: группы распускаются одна за другой, пока Аня
  // рассказывает. Отменяется при уходе с доски.
  const scheduleAutoReveal = useCallback((b) => {
    autoRevealTimers.current.forEach(clearTimeout)
    autoRevealTimers.current = []
    const total = REVEAL_GROUPS[b] || 0
    const done = revealIdx.current[b] || 0
    let delay = 1150 // дождаться конца полёта камеры
    for (let i = done; i < total; i++) {
      autoRevealTimers.current.push(setTimeout(() => {
        if (boardRef.current === b) revealNext(b)
      }, delay))
      delay += 2800
    }
  }, [revealNext])

  // ---- Полёты камеры ----

  const flyToBoard = useCallback((b, animate = true) => {
    const editor = editorRef.current
    if (!editor) return
    const bounds = editor.getShapePageBounds(FRAME_IDS[b])
    if (!bounds) return
    editor.stopCameraAnimation()
    if (lookRef.current) { lockCamera(editor); setLookAroundState(false) }
    const prev = boardRef.current
    if (prev && prev !== b) {
      const connId = createShapeId('conn-' + prev + '-' + b)
      if (editor.getShape(connId)) {
        fadeShape(editor, connId, 1, 0, 250)
        setTimeout(() => fadeShape(editor, connId, 0.85, 0, 600), 1400)
      }
    }
    editor.zoomToBounds(bounds, {
      inset: 70,
      animation: animate ? { duration: 1000, easing: EASINGS.easeInOutCubic } : undefined,
      immediate: !animate,
      force: true,
    })
    if (prev && prev !== b && !visitedRef.current.has(prev)) {
      visitedRef.current.add(prev)
      txt(editor, FRAME_IDS[prev], FW - 110, 30, '✓', { size: 'xl', scale: 2, color: 'green' })
    }
    setBoard(b)
    setPlanetCard(null)
    scheduleAutoReveal(b)
    if (DEBUG && !ENGINE.onStart && DEBUG_LINES[b]) setCaption(DEBUG_LINES[b][0])
    logEvent('showBoard(' + b + ')')
  }, [scheduleAutoReveal, logEvent])

  const flyToOverview = useCallback((animate = true) => {
    const editor = editorRef.current
    if (!editor) return
    editor.stopCameraAnimation()
    if (lookRef.current) { lockCamera(editor); setLookAroundState(false) }
    autoRevealTimers.current.forEach(clearTimeout)
    const bounds = editor.getCurrentPageBounds()
    if (!bounds) return
    editor.zoomToBounds(bounds, {
      inset: 60,
      animation: animate ? { duration: 1200, easing: EASINGS.easeInOutCubic } : undefined,
      immediate: !animate,
      force: true,
    })
    setBoard(null)
    setPlanetCard(null)
    logEvent('обзор карты')
  }, [logEvent])

  // ---- Прочие действия движка ----

  const drawIntoFrame = useCallback(() => {
    const editor = editorRef.current
    const target = boardRef.current || 'solar'
    if (!editor) return
    const parentId = FRAME_IDS[target] || FRAME_IDS.solar
    const arrowId = createShapeId()
    editor.createShape({
      id: arrowId, type: 'arrow', parentId, x: 0, y: 0, opacity: 0,
      props: {
        start: { x: 380, y: 240 }, end: { x: 860, y: 240 },
        color: 'red', size: 'l', dash: 'solid',
        arrowheadStart: 'none', arrowheadEnd: 'arrow',
        text: 'дорисовано на лету!',
      },
    })
    fadeShape(editor, arrowId, 1)
    setTimeout(() => {
      fadeShape(editor, arrowId, 0)
      setTimeout(() => { try { editor.deleteShape(arrowId) } catch {} }, FADE_MS + 100)
    }, 5000)
  }, [])

  const toggleLookAround = useCallback(() => {
    const editor = editorRef.current
    const b = boardRef.current
    if (!editor) return
    if (!lookRef.current) {
      if (!b) return
      unlockWithinFrame(editor, b)
      setLookAroundState(true)
    } else {
      lockCamera(editor)
      setLookAroundState(false)
      if (b) flyToBoard(b)
    }
  }, [flyToBoard])

  // ---- Ответы на задачи ----

  const handleSolve = useCallback((step) => {
    // Дедуп по step.id — как solvedTasks в anya.html. React привязывает решение
    // к currentTaskIdRef, второй onSolve исказил бы статистику.
    if (solvedRef.current.has(step.id)) return
    solvedRef.current.add(step.id)
    ENGINE.onSolve?.(step)
    logEvent('onSolve(' + step.id + ')')
    setTimeout(() => setTask(null), 2200)
  }, [logEvent])

  const handleWrong = useCallback(() => {
    // Дебаунс 1500мс (паттерн anya.html) — React шлёт Ане сообщение на КАЖДЫЙ
    // onWrong, серия кликов без дебаунса = очередь «подскажи».
    const now = Date.now()
    if (now - wrongAtRef.current < 1500) return
    wrongAtRef.current = now
    ENGINE.onWrong?.()
    logEvent('onWrong()')
  }, [logEvent])

  const openTask = useCallback((step) => {
    if (!step) return
    // Задачу показываем НА её доске: если камера в другом месте — сначала долёт.
    if (step.board && boardRef.current !== step.board && FRAME_IDS[step.board]) {
      flyToBoard(step.board)
      setTimeout(() => setTask(step), 1150)
    } else {
      setTask(step)
    }
    logEvent('showTask(' + (step.id || '?') + ')')
  }, [flyToBoard, logEvent])

  // ---- Действия для стабильного ENGINE (обновляются каждый рендер) ----

  ACTIONS = {
    setStatus: (s) => {
      setStatus(s)
      // Паттерн anya.html: статус перезатирает подпись — иначе «Соединяюсь…»
      // висит вечно (React больше не чистит caption сам).
      setCaption('')
    },
    setCaption: (t) => setCaption(t || ''),
    setMuted: (m) => setMuted(!!m),
    setChildName: (n) => n && setChildName(n),
    setTeacherName: (n) => n && setTeacherName(n),
    showStartButton: () => setStartBtn((p) => ({ ...p, visible: true })),
    hideStartButton: () => setStartBtn((p) => ({ ...p, visible: false })),
    setStartButtonText: (t, d) => setStartBtn((p) => ({ ...p, text: t || p.text, disabled: !!d })),
    startTimer: () => {
      if (timerStartedRef.current) return // guard: reconnect зовёт повторно
      timerStartedRef.current = true
      setElapsed(0)
    },
    setVoiceMenu: (voices, selected) => setVoiceMenuState((p) => ({ ...p, voices: voices || [], selected: selected || '' })),
    pushBubble: (w, t) => {
      if (!t) return
      bubbleSeq.current += 1
      setBubbles((prev) => [...prev, { w, t, k: bubbleSeq.current }].slice(-6))
      // pushBubble флипает статус (паттерн anya.html) — React пушит tutor-пузырь
      // в момент начала речи и полагается на это.
      setStatus(w === 'tutor' ? 'speaking' : 'listening')
      setCaption('')
    },
    showBoard: (variant, animate) => {
      if (variant === 'overview') flyToOverview(animate !== false)
      else if (FRAME_IDS[variant]) flyToBoard(variant, animate !== false)
    },
    showTask: (step) => openTask(step),
    hideTool: (animate) => { setTask(null); flyToOverview(animate !== false) },
    revealNext: (b) => revealNext(b),
    lookAround: () => toggleLookAround(),
    drawIntoFrame: () => drawIntoFrame(),
  }

  // ---- Демо-прогон (только ?debug=1) ----

  const openNextTaskDebug = useCallback((b) => {
    const target = b || boardRef.current
    if (!target) return
    const next = TASKS.find((t) => t.board === target && !solvedRef.current.has(t.id))
      || TASKS.find((t) => t.board === target)
    if (next) openTask(next)
  }, [openTask])

  const runDemo = useCallback(async () => {
    if (demoRunning) { demoAbort.current.aborted = true; setDemoRunning(false); return }
    demoAbort.current = { aborted: false }
    const abort = demoAbort.current
    setDemoRunning(true)
    const wait = (ms) => new Promise((res) => setTimeout(res, ms))
    const step = async (fn, ms) => { if (abort.aborted) throw new Error('abort'); fn(); await wait(ms) }
    try {
      await step(() => flyToOverview(), 4200)
      await step(() => flyToBoard('cover'), 5000)
      await step(() => flyToBoard('etymology'), 9500)
      setAutoTask(true)
      await step(() => openNextTaskDebug('etymology'), 6400)
      await step(() => flyToBoard('bodies'), 8000)
      await step(() => openNextTaskDebug('bodies'), 6400)
      await step(() => flyToBoard('solar'), 8000)
      await step(() => {
        const p = PLANETS.find((x) => x.key === 'saturn')
        setPlanetCard(p)
        ENGINE.onPlanetClick?.(p.name)
      }, 4200)
      await step(() => setPlanetCard(null), 400)
      await step(() => openNextTaskDebug('solar'), 6400)
      await step(() => flyToBoard('sunEarth'), 8000)
      await step(() => flyToBoard('facts'), 9500)
      await step(() => openNextTaskDebug('facts'), 6400)
      await step(() => flyToBoard('reward'), 5000)
      await step(() => flyToOverview(), 1500)
    } catch { /* прервано */ }
    setAutoTask(false)
    setDemoRunning(false)
  }, [demoRunning, flyToOverview, flyToBoard, openNextTaskDebug])

  // ---- Монтирование tldraw ----

  const onMount = useCallback((editor) => {
    editorRef.current = editor
    if (DEBUG) window.__spikeEditor = editor
    editor.user.updateUserPreferences({ colorScheme: 'light' })

    buildLessonMap(editor)

    // ЗАКОН, замок 2: hand tool (НЕ isReadonly — он глушит и программные
    // createShape/updateShape, ломая reveal) + возврат руки + глушение клавы.
    editor.setCurrentTool('hand')
    editor.on('event', () => {
      if (editor.getCurrentToolId() !== 'hand') editor.setCurrentTool('hand')
    })
    window.addEventListener('keydown', (e) => {
      if (e.target && e.target.closest && e.target.closest('input, textarea, [contenteditable]')) return
      const k = e.key.toLowerCase()
      const plainKey = !e.ctrlKey && !e.metaKey && k.length === 1
      const editCombo = (e.ctrlKey || e.metaKey) && ['z', 'y', 'a', 'x', 'v', 'c'].includes(k)
      if (plainKey || editCombo || k === 'delete' || k === 'backspace') e.stopPropagation()
    }, { capture: true })
    // ЗАКОН, замок 1: камера на рельсах.
    lockCamera(editor)

    const bounds = editor.getCurrentPageBounds()
    if (bounds) editor.zoomToBounds(bounds, { inset: 60, immediate: true, force: true })

    // Клик по планетам: pointer_up (pointer_down у tldraw делает
    // setPointerCapture и глохнет на синтетике; для ребёнка клик = отпустил).
    editor.on('event', (info) => {
      if (info.name !== 'pointer_up') return
      try {
        const pt = editor.inputs.currentPagePoint
        let shape = editor.getShapeAtPoint(pt, { hitInside: true, margin: 6 })
        while (shape) {
          const key = shape.meta?.planet
          if (key) {
            const p = PLANETS.find((x) => x.key === key)
              || { key, name: shape.meta.planetName || key, fact: 'Это Солнце — наша звезда! Диаметр в 109 раз больше земного.' }
            setPlanetCard(p)
            // РУССКОЕ имя — голосовой слой пробрасывает строку Ане как есть.
            ENGINE.onPlanetClick?.(p.name)
            logEvent('onPlanetClick(' + p.name + ')')
            return
          }
          const parent = typeof shape.parentId === 'string' && shape.parentId.startsWith('shape:')
            ? editor.getShape(shape.parentId) : null
          shape = parent
        }
      } catch { /* hit-test не критичен */ }
    })

    // Контракт наружу — ОДИН раз, стабильные объекты.
    window.__klassioEngine = ENGINE
    window.__KLASSIO_REAL_LESSON = TASKS

    setReady(true)
    logEvent('__klassioEngine готов (стабильный объект)')

    // ?debug=1 standalone (без родителя): через 2.5с показать кнопку локально.
    if (DEBUG) {
      setTimeout(() => {
        if (!ENGINE.onStart) setStartBtn({ visible: true, text: 'Начать урок (debug)', disabled: false })
      }, 2500)
    }
  }, [logEvent])

  // Таймер урока.
  useEffect(() => {
    if (elapsed === null) return
    const t = setInterval(() => setElapsed((e) => (e === null ? null : e + 1)), 1000)
    return () => clearInterval(t)
  }, [elapsed !== null])

  const onStartClick = () => {
    if (startBtn.disabled) return
    if (ENGINE.onStart) {
      ENGINE.onStart() // live: React стартует голосовую сессию
    } else if (DEBUG) {
      setStartBtn((p) => ({ ...p, visible: false }))
      timerStartedRef.current = true
      setElapsed(0)
      flyToOverview(true)
    }
    logEvent('onStart()')
  }

  const onMicClick = () => {
    const m = !muted
    setMuted(m)
    ENGINE.onMute?.(m)
  }

  const boardIdx = board ? BOARD_ORDER.indexOf(board) : -1
  const slideNo = board && board !== 'reward' ? CONTENT_BOARDS.indexOf(board) + 1 : 0
  const slideLabel = board === 'reward' ? 'Финал'
    : slideNo > 0 ? 'Слайд ' + slideNo + ' / ' + CONTENT_BOARDS.length
      : 'Обзор карты'
  const statusLabel = status === 'speaking' ? teacherName + ' ' + MIC_CAP.speaking
    : status === 'thinking' ? teacherName + ' ' + MIC_CAP.thinking : MIC_CAP.listening
  const captionText = caption || statusLabel

  return (
    <div style={{ position: 'fixed', inset: 0, fontFamily: "'Segoe UI', system-ui, sans-serif" }}>
      <Tldraw hideUi onMount={onMount} />

      {/* ---------- Верх: прогресс маршрута + таймер + выход ---------- */}
      <div style={{
        position: 'absolute', top: 14, left: '50%', transform: 'translateX(-50%)',
        display: 'flex', gap: 8, alignItems: 'center', background: 'rgba(255,253,248,.92)',
        border: '1px solid #e5dccb', borderRadius: 999, padding: '8px 16px', zIndex: 20,
      }}>
        {BOARD_ORDER.map((b, i) => (
          <div key={b} title={BOARD_TITLES[b]} style={{
            width: i === boardIdx ? 26 : 10, height: 10, borderRadius: 999,
            transition: 'all .35s',
            background: i === boardIdx ? '#e8833a' : visitedRef.current.has(b) ? '#7bb661' : '#ddd3c2',
          }} />
        ))}
        <span style={{ fontSize: 12, color: '#8a8070', marginLeft: 6 }}>
          <b style={{ fontWeight: 600, color: '#a06428' }}>{slideLabel}</b>
          {board && board !== 'reward' && ' · ' + BOARD_TITLES[board]}
          {elapsed !== null && ' · ' + Math.floor(elapsed / 60) + ':' + String(elapsed % 60).padStart(2, '0')}
        </span>
        <button
          onClick={() => { try { window.top.location.href = '/' } catch { location.href = '/' } }}
          style={{
            marginLeft: 8, fontSize: 11, color: '#8a8070', background: 'none',
            border: '1px solid #ddd3c2', borderRadius: 999, padding: '3px 10px',
            cursor: 'pointer', fontFamily: 'inherit',
          }}>
          Выйти
        </button>
      </div>

      {/* ---------- Чат-лента слева (не наезжает на контент доски) ---------- */}
      {bubbles.length > 0 && (
        <div style={{
          position: 'absolute', left: 14, top: 64, bottom: 92, width: 300, zIndex: 20,
          display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', gap: 8,
          pointerEvents: 'none', overflow: 'hidden',
        }}>
          {bubbles.map((b, i) => (
            <div key={b.k} style={{
              maxWidth: '92%',
              alignSelf: b.w === 'tutor' ? 'flex-start' : 'flex-end',
              background: b.w === 'tutor' ? 'rgba(255,253,248,.97)' : 'rgba(232,131,58,.14)',
              border: '1px solid ' + (b.w === 'tutor' ? '#e5dccb' : '#ecc9a8'),
              borderRadius: 14, padding: '8px 13px', fontSize: 13.5, color: '#3a3428', lineHeight: 1.4,
              opacity: 0.5 + 0.5 * ((i + 1) / bubbles.length),
              boxShadow: '0 2px 10px rgba(90,70,40,.06)',
              animation: 'klassio-rise .35s ease-out',
            }}>
              <span style={{ fontSize: 10.5, fontWeight: 600, color: '#a06428', display: 'block', marginBottom: 2 }}>
                {b.w === 'tutor' ? teacherName : childName}
              </span>
              {b.t}
            </div>
          ))}
        </div>
      )}

      {/* ---------- Низ по центру: подпись + Аня ---------- */}
      <div style={{
        position: 'absolute', bottom: 22, left: '50%', transform: 'translateX(-50%)',
        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, zIndex: 20,
        pointerEvents: 'none',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, pointerEvents: 'auto', marginTop: 4 }}>
          <div
            onClick={() => voiceMenu.voices.length && setVoiceMenuState((p) => ({ ...p, open: !p.open }))}
            title={voiceMenu.voices.length ? 'Выбрать голос' : ''}
            style={{
              width: 56, height: 56, borderRadius: '50%', background: '#f3e3cf',
              border: '3px solid ' + (status === 'speaking' ? '#e8833a' : status === 'thinking' ? '#b9a9e8' : '#cfc4ae'),
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 24, fontWeight: 600, color: '#a06428',
              animation: status === 'speaking' ? 'klassio-pulse 1.2s infinite' : 'none',
              cursor: voiceMenu.voices.length ? 'pointer' : 'default',
            }}>{(teacherName || 'А')[0]}</div>
          <div style={{ fontSize: 12, color: '#8a8070', minWidth: 110 }}>{captionText}</div>
          <button onClick={onMicClick} style={{
            ...S.panelBtn, width: 'auto', marginBottom: 0, padding: '6px 10px',
            background: muted ? '#f7d9d3' : '#fffdf8',
          }}>{muted ? 'мик выкл' : 'мик вкл'}</button>
        </div>

        {voiceMenu.open && voiceMenu.voices.length > 0 && (
          <div style={{
            pointerEvents: 'auto', background: 'rgba(255,253,248,.98)', border: '1px solid #e5dccb',
            borderRadius: 12, padding: 6, display: 'flex', flexDirection: 'column', gap: 4,
          }}>
            {voiceMenu.voices.map((v) => (
              <button key={v.key} onClick={() => {
                setVoiceMenuState((p) => ({ ...p, selected: v.key, open: false }))
                ENGINE.onVoiceSelect?.(v.key)
              }} style={{
                ...S.panelBtn, marginBottom: 0,
                background: v.key === voiceMenu.selected ? '#fbeadb' : '#fffdf8',
                borderColor: v.key === voiceMenu.selected ? '#e8833a' : '#d8cfc0',
              }}>{v.label}</button>
            ))}
          </div>
        )}
      </div>

      {/* ---------- Режиссёрская панель (?debug=1) ---------- */}
      {DEBUG && ready && (
        <div style={{
          position: 'absolute', top: 70, right: 14, width: 210, zIndex: 25,
          background: 'rgba(255,253,248,.95)', border: '1px solid #e5dccb', borderRadius: 14,
          padding: 12, boxShadow: '0 6px 24px rgba(90,70,40,.10)',
        }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: '#a06428', letterSpacing: '.06em', marginBottom: 8 }}>
            РЕЖИССЁР (debug)
          </div>
          <button style={{ ...S.panelBtn, background: demoRunning ? '#f7d9d3' : '#eef4e2', fontWeight: 600 }} onClick={runDemo}>
            {demoRunning ? '■ Стоп демо' : '▶ Демо-прогон урока'}
          </button>
          <div style={{ height: 8 }} />
          {BOARD_ORDER.map((b, i) => (
            <button key={b} style={{
              ...S.panelBtn,
              borderColor: board === b ? '#e8833a' : '#d8cfc0',
              background: board === b ? '#fbeadb' : '#fffdf8',
            }} onClick={() => flyToBoard(b)}>
              {i + 1}. {BOARD_TITLES[b]}
            </button>
          ))}
          <button style={S.panelBtn} onClick={() => flyToOverview()}>🗺 Обзор карты</button>
          <button style={S.panelBtn} onClick={() => revealNext()}>✨ Проявить контент</button>
          <button style={S.panelBtn} onClick={() => openNextTaskDebug()}>📝 Задача</button>
          <button style={{ ...S.panelBtn, background: lookAround ? '#fbeadb' : '#fffdf8' }} onClick={toggleLookAround}>
            {lookAround ? '🔒 Залочить камеру' : '👀 Оглядеться'}
          </button>
          <button style={S.panelBtn} onClick={drawIntoFrame}>✏️ Дорисовать в фрейм</button>
        </div>
      )}

      {/* ---------- Лог событий (?debug=1) ---------- */}
      {DEBUG && events.length > 0 && (
        <div style={{
          position: 'absolute', bottom: 16, left: 14, width: 250, zIndex: 20,
          background: 'rgba(42,38,32,.88)', color: '#e8e0d0', borderRadius: 10,
          padding: '8px 10px', fontSize: 10.5, fontFamily: 'Consolas, monospace', lineHeight: 1.6,
          maxHeight: 170, overflow: 'hidden',
        }}>
          <div style={{ opacity: .6, marginBottom: 2 }}>события __klassioEngine:</div>
          {events.map((e, i) => <div key={i} style={{ opacity: 1 - i * 0.11 }}>{e}</div>)}
        </div>
      )}

      {/* ---------- Карточка планеты ---------- */}
      {planetCard && (
        <div onClick={() => setPlanetCard(null)} style={{
          position: 'absolute', bottom: 130, left: '50%', transform: 'translateX(-50%)',
          zIndex: 30, background: 'rgba(255,253,248,.97)', border: '2px solid #e8833a',
          borderRadius: 16, padding: '14px 20px', maxWidth: 420, cursor: 'pointer',
          boxShadow: '0 10px 36px rgba(90,70,40,.18)', display: 'flex', gap: 14, alignItems: 'center',
        }}>
          <img src={'planets/' + planetCard.key + '.png'} width={64} height={64} alt="" />
          <div>
            <div style={{ fontWeight: 700, color: '#a06428', marginBottom: 3 }}>{planetCard.name}</div>
            <div style={{ fontSize: 13.5, color: '#3a3428' }}>{planetCard.fact}</div>
          </div>
        </div>
      )}

      {/* ---------- Тренажёр-оверлей ---------- */}
      {task && (
        <TaskOverlay
          key={task.id}
          step={task}
          auto={autoTask}
          onSolve={handleSolve}
          onWrong={handleWrong}
        />
      )}

      {/* ---------- Стартовый экран (управляется React'ом через контракт) ---------- */}
      {startBtn.visible && ready && (
        <div style={{
          position: 'absolute', inset: 0, zIndex: 40, display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center', gap: 22,
          background: 'rgba(247,242,232,.55)', backdropFilter: 'blur(2px)',
        }}>
          <div style={{
            width: 88, height: 88, borderRadius: '50%', background: '#f3e3cf',
            border: '4px solid #e8833a', display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 38, fontWeight: 600, color: '#a06428', animation: 'klassio-pulse 1.6s infinite',
          }}>{(teacherName || 'А')[0]}</div>
          <div style={{ fontSize: 22, fontWeight: 600, color: '#3a3428' }}>Мир глазами астронома</div>
          <div style={{ fontSize: 14, color: '#8a8070', maxWidth: 420, textAlign: 'center' }}>
            Урок-карта: весь путь темы на одном холсте, камеру ведёт {teacherName}
          </div>
          <button onClick={onStartClick} disabled={startBtn.disabled} style={{
            padding: '13px 34px', fontSize: 16, fontWeight: 600, color: '#fff',
            background: startBtn.disabled ? '#d8cfc0' : '#e8833a', border: 'none', borderRadius: 999,
            cursor: startBtn.disabled ? 'default' : 'pointer',
            boxShadow: startBtn.disabled ? 'none' : '0 8px 24px rgba(232,131,58,.35)',
          }}>{startBtn.text}</button>
        </div>
      )}
    </div>
  )
}

// ============================ ТРЕНАЖЁР-ОВЕРЛЕЙ ==============================
// Live-инварианты: задачу НЕЛЬЗЯ закрыть без решения (React держит taskActive
// и блокирует листание до onSolve); step.explain НЕ показываем (его озвучивает
// Аня — иначе дубль текста поверх голоса).

function TaskOverlay({ step, auto, onSolve, onWrong }) {
  const [picked, setPicked] = useState(null)
  const [solved, setSolved] = useState(false)
  const [wrongCount, setWrongCount] = useState(0)
  const [value, setValue] = useState('')
  const [shake, setShake] = useState(false)

  const solve = useCallback(() => {
    setSolved(true)
    onSolve(step)
  }, [onSolve, step])

  const wrong = useCallback(() => {
    setWrongCount((c) => c + 1)
    setShake(true)
    setTimeout(() => setShake(false), 500)
    onWrong()
  }, [onWrong])

  const pick = useCallback((i) => {
    if (solved) return
    setPicked(i)
    if (step.options[i].correct) solve()
    else wrong()
  }, [solved, step, solve, wrong])

  const submitBlank = useCallback(() => {
    if (solved) return
    const norm = (s) => String(s).trim().toLowerCase().replace(/\s+/g, '')
    if (norm(value) === norm(step.answer)) solve()
    else wrong()
  }, [solved, value, step, solve, wrong])

  useEffect(() => {
    if (!auto) return
    const t = setTimeout(() => {
      if (step.variant === 'choice') {
        const i = step.options.findIndex((o) => o.correct)
        setPicked(i); setSolved(true); onSolve(step)
      } else {
        setValue(String(step.answer)); setSolved(true); onSolve(step)
      }
    }, 2600)
    return () => clearTimeout(t)
  }, [auto, step, onSolve])

  const hint = wrongCount > 0 && !solved ? (step.hints?.[Math.min(wrongCount - 1, (step.hints?.length || 1) - 1)]) : null

  return (
    <div style={{
      position: 'absolute', inset: 0, zIndex: 35, display: 'flex',
      alignItems: 'center', justifyContent: 'center', pointerEvents: 'none',
    }}>
      <div style={{
        pointerEvents: 'auto', width: 520, maxWidth: '86vw',
        background: 'rgba(255,253,248,.98)', border: '1px solid #e5dccb', borderRadius: 20,
        padding: '22px 26px', boxShadow: '0 18px 60px rgba(90,70,40,.22)',
        animation: shake ? 'klassio-shake .45s' : 'klassio-rise .4s ease-out',
      }}>
        <div style={{ fontSize: 11, fontWeight: 600, color: '#a06428', letterSpacing: '.06em', marginBottom: 8 }}>
          ЗАДАНИЕ
        </div>
        <div style={{ fontSize: 17, fontWeight: 600, color: '#3a3428', marginBottom: 16 }}>{step.q}</div>

        {step.variant === 'choice' && (
          <div style={{ display: 'grid', gap: 8 }}>
            {step.options.map((o, i) => {
              const isPicked = picked === i
              const bg = isPicked ? (o.correct ? '#e3f0d8' : '#f7d9d3') : '#fffdf8'
              const border = isPicked ? (o.correct ? '#7bb661' : '#d9776a') : '#d8cfc0'
              return (
                <button key={i} onClick={() => pick(i)} style={{
                  textAlign: 'left', padding: '11px 14px', fontSize: 14.5, fontFamily: 'inherit',
                  background: bg, border: '2px solid ' + border, borderRadius: 12, cursor: 'pointer',
                  color: '#3a3428', transition: 'all .2s',
                }}>
                  {o.t}{isPicked && o.correct ? '  ✓' : isPicked ? '  ✗' : ''}
                </button>
              )
            })}
          </div>
        )}

        {step.variant === 'blank' && (
          <div style={{ display: 'flex', gap: 8 }}>
            <input
              value={value}
              onChange={(e) => setValue(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && submitBlank()}
              placeholder="впиши ответ…"
              style={{
                flex: 1, padding: '11px 14px', fontSize: 15, fontFamily: 'inherit',
                border: '2px solid ' + (solved ? '#7bb661' : '#d8cfc0'), borderRadius: 12,
                background: solved ? '#e3f0d8' : '#fffdf8', color: '#3a3428', outline: 'none',
              }}
            />
            <button onClick={submitBlank} disabled={solved} style={{
              padding: '11px 18px', fontSize: 14.5, fontWeight: 600, color: '#fff',
              background: '#e8833a', border: 'none', borderRadius: 12, cursor: 'pointer', fontFamily: 'inherit',
            }}>Ответить</button>
          </div>
        )}

        {hint && (
          <div style={{
            marginTop: 12, padding: '9px 13px', fontSize: 13, color: '#7a6430',
            background: '#faf3dd', border: '1px solid #ecd9a8', borderRadius: 10,
          }}>💡 {hint}</div>
        )}
        {solved && (
          <div style={{
            marginTop: 12, padding: '10px 13px', fontSize: 13.5, color: '#3d6b28',
            background: '#e3f0d8', border: '1px solid #b9d8a4', borderRadius: 10,
          }}>Верно! Молодец 🎉</div>
        )}
      </div>
    </div>
  )
}

// ================================ MOUNT =====================================

createRoot(document.getElementById('app')).render(<App />)
