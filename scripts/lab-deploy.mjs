#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════════════════
//  ВЫКЛАДКА ВИТРИНЫ РЕЛИЗОМ (с откатом, если не встало)
//
//  node scripts/lab-deploy.mjs -m "что и зачем выкладываем"
//        --dry        только показать, ЧТО изменится на боевом, и остановиться
//        --clips      добавить ролики записанного учителя (33 МБ)
//        --no-commit  не делать коммит-снимок исходников (по умолчанию делает)
//
//  Порядок такой, что до боевого дело доходит последним:
//    1. зеркалим исходники в lab/ — это и есть история под git;
//    2. собираем пакет и сверяем его с ЖИВЫМ релизом файл в файл;
//    3. коммит + метка lab-000N (локально; push не делаем);
//    4. заливаем НОВОЙ папкой, переключаем ссылку, проверяем живость;
//    5. не встало — сами возвращаем ссылку назад и перезапускаем.
//
//  Откат делается отдельным скриптом: node scripts/lab-rollback.mjs
// ═══════════════════════════════════════════════════════════════════════════
import fs from 'node:fs'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import {
  assertRoot, sshScript, scpUp, git, md5, owner, sources, buildVersion,
  ROOT, HOST, KEY, KEEP, SRC, MIRROR, REMOTE_HEALTH, REMOTE_LINK_SHARED,
} from './lab-common.mjs'

assertRoot()

const argv = process.argv.slice(2)
const flag = (f) => argv.includes(f)
const DRY = flag('--dry')
const CLIPS = flag('--clips')
const NOCOMMIT = flag('--no-commit')
const NOTE = (() => {
  const i = argv.findIndex((a) => a === '-m' || a === '--note')
  return i >= 0 && argv[i + 1] ? argv[i + 1] : ''
})()
if (!NOTE && !DRY) {
  console.error('Нужна строка «зачем»: node scripts/lab-deploy.mjs -m "поправил разбор на третьей попытке"')
  console.error('Она попадёт в журнал релизов — по ней потом и выбирают, куда откатываться.')
  process.exit(2)
}

const STAGE = '.tmp/lab-stage'
const TAR = '.tmp/lab-deploy.tar.gz'
const LOG = '.planning/LAB-RELEASES.md'

// ── 1. что сейчас на боевом ────────────────────────────────────────────────
console.log('── смотрю, что на боевом ──')
const state = sshScript(`
set -eu
cd ${ROOT}
[ -L current ] || { echo "НЕТ-РЕЛИЗОВ"; exit 0; }
echo "CURRENT=$(basename "$(readlink current)")"
echo "СПИСОК=$(ls -1 releases | tr '\\n' ' ')"
echo "---манифест---"
cat current/MANIFEST.md5 2>/dev/null || true
`, { capture: true })

if (/НЕТ-РЕЛИЗОВ/.test(state)) {
  console.error('Сервер ещё не переехал на релизы. Сначала: node scripts/lab-server-init.mjs')
  process.exit(2)
}
const CURRENT = (state.match(/CURRENT=(\S+)/) || [])[1]
const RELEASES = ((state.match(/СПИСОК=(.*)/) || [])[1] || '').trim().split(/\s+/).filter(Boolean)
const liveMan = new Map()
for (const line of (state.split('---манифест---')[1] || '').split('\n')) {
  // ⚠️ Срезать можно только пару «./» целиком: жадная точка съедала первый символ
  // у `.tmp/...` и `.planning/...`, и сверка показывала, что изменилось ВСЁ.
  const m = line.match(/^([0-9a-f]{32})\s+(?:\.\/)?(.+)$/)
  if (m) liveMan.set(m[2].trim(), m[1])
}
const nextNum = String(RELEASES.reduce((a, r) => Math.max(a, parseInt(r, 10) || 0), 0) + 1).padStart(4, '0')
const d = new Date()
const дв = (n) => String(n).padStart(2, '0')
const ID = `${nextNum}-${d.getFullYear()}${дв(d.getMonth() + 1)}${дв(d.getDate())}-${дв(d.getHours())}${дв(d.getMinutes())}`
console.log(`  живой релиз: ${CURRENT} (всего ${RELEASES.length}, в манифесте ${liveMan.size} файлов)`)
console.log(`  новый будет: ${ID}`)

// ── 2. зеркало исходников под git ──────────────────────────────────────────
// Рабочая копия урока лежит в .tmp/ (в .gitignore вместе с 1.2 ГБ 3D-хлама рядом),
// поэтому истории у неё нет. Зеркалим ТЕКСТ — страницы сборок и данные; рендеры
// учебника и картинки остаются вне git: копирайт и вес.
console.log('\n── зеркалю исходники в ' + MIRROR + '/ ──')
let зеркалено = 0
for (const rel of sources()) {
  const to = path.join(MIRROR, rel)
  fs.mkdirSync(path.dirname(to), { recursive: true })
  const src = path.join(SRC, rel)
  if (!fs.existsSync(to) || md5(to) !== md5(src)) { fs.copyFileSync(src, to); зеркалено++ }
}
console.log(`  файлов в зеркале: ${sources().length}, обновилось: ${зеркалено}`)

