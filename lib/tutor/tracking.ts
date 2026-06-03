// Per-task tracking, skill-mastery aggregation, and the progress-event firehose.
// One graded answer → up to three writes: lesson_attempt (upsert), skill_mastery
// (EWMA upsert), progress_event (task_correct|task_wrong). LESSON-FLOW.md §7.
import { db } from '@/lib/db'
import { lessonAttempts, skillMastery, progressEvents } from '@/lib/db/schema'
import { and, eq, sql, inArray, count } from 'drizzle-orm'
import type { ProgressEventType } from './types'

const num = (v: unknown): number => Number(v ?? 0)

export interface RecordAttemptInput {
  sessionId: string
  userId: string
  subjectId: string
  taskId: string
  correct: boolean
  skillTag?: string | null
  /** ms from task shown to this answer (stored only on the first attempt). */
  reactionMs?: number | null
  /** cumulative hints opened for this task so far. */
  hintsUsed?: number
}

/**
 * Record one graded answer. Upserts the (session,task) row — `attempts`
 * increments on repeat, `correct` reflects the LATEST verdict, `reactionMs`
 * keeps the FIRST value. Updates the child's skill mastery (EWMA, α=0.4) and
 * logs a task_correct/task_wrong event.
 */
export async function recordAttempt(input: RecordAttemptInput): Promise<void> {
  const {
    sessionId,
    userId,
    subjectId,
    taskId,
    correct,
    skillTag = null,
    reactionMs = null,
    hintsUsed = 0,
  } = input

  await db
    .insert(lessonAttempts)
    .values({ sessionId, userId, taskId, skillTag, correct, attempts: 1, hintsUsed, reactionMs })
    .onConflictDoUpdate({
      target: [lessonAttempts.sessionId, lessonAttempts.taskId],
      set: {
        attempts: sql`${lessonAttempts.attempts} + 1`,
        correct,
        hintsUsed: sql`GREATEST(${lessonAttempts.hintsUsed}, ${hintsUsed})`,
        reactionMs: sql`COALESCE(${lessonAttempts.reactionMs}, ${reactionMs})`,
        answeredAt: new Date(),
      },
    })

  if (skillTag) {
    const c = correct ? 1 : 0
    await db
      .insert(skillMastery)
      .values({
        userId,
        subjectId,
        skillTag,
        attemptsTotal: 1,
        correctTotal: c,
        masteryLevel: c,
        lastPracticedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: [skillMastery.userId, skillMastery.skillTag],
        set: {
          attemptsTotal: sql`${skillMastery.attemptsTotal} + 1`,
          correctTotal: sql`${skillMastery.correctTotal} + ${c}`,
          // EWMA: recent answers weighted higher so a child recovers from a bad start.
          masteryLevel: sql`${skillMastery.masteryLevel} * 0.6 + ${c} * 0.4`,
          lastPracticedAt: new Date(),
        },
      })
  }

  await db.insert(progressEvents).values({
    sessionId,
    userId,
    eventType: correct ? 'task_correct' : 'task_wrong',
    payload: { taskId, skillTag, reactionMs, hintsUsed },
  })
}

/** Append a progress event (generic firehose entry). Returns its id. */
export async function recordEvent(input: {
  sessionId?: string | null
  userId: string
  eventType: ProgressEventType
  payload?: unknown
}): Promise<string> {
  const res = await db
    .insert(progressEvents)
    .values({
      sessionId: input.sessionId ?? null,
      userId: input.userId,
      eventType: input.eventType,
      payload: (input.payload ?? null) as object | null,
    })
    .returning({ id: progressEvents.id })
  return res[0].id
}

/** Count events of given types within a session (for moderation escalation). */
export async function countSessionEvents(
  sessionId: string,
  userId: string,
  types: ProgressEventType[],
): Promise<number> {
  const [row] = await db
    .select({ c: count() })
    .from(progressEvents)
    .where(
      and(
        eq(progressEvents.sessionId, sessionId),
        eq(progressEvents.userId, userId),
        inArray(progressEvents.eventType, types),
      ),
    )
  return num(row?.c)
}
