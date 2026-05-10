---
phase: 02-admin
plan: "03"
subsystem: testing
tags: [playwright, e2e, documentation, admin-guide, schedule-ui, collapsible, neon, session-reuse]

# Dependency graph
requires:
  - phase: 02-admin/02-01
    provides: Admin CLI scripts (create-user, create-lesson, list-users, list-lessons) documented in guide
  - phase: 02-admin/02-02
    provides: /lessons page with Расписание h1, week headers, past-lessons collapsible component
  - phase: 01-account-shell/01-06
    provides: e2e/fixtures/db-setup.ts (seedTestUser, resetTestDb, makeTestEmail, readMagicLinkFor, clearMagicLinkFile), e2e/global-setup.ts warmup pattern

provides:
  - docs/admin-guide.md: Russian admin guide — quickstart (30-sec path), command reference (4 scripts), FAQ (4 items), troubleshooting (4 scenarios)
  - README.md: Project readme with Documentation section linking to docs/admin-guide.md
  - e2e/schedule-grouping.spec.ts: 5 passing E2E tests for ACC-03 schedule UI

affects:
  - Phase 4 (production deploy): README.md exists for first-time contributors
  - Phase 10 (recordings): admin guide FAQ mentions "Запись урока появится в будущем обновлении." placeholder verified by E2E

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Login-once session sharing in E2E: authenticate in beforeAll with dedicated chromium.launch(), save context.cookies(), inject via addCookies() in each test — avoids single-use magic link problem"
    - "Neon cold-start mitigation in E2E: warmup /api/auth/session hit before /lessons, explicit goto timeout (8s), 3-retry loop with 2.5s wait — prevents 35s test stall"
    - "goToLessons() helper pattern: encapsulate auth + warmup + retry in a single helper for clean test bodies"

key-files:
  created:
    - docs/admin-guide.md
    - README.md
    - e2e/schedule-grouping.spec.ts
  modified:
    - e2e/login-happy-path.spec.ts (fix stale heading selector /^Уроки$/ → /Расписание/)

key-decisions:
  - "login-once-in-beforeAll with addCookies: avoids single-use magic link token exhaustion across 5 tests sharing same email"
  - "Explicit goto timeout (8s) + retry (3x) in goToLessons: prevents 35s stall when Neon Free tier compute is cold between tests 10 and 12 (alternating ECONNRESET pattern)"
  - "admin-guide.md uses real Klassio context: kratov.gr@gmail.com seed admin, Маша child, math 5th grade topics (per constraint #5)"
  - "README.md created from scratch (not pre-existing): project had VISION.md, BOARD-STACK.md, BOARD-STATUS.md but no README — created minimal one with Documentation section"

patterns-established:
  - "E2E session reuse: chromium.launch() in beforeAll → save cookies → addCookies per test"
  - "Neon warmup before DB-heavy pages: /api/auth/session hit wakes compute before /lessons query"
  - "docs/ directory established for product-side docs (separate from .planning/ which is process docs)"

requirements-completed: [ACC-03, ACC-04]

# Metrics
duration: 35min
completed: "2026-05-10"
---

# Phase 2, Plan 03: Admin Guide + Schedule E2E Summary

**Russian admin guide (docs/admin-guide.md) with 30-sec quickstart + 4 CLI commands + FAQ + troubleshooting, plus 5 passing Playwright E2E tests verifying the /lessons schedule UI (week grouping, smart dates, past section collapsed/expanded)**

## Performance

- **Duration:** ~35 min
- **Started:** 2026-05-10T00:39:29Z
- **Completed:** 2026-05-10T01:14:07Z
- **Tasks:** 2/2
- **Files created:** 3 new, 1 modified

## Accomplishments

- `docs/admin-guide.md` created in Russian: quickstart (30 seconds to test child + lesson), command reference for all 4 admin scripts with real example output, FAQ (4 questions: delete user, change schedule, cancel lesson, whitelist), troubleshooting (4 scenarios: env var, user not found, ECONNRESET, magic link)
- `README.md` created with project overview and Documentation section linking to docs/admin-guide.md (project had no README before)
- `e2e/schedule-grouping.spec.ts` created with 5 tests: Расписание heading, Эта неделя week header, Сегодня в smart date, past section collapsed, past section expanded with status badge + Phase 10 placeholder
- All 15 E2E tests pass (10 existing + 5 new); all 64 unit tests pass; `npm run build` passes
- ACC-03 and ACC-04 both confirmed complete; Phase 2 success criteria 1-4 all met

## Task Commits

1. **Task 1: docs/admin-guide.md + README.md update** — `d831e69` (docs)
   - Files: docs/admin-guide.md (new), README.md (new)

2. **Task 2: Playwright E2E spec for schedule grouping** — `e76630c` (feat)
   - Files: e2e/schedule-grouping.spec.ts (new), e2e/login-happy-path.spec.ts (fix)

## Files Created/Modified

- `docs/admin-guide.md` — Russian admin guide: quickstart, 4-command reference (create-user, create-lesson, list-users, list-lessons), 4-item FAQ, 4-scenario troubleshooting
- `README.md` — Project overview with Documentation section: `Admin-операции... see docs/admin-guide.md`
- `e2e/schedule-grouping.spec.ts` — 5 Playwright E2E tests for /lessons schedule grouping UI; login-once-in-beforeAll session sharing pattern; Neon warmup + retry in goToLessons helper
- `e2e/login-happy-path.spec.ts` — Fixed stale heading selector (`/^Уроки$/` → `/Расписание/`) after Plan 02-02 refactored the heading text

## Decisions Made

