// Homework persistence (эпик «Образовательная платформа», июнь 2026).
// Аня в конце урока формирует домашку; родитель/ребёнок видит её в ЛК и
// отмечает выполненной. v1: статусы assigned/done, без жёстких дедлайнов.
// items переиспользует формат задач урока (см. canvas-contract §3), чтобы
// потом прогнать их через тот же тренажёр.
import { db } from '@/lib/db'
import { homeworkAssignments } from '@/lib/db/schema'
import { and, eq, desc } from 'drizzle-orm'

export interface HomeworkItem {
  q: string
  answer?: string
  options?: Array<{ t: string; correct?: boolean }>
  skill?: string
}

export interface HomeworkAssignment {
  id: string
  subjectId: string
  lessonSlug: string
  title: string
  items: HomeworkItem[]
  status: 'assigned' | 'done'
  createdAt: Date
  completedAt: Date | null
}

/** Выдать домашку. Возвращает id новой записи. */
export async function createHomework(input: {
  userId: string
  sessionId?: string | null
  subjectId: string
  lessonSlug: string
  title: string
  items: HomeworkItem[]
}): Promise<string> {
  const items = (input.items || []).filter((it) => it && typeof it.q === 'string' && it.q.trim()).slice(0, 20)
  const [row] = await db
    .insert(homeworkAssignments)
    .values({
      userId: input.userId,
      sessionId: input.sessionId ?? null,
      subjectId: input.subjectId,
      lessonSlug: input.lessonSlug,
      title: input.title.slice(0, 200),
      items,
    })
    .returning({ id: homeworkAssignments.id })
  return row.id
}

/** Список домашек ребёнка (новые первыми). */
export async function listHomework(userId: string): Promise<HomeworkAssignment[]> {
  const rows = await db
    .select()
    .from(homeworkAssignments)
    .where(eq(homeworkAssignments.userId, userId))
    .orderBy(desc(homeworkAssignments.createdAt))
    .limit(100)
  return rows.map((r) => ({
    id: r.id,
    subjectId: r.subjectId,
    lessonSlug: r.lessonSlug,
    title: r.title,
    items: (r.items as HomeworkItem[]) ?? [],
    status: r.status as 'assigned' | 'done',
    createdAt: r.createdAt,
    completedAt: r.completedAt,
  }))
}

/** Отметить домашку выполненной. false, если не принадлежит пользователю. */
export async function markHomeworkDone(input: { homeworkId: string; userId: string }): Promise<boolean> {
  const res = await db
    .update(homeworkAssignments)
    .set({ status: 'done', completedAt: new Date() })
    .where(and(eq(homeworkAssignments.id, input.homeworkId), eq(homeworkAssignments.userId, input.userId)))
    .returning({ id: homeworkAssignments.id })
  return res.length > 0
}
