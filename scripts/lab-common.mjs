// ═══════════════════════════════════════════════════════════════════════════
//  ОБЩАЯ ОБВЯЗКА ВИТРИНЫ /lab
//  Где сервер, чем до него ходить, что считать исходником сборки.
//  Используют: lab-server-init.mjs · lab-deploy.mjs · lab-rollback.mjs
// ═══════════════════════════════════════════════════════════════════════════
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { execFileSync } from 'node:child_process'

export const HOST = process.env.LAB_HOST || 'root@5.35.90.219'
export const KEY = process.env.LAB_KEY || '.tmp/keys/klassio-lab'
export const ROOT = '/opt/klassio-lab'
export const PORT = 8781
export const KEEP = Number(process.env.LAB_KEEP || 10)   // сколько релизов держим на сервере
export const SRC = '.tmp/sketches/tutor'                  // рабочая копия урока
export const MIRROR = 'lab'                               // зеркало исходников ПОД GIT

// ── чем ходить ─────────────────────────────────────────────────────────────
// ⚠️ Windows OpenSSH отказывается читать ключ из папки проекта: «bad permissions»
// (виноваты ACL, а не мы). ssh из комплекта Git на ACL не смотрит и ключ берёт.
// Поэтому сначала ищем его, и только потом — то, что нашлось в PATH.
const findBin = (name) => {
  for (const p of [process.env['LAB_' + name.toUpperCase()],
    'C:/Program Files/Git/usr/bin/' + name + '.exe',
    'C:/Program Files (x86)/Git/usr/bin/' + name + '.exe']) {
    if (p && fs.existsSync(p)) return p
  }
  return name
}
export const SSH_BIN = findBin('ssh')
export const SCP_BIN = findBin('scp')
const SSH_OPTS = ['-i', KEY, '-o', 'StrictHostKeyChecking=accept-new', '-o', 'BatchMode=yes',
  '-o', 'ConnectTimeout=20']

// Скрипт уезжает на сервер СТДИНОМ (`bash -s`), а не строкой в кавычках: так не надо
// экранировать кавычки, и вся логика видна прямо здесь, в репозитории под git.
export const sshScript = (script, { capture = false } = {}) => {
  const out = execFileSync(SSH_BIN, [...SSH_OPTS, HOST, 'bash -s'], {
    input: Buffer.from(script, 'utf8'),
    encoding: 'utf8',
    maxBuffer: 32 * 1024 * 1024,
    // stderr всегда наружу: молчаливая ошибка на боевом — худшее, что может случиться
    stdio: capture ? ['pipe', 'pipe', 'inherit'] : ['pipe', 'inherit', 'inherit'],
  })
  return capture ? out : ''
}

export const scpUp = (local, remote) =>
  execFileSync(SCP_BIN, ['-i', KEY, '-o', 'StrictHostKeyChecking=accept-new', '-o', 'BatchMode=yes',
    local, HOST + ':' + remote], { stdio: 'inherit' })

// ── что считаем исходником ─────────────────────────────────────────────────
// Только ТЕКСТ: страницы сборок и данные урока. Рендеры страниц учебника,
// иллюстрации и 3D-модели в git не едут — копирайт и вес (25 МБ + 1.2 ГБ рядом).
export const PAGES = ['lab.html', 'kniga.html', 'kniga-v1.html', 'kniga-v23.html', 'obzor.html']

export const sources = () => {
  const out = PAGES.filter((f) => fs.existsSync(path.join(SRC, f)))
  // book/ сканируется, а не перечисляется: новый файл данных (как drill.json в v2.5)
  // иначе молча остаётся без истории — на белом списке в сервере на этом уже обожглись.
  const scan = (rel) => {
    const dir = path.join(SRC, rel)
    if (!fs.existsSync(dir)) return
    for (const f of fs.readdirSync(dir).sort()) {
      const st = fs.statSync(path.join(dir, f))
      if (st.isDirectory()) { scan(rel + '/' + f); continue }
      if (/\.(json|svg)$/.test(f) && !f.startsWith('_')) out.push(rel + '/' + f)
    }
  }
  scan('book')
  return out
}

