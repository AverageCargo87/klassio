// Subject-centric cabinet queries (эпик «Образовательная платформа»).
// Главная кабинета = предметы с уведомлениями; внутри предмета — уроки, домашка,
// поведение, навыки ПО ЭТОМУ предмету (общие суммы по разным предметам бессмысленны).
import { db } from '@/lib/db'
import {
  tutorSessions, lessonAttempts, skillMastery, progressEvents,
  lessonTranscripts, homeworkAssignments,
} from '@/lib/db/schema'
import { and, eq, desc, asc, count, isNull, inArray, sql } from 'drizzle-orm'
import { SUBJECT_LIST, lessonTitle, type CurriculumLesson } from '@/lib/curriculum'

const num = (v: unknown): number => Number(v ?? 0)
const MOD_TYPES = ['moderation_warning', 'moderation_escalation'] as const

// ── Главная кабинета: предметы + уведомления ────────────────────────────────
export interface SubjectCard {
  id: string
  title: string
  grade: string
  emoji: string
  description: string
  nextLessonTitle: string | null // следующий доступный/предстоящий урок
  homeworkDue: number            // невыполненных домашек
  unreadNotices: number          // непрочитанных замечаний
  hasActiveLesson: boolean       // есть идущий урок
}

export async function getCabinetHome(userId: string): Promise<SubjectCard[]> {
  // Одним заходом собираем сигналы по всем предметам, потом раскладываем.
  const [hw, active, completed, mods] = await Promise.all([
    db.select({ subjectId: homeworkAssignments.subjectId, c: count() })
      .from(homeworkAssignments)
      .where(and(eq(homeworkAssignments.userId, userId), eq(homeworkAssignments.status, 'assigned')))
      .groupBy(homeworkAssignments.subjectId),
    db.select({ subjectId: tutorSessions.subjectId, c: count() })
      .from(tutorSessions)
      .where(and(eq(tutorSessions.userId, userId), eq(tutorSessions.status, 'in_progress')))
      .groupBy(tutorSessions.subjectId),
    db.select({ subjectId: tutorSessions.subjectId, lessonSlug: tutorSessions.lessonSlug })
      .from(tutorSessions)
      .where(and(eq(tutorSessions.userId, userId), eq(tutorSessions.status, 'completed'))),
    db.select({ subjectId: tutorSessions.subjectId, c: count() })
      .from(progressEvents)
      .innerJoin(tutorSessions, eq(progressEvents.sessionId, tutorSessions.id))
      .where(and(
        eq(progressEvents.userId, userId),
        inArray(progressEvents.eventType, [...MOD_TYPES]),
        isNull(progressEvents.acknowledgedAt),
      ))
      .groupBy(tutorSessions.subjectId),
  ])

  const hwBy = new Map(hw.map((r) => [r.subjectId, num(r.c)]))
  const activeBy = new Map(active.map((r) => [r.subjectId, num(r.c)]))
  const modBy = new Map(mods.map((r) => [r.subjectId, num(r.c)]))
  const doneBy = new Map<string, Set<string>>()
  for (const r of completed) {
    if (!doneBy.has(r.subjectId)) doneBy.set(r.subjectId, new Set())
    doneBy.get(r.subjectId)!.add(r.lessonSlug)
  }

  return SUBJECT_LIST.map((s) => {
    const done = doneBy.get(s.id) ?? new Set<string>()
    const next = s.lessons.find((l) => !done.has(l.slug)) ?? null
    return {
      id: s.id, title: s.title, grade: s.grade, emoji: s.emoji, description: s.description,
      nextLessonTitle: next?.title ?? null,
      homeworkDue: hwBy.get(s.id) ?? 0,
      unreadNotices: modBy.get(s.id) ?? 0,
      hasActiveLesson: (activeBy.get(s.id) ?? 0) > 0,
    }
  })
}

// ── Страница предмета ───────────────────────────────────────────────────────
export interface SubjectLessonRow {
  id: string
  lessonSlug: string
  lessonTitle: string
  status: 'in_progress' | 'completed' | 'abandoned'
  startedAt: Date
  accuracy: number | null
  tasksCorrect: number
  tasksTotal: number
  durationSec: number | null
  summary: string | null
  hasTranscript: boolean
  voiceProvider: string | null
}
export interface SubjectHomework {
  id: string; title: string; items: { q: string }[]; status: 'assigned' | 'done'
}
export interface SubjectNotice {
  id: string; type: string; createdAt: Date; acknowledgedAt: Date | null; sessionId: string | null
}
export interface SubjectSkill { skillTag: string; masteryLevel: number }
export interface SubjectReport {
  subjectId: string
  title: string
  grade: string
  emoji: string
  lessonsCompleted: number
  accuracy: number | null
  activeLesson: SubjectLessonRow | null
  pastLessons: SubjectLessonRow[]
  upcoming: CurriculumLesson[]
  homework: SubjectHomework[]
  notices: SubjectNotice[]
  skills: SubjectSkill[]
}

