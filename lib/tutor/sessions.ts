// Tutor session lifecycle — start/resume, phase transitions, completion.
// All functions enforce ownership via userId (defence in depth alongside the
// API route's auth() guard). Uses the neon-http `db` (one HTTP request/query).
import { db } from '@/lib/db'
import { tutorSessions, progressEvents } from '@/lib/db/schema'
import { and, eq, desc, count } from 'drizzle-orm'
import type { StartSessionResult, TutorPhase } from './types'

const num = (v: unknown): number => Number(v ?? 0)

/**
 * Start a tutor lesson — or RESUME the most recent in-progress run of the same
 * (subject, lesson) so a page reload doesn't spawn duplicate sessions.
 * Computes the "первый урок vs продолжаем" signals used for dynamic variables.
 */
export async function getOrStartSession(input: {
  userId: string
  subjectId: string
  lessonSlug: string
}): Promise<StartSessionResult> {
  const { userId, subjectId, lessonSlug } = input

  // Counts (completed runs of this lesson / of any lesson).
  const [thisDone] = await db
    .select({ c: count() })
    .from(tutorSessions)
    .where(
      and(
        eq(tutorSessions.userId, userId),
        eq(tutorSessions.subjectId, subjectId),
        eq(tutorSessions.lessonSlug, lessonSlug),
        eq(tutorSessions.status, 'completed'),
      ),
    )
  const [anyDone] = await db
    .select({ c: count() })
    .from(tutorSessions)
    .where(and(eq(tutorSessions.userId, userId), eq(tutorSessions.status, 'completed')))

  const priorCompletions = num(thisDone?.c)
  const priorLessonsDone = num(anyDone?.c)
  const isFirstEver = priorLessonsDone === 0

  // Resume an in-progress session if one exists for this lesson.
  const existing = await db
    .select()
    .from(tutorSessions)
    .where(
      and(
        eq(tutorSessions.userId, userId),
        eq(tutorSessions.subjectId, subjectId),
        eq(tutorSessions.lessonSlug, lessonSlug),
        eq(tutorSessions.status, 'in_progress'),
      ),
    )
    .orderBy(desc(tutorSessions.startedAt))
    .limit(1)

  if (existing.length) {
    return {
      sessionId: existing[0].id,
      attemptNumber: existing[0].attemptNumber,
      isFirstEver,
      priorCompletions,
      priorLessonsDone,
      resumed: true,
    }
  }

  // attemptNumber = total prior sessions of this lesson (any status) + 1.
  const [priorAny] = await db
    .select({ c: count() })
    .from(tutorSessions)
    .where(
      and(
        eq(tutorSessions.userId, userId),
        eq(tutorSessions.subjectId, subjectId),
        eq(tutorSessions.lessonSlug, lessonSlug),
      ),
    )
  const attemptNumber = num(priorAny?.c) + 1

  const inserted = await db
    .insert(tutorSessions)
    .values({ userId, subjectId, lessonSlug, attemptNumber })
    .returning({ id: tutorSessions.id })
  const sessionId = inserted[0].id

  await db.insert(progressEvents).values({
    sessionId,
    userId,
    eventType: 'session_started',
    payload: { subjectId, lessonSlug, attemptNumber },
  })

  return {
    sessionId,
    attemptNumber,
    isFirstEver,
    priorCompletions,
    priorLessonsDone,
    resumed: false,
  }
}

/** Fetch a session if it belongs to userId, else null. */
export async function getSession(sessionId: string, userId: string) {
  const rows = await db
    .select()
    .from(tutorSessions)
    .where(and(eq(tutorSessions.id, sessionId), eq(tutorSessions.userId, userId)))
    .limit(1)
  return rows[0] ?? null
}

/** Transition the lesson phase + log a phase_change event. False if not owned. */
export async function setPhase(input: {
  sessionId: string
  userId: string
  phase: TutorPhase
}): Promise<boolean> {
  const res = await db
    .update(tutorSessions)
    .set({ phase: input.phase })
    .where(and(eq(tutorSessions.id, input.sessionId), eq(tutorSessions.userId, input.userId)))
    .returning({ id: tutorSessions.id })
  if (!res.length) return false
  await db.insert(progressEvents).values({
    sessionId: input.sessionId,
    userId: input.userId,
    eventType: 'phase_change',
    payload: { phase: input.phase },
  })
  return true
}

/** Mark a session completed, compute duration, log session_completed. */
export async function completeSession(input: {
  sessionId: string
  userId: string
}): Promise<boolean> {
  const rows = await db
    .select({ startedAt: tutorSessions.startedAt, status: tutorSessions.status })
    .from(tutorSessions)
    .where(and(eq(tutorSessions.id, input.sessionId), eq(tutorSessions.userId, input.userId)))
    .limit(1)
  if (!rows.length) return false

  const endedAt = new Date()
  const durationSec = Math.max(
    0,
    Math.round((endedAt.getTime() - rows[0].startedAt.getTime()) / 1000),
  )
  await db
    .update(tutorSessions)
    .set({ status: 'completed', endedAt, durationSec })
    .where(and(eq(tutorSessions.id, input.sessionId), eq(tutorSessions.userId, input.userId)))
  await db.insert(progressEvents).values({
    sessionId: input.sessionId,
    userId: input.userId,
    eventType: 'session_completed',
    payload: { durationSec },
  })
  return true
}
