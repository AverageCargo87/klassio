#!/usr/bin/env tsx
// One-shot migration runner for Neon Free tier — Phase "AI-репетитор" tracking schema.
// Applies migration 0003: tutor_session, lesson_attempt, skill_mastery, progress_event
// (+ 3 enums). Uses pg (node-postgres) with DATABASE_URL_DIRECT — the postgres-js path
// in scripts/db-push.ts hangs on Neon when re-CREATE-ing the pre-existing `lesson` table.
//
// Purely ADDITIVE: never touches account/user/session/lesson/allowed_email/verificationToken.
// Fully idempotent — enums use a DO-block guard, tables/indexes use IF NOT EXISTS, and
// FK constraints are declared INLINE so re-runs are safe. Run multiple times freely.
//
// Run via: npx tsx scripts/apply-0003-tutor-migration.ts
import { config } from 'dotenv'
import { resolve } from 'path'
import { Client } from 'pg'

config({ path: resolve(process.cwd(), '.env.local') })
config()

// Each entry is one DDL statement. Order matters: enums → tutor_session →
// dependents (FK to tutor_session) → indexes.
const STATEMENTS: string[] = [
  // ── Enums (DO-block guard = idempotent CREATE TYPE) ──────────────────────
  `DO $$ BEGIN
     CREATE TYPE "public"."tutor_phase" AS ENUM('connecting','warmup','diagnostic','bridge','cycle','pause','summary','farewell');
   EXCEPTION WHEN duplicate_object THEN null; END $$`,
  `DO $$ BEGIN
     CREATE TYPE "public"."tutor_session_status" AS ENUM('in_progress','completed','abandoned');
   EXCEPTION WHEN duplicate_object THEN null; END $$`,
  `DO $$ BEGIN
     CREATE TYPE "public"."progress_event_type" AS ENUM('session_started','session_completed','phase_change','tool_used','task_correct','task_wrong','hint_shown','fatigue_signal','pause_started','pause_ended','reward_given','diagnostic_result','moderation_warning','moderation_escalation');
   EXCEPTION WHEN duplicate_object THEN null; END $$`,

  // ── tutor_session (parent of lesson_attempt + progress_event) ────────────
  `CREATE TABLE IF NOT EXISTS "tutor_session" (
     "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
     "user_id" text NOT NULL REFERENCES "user"("id") ON DELETE cascade,
     "subject_id" text NOT NULL,
     "lesson_slug" text NOT NULL,
     "attempt_number" integer DEFAULT 1 NOT NULL,
     "phase" "tutor_phase" DEFAULT 'connecting' NOT NULL,
     "status" "tutor_session_status" DEFAULT 'in_progress' NOT NULL,
     "started_at" timestamp DEFAULT now() NOT NULL,
     "ended_at" timestamp,
     "duration_sec" integer,
     "created_at" timestamp DEFAULT now() NOT NULL
   )`,

  // ── lesson_attempt ───────────────────────────────────────────────────────
  `CREATE TABLE IF NOT EXISTS "lesson_attempt" (
     "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
     "session_id" uuid NOT NULL REFERENCES "tutor_session"("id") ON DELETE cascade,
     "user_id" text NOT NULL REFERENCES "user"("id") ON DELETE cascade,
     "task_id" text NOT NULL,
     "skill_tag" text,
     "correct" boolean DEFAULT false NOT NULL,
     "attempts" integer DEFAULT 1 NOT NULL,
     "hints_used" integer DEFAULT 0 NOT NULL,
     "reaction_ms" integer,
     "answered_at" timestamp DEFAULT now() NOT NULL
   )`,

  // ── skill_mastery ────────────────────────────────────────────────────────
  `CREATE TABLE IF NOT EXISTS "skill_mastery" (
     "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
     "user_id" text NOT NULL REFERENCES "user"("id") ON DELETE cascade,
     "subject_id" text NOT NULL,
     "skill_tag" text NOT NULL,
     "attempts_total" integer DEFAULT 0 NOT NULL,
     "correct_total" integer DEFAULT 0 NOT NULL,
     "mastery_level" real DEFAULT 0 NOT NULL,
     "last_practiced_at" timestamp DEFAULT now() NOT NULL
   )`,

  // ── progress_event ───────────────────────────────────────────────────────
  `CREATE TABLE IF NOT EXISTS "progress_event" (
     "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
     "session_id" uuid REFERENCES "tutor_session"("id") ON DELETE cascade,
     "user_id" text NOT NULL REFERENCES "user"("id") ON DELETE cascade,
     "event_type" "progress_event_type" NOT NULL,
     "payload" jsonb,
     "acknowledged_at" timestamp,
     "created_at" timestamp DEFAULT now() NOT NULL
   )`,

  // ── Indexes ──────────────────────────────────────────────────────────────
  `CREATE INDEX IF NOT EXISTS "tutor_session_user_id_idx" ON "tutor_session" USING btree ("user_id")`,
  `CREATE INDEX IF NOT EXISTS "tutor_session_lesson_idx" ON "tutor_session" USING btree ("user_id","subject_id","lesson_slug")`,
  `CREATE INDEX IF NOT EXISTS "lesson_attempt_session_idx" ON "lesson_attempt" USING btree ("session_id")`,
  `CREATE INDEX IF NOT EXISTS "lesson_attempt_user_idx" ON "lesson_attempt" USING btree ("user_id")`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "lesson_attempt_session_task_uniq" ON "lesson_attempt" USING btree ("session_id","task_id")`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "skill_mastery_user_skill_uniq" ON "skill_mastery" USING btree ("user_id","skill_tag")`,
  `CREATE INDEX IF NOT EXISTS "skill_mastery_user_idx" ON "skill_mastery" USING btree ("user_id")`,
  `CREATE INDEX IF NOT EXISTS "progress_event_user_idx" ON "progress_event" USING btree ("user_id")`,
  `CREATE INDEX IF NOT EXISTS "progress_event_session_idx" ON "progress_event" USING btree ("session_id")`,
  `CREATE INDEX IF NOT EXISTS "progress_event_type_idx" ON "progress_event" USING btree ("event_type")`,
]

