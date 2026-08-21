#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════════════════
//  СБОРКА ВИТРИНЫ ДЛЯ ВЫКЛАДКИ НА СЕРВЕР
//
//  Рядом с уроком лежит 1.2 ГБ 3D-хлама от закрытых веток. Везти это на сервер
//  незачем, поэтому список файлов здесь ЯВНЫЙ, а не «скопируй папку».
//
//  Что НЕ едет и почему:
//    · _hi-src-*.png — исходники апскейла (21 МБ), нужны только при подготовке;
//    · всё 3D закрытых веток (Крит, ХАБ, сцены) — витрина их не показывает;
//    · .env.local — ключи Яндекса ставятся на сервере руками, в архиве им не место.
//
//  node scripts/pack-lab.mjs [--clips]     # --clips добавит записанные ролики (33 МБ)
//  → .tmp/lab-deploy.tar.gz
// ═══════════════════════════════════════════════════════════════════════════
import fs from 'node:fs'
import path from 'node:path'
import { execFileSync } from 'node:child_process'

const WITH_CLIPS = process.argv.includes('--clips')
const SRC = '.tmp/sketches/tutor'
const STAGE = '.tmp/lab-stage'
const OUT = '.tmp/lab-deploy.tar.gz'

const copy = (from, to) => {
  fs.mkdirSync(path.dirname(to), { recursive: true })
  fs.copyFileSync(from, to)
  return fs.statSync(to).size
}
const human = (b) => b > 1048576 ? (b / 1048576).toFixed(1) + ' МБ' : Math.round(b / 1024) + ' КБ'

fs.rmSync(STAGE, { recursive: true, force: true })
fs.mkdirSync(STAGE, { recursive: true })

let total = 0
// ⚠️ Пути внутри архива обязаны повторять локальные ОДИН В ОДИН: сервер читает файлы
// по относительным путям вида `.tmp/sketches/tutor/kniga.html`. Разложишь «покрасивее»,
// без `.tmp` — и на сервере урок отдаст 500 на каждой странице.
const add = (rel, dst) => {
  const from = path.join(SRC, rel)
  if (!fs.existsSync(from)) { console.log('  ⚠ нет файла: ' + rel); return 0 }
  const n = copy(from, path.join(STAGE, dst || ('.tmp/sketches/tutor/' + rel)))
  total += n
  return n
}

console.log('── сервер ──')
for (const f of ['yandex-test-server.mjs', 'bhmock-core.mjs']) {
  total += copy('scripts/' + f, path.join(STAGE, 'scripts/' + f))
  console.log('  ' + f)
}
// журнал версий — из него витрина режет «что изменилось»
total += copy('.planning/KNIGA-VERSIONS.md', path.join(STAGE, '.planning/KNIGA-VERSIONS.md'))
console.log('  KNIGA-VERSIONS.md (чейнджлог витрины)')
// хроника работ по дням — из неё лента берёт даты РАБОТЫ (выкладка часто позже)
total += copy('.planning/KNIGA-HRONIKA.md', path.join(STAGE, '.planning/KNIGA-HRONIKA.md'))
console.log('  KNIGA-HRONIKA.md (даты работ для ленты)')

console.log('── страницы ──')
// zakrep.html — макет экрана закрепления по референсу Anatomy Atelier, который присылал
// руководитель. Ему нужны только `book/zakrep.json` и карта, а они и так едут: значит
// показать эту ветку стоит один файл.
// proba.html — песочница пробных функций (21.08), вход с витрины ДО урока. Своих данных
// у неё нет: картинки лежат в proba/ и едут ниже, синтез и модель общие с уроком.
for (const f of ['lab.html', 'kniga.html', 'kniga-v1.html', 'kniga-v23.html', 'kniga-v26.html', 'obzor.html', 'zakrep.html', 'proba.html']) {
  console.log('  ' + f + ' — ' + human(add(f)))
}

// Картинки пробных функций. Отдельная папка, а не art-*: это НЕ материал урока, и
// путать их нельзя — пробы могут в любой момент уехать целиком.
if (fs.existsSync(path.join(SRC, 'proba'))) {
  let n = 0, b = 0
  for (const f of fs.readdirSync(path.join(SRC, 'proba')).sort()) {
    if (!/\.(jpg|png)$/.test(f)) continue
    b += add('proba/' + f); n++
  }
  console.log('  картинки пробных функций: ' + n + ' шт., ' + human(b))
}

