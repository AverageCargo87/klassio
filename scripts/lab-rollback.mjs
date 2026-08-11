#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════════════════
//  ОТКАТ ВИТРИНЫ НА ПРОШЛЫЙ РЕЛИЗ
//
//  node scripts/lab-rollback.mjs              показать релизы и готовые команды
//  node scripts/lab-rollback.mjs --back       вернуть предыдущий
//  node scripts/lab-rollback.mjs --to 0003    вернуть конкретный
//  node scripts/lab-rollback.mjs --to 0003 --local
//        плюс вернуть ИСХОДНИКИ на рабочей машине из метки git lab-0003
//        (рабочая копия сначала откладывается в .tmp/lab-before-restore-…)
//
//  Без аргументов боевого НЕ трогает: голая команда не должна менять то,
//  что смотрит руководитель. Список сам печатает строку, которую надо запустить.
//
//  Откат = переставить ссылку current и перезапустить службу, это секунда.
//  Замечания руководителя лежат в shared/ и откатом НЕ стираются.
// ═══════════════════════════════════════════════════════════════════════════
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { assertRoot, sshScript, git, md5, ROOT, HOST, KEY, SRC, MIRROR, REMOTE_HEALTH } from './lab-common.mjs'

const хеш = (buf) => crypto.createHash('md5').update(buf).digest('hex')

assertRoot()
const argv = process.argv.slice(2)
const BACK = argv.includes('--back')
const LOCAL = argv.includes('--local')
const TO = (() => { const i = argv.indexOf('--to'); return i >= 0 ? (argv[i + 1] || '') : '' })()

// ── что есть на сервере ────────────────────────────────────────────────────
const raw = sshScript(`
set -eu
cd ${ROOT}
[ -L current ] || { echo "НЕТ-РЕЛИЗОВ"; exit 0; }
echo "CURRENT=$(basename "$(readlink current)")"
for f in releases/*/; do
  echo "---релиз---"
  echo "ПАПКА=$(basename "$f")"
  cat "$f/RELEASE.json" 2>/dev/null || echo '{}'
done
`, { capture: true })

if (/НЕТ-РЕЛИЗОВ/.test(raw)) {
  console.error('Сервер ещё не переехал на релизы. Сначала: node scripts/lab-server-init.mjs')
  process.exit(2)
}
const CURRENT = (raw.match(/CURRENT=(\S+)/) || [])[1]
const список = raw.split('---релиз---').slice(1).map((кусок) => {
  const папка = (кусок.match(/ПАПКА=(\S+)/) || [])[1]
  let инфо = {}
  try { инфо = JSON.parse(кусок.slice(кусок.indexOf('{'))) } catch { /* релиз без описания */ }
  return { папка, номер: (папка || '').slice(0, 4), инфо, живой: папка === CURRENT }
}).filter((r) => r.папка)
список.sort((a, b) => a.папка.localeCompare(b.папка))

const датой = (r) => (r.инфо.когда || '').replace('T', ' ').slice(0, 16) || '—'
// Ключи читаем как есть: у релизов до 11.08 сборки звались АЛЬФА·БРАВО·ЧАРЛИ, и старый
// список не должен превратиться в «undefined» из-за переименования в греческие буквы.
const версией = (r) => r.инфо.версии
  ? Object.entries(r.инфо.версии).map(([к, в]) => к + ' ' + в).join(' · ')
  : '—'

if (!BACK && !TO) {
  console.log('Релизы витрины на ' + HOST + ':\n')
  for (const r of список) {
    console.log(`${r.живой ? '▶' : ' '} ${r.номер}  ${r.папка}${r.живой ? '   ← сейчас на боевом' : ''}`)
    console.log(`     когда:  ${датой(r)}`)
    console.log(`     зачем:  ${r.инфо.зачем || r.инфо.что || '—'}`)
    console.log(`     сборки: ${версией(r)}`)
    console.log(`     git:    ${r.инфо.метка ? r.инфо.метка + ' (' + r.инфо.коммит + ')' : '—'}`)
    console.log('')
  }
  const пред = список[список.findIndex((r) => r.живой) - 1]
  console.log('Вернуть предыдущий:  node scripts/lab-rollback.mjs --back'
    + (пред ? '        (это ' + пред.номер + ')' : '   — предыдущего нет, релиз один'))
  console.log('Вернуть конкретный:  node scripts/lab-rollback.mjs --to <номер>')
  console.log('И исходники на машине: то же самое с --local')
  process.exit(0)
}

