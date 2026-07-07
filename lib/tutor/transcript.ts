// Lesson transcript persistence (эпик «Образовательная платформа», июнь 2026).
// Родитель может открыть полную запись урока в ЛК. Клиент копит СТРОКИ ЛЕНТЫ и шлёт
// их батчами (на завершении/размонтировании + периодически), чтобы не делать
// HTTP-запрос на каждую строку. Ownership проверяется один раз на батч.
//
// Строка ленты = либо речевая реплика (role agent|child, kind=null), либо событие
// урока (kind: 'tool'|'wrong'|'solve'|'reward'|'name'; role — техническая заглушка
// 'agent'). Общий монотонный `seq` с клиента гарантирует правильный порядок ленты.
import { db } from '@/lib/db'
import { lessonTranscripts, tutorSessions } from '@/lib/db/schema'
import { and, eq, asc } from 'drizzle-orm'

/** Тип события ленты (null у речевых реплик — рендерятся по role). */
export type TranscriptKind = 'tool' | 'wrong' | 'solve' | 'reward' | 'name'

export interface TranscriptLine {
  role: 'agent' | 'child'
  text: string
  seq: number
  kind?: TranscriptKind | null
  meta?: Record<string, unknown> | null
}

const EVENT_KINDS: ReadonlySet<string> = new Set(['tool', 'wrong', 'solve', 'reward', 'name'])

/**
 * Дописать батч строк ленты в запись сессии. Возвращает число вставленных строк,
 * или -1 если сессия не принадлежит пользователю. Дубли по (session, seq)
 * отбрасываются (onConflictDoNothing) — клиент может ретраить батч безопасно.
 */
export async function appendTranscript(input: {
  sessionId: string
  userId: string
  lines: TranscriptLine[]
}): Promise<number> {
  const { sessionId, userId, lines } = input
  if (!lines.length) return 0

  // Ownership (defence in depth — роут тоже проверяет auth).
  const owns = await db
    .select({ id: tutorSessions.id })
    .from(tutorSessions)
    .where(and(eq(tutorSessions.id, sessionId), eq(tutorSessions.userId, userId)))
    .limit(1)
  if (!owns.length) return -1

  const rows = lines
    .filter((l) => {
      if (!l || typeof l.text !== 'string' || !l.text.trim()) return false
      // Событие — валиден любой известный kind; речевая строка — только agent|child.
      return l.kind ? EVENT_KINDS.has(l.kind) : l.role === 'agent' || l.role === 'child'
    })
    .map((l) => ({
      sessionId,
      userId,
      // У событий author не важен — пишем 'agent' как not-null заглушку.
      role: l.role === 'child' ? 'child' : 'agent',
      text: l.text.trim().slice(0, 4000),
      seq: l.seq,
      kind: l.kind ?? null,
      meta: (l.meta ?? null) as object | null,
    }))
  if (!rows.length) return 0

  await db
    .insert(lessonTranscripts)
    .values(rows)
    .onConflictDoNothing({ target: [lessonTranscripts.sessionId, lessonTranscripts.seq] })
  return rows.length
}

/** Полная лента урока в порядке `seq`. Пустой массив, если не владелец/нет записи. */
export async function getTranscript(sessionId: string, userId: string): Promise<TranscriptLine[]> {
  const map = (r: { role: string; text: string; seq: number; kind?: string | null; meta?: unknown }): TranscriptLine => ({
    role: r.role === 'child' ? 'child' : 'agent',
    text: r.text,
    seq: r.seq,
    kind: (r.kind as TranscriptKind | null) ?? null,
    meta: (r.meta as Record<string, unknown> | null) ?? null,
  })
  try {
    const rows = await db
      .select({
        role: lessonTranscripts.role,
        text: lessonTranscripts.text,
        seq: lessonTranscripts.seq,
        kind: lessonTranscripts.kind,
        meta: lessonTranscripts.meta,
      })
      .from(lessonTranscripts)
      .where(and(eq(lessonTranscripts.sessionId, sessionId), eq(lessonTranscripts.userId, userId)))
      .orderBy(asc(lessonTranscripts.seq))
    return rows.map(map)
  } catch (err) {
    // Колонки kind/meta ещё не в БД (миграция 0006 не применена) — деградируем к
    // речевой ленте, чтобы страница записи не падала до применения миграции.
    console.warn('[tutor/transcript] kind/meta select failed, falling back to speech-only:', err)
    const rows = await db
      .select({ role: lessonTranscripts.role, text: lessonTranscripts.text, seq: lessonTranscripts.seq })
      .from(lessonTranscripts)
      .where(and(eq(lessonTranscripts.sessionId, sessionId), eq(lessonTranscripts.userId, userId)))
      .orderBy(asc(lessonTranscripts.seq))
    return rows.map(map)
  }
}

/** Только речевые реплики (для AI-резюме — события ленты в него не идут). */
export function speechOnly(lines: TranscriptLine[]): TranscriptLine[] {
  return lines.filter((l) => !l.kind && (l.role === 'agent' || l.role === 'child'))
}