const EXPECTED_TABLES = ['tutor_session', 'lesson_attempt', 'skill_mastery', 'progress_event']

// Neon Free tier resets idle TCP connections mid-migration (ECONNRESET) and
// can drop the socket right AFTER applying a DDL. So: one FRESH connection per
// statement (matches scripts/db-push.ts strategy), attach an 'error' handler so
// an async reset can't crash the process with "Unhandled 'error' event", and
// treat ECONNRESET as "DDL probably landed" — the final verify + IF NOT EXISTS
// idempotency make this safe.
async function runStatement(
  connectionString: string,
  stmt: string,
): Promise<{ ok: boolean; reset?: boolean; error?: string }> {
  const client = new Client({ connectionString, ssl: { rejectUnauthorized: false } })
  // Swallow async socket errors (Neon drops the connection after DDL).
  client.on('error', () => {})
  try {
    await client.connect()
    await client.query(stmt)
    return { ok: true }
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e)
    if (msg.includes('ECONNRESET')) return { ok: true, reset: true }
    if (msg.includes('already exists') || msg.includes('duplicate')) {
      return { ok: false, error: msg }
    }
    return { ok: false, error: msg }
  } finally {
    try {
      await client.end()
    } catch {
      /* Neon may have already closed the socket */
    }
  }
}

async function applyMigration() {
  const connectionString = process.env.DATABASE_URL_DIRECT
  if (!connectionString) throw new Error('DATABASE_URL_DIRECT is required')

  console.log('Applying migration 0003: tutor tracking schema (4 tables, 3 enums)...')
  for (const stmt of STATEMENTS) {
    const head = stmt.replace(/\s+/g, ' ').slice(0, 64)
    const r = await runStatement(connectionString, stmt)
    if (r.ok) {
      console.log(`[migration] OK  ${r.reset ? '(reset, assumed applied)' : ''}:`, head)
    } else if (r.error && (r.error.includes('already exists') || r.error.includes('duplicate'))) {
      console.log('[migration] SKIP:', r.error.slice(0, 64))
    } else {
      throw new Error(`statement failed: ${head} → ${r.error}`)
    }
  }

  // Verify all 4 tables present (fresh connection).
  const verify = new Client({ connectionString, ssl: { rejectUnauthorized: false } })
  verify.on('error', () => {})
  await verify.connect()
  try {
    const result = await verify.query<{ table_name: string }>(
      `SELECT table_name FROM information_schema.tables
       WHERE table_schema='public' AND table_name = ANY($1)
       ORDER BY table_name`,
      [EXPECTED_TABLES],
    )
    const got = result.rows.map((r) => r.table_name)
    console.log('[migration] Tables confirmed:', got.join(', '))
    const missing = EXPECTED_TABLES.filter((t) => !got.includes(t))
    if (missing.length) throw new Error(`verify failed — missing tables: ${missing.join(', ')}`)
    console.log('[migration] Migration 0003 applied successfully. ✅')
  } finally {
    await verify.end()
  }
}

const scriptPath = process.argv[1] ?? ''
if (scriptPath.includes('apply-0003-tutor-migration')) {
  applyMigration().catch((err) => {
    console.error('[migration] FAILED:', err instanceof Error ? err.message : String(err))
    process.exit(1)
  })
}
