---
phase: 02-admin
plan: "01"
subsystem: database
tags: [drizzle, schema, neon, postgres, pg, admin-cli, migration]

# Dependency graph
requires:
  - phase: 01-account-shell/01-03
    provides: lib/db/schema.ts (lessons table), scripts/db-push.ts pattern, scripts/seed.ts pg pattern
  - phase: 01-account-shell/01-01
    provides: lib/env.ts (DATABASE_URL + DATABASE_URL_DIRECT validated), test infra

provides:
  - lib/db/schema.ts: 3 new nullable columns on lessons table (recording_url, transcript_url, html_trainer_path)
  - drizzle/0001_fat_mockingbird.sql: SQL migration with 3 ALTER TABLE ADD COLUMN stmts
  - scripts/apply-0001-migration.ts: Direct pg migration (Neon-safe pattern)
  - scripts/admin/create-user.ts: Admin CLI to upsert user + whitelist email; exports parseArgs
  - scripts/admin/create-lesson.ts: Admin CLI to create lesson bound to user (--email required)
  - scripts/admin/list-users.ts: Admin CLI to list all users in aligned table
  - scripts/admin/list-lessons.ts: Admin CLI to list all lessons with user JOIN
  - scripts/admin/__tests__/parse-args.test.ts: 5 unit tests for native process.argv parseArgs

