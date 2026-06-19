// scripts/probe-sber-tutor-ws.mjs — смоук-тест Sber-оркестратора БЕЗ микрофона.
// Гоняет полный путь: HMAC-upgrade → init/приветствие → user_text-триггеры →
// tool_call→tool_result раунд-трипы (отвечаем как фронтовые clientTools) → end.
//
//   node scripts/probe-sber-tutor-ws.mjs --local     → ws://127.0.0.1:3002 (оркестратор запущен локально)
//   node scripts/probe-sber-tutor-ws.mjs             → wss://87.120.93.35.nip.io/sber-tutor (VPS)
//   node scripts/probe-sber-tutor-ws.mjs --url ws://...&sid=..   (готовый URL, без подписи)
//
// Секрет берёт из .env.local: SBER_TUTOR_HMAC_SECRET || VOICE_PROXY_HMAC_SECRET
// (на VPS в /opt/klassio-sber-tutor/.env лежит тот же секрет, что у voice-proxy).
import { createHmac, randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'

const WebSocketImpl = globalThis.WebSocket ?? (await import('undici')).WebSocket

const args = process.argv.slice(2)
const isLocal = args.includes('--local')
const urlArg = args.includes('--url') ? args[args.indexOf('--url') + 1] : null

function envVal(name) {
  try {
    const env = readFileSync('.env.local', 'utf8')
    return (env.match(new RegExp(`^${name}=(.*)$`, 'm')) || [])[1]?.trim()
  } catch { return undefined }
}

let url = urlArg
if (!url) {
  const secret = envVal('SBER_TUTOR_HMAC_SECRET') || envVal('VOICE_PROXY_HMAC_SECRET')
  if (!secret) { console.error('Нет SBER_TUTOR_HMAC_SECRET / VOICE_PROXY_HMAC_SECRET в .env.local'); process.exit(1) }
  const sid = randomUUID()
  const t = String(Date.now())
  const s = createHmac('sha256', secret).update(`${sid}:${t}`).digest('hex')
  const base = isLocal ? 'ws://127.0.0.1:3002/sber-tutor' : 'wss://87.120.93.35.nip.io/sber-tutor'
  url = `${base}?sid=${sid}&t=${t}&s=${s}`
}
console.log('→ connecting:', url.replace(/s=[0-9a-f]+/, 's=…'))

// Реплики «ребёнка» по очереди — каждый user_text триггерит ход Ани.
const TURNS = [
  'Меня зовут Гриша!',
  'У меня всё хорошо, сегодня в школе была физкультура, мы играли в вышибалы. А давай уже начинать урок!',
  'Понятно! Звучит интересно, давай дальше.',
]

// Отвечаем на tool_call как фронтовые clientTools — ВКЛЮЧАЯ пейсинг-гварды
// (60-сек пол на теоретической доске, отказ в награде до 13 решённых, одно
// действие за ход). Без них базовый GigaChat флудит вызовами, и тест нереалистичен.
const BOARDS = ['cover', 'etymology', 'bodies', 'solar', 'sunEarth', 'facts']
let boardIdx = 0
let boardShownAt = 0
let currentBoard = ''
const BOARD_MIN_MS = 60000
function mockToolResult(name, toolArgs) {
  const leavingTooSoon = () => currentBoard && currentBoard !== 'cover' && Date.now() - boardShownAt < BOARD_MIN_MS
  switch (name) {
    case 'next_slide': {
      if (leavingTooSoon()) return 'Рано листать дальше — теоретический слайд держится не меньше 60 секунд. Разбери текущий, потом следующий.'
      const b = BOARDS[Math.min(boardIdx, BOARDS.length - 1)]
      boardIdx++; currentBoard = b; boardShownAt = Date.now()
      return `OK, показана доска "${b}" (${Math.min(boardIdx, BOARDS.length)}/6).`
    }
    case 'show_board': {
      const b = toolArgs?.board ?? '?'
      if (b === 'reward') return 'Рано: экран «урок пройден» — только после всех 13 заданий (решено 0). Не показывай его сейчас.'
      if (b !== currentBoard && leavingTooSoon()) return 'Рано уходить со слайда — теоретический слайд держится не меньше 60 секунд. Разбери его, дай ребёнку рассмотреть, потом переходи.'
      currentBoard = b; boardShownAt = Date.now()
      return `OK, доска "${b}" показана — рассказывай чуть медленнее.`
    }
    case 'show_trainer': {
      if (leavingTooSoon()) return 'Рано показывать задание — теоретический слайд держится не меньше 60 секунд. Разбери доску и дай ребёнку рассмотреть, потом задание.'
      return `OK, на экране задание ${toolArgs?.taskId ?? 'task-1'} (ВЫБОР варианта): «Что изучает астрономия?». Варианты: звёзды и планеты / растения / минералы. Правильный: звёзды и планеты. Объяви ИМЕННО этот вопрос своими словами и попроси ребёнка ВЫБРАТЬ правильный вариант на экране. Правильный ответ вслух НЕ называй.`
    }
    case 'set_phase': return `Фаза: ${toolArgs?.phase ?? '?'}`
    case 'set_child_name': return `Имя запомнено: ${toolArgs?.name ?? '?'}`
    case 'give_reward': return 'Рано: экран «урок пройден» показывается ТОЛЬКО в самом конце. Сейчас решено 0 из 13 — продолжай урок, награду пока не показывай.'
    case 'lesson_state': return `фаза cycle, решено 0/13, ошибок подряд 0 | доски показаны: [${BOARDS.slice(0, boardIdx).join(',') || '—'}], осталось: [${BOARDS.slice(boardIdx).join(',') || '—'}]`
    case 'hide_tool': return 'Холст очищен'
    default: return 'OK'
  }
}

const ws = new WebSocketImpl(url)
let turnIdx = 0
let turnSentAt = 0
let firstAudioAt = 0
let audioCount = 0
const timings = []

function nextTurn() {
  if (turnIdx >= TURNS.length) {
    console.log('\n══ TIMINGS (user_text → первый audio-чанк) ══')
    timings.forEach((ms, i) => console.log(`  ход ${i + 1}: ${ms} мс`))
    try { ws.send(JSON.stringify({ type: 'end' })) } catch {}
    setTimeout(() => process.exit(0), 500)
    return
  }
  const text = TURNS[turnIdx++]
  console.log(`\n→ user_text[${turnIdx}]: «${text}»`)
  turnSentAt = Date.now()
  firstAudioAt = 0
  audioCount = 0
  ws.send(JSON.stringify({ type: 'user_text', text, trigger: true }))
}

ws.onopen = () => {
  console.log('✓ WS open — отправляю init')
  ws.send(JSON.stringify({
    type: 'init',
    voiceName: 'Аня',
    voiceId: 'Nec_24000',
    dynamicVariables: {
      child_name: 'друг',
      lesson_title: 'Мир глазами астронома',
      lesson_topic: 'кто такие астрономы и что такое Солнечная система',
      is_first_lesson: 'да',
      is_first_lesson_phrase: 'первый урок — вы знакомитесь',
      prior_lessons_done: 0,
      attempt_number: 1,
    },
  }))
}
ws.onmessage = (ev) => {
  if (typeof ev.data !== 'string') return
  let m; try { m = JSON.parse(ev.data) } catch { return }
  switch (m.type) {
    case 'ready': console.log('✓ ready'); break
    case 'mode': console.log(`  mode=${m.mode}`); break
    case 'transcript': console.log(`  ${m.role === 'agent' ? 'Аня' : 'Ребёнок'}: ${m.text}`); break
    case 'tool_call': {
      console.log(`  ⚙ tool_call: ${m.name}(${JSON.stringify(m.args)})`)
      const result = mockToolResult(m.name, m.args)
      ws.send(JSON.stringify({ type: 'tool_result', id: m.id, result }))
      break
    }
    case 'audio': {
      audioCount++
      if (!firstAudioAt) {
        firstAudioAt = Date.now()
        if (turnSentAt) { const ms = firstAudioAt - turnSentAt; timings.push(ms); console.log(`  🔊 первый audio через ${ms} мс`) }
        else console.log('  🔊 первый audio (приветствие)')
      }
      break
    }
    case 'agent_done': {
      console.log(`  ✓ agent_done (${audioCount} чанков)`)
      setTimeout(nextTurn, 300)
      break
    }
    case 'error': console.error('  ✗ server error:', m.message); break
  }
}
ws.onerror = (e) => { console.error('✗ WS error:', e?.message || e); }
ws.onclose = (e) => { console.log(`WS closed code=${e.code}`); process.exit(e.code === 1000 ? 0 : 1) }

setTimeout(() => { console.error('✗ глобальный таймаут 180с'); process.exit(1) }, 180000)
