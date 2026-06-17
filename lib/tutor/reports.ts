// Parent-cabinet report queries (LESSON-FLOW.md §2 + §7). One mechanism feeds
// the parent dashboard: per-lesson results, skill mastery (weak spots first),
// and behaviour-moderation notices with acknowledgement.
import { db } from '@/lib/db'
import { tutorSessions, lessonAttempts, skillMastery, progressEvents, lessonTranscripts } from '@/lib/db/schema'
import { and, eq, desc, asc, count, isNull, inArray, sql } from 'drizzle-orm'
import { lessonTitle } from '@/lib/curriculum'
import type { TutorPhase } from './types'

const num = (v: unknown): number => Number(v ?? 0)

const MODERATION_TYPES = ['moderation_warning', 'moderation_escalation'] as const

export interface SessionSummary {
  id: string
  subjectId: string
  lessonSlug: string
  lessonTitle: string
  status: 'in_progress' | 'completed' | 'abandoned'
  phase: TutorPhase
  attemptNumber: number
  startedAt: Date
  endedAt: Date | null
  durationSec: number | null
  tasksTotal: number
  tasksCorrect: number
  /** 0..1 accuracy across graded tasks; null when no tasks graded. */
  accuracy: number | null
  /** AI-резюме урока («замечания учителя»); null пока не сгенерировано. */
  summary: string | null
  /** Есть ли сохранённая запись урока (можно открыть полный транскрипт). */
  hasTranscript: boolean
}

export interface SkillSummary {
  skillTag: string
  subjectId: string
  attemptsTotal: number
  correctTotal: number
  masteryLevel: number
  lastPracticedAt: Date
}

export interface ModerationNotice {
  id: string
  type: 'moderation_warning' | 'moderation_escalation'
  createdAt: Date
  acknowledgedAt: Date | null
}

export interface ChildReport {
  sessions: SessionSummary[]
  skills: SkillSummary[]
  moderation: ModerationNotice[]
  unacknowledgedModeration: number
  totals: {
    lessonsCompleted: number
    tasksTotal: number
    tasksCorrect: number
  }
}

/** Full report for the parent cabinet — recent sessions, skills, behaviour. */
export async function getChildReport(userId: string): Promise<ChildReport> {
  const sessionRows = await db
    .select()
    .from(tutorSessions)
    .where(eq(tutorSessions.userId, userId))
    .orderBy(desc(tutorSessions.startedAt))
    .limit(50)

  // Per-session task aggregates in one grouped query.
  const agg = await db
    .select({
      sessionId: lessonAttempts.sessionId,
      tasksTotal: count(),
      tasksCorrect: sql<number>`sum(case when ${lessonAttempts.correct} then 1 else 0 end)`,
    })
    .from(lessonAttempts)
    .where(eq(lessonAttempts.userId, userId))
    .groupBy(lessonAttempts.sessionId)

  const aggBySession = new Map(
    agg.map((a) => [a.sessionId, { total: num(a.tasksTotal), correct: num(a.tasksCorrect) }]),
  )

  // Какие сессии имеют сохранённую запись урока (один сгруппированный запрос).
  const trRows = await db
    .select({ sessionId: lessonTranscripts.sessionId, c: count() })
    .from(lessonTranscripts)
    .where(eq(lessonTranscripts.userId, userId))
    .groupBy(lessonTranscripts.sessionId)
  const transcriptSessions = new Set(trRows.filter((r) => num(r.c) > 0).map((r) => r.sessionId))

  const sessions: SessionSummary[] = sessionRows.map((s) => {
    const a = aggBySession.get(s.id) ?? { total: 0, correct: 0 }
    return {
      id: s.id,
      subjectId: s.subjectId,
      lessonSlug: s.lessonSlug,
      lessonTitle: lessonTitle(s.subjectId, s.lessonSlug),
      status: s.status,
      phase: s.phase,
      attemptNumber: s.attemptNumber,
      startedAt: s.startedAt,
      endedAt: s.endedAt,
      durationSec: s.durationSec,
      tasksTotal: a.total,
      tasksCorrect: a.correct,
      accuracy: a.total > 0 ? a.correct / a.total : null,
      summary: s.summary ?? null,
      hasTranscript: transcriptSessions.has(s.id),
    }
  })

  const skillRows = await db
    .select()
    .from(skillMastery)
    .where(eq(skillMastery.userId, userId))
    .orderBy(asc(skillMastery.masteryLevel)) // weakest first
    .limit(100)

  const skills: SkillSummary[] = skillRows.map((s) => ({
    skillTag: s.skillTag,
    subjectId: s.subjectId,
    attemptsTotal: s.attemptsTotal,
    correctTotal: s.correctTotal,
    masteryLevel: s.masteryLevel,
    lastPracticedAt: s.lastPracticedAt,
  }))

  const modRows = await db
    .select({
      id: progressEvents.id,
      type: progressEvents.eventType,
      createdAt: progressEvents.createdAt,
      acknowledgedAt: progressEvents.acknowledgedAt,
    })
    .from(progressEvents)
    .where(
      and(
        eq(progressEvents.userId, userId),
        inArray(progressEvents.eventType, [...MODERATION_TYPES]),
      ),
    )
    .orderBy(desc(progressEvents.createdAt))
    .limit(50)

  const moderation: ModerationNotice[] = modRows.map((m) => ({
    id: m.id,
    type: m.type as ModerationNotice['type'],
    createdAt: m.createdAt,
    acknowledgedAt: m.acknowledgedAt,
  }))

  const unacknowledgedModeration = await countUnacknowledgedModeration(userId)

  const lessonsCompleted = sessions.filter((s) => s.status === 'completed').length
  const tasksTotal = sessions.reduce((n, s) => n + s.tasksTotal, 0)
  const tasksCorrect = sessions.reduce((n, s) => n + s.tasksCorrect, 0)

  return {
    sessions,
    skills,
    moderation,
    unacknowledgedModeration,
    totals: { lessonsCompleted, tasksTotal, tasksCorrect },
  }
}

/** Count behaviour notices the parent hasn't acknowledged (cabinet badge). */
export async function countUnacknowledgedModeration(userId: string): Promise<number> {
  const [row] = await db
    .select({ c: count() })
    .from(progressEvents)
    .where(
      and(
        eq(progressEvents.userId, userId),
        inArray(progressEvents.eventType, [...MODERATION_TYPES]),
        isNull(progressEvents.acknowledgedAt),
      ),
    )
  return num(row?.c)
}

/** Mark one behaviour notice acknowledged (owned by userId). */
export async function acknowledgeModerationEvent(
  userId: string,
  eventId: string,
): Promise<boolean> {
  const res = await db
    .update(progressEvents)
    .set({ acknowledgedAt: new Date() })
    .where(and(eq(progressEvents.id, eventId), eq(progressEvents.userId, userId)))
    .returning({ id: progressEvents.id })
  return res.length > 0
}