// ── 3. пакет ───────────────────────────────────────────────────────────────
console.log('\n── собираю пакет ──')
execFileSync('node', ['scripts/pack-lab.mjs', ...(CLIPS ? ['--clips'] : [])], { stdio: 'inherit' })

// ── 4. сверка с живым релизом ──────────────────────────────────────────────
const stageMan = new Map()
const walk = (dir, base = '') => {
  for (const f of fs.readdirSync(dir)) {
    const p = path.join(dir, f)
    const rel = base ? base + '/' + f : f
    if (fs.statSync(p).isDirectory()) walk(p, rel)
    else stageMan.set(rel, md5(p))
  }
}
walk(STAGE)

const СЛУЖЕБНЫЕ = new Set(['MANIFEST.md5', 'RELEASE.json'])
const меняются = [], новые = [], пропали = []
for (const [rel, sum] of stageMan) {
  if (СЛУЖЕБНЫЕ.has(rel)) continue
  if (!liveMan.has(rel)) новые.push(rel)
  else if (liveMan.get(rel) !== sum) меняются.push(rel)
}
for (const rel of liveMan.keys()) {
  if (!СЛУЖЕБНЫЕ.has(rel) && !stageMan.has(rel)) пропали.push(rel)
}

const метка = (rel) => {
  if (rel.startsWith('.tmp/sketches/tutor/')) {
    const r = rel.slice('.tmp/sketches/tutor/'.length)
    if (r.startsWith('clips/')) return 'ролики'
    if (/^art-/.test(r)) return 'картинки'
    if (/^book\/(p\d|hi-|fig-)/.test(r)) return 'страницы'
    if (/\.glb$/.test(r)) return '3D-учитель'
    return /\.(html|json|svg)$/.test(r) ? owner(r) : 'файлы урока'
  }
  if (rel.startsWith('scripts/')) return 'стенд'
  if (rel.startsWith('.planning/')) return 'журнал версий'
  return 'прочее'
}
const строка = (rel) => `    ${метка(rel).padEnd(12)} ${rel}`

console.log('\n── что изменится на боевом ──')
if (!меняются.length && !новые.length && !пропали.length) {
  console.log('  ничего: пакет совпадает с живым релизом файл в файл')
} else {
  if (меняются.length) { console.log('  правится (' + меняются.length + '):'); меняются.sort().forEach((r) => console.log(строка(r))) }
  if (новые.length) { console.log('  добавляется (' + новые.length + '):'); новые.sort().forEach((r) => console.log(строка(r))) }
  if (пропали.length) { console.log('  пропадает (' + пропали.length + '):'); пропали.sort().forEach((r) => console.log(строка(r))) }
}
// ⚠️ Общие данные читают ВСЕ сборки: правка в ГАММЕ через них меняет и то, что
// руководитель считает замороженным. Про это должна быть громкая строка, а не сноска.
const общие = [...меняются, ...новые].filter((r) => метка(r) === 'ОБЩЕЕ')
if (общие.length) {
  console.log('\n  ⚠️ ТРОГАЕМ ОБЩИЕ ДАННЫЕ — изменится и в АЛЬФЕ, и в БЕТЕ:')
  общие.forEach((r) => console.log('     ' + r))
}

if (DRY) { console.log('\n(--dry: боевого не касался)'); process.exit(0) }

// ── 5. коммит-снимок ───────────────────────────────────────────────────────
const версии = { 'АЛЬФА · учебник-листалка': buildVersion('kniga.html'), 'БЕТА · закрепление': 'макет',
  'архивы ветки': buildVersion('kniga-v23.html') + ' · ' + buildVersion('kniga-v1.html') }
