// ВРАЧ ВИДЕО-УЧИТЕЛЯ: где рвётся цепочка «браузер → стенд → раннер → живые кадры».
//
// Зачем. Жалоба «звук идёт, а картинка статичная» одинаково выглядит при пяти разных
// поломках: ведёт вообще другой учитель, раннер недоступен, урок свалился на заглушку,
// поток не открылся, кадры идут но все одинаковые. Глазом их не различить, и 14.08 мы
// на этом уже ошиблись диагнозом. Этот скрипт различает их за полминуты.
//
// ⚠️ Ходит ЧЕРЕЗ ПРОКСИ СТЕНДА — тем же путём, что браузер. Прямые замеры
// (scripts/bh-lipsync-measure.py) проверяют раннер, а не то, что доезжает до страницы.
//
//   node scripts/bh-doctor.mjs [http://localhost:8781] [http://87.120.93.151:8090]
import fs from 'node:fs'
import crypto from 'node:crypto'

const СТЕНД = (process.argv[2] || 'http://localhost:8781').replace(/\/+$/, '')
const РАННЕР = (process.argv[3] || 'http://87.120.93.151:8090').replace(/\/+$/, '')
const ФРАЗА = '.tmp/bh/fraza3.wav'
const итог = []
const строка = (звено, ок, что) => { итог.push({ звено, ок, что }); console.log(`${ок ? '✅' : '❌'} ${звено}: ${что}`) }

// ── 1. Стенд ──────────────────────────────────────────────────────────────────
let html = ''
try {
  const r = await fetch(`${СТЕНД}/kniga`)
  html = await r.text()
  const в = (html.match(/<title>([^ <]+)/) || [])[1] || '?'
  строка('стенд', r.ok, r.ok ? `отвечает, сборка ${в}` : `не отдал урок: ${r.status}`)
} catch (e) {
  строка('стенд', false, `не поднят (${e.message}) — запустить: node scripts/yandex-test-server.mjs`)
}

// ── 2. Кого урок поставит учителем по умолчанию ────────────────────────────────
// Список в разметке: первое option — то, что увидит браузер БЕЗ ?teacher= и без памяти.
const поумолчанию = (html.match(/id=tchWho[^>]*>\s*<option value="?([a-z0-9-]+)/i) || [])[1] || '?'
const свой = /localStorage\.kn_teacher[\s\S]{0,120}?tchWho'\)\.value=кто|kn_teacher\s*\n?\s*if\(кто&&/.test(html)
console.log(`ℹ️  учитель без ссылки: «${поумолчанию}»` +
  (свой ? ' (но сохранённый выбор восстанавливается — правка 17.08)'
        : ' — и сохранённый выбор НЕ восстанавливается: без «?teacher=bh» аватар не поднимется вовсе'))

// ── 3. Раннер через прокси стенда (так ходит браузер) ─────────────────────────
let живой = false
try {
  const j = await (await fetch(`${СТЕНД}/api/bithuman-health?base=${encodeURIComponent(РАННЕР)}`)).json()
  живой = !!j.ok && !j.mock
  строка('раннер через прокси', живой,
    j.ok ? (j.mock ? 'отвечает ЗАГЛУШКА стенда, а не боевой раннер' : `боевой, лицо ${j.avatar}, кадров за сеанс ${j['кадров_за_сеанс']}`)
      : `не отвечает: ${j.error || '—'}`)
} catch (e) { строка('раннер через прокси', false, e.message) }

// ── 4. Поток и ЖИВЫЕ кадры под речь ───────────────────────────────────────────
if (живой && fs.existsSync(ФРАЗА)) {
  const wav = fs.readFileSync(ФРАЗА)
  const pcm = wav.subarray(44)                       // заголовок WAV — 44 байта
  const сек = pcm.length / 2 / 16000
  const ac = new AbortController()
  const кадры = []
  try {
    const поток = await fetch(`${СТЕНД}/api/bithuman-stream?base=${encodeURIComponent(РАННЕР)}`, { signal: ac.signal })
    строка('поток открылся', поток.ok, поток.ok ? 'MJPEG пошёл' : `${поток.status}`)
    if (poток_ок(поток)) {
      const чтец = поток.body.getReader()
      const t0 = Date.now()
      ;(async () => {
        let буф = Buffer.alloc(0)
        while (true) {
          const { done, value } = await чтец.read().catch(() => ({ done: true }))
          if (done) break
          буф = Buffer.concat([буф, Buffer.from(value)])
          for (;;) {
            const a = буф.indexOf(Buffer.from([0xFF, 0xD8]))
            const b = a < 0 ? -1 : буф.indexOf(Buffer.from([0xFF, 0xD9]), a + 2)
            if (a < 0 || b < 0) break
            кадры.push([Date.now() - t0, crypto.createHash('md5').update(буф.subarray(a, b + 2)).digest('hex')])
            буф = буф.subarray(b + 2)
          }
        }
      })()
      await new Promise((r) => setTimeout(r, 1500))
      const было = кадры.length
      const подача = Date.now() - t0
      await fetch(`${СТЕНД}/api/bithuman-push`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ base: РАННЕР, b64: pcm.toString('base64'), last: true }),
      })
      await new Promise((r) => setTimeout(r, (сек + 2.5) * 1000))
      ac.abort()
      const речь = кадры.filter(([t]) => t >= подача && t <= подача + сек * 1000)
      const разных = new Set(речь.map(([, h]) => h)).size
      строка('кадры доезжают', речь.length > 10, `${речь.length} шт. за ${сек.toFixed(1)} с (до подачи звука было ${было})`)
      строка('картинка ЖИВАЯ', разных > сек * 10,
        `РАЗНЫХ кадров ${разных} = ${(разных / сек).toFixed(1)}/с` +
        (разных > сек * 10 ? ' (норма ~25)' : ' — раннер шлёт один и тот же снимок, лицо не отыгрывает'))
      const первый = речь.find(([, h], i) => i && h !== речь[0][1])
      if (первый) строка('пауза до движения', первый[0] - подача < 1500,
        `${((первый[0] - подача) / 1000).toFixed(2)} с (тёплый раннер даёт ~0.9, холодный 2–4)`)
    }
  } catch (e) { строка('поток', false, e.message) }
} else if (живой) {
  строка('фраза для пробы', false, `нет файла ${ФРАЗА} — положить WAV mono 16 кГц PCM16`)
}

function poток_ок(п) { return п.ok && п.body }

console.log('\n' + '─'.repeat(70))
const плохо = итог.filter((x) => !x.ок)
if (!плохо.length) console.log('ВЕРДИКТ: цепочка целая. Если глазом всё равно статика — снимать\n'
  + '         вкладку видео и смотреть, что рисует canvas (виновата отрисовка, не раннер).')
else {
  console.log('ВЕРДИКТ: рвётся здесь → ' + плохо.map((x) => x.звено).join(' · '))
  console.log('Первое сломанное звено и чинить: ' + плохо[0].звено + ' — ' + плохо[0].что)
}