affects:
  - 02-02 (schedule UI): lessons table now has html_trainer_path column (D-13)
  - 02-03 (admin guide): admin CLI command signatures ready for docs
  - 07 (html trainer): html_trainer_path column pre-wired in schema
  - 10 (recordings): recording_url + transcript_url columns pre-wired in schema

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Admin CLI scripts in scripts/admin/*.ts — 4 thin DB-wrapper scripts, no yargs/commander (D-10)"
    - "parseArgs exported from create-user.ts for unit testing; inlined in other scripts (self-contained)"
    - "pg (node-postgres) for admin CLI DML — avoids postgres-js ECONNRESET on Neon Free (D-09)"
    - "scripts/apply-0001-migration.ts pattern: pg + IF NOT EXISTS for safe idempotent Neon migration"
    - "db-push.ts flow: drizzle-kit generate (schema-only) + separate pg apply for actual DML"

key-files:
  created:
    - drizzle/0001_fat_mockingbird.sql
    - drizzle/meta/0001_snapshot.json
    - scripts/apply-0001-migration.ts
    - scripts/admin/create-user.ts
    - scripts/admin/create-lesson.ts
    - scripts/admin/list-users.ts
    - scripts/admin/list-lessons.ts
    - scripts/admin/__tests__/parse-args.test.ts
  modified:
    - lib/db/schema.ts (3 new columns on lessons table)
    - lib/db/__tests__/schema.test.ts (3 new tests + 2 regression guards)
    - package.json (4 admin:* scripts)

key-decisions:
  - "D-09 reaffirmed: admin CLI uses pg (node-postgres) not postgres-js — avoids ECONNRESET on Neon Free tier"
  - "D-10 implemented: native process.argv parseArgs — no yargs/commander; function exported for unit testing"
  - "D-08 implemented: admin CLI auto-whitelists email into allowed_email (ON CONFLICT DO NOTHING)"
  - "T-02-04 mitigated: --date format validated (YYYY-MM-DD regex) before timestamp construction"
  - "Migration applied via scripts/apply-0001-migration.ts (pg + IF NOT EXISTS) not db-push.ts (which hangs on Neon when applying already-existing DDL from 0000 file)"

patterns-established:
  - "Admin scripts are self-contained (inline withClient + inline parseArgs) — no shared module imports"
  - "CLI entrypoint guard: process.argv[1]?.endsWith('.ts') pattern (matches seed.ts)"
  - "ON CONFLICT (email) DO UPDATE for user upsert — idempotent by design"
  - "create-lesson has no ON CONFLICT — running twice creates 2 lessons (intentional; no natural unique key)"

requirements-completed: [ACC-04]

# Metrics
duration: 10min
completed: "2026-05-10"
---

# Phase 2, Plan 01: Schema Migration + Admin CLI Scripts Summary

**3 nullable lesson columns (recording_url, transcript_url, html_trainer_path) pushed to Neon + 4 admin CLI scripts (create-user, create-lesson, list-users, list-lessons) wired as npm admin:* scripts**

## Performance

- **Duration:** ~10 min
- **Started:** 2026-05-10T00:14:26Z
- **Completed:** 2026-05-10T00:24:26Z
- **Tasks:** 2/2
- **Files created:** 8 new, 3 modified

## Accomplishments

- 3 nullable TEXT columns added to lesson table in live Neon DB (`recording_url`, `transcript_url`, `html_trainer_path`) — pre-wires schema for Phase 7 (html trainer) and Phase 10 (recordings)
- drizzle/0001_fat_mockingbird.sql generated with 3 ALTER TABLE ADD COLUMN statements
- Migration applied to Neon via `scripts/apply-0001-migration.ts` (pg + IF NOT EXISTS — Neon-safe)
- 4 admin CLI scripts fully functional against live Neon; smoke tests pass (create-user idempotent, list-users shows 2 users)
- 5 parseArgs unit tests + 3 schema column tests + 2 regression guards = 43 total tests (was 35)
- ACC-04 acceptance criterion met: mechanism to create user + lesson without a UI

## Task Commits

1. **Task 1: Extend Drizzle schema + push migration to Neon** — `1add440` (feat)
   - Files: lib/db/schema.ts, lib/db/__tests__/schema.test.ts, drizzle/0001_fat_mockingbird.sql, drizzle/meta/, scripts/apply-0001-migration.ts

2. **Task 2: Admin CLI scripts + npm scripts wiring** — `9c001a2` (feat)
   - Files: scripts/admin/create-user.ts, create-lesson.ts, list-users.ts, list-lessons.ts, __tests__/parse-args.test.ts, package.json

## Files Created/Modified

- `lib/db/schema.ts` — 3 new nullable columns: recordingUrl, transcriptUrl, htmlTrainerPath on lessons table
- `lib/db/__tests__/schema.test.ts` — +3 new column tests + 2 regression guards (8 → 9 tests in file)
- `drizzle/0001_fat_mockingbird.sql` — 3 ALTER TABLE ADD COLUMN IF NOT EXISTS statements
- `scripts/apply-0001-migration.ts` — Direct pg migration for Neon (ADD COLUMN IF NOT EXISTS, idempotent)
- `scripts/admin/create-user.ts` — Upsert user + whitelist; exports `parseArgs` for unit tests
- `scripts/admin/create-lesson.ts` — Insert lesson (date/time validated, trainer optional); --date required
- `scripts/admin/list-users.ts` — Aligned table: ID|Email|Child|Age|Created|LastLogin
- `scripts/admin/list-lessons.ts` — Aligned table with user JOIN: ID|Email|Topic|Scheduled|Duration|Status
- `scripts/admin/__tests__/parse-args.test.ts` — 5 unit tests for native parseArgs
- `package.json` — 4 admin:* scripts: admin:create-user, admin:create-lesson, admin:list-users, admin:list-lessons

## Decisions Made

1. **Migration via `scripts/apply-0001-migration.ts` not `npm run db:push`** — The existing `db-push.ts` applies ALL .sql files in drizzle/ in sort order. When it re-processes the already-applied 0000 file, postgres.js hangs waiting for responses on CREATE TABLE/TYPE statements (Neon ECONNRESET pattern with long idle_timeout). Rather than modify db-push.ts (which works for clean migrations), created a one-shot migration script using `pg` + `IF NOT EXISTS`. The 0001 SQL file is still the migration source of truth; db-push.ts will work correctly on a fresh database.

2. **parseArgs exported from create-user.ts, inlined in others** — The plan spec says "do NOT create a separate parse-args.ts module" and tests import from create-user. Each other script inlines the same implementation for self-containedness (consistent with seed.ts pattern).

3. **T-02-04 date validation implemented** — `--date` validated with `/^\d{4}-\d{2}-\d{2}$/` regex before `new Date()` construction. Invalid format exits 1 with helpful message before any DB interaction.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Used separate migration script instead of db-push.ts for 0001 migration**
- **Found during:** Task 1 (migration apply step)
- **Issue:** `npm run db:push` hangs when processing the 0000 file (already-applied DDL) — postgres.js awaits responses on CREATE TABLE for already-existing tables, and Neon's ECONNRESET comes too late (after `idle_timeout: 10`). The 0001 migration was never reached.
- **Fix:** Created `scripts/apply-0001-migration.ts` using `pg` + `ALTER TABLE ... IF NOT EXISTS` — reliable on Neon Free, idempotent. All 3 columns confirmed present via `information_schema.columns` query.
- **Files modified:** scripts/apply-0001-migration.ts (new)
- **Verification:** Query returned `recording_url, transcript_url, html_trainer_path` in column list
- **Committed in:** `1add440`

---

**Total deviations:** 1 auto-fixed (1 blocking)
**Impact on plan:** Necessary for migration delivery. The 0001_fat_mockingbird.sql file is still the canonical drizzle migration artifact; apply-0001-migration.ts is the Neon-compatible runner for this specific file.

## Issues Encountered

- db-push.ts hanging on already-applied 0000 DDL — resolved by dedicated pg migration script (see Deviations above). The `db-push.ts` approach is correct for fresh DB deployments (Vercel/preview envs); apply-0001-migration.ts handles the incremental Neon Free tier case.

## User Setup Required

None — all changes applied to live Neon DB automatically. No manual steps needed.

## Known Stubs

None — all 4 CLI scripts execute real DB operations. No placeholder content.

## Threat Flags

None — no new trust boundaries beyond the plan's threat model. DATABASE_URL_DIRECT only in .env.local (gitignored).

## Next Phase Readiness

- Admin CLI ready for Plan 02-02 (schedule UI) — test user `smoke-test@example.ru` + lesson exist in Neon
- Schema pre-wired for Phase 7 (`html_trainer_path`) and Phase 10 (`recording_url`, `transcript_url`)
- ACC-04 complete — admin path exists for creating test child + test lesson
- `scripts/admin/create-user.ts` covers quickstart story from D-15 admin guide (Plan 02-03 can reference these commands directly)

---

*Phase: 02-admin*
*Completed: 2026-05-10*

## Self-Check: PASSED

| Item | Status |
|------|--------|
| lib/db/schema.ts | FOUND |
| lib/db/__tests__/schema.test.ts | FOUND |
| drizzle/0001_fat_mockingbird.sql | FOUND |
| scripts/apply-0001-migration.ts | FOUND |
| scripts/admin/create-user.ts | FOUND |
| scripts/admin/create-lesson.ts | FOUND |
| scripts/admin/list-users.ts | FOUND |
| scripts/admin/list-lessons.ts | FOUND |
| scripts/admin/__tests__/parse-args.test.ts | FOUND |
| package.json | FOUND |
| .planning/phases/02-admin/02-01-SUMMARY.md | FOUND |
| commit 1add440 | FOUND |
| commit 9c001a2 | FOUND |