let sha = 'без коммита'
if (!NOCOMMIT) {
  console.log('\n── снимок в git ──')
  const шапка = `## ${ID}\n\n`
    + `- **когда:** ${дв(d.getDate())}.${дв(d.getMonth() + 1)}.${d.getFullYear()} ${дв(d.getHours())}:${дв(d.getMinutes())}\n`
    + `- **зачем:** ${NOTE}\n`
    + `- **сборки:** ` + Object.entries(версии).map(([к, в]) => к + ' ' + в).join(' · ') + '\n'
    + `- **было на боевом:** ${CURRENT}\n`
    + (меняются.length || новые.length || пропали.length
      ? `- **правится:** ${меняются.length} · **добавляется:** ${новые.length} · **пропадает:** ${пропали.length}\n`
        + [...меняются, ...новые].slice(0, 40).map((r) => `  - ${метка(r)} — \`${r}\``).join('\n') + '\n'
      : '- **изменений в файлах нет** (перевыкладка того же содержимого)\n')
    + (общие.length ? `- ⚠️ затронуты ОБЩИЕ данные — меняется и в АЛЬФЕ, и в БЕТЕ\n` : '')
    + `- **откатиться сюда:** \`node scripts/lab-rollback.mjs --to ${nextNum}\`\n\n`
  const было = fs.existsSync(LOG) ? fs.readFileSync(LOG, 'utf8') : ''
  const заголовок = '# Журнал выкладок витрины `/lab`\n\n'
    + 'Пишется скриптом `lab-deploy.mjs`, руками не правится. Каждая запись — папка-релиз\n'
    + 'на сервере и метка `lab-000N` в git: по ним и откатываются. Новые записи сверху.\n\n'
  // новая запись встаёт сразу под шапку: свежее сверху, читать сверху вниз
  fs.writeFileSync(LOG, было.startsWith(заголовок)
    ? заголовок + шапка + было.slice(заголовок.length)
    : заголовок + шапка + было)

  git(['add', '--', MIRROR, LOG, '.planning/KNIGA-VERSIONS.md', 'scripts/lab-common.mjs',
    'scripts/lab-deploy.mjs', 'scripts/lab-rollback.mjs', 'scripts/lab-server-init.mjs', 'scripts/pack-lab.mjs'])
  const есть = git(['diff', '--cached', '--name-only'], { allowFail: true })
  if (есть) {
    git(['commit', '-m', `витрина ${ID}: ${NOTE}`, '--no-verify'])
    console.log('  коммит сделан (push НЕ делаем — это правило проекта)')
  } else {
    console.log('  менять нечего, коммит не нужен')
  }
  git(['tag', '-f', 'lab-' + nextNum], { allowFail: true })
  sha = git(['rev-parse', '--short', 'HEAD'], { allowFail: true }) || 'без коммита'
  console.log(`  метка lab-${nextNum} → ${sha}`)
}

// ── 6. боевой ──────────────────────────────────────────────────────────────
console.log('\n── заливаю ──')
scpUp(TAR, '/tmp/lab-' + ID + '.tar.gz')

const описание = JSON.stringify({
  id: ID, когда: d.toISOString(), зачем: NOTE, коммит: sha, метка: 'lab-' + nextNum,
  версии, предыдущий: CURRENT,
  изменено: меняются.length, добавлено: новые.length, удалено: пропали.length,
}, null, 2)

console.log('\n── ставлю релиз ' + ID + ' и переключаю ──')
// ⚠️ Имена переменных в bash обязаны быть латиницей: PREV/NEW/LIVE, а не БЫЛО/НОВЫЙ.
// Провал — штатный исход: сервер сам вернул прежний релиз, и сказать об этом надо
// одной внятной строкой, а не стектрейсом node.
try {
  sshScript(`
set -eu
${REMOTE_HEALTH}
${REMOTE_LINK_SHARED}
cd ${ROOT}
PREV="$(basename "$(readlink current)")"
NEW="${ID}"

rm -rf "releases/$NEW"
mkdir -p "releases/$NEW"
tar -xzf "/tmp/lab-${ID}.tar.gz" -C "releases/$NEW"
rm -f "/tmp/lab-${ID}.tar.gz"
link_shared "releases/$NEW"
cat > "releases/$NEW/RELEASE.json" <<'JSONEOF'
${описание}
JSONEOF
( cd "releases/$NEW" && find . -type f ! -name MANIFEST.md5 ! -name RELEASE.json \\
    | sed 's#^\\./##' | sort | xargs md5sum > /tmp/man.md5 && mv /tmp/man.md5 MANIFEST.md5 )

ln -sfn "releases/$NEW" current
systemctl restart klassio-lab
echo "== проверяю живость =="
if health; then
  echo "== встало: current -> $(readlink current) =="
else
  echo
  echo "!! НЕ ВСТАЛО — возвращаю $PREV"
  ln -sfn "releases/$PREV" current
  systemctl restart klassio-lab
  if health; then echo "!! откат прошёл, на боевом снова $PREV"; else echo "!! ОТКАТ ТОЖЕ НЕ ПОМОГ — смотреть journalctl -u klassio-lab -n 50"; fi
  exit 1
fi

# держим последние ${KEEP} релизов, живой не трогаем ни при каких условиях
LIVE="$(basename "$(readlink current)")"
ls -1 releases | sort | head -n -${KEEP} | while read -r old; do
  [ "$old" = "$LIVE" ] && continue
  echo "  чищу старый релиз $old"
  rm -rf "releases/$old"
done
echo
df -h / | tail -1
du -sh releases
`)
} catch {
  console.error(`\n✗ Релиз ${ID} НЕ ВСТАЛ. Боевой сам вернулся на ${CURRENT} — руководитель видит то же, что и до выкладки.`)
  console.error(`  Снимок исходников в git остался (метка lab-${nextNum}), боевого он не касается.`)
  console.error(`  Что смотреть: ssh -i ${KEY} ${HOST} "journalctl -u klassio-lab -n 50"`)
  process.exit(1)
}

const URL = 'https://' + HOST.split('@').pop() + '.nip.io'
console.log(`
✓ На боевом релиз ${ID}
   ${URL}   логин klassio

   не понравилось — вернуть предыдущий:  node scripts/lab-rollback.mjs --back
   посмотреть все релизы:                node scripts/lab-rollback.mjs
   полная приёмка снаружи:
     LAB_URL=${URL} LAB_USER=klassio LAB_PASS=пароль node scripts/check-lab.mjs`)