export async function getSubjectReport(userId: string, subjectId: string): Promise<SubjectReport | null> {
  const subject = SUBJECT_LIST.find((s) => s.id === subjectId)
  if (!subject) return null

  const sessionRows = await db
    .select()
    .from(tutorSessions)
    .where(and(eq(tutorSessions.userId, userId), eq(tutorSessions.subjectId, subjectId)))
    .orderBy(desc(tutorSessions.startedAt))
    .limit(60)
  const sessionIds = sessionRows.map((s) => s.id)

  // task aggregates + transcript presence для этих сессий
  const [agg, tr] = await Promise.all([
    sessionIds.length
      ? db.select({
          sessionId: lessonAttempts.sessionId,
          tasksTotal: count(),
          tasksCorrect: sql<number>`sum(case when ${lessonAttempts.correct} then 1 else 0 end)`,
        }).from(lessonAttempts).where(inArray(lessonAttempts.sessionId, sessionIds)).groupBy(lessonAttempts.sessionId)
      : Promise.resolve([] as { sessionId: string; tasksTotal: number; tasksCorrect: number }[]),
    sessionIds.length
      ? db.select({ sessionId: lessonTranscripts.sessionId, c: count() })
          .from(lessonTranscripts).where(inArray(lessonTranscripts.sessionId, sessionIds)).groupBy(lessonTranscripts.sessionId)
      : Promise.resolve([] as { sessionId: string; c: number }[]),
  ])
  const aggBy = new Map(agg.map((a) => [a.sessionId, { total: num(a.tasksTotal), correct: num(a.tasksCorrect) }]))
  const trSet = new Set(tr.filter((r) => num(r.c) > 0).map((r) => r.sessionId))

  const rows: SubjectLessonRow[] = sessionRows.map((s) => {
    const a = aggBy.get(s.id) ?? { total: 0, correct: 0 }
    return {
      id: s.id, lessonSlug: s.lessonSlug, lessonTitle: lessonTitle(subjectId, s.lessonSlug),
      status: s.status, startedAt: s.startedAt,
      accuracy: a.total > 0 ? a.correct / a.total : null,
      tasksCorrect: a.correct, tasksTotal: a.total, durationSec: s.durationSec,
      summary: s.summary ?? null, hasTranscript: trSet.has(s.id), voiceProvider: s.voiceProvider ?? null,
    }
  })
  const activeLesson = rows.find((r) => r.status === 'in_progress') ?? null
  const pastLessons = rows.filter((r) => r.status !== 'in_progress')

  // предстоящие уроки = из программы те, что ещё не пройдены
  const doneSlugs = new Set(rows.filter((r) => r.status === 'completed').map((r) => r.lessonSlug))
  const upcoming = subject.lessons.filter((l) => !doneSlugs.has(l.slug))

  const [hwRows, modRows, skillRows] = await Promise.all([
    db.select().from(homeworkAssignments)
      .where(and(eq(homeworkAssignments.userId, userId), eq(homeworkAssignments.subjectId, subjectId)))
      .orderBy(desc(homeworkAssignments.createdAt)).limit(40),
    sessionIds.length
      ? db.select({ id: progressEvents.id, type: progressEvents.eventType, createdAt: progressEvents.createdAt, acknowledgedAt: progressEvents.acknowledgedAt, sessionId: progressEvents.sessionId })
          .from(progressEvents)
          .where(and(eq(progressEvents.userId, userId), inArray(progressEvents.eventType, [...MOD_TYPES]), inArray(progressEvents.sessionId, sessionIds)))
          .orderBy(desc(progressEvents.createdAt)).limit(40)
      : Promise.resolve([] as { id: string; type: string; createdAt: Date; acknowledgedAt: Date | null; sessionId: string | null }[]),
    db.select().from(skillMastery)
      .where(and(eq(skillMastery.userId, userId), eq(skillMastery.subjectId, subjectId)))
      .orderBy(asc(skillMastery.masteryLevel)).limit(60),
  ])

  const completedCount = rows.filter((r) => r.status === 'completed').length
  const totT = rows.reduce((n, r) => n + r.tasksTotal, 0)
  const totC = rows.reduce((n, r) => n + r.tasksCorrect, 0)

  return {
    subjectId, title: subject.title, grade: subject.grade, emoji: subject.emoji,
    lessonsCompleted: completedCount,
    accuracy: totT > 0 ? totC / totT : null,
    activeLesson, pastLessons, upcoming,
    homework: hwRows.map((h) => ({ id: h.id, title: h.title, items: (h.items as { q: string }[]) ?? [], status: h.status as 'assigned' | 'done' })),
    notices: modRows.map((m) => ({ id: m.id, type: m.type as string, createdAt: m.createdAt, acknowledgedAt: m.acknowledgedAt, sessionId: m.sessionId })),
    skills: skillRows.map((k) => ({ skillTag: k.skillTag, masteryLevel: k.masteryLevel })),
  }
}
