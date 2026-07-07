// Сид «запись урока» для демо: завершённая сессия «Инвестиции для начинающих»
// (fin-gramotnost/investicii) с AI-резюме и полной лентой (реплики + события:
// доски, ошибки, верные ответы, награда, имя). Подстраховка на демо-путь Владимира,
// чтобы в ЛК точно была красивая запись независимо от живого мик-теста урока «Карта».
//
// Запуск:  npx tsx scripts/seed-demo-record.ts
// Требует: миграцию 0006 (колонки kind/meta) применённой — `npm run db:migrate`.
// Идемпотентно: фиксированный id сессии, лента переписывается заново.
// Пользователь = admin email (по умолчанию kratov.gr@gmail.com); переопределить —
// SEED_ADMIN_EMAIL или SEED_USER_ID.
import { config } from 'dotenv'
config({ path: '.env.local' })
config()

import { Client } from 'pg'

const ADMIN_EMAIL = (process.env.SEED_ADMIN_EMAIL ?? 'kratov.gr@gmail.com').toLowerCase()
const FIXED_SESSION_ID = '00000000-0000-4000-8000-000000000d01' // детерминированный → идемпотентно
const SUBJECT_ID = 'fin-gramotnost'
const LESSON_SLUG = 'investicii'

const SUMMARY =
  'Миша уверенно понял главную мысль урока — деньги должны работать, а не лежать без дела. ' +
  'Отлично разобрался с инфляцией на примере с мороженым и почувствовал, почему «просто копить» — мало. ' +
  'С риском был осторожен: сначала решил, что акции только растут, но после подсказки быстро поправился. ' +
  'Дома можно закрепить: посчитайте вместе, во что превратятся 100 ₽ через 10 лет под 10% годовых — ' +
  'это впечатляет и отлично показывает силу времени.'

type Row = { role: 'agent' | 'child'; text: string; kind?: string; meta?: Record<string, unknown> }

// Лента урока — порядок = seq. kind отсутствует у речевых реплик.
const STREAM: Row[] = [
  { role: 'agent', text: 'Привет! Меня зовут Аня. А тебя как?' },
  { role: 'child', text: 'Миша' },
  { role: 'agent', text: 'Имя ученика: Миша', kind: 'name', meta: { name: 'Миша' } },
  { role: 'agent', text: 'Очень приятно, Миша! Скажи, ты когда-нибудь копил на что-то большое?' },
  { role: 'child', text: 'Да, на велосипед копил' },
  { role: 'agent', text: 'Здорово! А сейчас я покажу, почему просто копить бывает мало.' },
  { role: 'agent', text: 'Открыта доска «Что такое инфляция»', kind: 'tool', meta: { tool: 'board', board: 'inflation', boardLabel: 'Что такое инфляция' } },
  { role: 'agent', text: 'Представь: сегодня мороженое стоит 50 рублей, а через год — уже 55. Деньги те же, а купить на них можно меньше. Это и есть инфляция.' },
  { role: 'agent', text: 'Задание: «Что делает инфляция с деньгами, которые просто лежат дома?»', kind: 'tool', meta: { tool: 'trainer', taskId: 'task-1', q: 'Что делает инфляция с деньгами, которые просто лежат дома?' } },
  { role: 'agent', text: 'Неверный ответ (задание 1)', kind: 'wrong', meta: { taskId: 'task-1' } },
  { role: 'agent', text: 'Не переживай, это частая ловушка. Подумай: если цены растут, а деньги лежат без дела — их «сила» растёт или тает?' },
  { role: 'child', text: 'Наверное тает…' },
  { role: 'agent', text: 'Верно со 2-й попытки: «Постепенно обесценивает»', kind: 'solve', meta: { taskId: 'task-1', skill: 'inflation' } },
  { role: 'agent', text: 'Именно! Поэтому деньги лучше вкладывать, чтобы они росли быстрее цен.' },
  { role: 'agent', text: 'Открыта доска «Акции — часть компании»', kind: 'tool', meta: { tool: 'board', board: 'stocks', boardLabel: 'Акции — часть компании' } },
  { role: 'agent', text: 'Купить акцию — значит купить маленький кусочек компании. Компания растёт — растёт и твой кусочек.' },
  { role: 'agent', text: 'Задание: «Акции — это всегда только рост, без риска?»', kind: 'tool', meta: { tool: 'trainer', taskId: 'task-2', q: 'Акции — это всегда только рост, без риска?' } },
  { role: 'agent', text: 'Верно: «Нет, цена может и падать»', kind: 'solve', meta: { taskId: 'task-2', skill: 'risk' } },
  { role: 'agent', text: 'Верно! У акций бывают взлёты и падения — поэтому не кладём все деньги в одну корзину.' },
  { role: 'agent', text: 'Открыта доска «Сила времени»', kind: 'tool', meta: { tool: 'board', board: 'time', boardLabel: 'Сила времени' } },
  { role: 'agent', text: 'И самое волшебное: чем раньше начнёшь, тем больше вырастут деньги. Даже небольшие суммы за годы превращаются в крупные.' },
  { role: 'agent', text: 'Задание: «Что помогает маленьким вложениям стать большими?»', kind: 'tool', meta: { tool: 'trainer', taskId: 'task-3', q: 'Что помогает маленьким вложениям стать большими?' } },
  { role: 'child', text: 'Время!' },
  { role: 'agent', text: 'Верно: «Время»', kind: 'solve', meta: { taskId: 'task-3', skill: 'compounding' } },
  { role: 'agent', text: 'Ты молодец, Миша! Теперь ты знаешь, как деньги могут работать на тебя.' },
  { role: 'agent', text: 'Награда: урок пройден', kind: 'reward', meta: { label: 'урок пройден' } },
]