// ── выбираем цель ──────────────────────────────────────────────────────────
let цель
if (BACK) {
  const i = список.findIndex((r) => r.живой)
  цель = список[i - 1]
  if (!цель) { console.error('Предыдущего релиза нет — на сервере он единственный.'); process.exit(1) }
} else {
  const найдено = список.filter((r) => r.папка.startsWith(TO) || r.номер === TO.padStart(4, '0'))
  if (найдено.length !== 1) {
    console.error(найдено.length ? 'Под «' + TO + '» подходит несколько релизов.' : 'Нет релиза «' + TO + '».')
    console.error('Список: node scripts/lab-rollback.mjs')
    process.exit(1)
  }
  цель = найдено[0]
}
if (цель.живой) { console.log('Релиз ' + цель.папка + ' и так на боевом — делать нечего.'); process.exit(0) }

console.log(`── откат: ${CURRENT}  →  ${цель.папка} ──`)
console.log(`   зачем он был: ${цель.инфо.зачем || цель.инфо.что || '—'}`)
console.log(`   сборки:       ${версией(цель)}\n`)

// ── боевой ─────────────────────────────────────────────────────────────────
// Неудача здесь — штатный исход, а не авария скрипта: сервер уже вернул прежний
// релиз сам. Поэтому ловим и говорим по-человечески, без стектрейса на пол-экрана.
try {
  sshScript(`
set -eu
${REMOTE_HEALTH}
cd ${ROOT}
PREV="$(basename "$(readlink current)")"
TARGET="${цель.папка}"
[ -d "releases/$TARGET" ] || { echo "на сервере нет папки releases/$TARGET"; exit 1; }
ln -sfn "releases/$TARGET" current
systemctl restart klassio-lab
echo "== проверяю живость =="
if health; then
  echo "== на боевом $TARGET =="
else
  echo
  echo "!! релиз $TARGET не поднялся — возвращаю $PREV"
  ln -sfn "releases/$PREV" current
  systemctl restart klassio-lab
  health || echo "!! и $PREV не отвечает — journalctl -u klassio-lab -n 50"
  exit 1
fi
`)
} catch {
  console.error(`\n✗ Релиз ${цель.папка} не поднялся — сервер сам вернул тот, что был.`)
  console.error(`  Что смотреть: ssh -i ${KEY} ${HOST} "journalctl -u klassio-lab -n 50"`)
  process.exit(1)
}

// ── исходники на рабочей машине ────────────────────────────────────────────
if (LOCAL) {
  console.log('\n── возвращаю исходники локально ──')
  const метка = цель.инфо.метка || ('lab-' + цель.номер)
  const есть = git(['tag', '-l', метка], { allowFail: true })
  if (!есть) {
    console.log(`  ⚠️ метки ${метка} в git нет (релиз старше перехода на зеркало) —`)
    console.log('     на сервере откат прошёл, локальные исходники остались как были')
  } else {
    const файлы = git(['ls-tree', '-r', '--name-only', метка, MIRROR + '/'], { allowFail: true })
      .split('\n').map((s) => s.trim()).filter(Boolean)
    // ⚠️ Сначала откладываем то, что сейчас в работе: откат не имеет права
    // стереть незакоммиченную правку, о которой автор ещё не пожалел.
    const запас = '.tmp/lab-before-restore-' + new Date().toISOString().replace(/[:.]/g, '-').slice(0, 16)
    let вернули = 0, отложили = 0
    for (const f of файлы) {
      const rel = f.slice(MIRROR.length + 1)
      const рабочий = path.join(SRC, rel)
      const буфер = execFileSync('git', ['show', метка + ':' + f], { maxBuffer: 64 * 1024 * 1024 })
      if (fs.existsSync(рабочий)) {
        if (md5(рабочий) === хеш(буфер)) continue
        const куда = path.join(запас, rel)
        fs.mkdirSync(path.dirname(куда), { recursive: true })
        fs.copyFileSync(рабочий, куда); отложили++
      }
      fs.mkdirSync(path.dirname(рабочий), { recursive: true })
      fs.writeFileSync(рабочий, буфер); вернули++
    }
    console.log(`  вернул из ${метка}: ${вернули} файлов (рабочая копия отложена в ${запас}: ${отложили})`)
    console.log('  ⚠️ зеркало lab/ осталось от последней выкладки — оно приведётся в порядок')
    console.log('     на следующей: node scripts/lab-deploy.mjs -m "..."')
  }
}

const URL = 'https://' + HOST.split('@').pop() + '.nip.io'
console.log(`\n✓ На боевом ${цель.папка}\n   ${URL}   логин klassio`)
console.log('   вперёд/назад — тем же скриптом: node scripts/lab-rollback.mjs')