// Кому принадлежит файл. Нужно на выкладке: правка ОБЩЕГО файла меняет и те сборки,
// которые руководитель считает замороженными, — про это обязана быть громкая строка.
// Сборки названы буквами греческого алфавита (урок про Грецию): АЛЬФА · БЕТА · ГАММА.
export const owner = (rel) => {
  if (rel === 'lab.html') return 'витрина'
  if (rel === 'kniga-v1.html' || rel.startsWith('book/v1/')) return 'АЛЬФА v1.0'
  if (rel === 'kniga-v23.html' || rel.startsWith('book/v23/')) return 'БЕТА v2.3'
  if (rel === 'kniga.html') return 'ГАММА'
  if (/^book\/(panel|test|drill|zakrep)\.json$/.test(rel)) return 'ГАММА'
  // blocks · figures · marks · pages · map-greece — их читают ВСЕ три сборки
  if (rel.startsWith('book/')) return 'ОБЩЕЕ'
  return 'прочее'
}

export const md5 = (file) => crypto.createHash('md5').update(fs.readFileSync(file)).digest('hex')

// версия сборки прямо из плашки #ver — чтобы в журнале релизов не врать
export const buildVersion = (file) => {
  try {
    const html = fs.readFileSync(path.join(SRC, file), 'utf8')
    const m = html.match(/id=["']?ver["']?[^>]*>\s*(v\d+\.\d+)/)   // «v2.3 · архив» → v2.3
    return m ? m[1] : '?'
  } catch { return '?' }
}

export const git = (args, { allowFail = false } = {}) => {
  try { return execFileSync('git', args, { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 }).trim() }
  catch (e) { if (allowFail) return ''; throw e }
}

export const assertRoot = () => {
  if (!fs.existsSync('scripts/yandex-test-server.mjs')) {
    console.error('Запускать из корня репозитория Klassio: node scripts/<скрипт>.mjs')
    process.exit(2)
  }
  if (!fs.existsSync(KEY)) {
    console.error('Нет ключа ' + KEY + ' — без него на сервер не попасть.')
    process.exit(2)
  }
}

// ── общая часть удалённых скриптов ─────────────────────────────────────────
// Проверка живости после переключения. Мало «процесс поднялся»: релиз считается
// удачным, только если открываются ВСЕ ТРИ сборки и отдаются их данные.
export const REMOTE_HEALTH = `
health() {
  for i in $(seq 1 25); do
    c=$(curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:${PORT}/lab || true)
    [ "$c" = "200" ] && break
    sleep 1
  done
  bad=0
  for pair in /lab:4000 /kniga:150000 /kniga/v1:100000 /kniga/v23:150000 \\
              /book/panel.json:10000 /book/drill.json:10000 /book/zakrep.json:5000 \\
              /book/v1/panel.json:5000 /book/v23/panel.json:5000 \\
              /book/blocks.json:10000 /book/map-greece.svg:50000 \\
              /api/changelog:2000 /clips/index.json:10; do
    u=\${pair%:*}; min=\${pair##*:}
    c=$(curl -s -o /tmp/lab-hc.out -w '%{http_code}' "http://127.0.0.1:${PORT}$u" || true)
    sz=$(stat -c %s /tmp/lab-hc.out 2>/dev/null || echo 0)
    if [ "$c" != "200" ] || [ "$sz" -lt "$min" ]; then
      echo "  ПРОМАХ $u -> код $c, $sz байт (ждали от $min)"; bad=1
    else
      echo "  ok $u -> $sz байт"
    fi
  done
  # на витрине обязаны быть все три карточки: иначе руководитель упрётся в пустой экран
  if ! curl -s http://127.0.0.1:${PORT}/lab | grep -q 'ГАММА'; then
    echo "  ПРОМАХ /lab -> нет карточек сборок"; bad=1
  fi
  return $bad
}
`

// Общее (секрет Яндекса и замечания руководителя) живёт ВНЕ релизов и вшивается
// в каждый ссылкой — иначе откат стёр бы замечания, ради которых всё и затевалось.
export const REMOTE_LINK_SHARED = `
link_shared() {   # $1 — папка релиза
  mkdir -p "$1/scripts" "$1/.tmp" ${ROOT}/shared ${ROOT}/shared/photos
  touch ${ROOT}/shared/feedback.jsonl
  ln -sfn ../../../shared/.yandex-secret.json "$1/scripts/.yandex-secret.json"
  ln -sfn ../../../shared/feedback.jsonl "$1/.tmp/feedback.jsonl"
  ln -sfn ../../../shared/photos "$1/.tmp/feedback-photos"
}
`