// Neon free tier рвёт TCP между запросами на одном соединении — свежий Client
// на каждую операцию (проверенный паттерн из scripts/seed.ts, withClient).
async function withClient<T>(fn: (client: Client) => Promise<T>): Promise<T> {
  const client = new Client({ connectionString: process.env.DATABASE_URL_DIRECT })
  await client.connect()
  try {
    return await fn(client)
  } finally {
    await client.end()
  }
}

async function main() {
  if (!process.env.DATABASE_URL_DIRECT) {
    throw new Error('DATABASE_URL_DIRECT required (direct, NOT pooler — Pitfall 3)')
  }
  // 1. userId
  let userId = process.env.SEED_USER_ID
  if (!userId) {
    const r = await withClient((c) => c.query('SELECT id FROM "user" WHERE lower(email) = $1 LIMIT 1', [ADMIN_EMAIL]))
    if (!r.rows.length) throw new Error(`Нет пользователя ${ADMIN_EMAIL}. Сначала: npm run db:seed (или задай SEED_USER_ID).`)
    userId = r.rows[0].id as string
  }
  console.log(`[seed-record] user.id = ${userId}`)

  // 2. верифицируем колонки kind/meta (иначе миграция 0006 не применена)
  const col = await withClient((c) =>
    c.query(`SELECT column_name FROM information_schema.columns WHERE table_name='lesson_transcript' AND column_name IN ('kind','meta')`),
  )
  if (col.rows.length < 2) {
    throw new Error('В lesson_transcript нет колонок kind/meta — примени миграцию (node scripts/apply-0006-direct.mjs), потом повтори сид.')
  }

  // 3. сессия (upsert по фиксированному id → идемпотентно)
  const startedAt = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000) // 2 дня назад
  const durationSec = 17 * 60
  const endedAt = new Date(startedAt.getTime() + durationSec * 1000)
  await withClient((c) =>
    c.query(
      `INSERT INTO tutor_session (id, user_id, subject_id, lesson_slug, attempt_number, phase, status, started_at, ended_at, duration_sec, summary, voice_provider)
       VALUES ($1,$2,$3,$4,1,'farewell','completed',$5,$6,$7,$8,'sber')
       ON CONFLICT (id) DO UPDATE SET
         user_id=EXCLUDED.user_id, status='completed', phase='farewell',
         started_at=EXCLUDED.started_at, ended_at=EXCLUDED.ended_at,
         duration_sec=EXCLUDED.duration_sec, summary=EXCLUDED.summary, voice_provider='sber'`,
      [FIXED_SESSION_ID, userId, SUBJECT_ID, LESSON_SLUG, startedAt.toISOString(), endedAt.toISOString(), durationSec, SUMMARY],
    ),
  )
  console.log(`[seed-record] сессия ${FIXED_SESSION_ID} (fin-gramotnost/investicii, completed)`)

  // 4. лента — переписываем заново, вставка ОДНИМ статементом
  await withClient((c) => c.query('DELETE FROM lesson_transcript WHERE session_id = $1', [FIXED_SESSION_ID]))
  const params: unknown[] = []
  const values = STREAM.map((row, seq) => {
    params.push(FIXED_SESSION_ID, userId, row.role, row.text, seq, row.kind ?? null, row.meta ? JSON.stringify(row.meta) : null)
    const b = seq * 7
    return `($${b + 1},$${b + 2},$${b + 3},$${b + 4},$${b + 5},$${b + 6},$${b + 7}::jsonb)`
  })
  await withClient((c) =>
    c.query(`INSERT INTO lesson_transcript (session_id, user_id, role, text, seq, kind, meta) VALUES ${values.join(',')}`, params),
  )
  console.log(`[seed-record] лента: ${STREAM.length} строк (${STREAM.filter((r) => !r.kind).length} реплик, ${STREAM.filter((r) => r.kind).length} событий)`)
  console.log(`[seed-record] готово → /cabinet/lessons/${FIXED_SESSION_ID}`)
}

main().catch((e) => {
  console.error('[seed-record] FAILED:', e.message ?? e)
  process.exit(1)
})
