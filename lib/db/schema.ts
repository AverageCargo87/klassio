// Source: Adapted from RESEARCH § Code Example 2 — uses array-of-constraints syntax
// (modern Drizzle v0.41+); RESEARCH.md shows the older wrapped-object form which is
// also valid but less idiomatic. Both work in drizzle-orm 0.45.x.
// 6 tables: 4 required by Auth.js Drizzle adapter (user, account, session, verificationToken) + 2 Klassio-specific (allowed_email, lesson).
import {
  timestamp,
  pgTable,
  text,
  primaryKey,
  integer,
  pgEnum,
  uuid,
  index,
  uniqueIndex,
  boolean,
  real,
  jsonb,
} from 'drizzle-orm/pg-core'
import type { AdapterAccountType } from '@auth/core/adapters'

// === NextAuth required tables (Auth.js Drizzle adapter contract) ===

export const users = pgTable('user', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  name: text('name'),
  email: text('email').unique(),
  emailVerified: timestamp('emailVerified', { mode: 'date' }),
  image: text('image'),
  // === Klassio extensions (D-03 — single-child parent in v1) ===
  childName: text('child_name'),
  childAge: integer('child_age'),
  createdAt: timestamp('created_at', { mode: 'date' }).defaultNow().notNull(),
  lastLoginAt: timestamp('last_login_at', { mode: 'date' }),
})

export const accounts = pgTable(
  'account',
  {
    userId: text('userId').notNull().references(() => users.id, { onDelete: 'cascade' }),
    type: text('type').$type<AdapterAccountType>().notNull(),
    provider: text('provider').notNull(),
    providerAccountId: text('providerAccountId').notNull(),
    refresh_token: text('refresh_token'),
    access_token: text('access_token'),
    expires_at: integer('expires_at'),
    token_type: text('token_type'),
    scope: text('scope'),
    id_token: text('id_token'),
    session_state: text('session_state'),
  },
  (account) => [
    primaryKey({ columns: [account.provider, account.providerAccountId] }),
  ],
)

// sessions table — required for adapter type contract even on JWT strategy.
// Per RESEARCH § Pattern 3 + Assumption A4: include for compatibility, no active reads/writes.
export const sessions = pgTable('session', {
  sessionToken: text('sessionToken').primaryKey(),
  userId: text('userId').notNull().references(() => users.id, { onDelete: 'cascade' }),
  expires: timestamp('expires', { mode: 'date' }).notNull(),
})

export const verificationTokens = pgTable(
  'verificationToken',
  {
    identifier: text('identifier').notNull(),
    token: text('token').notNull(),
    expires: timestamp('expires', { mode: 'date' }).notNull(),
  },
  (vt) => [primaryKey({ columns: [vt.identifier, vt.token] })],
)

// === Klassio-specific tables ===

// D-02 + A1 (resolved 01-02): whitelist source of truth for signIn callback in Plan 04.
export const allowedEmails = pgTable(
  'allowed_email',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    email: text('email').notNull().unique(),
    addedAt: timestamp('added_at', { mode: 'date' }).defaultNow().notNull(),
    notes: text('notes'), // free-form admin notes
  },
  (t) => [index('allowed_email_email_idx').on(t.email)],
)

export const lessonStatusEnum = pgEnum('lesson_status', [
  'scheduled',
  'in_progress',
  'completed',
  'cancelled',
])

// ACC-02: lessons list with scheduledAt ASC ordering. htmlTemplateUrl reserved for Phase 7.
export const lessons = pgTable(
  'lesson',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    scheduledAt: timestamp('scheduled_at', { mode: 'date' }).notNull(),
    topic: text('topic').notNull(),
    durationMin: integer('duration_min').notNull().default(45),
    htmlTemplateUrl: text('html_template_url'), // placeholder for Phase 7 HTML trainer
    // === Phase 2 extensions (D-11, D-13) — all nullable; populated by later phases ===
    recordingUrl: text('recording_url'),         // Phase 10 will populate
    transcriptUrl: text('transcript_url'),       // Phase 10 will populate
    htmlTrainerPath: text('html_trainer_path'),  // Phase 7 will populate
    status: lessonStatusEnum('status').notNull().default('scheduled'),
    createdAt: timestamp('created_at', { mode: 'date' }).defaultNow().notNull(),
    // === Phase 3 extensions (D-13) — lesson timing analytics ===
    actualStartAt: timestamp('actual_start_at', { mode: 'date' }),  // set on first in_progress transition
    actualEndAt: timestamp('actual_end_at', { mode: 'date' }),      // set on completed transition
  },
  (t) => [
    index('lesson_user_id_idx').on(t.userId),
    index('lesson_scheduled_at_idx').on(t.scheduledAt),
  ],
)

