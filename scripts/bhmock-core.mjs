// Мок «раннера» bitHuman — БЕЗ реального SDK, ключа и .imx. Один и тот же движок
// поднимается двумя способами:
//   · отдельным процессом  — scripts/bithuman-mock.mjs (порт 8090, как боевой раннер);
//   · прямо в стенде       — yandex-test-server.mjs на /api/bhmock/* (ничего запускать не надо).
// Второй путь появился после прогона 31.07: Кратов выбирал «ВИДЕО · bitHuman» и видел
// пустой экран — просто потому, что раннера никто не поднял. Теперь заглушка всегда
// под рукой, и «нет картинки» означает уже настоящую поломку, а не забытый процесс.
//
// Контракт тот же, что у scripts/bithuman-runner.py, плюс выбор лица:
//   GET  /health?avatar=id  → { ok, mock:true, avatar, talking }
//   GET  /avatars           → { avatars:[{id,name}] }        ← список лиц для выпадашки
//   GET  /stream?avatar=id  → MJPEG (multipart/x-mixed-replace)
//   POST /push {b64,last}   → PCM16: пока звук играет, рот двигается
//
// Кадры лежат в .tmp/sketches/tutor/m/bhmock/<id>/{talk0..talk4,blink}.jpg и рисуются
// генератором scripts/make-bhmock-faces.mjs.
import fs from 'node:fs'
import path from 'node:path'

const DIR = '.tmp/sketches/tutor/m/bhmock'
export const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
}

let talkingUntil = 0                 // ms-таймстамп, до которого «говорим»
const cache = new Map()              // id → { talk:[Buffer×5], blink:Buffer }

export function faces() {
  try { return JSON.parse(fs.readFileSync(path.join(DIR, 'faces.json'), 'utf8')) }
  catch { return [{ id: '', name: 'лицо-заглушка' }] }   // старый плоский набор без папок
}
const defaultFace = () => (faces()[0] || {}).id || ''

// Кадры лица. Папки нет (или лицо неизвестно) — откатываемся на плоский набор в корне,
// он остался от первой версии мока: пусть заглушка живёт, а не отдаёт 404.
function framesOf(id) {
  const key = id || ''
  if (cache.has(key)) return cache.get(key)
  const base = key ? path.join(DIR, key) : DIR
  const rd = (n) => fs.readFileSync(path.join(base, n + '.jpg'))
  let set
  try { set = { talk: [0, 1, 2, 3, 4].map((i) => rd('talk' + i)), blink: rd('blink') } }
  catch {
    if (key) return framesOf('')     // неизвестное лицо → плоский набор
    throw new Error('нет кадров мока в ' + DIR + ' — прогони node scripts/make-bhmock-faces.mjs')
  }
  cache.set(key, set)
  return set
}

function pickFrame(f, tick) {
  if (Date.now() < talkingUntil) {
    // говорим: рот открывается синусом (кадры 1..4)
    const lvl = 1 + Math.round(Math.abs(Math.sin(tick * 0.9)) * 3)
    return f.talk[Math.min(4, lvl)]
  }
  if (tick % 34 === 0 || tick % 34 === 1) return f.blink   // молчим: изредка моргаем
  return f.talk[0]
}

const jsonOut = (res, code, obj) => {
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', ...CORS })
  res.end(JSON.stringify(obj))
}

// sub — путь без префикса: 'health' | 'avatars' | 'stream' | 'push'.
// Возвращает true, если запрос обслужен (вызывающему остаётся только вернуть управление).
export function handleMock(req, res, sub, query) {
  if (req.method === 'OPTIONS') { res.writeHead(204, CORS); res.end(); return true }
  const avatar = (query && query.get('avatar')) || defaultFace()

  if (req.method === 'GET' && sub === 'health') {
    let ok = true
    try { framesOf(avatar) } catch { ok = false }
    jsonOut(res, 200, { ok, mock: true, avatar, avatars: faces(), talking: Date.now() < talkingUntil })
    return true
  }

  if (req.method === 'GET' && sub === 'avatars') { jsonOut(res, 200, { avatars: faces(), mock: true }); return true }

  if (req.method === 'GET' && sub === 'stream') {
    let f
    try { f = framesOf(avatar) } catch (e) { jsonOut(res, 500, { error: e.message }); return true }
    res.writeHead(200, {
      'Content-Type': 'multipart/x-mixed-replace; boundary=frame',
      'Cache-Control': 'no-store, no-cache', Connection: 'close', ...CORS,
    })
    let tick = 0
    const iv = setInterval(() => {
      const jpg = pickFrame(f, tick++)
      res.write(`--frame\r\nContent-Type: image/jpeg\r\nContent-Length: ${jpg.length}\r\n\r\n`)
      res.write(jpg); res.write('\r\n')
    }, 90)                                  // ~11 fps — хватает для проверки, мало трафика
    const stop = () => clearInterval(iv)
    req.on('close', stop); res.on('close', stop); req.on('error', stop)
    return true
  }

  if (req.method === 'POST' && sub === 'push') {
    let body = ''
    req.on('data', (c) => (body += c))
    req.on('end', () => {
      try {
        const p = JSON.parse(body || '{}')
        const bytes = p.b64 ? Buffer.byteLength(p.b64, 'base64') : 0
        const sec = bytes / 2 / 16000            // PCM16 mono 16k → длительность
        talkingUntil = Date.now() + Math.max(400, sec * 1000)
        jsonOut(res, 200, { ok: true, seconds: +sec.toFixed(2) })
      } catch (e) { jsonOut(res, 400, { error: e.message }) }
    })
    return true
  }
  return false
}
