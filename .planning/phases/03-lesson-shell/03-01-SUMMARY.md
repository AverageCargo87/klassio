---
phase: 03-lesson-shell
plan: "01"
subsystem: database
tags: [drizzle, postgres, neon, migration, pg]

# Dependency graph
requires:
  - phase: 02-admin
    provides: "apply-0001-migration.ts pattern: pg + IF NOT EXISTS Neon-safe DDL"
provides:
  - "actual_start_at nullable timestamp column on lesson table in Neon"
  - "actual_end_at nullable timestamp column on lesson table in Neon"
  - "actualStartAt + actualEndAt Drizzle fields on lessons schema export"
  - "apply-0002-migration.ts idempotent migration runner"
affects:
  - "03-lesson-shell/03-03 — status transitions write to actualStartAt + actualEndAt"
  - "10-recording — actualEndAt - actualStartAt = lesson duration"
  - "12-analytics — both columns feed timing analytics"

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "pg + IF NOT EXISTS migration pattern (Neon-safe, idempotent)"
    - "TDD RED-GREEN cycle for schema column additions"

key-files:
  created:
    - drizzle/0002_lesson_timestamps.sql
    - scripts/apply-0002-migration.ts
  modified:
    - lib/db/schema.ts
    - lib/db/__tests__/schema.test.ts
    - app/lessons/__tests__/week-grouping.test.ts
    - app/lessons/__tests__/page.test.tsx
    - drizzle/meta/_journal.json
    - drizzle/meta/0002_snapshot.json

key-decisions:
  - "Used pg + IF NOT EXISTS (not drizzle-kit push) — same Neon-safe pattern as Phase 2 Plan 01"
  - "Generated SQL via drizzle-kit generate then renamed to 0002_lesson_timestamps.sql and added IF NOT EXISTS guards"
  - "Both columns nullable (no .notNull()) so existing rows get NULL — no data migration required"

patterns-established:
  - "Phase 3 schema extensions: add columns inside pgTable definition after existing createdAt"
  - "Test fixture pattern: add actualStartAt: null + actualEndAt: null to all lesson objects in tests"

requirements-completed: [LES-01]

# Metrics
duration: 10min
completed: 2026-05-10
---

# Phase 3 Plan 01: Lesson Timestamps Schema Summary

**Two nullable timestamp columns (actual_start_at, actual_end_at) added to Neon lesson table via idempotent pg migration runner, enabling Phase 3 status transitions and Phase 10/12 analytics**

## Performance

- **Duration:** ~10 min
- **Started:** 2026-05-10T04:32:00Z
- **Completed:** 2026-05-10T04:42:00Z
- **Tasks:** 2
- **Files modified:** 8

## Accomplishments
- Extended Drizzle `lessons` schema with `actualStartAt` + `actualEndAt` nullable timestamp fields (TDD: RED→GREEN confirmed)
- Generated `drizzle/0002_lesson_timestamps.sql` with `IF NOT EXISTS` guards (idempotent)
- Applied migration to live Neon DB — both columns confirmed via `information_schema.columns` query
- Migration verified idempotent: running script twice both succeed without errors

## Task Commits

Each task was committed atomically:

1. **Task 1: Extend Drizzle schema + generate SQL migration** - `4edbb85` (feat)
2. **Task 2: Write migration runner + apply to live Neon** - `9d4ffdb` (feat)

**Plan metadata:** (see final commit below)

_Note: Task 1 used TDD — tests written first (RED), then schema extended (GREEN)._

## Files Created/Modified
- `lib/db/schema.ts` - Added actualStartAt + actualEndAt nullable timestamp fields to lessons table
- `drizzle/0002_lesson_timestamps.sql` - SQL migration with 2 ALTER TABLE ADD COLUMN IF NOT EXISTS statements
- `scripts/apply-0002-migration.ts` - pg-based idempotent migration runner for Neon Free tier
- `lib/db/__tests__/schema.test.ts` - 2 new tests: actualStartAt/actualEndAt nullable timestamp assertions
- `app/lessons/__tests__/week-grouping.test.ts` - Rule 1 fix: added actualStartAt/actualEndAt null to lesson fixture
- `app/lessons/__tests__/page.test.tsx` - Rule 1 fix: added actualStartAt/actualEndAt null to 2 lesson fixtures
- `drizzle/meta/_journal.json` - Updated migration tag from auto-generated name to canonical 0002_lesson_timestamps
- `drizzle/meta/0002_snapshot.json` - Drizzle snapshot for migration 0002

## Decisions Made
- Used `pg` + `IF NOT EXISTS` (not `drizzle-kit push`) — same proven Neon-safe pattern established in Phase 2 Plan 01
- Generated SQL via `drizzle-kit generate` then renamed file and added `IF NOT EXISTS` guards (drizzle-kit generate omits IF NOT EXISTS)
- Both columns nullable with no `.notNull()` — existing lesson rows get NULL automatically, no data migration

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed TypeScript errors in lesson test fixtures after schema extension**
- **Found during:** Task 1 (typecheck post-schema-extension)
- **Issue:** `app/lessons/__tests__/week-grouping.test.ts` and `app/lessons/__tests__/page.test.tsx` have inline lesson object literals typed against `lessons.$inferSelect` — adding new non-optional (nullable) columns causes TS2739 "missing properties" errors
- **Fix:** Added `actualStartAt: null, actualEndAt: null` to all 3 lesson fixture objects across 2 files
- **Files modified:** `app/lessons/__tests__/week-grouping.test.ts`, `app/lessons/__tests__/page.test.tsx`
- **Verification:** `npm run typecheck` exits 0 after fix; all 66 tests pass
- **Committed in:** `4edbb85` (Task 1 commit)

---

**Total deviations:** 1 auto-fixed (Rule 1 — TypeScript correctness)
**Impact on plan:** Fix necessary for type correctness after schema change. No scope creep — exactly the files changed by this plan's schema extension.

## Issues Encountered
- `drizzle-kit generate` auto-generated name `0002_steep_serpent_society` — renamed to canonical `0002_lesson_timestamps.sql` and updated `drizzle/meta/_journal.json` accordingly
- Generated SQL lacks `IF NOT EXISTS` guards — added manually before applying to Neon

## User Setup Required
None - no external service configuration required beyond DATABASE_URL_DIRECT already in .env.local.

## Next Phase Readiness
- Neon `lesson` table has `actual_start_at` + `actual_end_at` nullable timestamp columns — confirmed live
- Drizzle schema exports `actualStartAt` + `actualEndAt` on `lessons` table — ready for Plan 03-03 status transitions
- Phase 10 can compute lesson duration as `actualEndAt - actualStartAt` once recording is wired
- Phase 12 analytics can query both timing columns

---
*Phase: 03-lesson-shell*
*Completed: 2026-05-10*

## Self-Check: PASSED

**Files verified exist:**
- FOUND: lib/db/schema.ts
- FOUND: drizzle/0002_lesson_timestamps.sql
- FOUND: scripts/apply-0002-migration.ts
- FOUND: lib/db/__tests__/schema.test.ts
- FOUND: .planning/phases/03-lesson-shell/03-01-SUMMARY.md

**Commits verified:**
- FOUND: 4edbb85 feat(03-01): extend lesson schema with actual_start_at + actual_end_at
- FOUND: 9d4ffdb feat(03-01): apply migration 0002 — actual_start_at + actual_end_at on lesson table

**Live Neon columns confirmed (idempotent re-run):**
- actual_end_at: present
- actual_start_at: present