// ════════════════════════════════════════════════════════════════════════════
// AI-репетитор tracking (June 2026 pivot — see LESSON-FLOW.md §7 + memory
// klassio-pivot-ai-tutor-first). One tracking mechanism feeds three consumers:
// (a) adaptive difficulty, (b) parent cabinet reports, (c) next-lesson planning.
//
// IMPORTANT: curriculum lessons (lib/curriculum/*.ts) are STATIC slugs, NOT rows
// in the `lesson` table (that table holds the old scheduled math sessions). The
// tutor tracks a child's journey through curriculum lessons via `tutor_session`
// keyed by (subjectId, lessonSlug), independent of the legacy `lesson` table.
// ════════════════════════════════════════════════════════════════════════════

// State-machine phases from LESSON-FLOW.md §4.
export const tutorPhaseEnum = pgEnum('tutor_phase', [
  'connecting', // подключение
  'warmup',     // разогрев / smalltalk
  'diagnostic', // диагностика (1-й урок)
  'bridge',     // мостик
  'cycle',      // цикл теория→практика
  'pause',      // пауза при усталости
  'summary',    // итог
  'farewell',   // прощание
])

export const tutorSessionStatusEnum = pgEnum('tutor_session_status', [
  'in_progress',
  'completed',
  'abandoned',
])

// One row per started tutor lesson. `attemptNumber` = how many times THIS child
// has started THIS (subjectId, lessonSlug) — 1 on the very first run. The
// "первый урок vs продолжаем" signal (LESSON-FLOW §6, dynamic_variables) is
// derived from this + a count of the child's prior completed sessions.
export const tutorSessions = pgTable(
  'tutor_session',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    subjectId: text('subject_id').notNull(),   // e.g. 'okr-mir-4'
    lessonSlug: text('lesson_slug').notNull(),  // e.g. 'astronom'
    attemptNumber: integer('attempt_number').notNull().default(1),
    phase: tutorPhaseEnum('phase').notNull().default('connecting'),
    status: tutorSessionStatusEnum('status').notNull().default('in_progress'),
    startedAt: timestamp('started_at', { mode: 'date' }).defaultNow().notNull(),
    endedAt: timestamp('ended_at', { mode: 'date' }),
    durationSec: integer('duration_sec'),
    // AI-резюме урока («замечания учителя» в ЛК): что прошли, как справился,
    // на что обратить внимание. Заполняется на завершении урока. NULL = ещё нет.
    summary: text('summary'),
    // Каким голосовым стеком шёл урок: 'elevenlabs' | 'sber'. Выбирается в меню
    // выбора урока; показывается в записи урока. NULL = старые сессии до этой фичи.
    voiceProvider: text('voice_provider'),
    createdAt: timestamp('created_at', { mode: 'date' }).defaultNow().notNull(),
  },
  (t) => [
    index('tutor_session_user_id_idx').on(t.userId),
    index('tutor_session_lesson_idx').on(t.userId, t.subjectId, t.lessonSlug),
  ],
)

// Per-task tracking within a session (LESSON-FLOW §7 "per задание"). One row per
// (session, taskId) — upserted as the child accrues attempts/hints. `correct` is
// the final verdict; `attempts`/`hintsUsed` accumulate; `reactionMs` is time from
// task shown to FIRST answer.
export const lessonAttempts = pgTable(
  'lesson_attempt',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    sessionId: uuid('session_id').notNull().references(() => tutorSessions.id, { onDelete: 'cascade' }),
    userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    taskId: text('task_id').notNull(),       // 'task-3' or a question id
    skillTag: text('skill_tag'),             // e.g. 'solar-system-order' (feeds skill_mastery)
    correct: boolean('correct').notNull().default(false),
    attempts: integer('attempts').notNull().default(1),
    hintsUsed: integer('hints_used').notNull().default(0),
    reactionMs: integer('reaction_ms'),
    answeredAt: timestamp('answered_at', { mode: 'date' }).defaultNow().notNull(),
  },
  (t) => [
    index('lesson_attempt_session_idx').on(t.sessionId),
    index('lesson_attempt_user_idx').on(t.userId),
    uniqueIndex('lesson_attempt_session_task_uniq').on(t.sessionId, t.taskId),
  ],
)

// Per-child skill aggregate (LESSON-FLOW §7 "освоенные темы, слабые места").
// Upserted on every graded attempt. `masteryLevel` is a 0..1 EWMA of correctness
// (recent answers weighted higher) so a child can recover from early mistakes.
export const skillMastery = pgTable(
  'skill_mastery',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    subjectId: text('subject_id').notNull(),
    skillTag: text('skill_tag').notNull(),
    attemptsTotal: integer('attempts_total').notNull().default(0),
    correctTotal: integer('correct_total').notNull().default(0),
    masteryLevel: real('mastery_level').notNull().default(0), // 0..1
    lastPracticedAt: timestamp('last_practiced_at', { mode: 'date' }).defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex('skill_mastery_user_skill_uniq').on(t.userId, t.skillTag),
    index('skill_mastery_user_idx').on(t.userId),
  ],
)

