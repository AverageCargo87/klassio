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