1. **Login-once-in-beforeAll with addCookies injection** — Multiple tests sharing same email email all need an authenticated session. Rather than each test doing a full login (exhausting the single-use magic link token), authenticate once in `beforeAll` with a dedicated `chromium.launch()` call, save cookies to `savedCookies` variable, and inject them into each test's page via `page.context().addCookies(savedCookies)`.

2. **Explicit goto timeout + retry loop** — Neon Free tier compute goes cold between test runs, causing `ERR_ABORTED` on `/lessons` page load (the Drizzle select fails with ECONNRESET). Tests 10 and 12 were timing out at 35s (the default 30s test timeout). Fix: explicit `goto` timeout (8s) + 3-retry loop with 2.5s wait, plus `/api/auth/session` warmup hit before each navigation.

3. **README.md created from scratch** — The plan said "find README.md and add pointer". No README existed (only VISION.md, BOARD-STACK.md, BOARD-STATUS.md). Created minimal README with quickstart, test commands, and Documentation section.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed stale heading selector in login-happy-path.spec.ts**
- **Found during:** Task 2 (initial E2E run — 1 existing test failing before new spec was added)
- **Issue:** `e2e/login-happy-path.spec.ts` checked `getByRole('heading', { name: /^Уроки$/ })` but Plan 02-02 refactored the h1 text from "Уроки" to "Расписание". Pre-existing failure in the existing test suite.
- **Fix:** Updated selector to `/Расписание/` with comment explaining the change
- **Files modified:** e2e/login-happy-path.spec.ts
- **Verification:** All 15 E2E tests pass after fix
- **Committed in:** `e76630c` (Task 2 commit)

---

**2. [Rule 1 - Bug] Redesigned E2E session management — single login in beforeAll instead of per-test login**
- **Found during:** Task 2 (first run with per-test login approach)
- **Issue:** Plan scaffold had each test do an independent login flow. With serial workers and the same email, the NextAuth magic link token is consumed by test 1. Tests 2-5 attempted new logins but Neon ECONNRESET on `verificationToken` INSERT caused failures.
- **Fix:** Authenticate once in `beforeAll` with `chromium.launch()`, save cookies, inject via `addCookies()` per test.
- **Files modified:** e2e/schedule-grouping.spec.ts
- **Verification:** 5/5 new tests pass in isolation and in full suite
- **Committed in:** `e76630c` (Task 2 commit)

---

**3. [Rule 1 - Bug] Added Neon warmup + retry loop in goToLessons() helper**
- **Found during:** Task 2 (second run — 13/15 passing, tests 10 and 12 failing with 35s timeout)
- **Issue:** Tests 10 and 12 hit Neon cold compute after previous test's connection released. `page.goto('/lessons')` got `net::ERR_ABORTED` from Next.js aborting the request when Drizzle select failed with ECONNRESET. Default Playwright navigation timeout (30s) caused test timeout.
- **Fix:** Added `page.request.get('/api/auth/session')` warmup before `/lessons` navigation (mirrors global-setup.ts pattern), explicit 8s goto timeout, and 3-retry loop with 2.5s wait.
- **Files modified:** e2e/schedule-grouping.spec.ts
- **Verification:** All 15 tests pass consistently across 2 full suite runs
- **Committed in:** `e76630c` (Task 2 commit)

---

**Total deviations:** 3 auto-fixed (all Rule 1 — bugs discovered during E2E test execution)
**Impact on plan:** All fixes necessary for test reliability. The session management approach is architecturally sound for serial Playwright tests with single-use magic links. No scope creep.

## Issues Encountered

- **Neon cold-start ECONNRESET pattern**: Neon Free tier compute suspends after ~5 minutes of inactivity. First HTTP fetch from neon-http client to a cold compute node fails with ECONNRESET. The global-setup.ts warmup warms the connection pool, but between individual tests there can be secondary cold-starts. The goToLessons() helper's `/api/auth/session` + retry approach reliably handles this (verified across 2 full runs).

## User Setup Required

None — all changes are documentation and tests. No new environment variables or external services required.

## Known Stubs

None — docs/admin-guide.md references real commands that execute against live Neon DB. E2E tests wire real DB data.

## Threat Flags

None — docs/admin-guide.md documents internal schema (T-02-08 disposition: accept). E2E tests use e2e-test+ prefix for cleanup (T-02-09 disposition: accept). afterAll resetTestDb() confirmed working (T-02-10 mitigation: implemented).

## Next Phase Readiness

- Phase 2 complete: ACC-03 (schedule UI) + ACC-04 (admin CLI) both satisfied
- docs/admin-guide.md enables any developer to onboard and test within 30 seconds
- E2E suite guards schedule grouping against regressions (15 total tests)
- docs/ directory established for product-side documentation in future phases
- Phase 3 (next) can proceed without Phase 2 blockers

---

*Phase: 02-admin*
*Completed: 2026-05-10*

## Self-Check: PASSED

| Item | Status |
|------|--------|
| docs/admin-guide.md | FOUND |
| README.md | FOUND |
| e2e/schedule-grouping.spec.ts | FOUND |
| .planning/phases/02-admin/02-03-SUMMARY.md | FOUND |
| commit d831e69 (Task 1) | FOUND |
| commit e76630c (Task 2) | FOUND |
| docs/admin-guide.md contains Quickstart | FOUND |
| docs/admin-guide.md contains 4 CLI commands | FOUND |
| docs/admin-guide.md contains FAQ | FOUND |
| docs/admin-guide.md contains Troubleshooting | FOUND |
| README.md links to docs/admin-guide.md | FOUND |
| E2E spec contains Расписание test | FOUND |
| E2E spec contains Эта неделя test | FOUND |
| E2E spec contains Прошедшие уроки test | FOUND |
| E2E spec contains status badge test | FOUND |
| npm run test (64 unit tests) | PASSED |
| npm run test:e2e (15 E2E tests) | PASSED |
| npm run build | PASSED |