// Event firehose — phase transitions, tool use, fatigue, rewards, AND behavior
// moderation incidents (LESSON-FLOW §7 ⚠ Модерация). `payload` is free-form JSON.
// `acknowledgedAt` lets the parent cabinet mark a moderation notice as seen.
export const progressEventTypeEnum = pgEnum('progress_event_type', [
  'session_started',
  'session_completed',
  'phase_change',
  'tool_used',
  'task_correct',
  'task_wrong',
  'hint_shown',
  'fatigue_signal',
  'pause_started',
  'pause_ended',
  'reward_given',
  'diagnostic_result',
  'moderation_warning',     // 1-е спокойное предупреждение
  'moderation_escalation',  // повтор → запись + уведомление родителю
])

export const progressEvents = pgTable(
  'progress_event',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    // Nullable: account-level events (not tied to a session) are allowed.
    sessionId: uuid('session_id').references(() => tutorSessions.id, { onDelete: 'cascade' }),
    userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    eventType: progressEventTypeEnum('event_type').notNull(),
    payload: jsonb('payload'),
    // Parent-cabinet acknowledgement (used for moderation notifications).
    acknowledgedAt: timestamp('acknowledged_at', { mode: 'date' }),
    createdAt: timestamp('created_at', { mode: 'date' }).defaultNow().notNull(),
  },
  (t) => [
    index('progress_event_user_idx').on(t.userId),
    index('progress_event_session_idx').on(t.sessionId),
    index('progress_event_type_idx').on(t.eventType),
  ],
)

// === Личный кабинет: запись урока + домашка (эпик «Образовательная платформа», июнь 2026) ===

// Транскрипт урока — по реплике на строку, копится за сессию (родитель может
// открыть полную запись в ЛК). ВАЖНО: это осознанно разворачивает прежнее
// приватностное решение «детские реплики не пишем» (см. /api/tutor/moderation,
// где намеренно пишутся только теги). Решение оператора 2026-06-17: храним
// транскрипт + AI-резюме. Модерация по-прежнему НЕ пишет текст отдельно — теперь
// он живёт здесь как часть учебной записи.
export const lessonTranscripts = pgTable(
  'lesson_transcript',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    sessionId: uuid('session_id').notNull().references(() => tutorSessions.id, { onDelete: 'cascade' }),
    userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    role: text('role').notNull(), // 'agent' (Аня) | 'child'
    text: text('text').notNull(),
    seq: integer('seq').notNull(), // монотонный порядок реплики в сессии
    // Тип строки ленты урока. NULL = речевая реплика (рендерится по role — обратная
    // совместимость со старыми записями). Иначе — событие платформы:
    // 'tool' (открыта доска/задание), 'wrong', 'solve', 'reward', 'name'.
    kind: text('kind'),
    // Детали события: { board? | boardLabel? | taskId? | q? | answer? | skill? | name? }.
    meta: jsonb('meta'),
    createdAt: timestamp('created_at', { mode: 'date' }).defaultNow().notNull(),
  },
  (t) => [
    // UNIQUE — нужно для onConflictDoNothing (идемпотентный ретрай батча клиентом).
    uniqueIndex('lesson_transcript_session_seq_uniq').on(t.sessionId, t.seq),
    index('lesson_transcript_user_idx').on(t.userId),
  ],
)

// Домашка — выдаётся в конце урока (Аня формирует), родитель/ребёнок видит в ЛК.
// `items` = массив задач в том же формате, что задачи урока (см. canvas-contract §3),
// чтобы переиспользовать тот же тренажёр для выполнения. v1: статус assigned/done,
// без жёстких дедлайнов.
export const homeworkStatusEnum = pgEnum('homework_status', ['assigned', 'done'])

export const homeworkAssignments = pgTable(
  'homework_assignment',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    sessionId: uuid('session_id').references(() => tutorSessions.id, { onDelete: 'set null' }), // урок-источник
    subjectId: text('subject_id').notNull(),
    lessonSlug: text('lesson_slug').notNull(),
    title: text('title').notNull(),
    items: jsonb('items').notNull(), // [{ q, answer, options?, skill? }]
    status: homeworkStatusEnum('status').notNull().default('assigned'),
    createdAt: timestamp('created_at', { mode: 'date' }).defaultNow().notNull(),
    completedAt: timestamp('completed_at', { mode: 'date' }),
  },
  (t) => [
    index('homework_user_idx').on(t.userId),
    index('homework_lesson_idx').on(t.userId, t.subjectId, t.lessonSlug),
  ],
)
