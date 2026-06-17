// Lesson transcript persistence (эпик «Образовательная платформа», июнь 2026).
// Родитель может открыть полную запись урока в ЛК. Клиент копит реплики и шлёт
// их батчами (на завершении/размонтировании + периодически), чтобы не делать
// HTTP-запрос на КАЖДУЮ реплику. Ownership проверяется один раз на батч.
import { db } from '@/lib/db'
import { lessonTranscripts, tutorSessions } from '@/lib/db/schema'
import { and, eq, asc } from 'drizzle-orm'

export interface TranscriptLine {
  role: 'agent' | 'child'
  text: string
  seq: number
}

/**
 * Дописать батч реплик в транскрипт сессии. Возвращает число вставленных строк,
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
    .filter((l) => l && (l.role === 'agent' || l.role === 'child') && typeof l.text === 'string' && l.text.trim())
    .map((l) => ({ sessionId, userId, role: l.role, text: l.text.trim().slice(0, 4000), seq: l.seq }))
  if (!rows.length) return 0

  await db
    .insert(lessonTranscripts)
    .values(rows)
    .onConflictDoNothing({ target: [lessonTranscripts.sessionId, lessonTranscripts.seq] })
  return rows.length
}

/** Полная запись урока в порядке реплик. Пустой массив, если не владелец/нет записи. */
export async function getTranscript(sessionId: string, userId: string): Promise<TranscriptLine[]> {
  const rows = await db
    .select({ role: lessonTranscripts.role, text: lessonTranscripts.text, seq: lessonTranscripts.seq })
    .from(lessonTranscripts)
    .where(and(eq(lessonTranscripts.sessionId, sessionId), eq(lessonTranscripts.userId, userId)))
    .orderBy(asc(lessonTranscripts.seq))
  return rows.map((r) => ({ role: r.role as 'agent' | 'child', text: r.text, seq: r.seq }))
}