console.log('── данные урока ──')
let bookN = 0, bookB = 0
for (const f of fs.readdirSync(path.join(SRC, 'book'))) {
  if (f.startsWith('_hi-src-')) continue                 // исходники апскейла не нужны
  const st = fs.statSync(path.join(SRC, 'book', f))
  if (st.isDirectory()) {                                 // book/v1, book/v23 — данные прошлых сборок
    for (const g of fs.readdirSync(path.join(SRC, 'book', f))) {
      if (g.startsWith('_hi-src-')) continue
      bookB += add('book/' + f + '/' + g); bookN++
    }
    continue
  }
  bookB += add('book/' + f); bookN++
}
console.log('  страницы учебника и привязки: ' + bookN + ' файлов, ' + human(bookB))

let artN = 0, artB = 0
for (const f of fs.readdirSync(SRC)) {
  if (!/^art-.*\.jpg$/.test(f)) continue
  artB += add(f); artN++
}
console.log('  иллюстрации урока: ' + artN + ' шт., ' + human(artB))

console.log('── учитель ──')
// 3D-учительница: та, что стоит по умолчанию, плюс стилизованная как запасная.
// Остальные аватары и всё 3D закрытых веток не едут.
for (const f of ['av-avaturn.glb', 'av-brunette.glb']) console.log('  ' + f + ' — ' + human(add(f)))

// Карточки выбора учителя (scripts/make-avatar-cards.mjs): портрет и петля простоя на лицо.
// ⚠️ Берём ТОЛЬКО эти два расширения и только из lica/ — рядом в face/ лежат старые
// исходники образа Ани на 25 МБ, которым на сервере делать нечего.
if (fs.existsSync(path.join(SRC, 'lica'))) {
  let n = 0, b = 0
  for (const f of fs.readdirSync(path.join(SRC, 'lica')).sort()) {
    if (!/\.(jpg|mp4)$/.test(f)) continue
    b += add('lica/' + f); n++
  }
  console.log('  карточки лиц: ' + n + ' шт., ' + human(b))
} else {
  console.log('  ⚠ карточек лиц нет — прогони scripts/make-avatar-cards.mjs, иначе выбор учителя будет без картинок')
}

if (WITH_CLIPS && fs.existsSync(path.join(SRC, 'clips'))) {
  let n = 0, b = 0
  for (const f of fs.readdirSync(path.join(SRC, 'clips'))) { b += add('clips/' + f); n++ }
  console.log('  записанные ролики: ' + n + ' шт., ' + human(b))
} else {
  // ⚠️ Пустой индекс кладём ВСЕГДА. Без него урок стучится за `/clips/index.json`,
  // получает 404 и пишет ошибку в консоль на каждом открытии; а с ним сразу понимает,
  // что роликов нет, и убирает из настроек пункт «записанный урок» — иначе руководитель
  // выберет режим, в котором учитель молча пропадает.
  fs.mkdirSync(path.join(STAGE, '.tmp/sketches/tutor/clips'), { recursive: true })
  fs.writeFileSync(path.join(STAGE, '.tmp/sketches/tutor/clips/index.json'), JSON.stringify({ beats: [] }))
  console.log('  записанные ролики: пропущены, положен пустой индекс (нужны — запусти с --clips)')
}

// подсказка серверу: чем запускать
fs.writeFileSync(path.join(STAGE, 'ЗАПУСК.txt'),
  'Витрина сборок урока.\n\n'
  + 'Запуск:  PORT=8781 node scripts/yandex-test-server.mjs\n'
  + 'Вход:    /lab   (корень / занят стендом Яндекса — перенаправляется через nginx)\n\n'
  + 'Нужны переменные окружения (без них не будет голоса):\n'
  + '  YANDEX_API_KEY=...\n  YANDEX_FOLDER_ID=...\n\n'
  + 'Замечания руководителя копятся в .tmp/feedback.jsonl рядом с запуском.\n')

fs.rmSync(OUT, { force: true })
execFileSync('tar', ['-czf', OUT, '-C', STAGE, '.'], { stdio: 'inherit' })
const zip = fs.statSync(OUT).size
console.log('\n→ ' + OUT)
console.log('распаковано ' + human(total) + ' · архив ' + human(zip))
console.log('\nДальше: раскатать по инструкции .planning/LAB-DEPLOY-RUNBOOK.md')
