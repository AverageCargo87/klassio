---
phase: 03-lesson-shell
plan: "03"
subsystem: ui
tags: [next-app-router, server-component, server-action, react-context, event-bus, playwright, shadcn, base-ui, pg, neon, tailwind, tdd]

# Dependency graph
requires:
  - phase: 03-lesson-shell
    plan: "01"
    provides: "actual_start_at + actual_end_at nullable timestamp columns"
  - phase: 03-lesson-shell
    plan: "02"
    provides: "LessonBusProvider, useLessonBus, useLessonBusEvent hooks"
  - phase: 02-admin
    plan: "02"
    provides: "pg + DML pattern for Neon-safe status transitions"
  - phase: 01-account-shell
    plan: "04"
    provides: "auth() pattern, Server Actions"
provides:
  - "app/lesson/[id]/page.tsx: Server Component with auth + ownership + canStart guard + scheduled→in_progress auto-transition"
  - "app/lesson/[id]/end-lesson.ts: 'use server' action — UPDATE status=completed + actual_end_at=now(), redirect /lessons"
  - "components/lesson-shell.tsx: LessonBusProvider + adaptive layout (desktop CSS Grid / tablet flex / mobile prompt)"
  - "components/panels/board-panel.tsx: Pencil icon + Phase 4 placeholder"
  - "components/panels/voice-panel.tsx: Mic icon + Тест шины bus emit button"
  - "components/panels/trainer-panel.tsx: BookOpen icon + useLessonBusEvent counter"
  - "components/ui/alert-dialog.tsx: shadcn AlertDialog (base-ui based)"
  - "e2e/lesson-shell.spec.ts: 5 Playwright E2E tests — full lesson shell flow + bus proof"
affects:
  - "04-board — drop tldraw into BoardPanel without touching page/bus infrastructure"
  - "06-voice — drop voice+avatar into VoicePanel"
  - "07-trainer — drop HTML trainer into TrainerPanel"
  - "10-recording — actualEndAt - actualStartAt = lesson duration"
  - "12-e2e — lesson shell E2E already tested; extend for multimodal flows"

# Tech tracking
tech-stack:
  added:
    - "@base-ui/react AlertDialog (via shadcn shadcn@latest add alert-dialog)"
  patterns:
    - "Server Component for auth + ownership + canStart guard; passes only serialized primitives to client"
    - "pg + COALESCE idempotent status transition (scheduled→in_progress) on first page visit"
    - "LessonBusProvider wraps entire lesson layout; panels communicate via bus without prop drilling"
    - "Single render of panels (no DOM duplicates); responsive layout via Tailwind flex→grid on parent container"
    - "AlertDialogTrigger styled directly (base-ui does not support Radix-style asChild nesting)"
    - "E2E pattern: seedLessonShellUser with status=in_progress + login-once-beforeAll + savedCookies injection"
    - "TDD RED-GREEN: test file created first (import errors = RED), then implementation (5 tests GREEN)"

key-files:
  created:
    - app/lesson/[id]/end-lesson.ts
    - components/lesson-shell.tsx
    - components/panels/board-panel.tsx
    - components/panels/voice-panel.tsx
    - components/panels/trainer-panel.tsx
    - components/ui/alert-dialog.tsx
    - components/lesson-shell/__tests__/panels.test.tsx
    - e2e/lesson-shell.spec.ts
  modified:
    - app/lesson/[id]/page.tsx

key-decisions:
  - "Single render of panels (no duplicate DOM): responsive layout via Tailwind flex→grid on parent, not two separate layout containers"
  - "AlertDialogTrigger styled directly (not via Button wrapper): base-ui Trigger renders its own <button>; wrapping Button inside triggers nested button DOM error"
  - "E2E seeds lesson as status=in_progress directly: avoids pg status-transition timing issues on page load"
  - "LessonShell receives only string primitives (lessonId, topic): RSC→Client boundary cannot serialize Date objects"
  - "Mock @/app/lesson/[id]/end-lesson in unit tests: server action imports next-auth (server-only) which is incompatible with vitest happy-dom environment"

patterns-established:
  - "Cross-panel bus proof: VoicePanel emits lesson:test → TrainerPanel counter increments via useLessonBusEvent"
  - "Server action end-lesson: auth() → ownership WHERE user_id=$2 → status guard WHERE status='in_progress' → redirect('/lessons')"
  - "canStartLesson gate on server: only renders LessonShell if lesson is in active window"
  - "Adaptive layout: hidden md:flex outer wrapper; flex flex-col lg:grid inside for tablet→desktop transition"

requirements-completed: [LES-01]

# Metrics
duration: 12min
completed: 2026-05-10
---

# Phase 3 Plan 03: Lesson Shell Summary

**Lesson page server component with auth + ownership + canStart guard + auto-transition, LessonShell client with 3 panel placeholders + LessonBus wiring + AlertDialog end-lesson + adaptive layout, and 5 Playwright E2E tests proving cross-panel event bus**

## Performance

- **Duration:** ~12 min
- **Started:** 2026-05-10T01:47:09Z
- **Completed:** 2026-05-10T01:59:00Z
- **Tasks:** 3
- **Files modified:** 9 (8 created, 1 rewritten)

## Accomplishments
- Full lesson page (`/lesson/[id]`) replacing Phase 1 placeholder: auth, ownership (404 on IDOR), terminal status view, canStart guard, idempotent pg scheduled→in_progress transition, LessonShell render
- `end-lesson` server action with ownership+status guards, pg UPDATE actual_end_at=now(), redirect /lessons — mitigates T-03-03-03 and T-03-03-04
- LessonShell client component: LessonBusProvider wraps 3 panels; adaptive layout (desktop CSS Grid 1fr/24rem, tablet flex-col, mobile prompt); AlertDialog confirm for "Завершить урок"
- 3 panel placeholders (BoardPanel, VoicePanel, TrainerPanel) with bus test infrastructure — cross-panel emit/receive proved via E2E
- 5 unit tests (TDD RED→GREEN) + 5 E2E tests: 86 total green (81 unit + 20 E2E → was 76+15)

## Task Commits

Each task was committed atomically:

1. **Task 1: lesson page server component + end-lesson server action** - `61360de` (feat)
2. **Task 2: LessonShell + 3 panel placeholders + adaptive layout (5 tests GREEN)** - `524fcc8` (feat)
3. **Task 3: Playwright E2E lesson-shell spec (LES-01 — 5 tests) + LessonShell layout fix** - `40a7ba8` (feat)

**Plan metadata:** (final commit below)

_Task 2 followed TDD: test file created first (RED via import errors), then all 5 components created (GREEN)._

## Files Created/Modified
- `app/lesson/[id]/page.tsx` — Full rewrite: auth(), Drizzle ownership query, terminal status view, canStart guard, pg COALESCE status transition, LessonShell render
- `app/lesson/[id]/end-lesson.ts` — 'use server' action: pg UPDATE status=completed + actual_end_at=now() WHERE id=$1 AND user_id=$2 AND status='in_progress'
- `components/lesson-shell.tsx` — 'use client': LessonBusProvider, AlertDialog confirm, adaptive layout (hidden md:flex outer; flex→grid inner transition)
- `components/panels/board-panel.tsx` — Pencil icon + "Здесь будет доска (Phase 4)"
- `components/panels/voice-panel.tsx` — Mic icon + "Тест шины" button (bus.emit lesson:test, NEXT_PUBLIC_LESSON_BUS_TEST flag)
- `components/panels/trainer-panel.tsx` — BookOpen icon + useLessonBusEvent counter "Получено N тестовых событий"
- `components/ui/alert-dialog.tsx` — shadcn base-ui AlertDialog component
- `components/lesson-shell/__tests__/panels.test.tsx` — 5 Vitest tests (mock end-lesson server action)
- `e2e/lesson-shell.spec.ts` — 5 Playwright E2E tests: panels visible, bus counter, end-lesson flow

## Decisions Made
- **Single render of panels (no DOM duplicates):** Earlier implementation had board/voice/trainer rendered twice (in both tablet-stack and desktop-grid containers). When E2E checked `.first()`, it resolved to the CSS-hidden copy in the tablet container. Fixed by rendering each panel once inside a single container that switches from flex to grid via parent CSS class.
- **AlertDialogTrigger styled directly:** base-ui Trigger renders a native `<button>`. Wrapping `<Button>` inside it creates button-in-button DOM validation error (React warning + accessibility issue). Solution: apply button styles directly on `<AlertDialogTrigger>` via className.
- **E2E lesson seeded as in_progress:** Seeding with status='in_progress' + actual_start_at=now() avoids the pg status-transition DML on first page load during tests, eliminating race conditions.
- **Mock end-lesson in unit tests:** The server action transitively imports next-auth which imports `next/server` (not available in vitest happy-dom). Mock is necessary; it doesn't affect the unit test's actual goal (testing panel render and bus wiring).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed test assertions: multiple elements match single-text queries**
- **Found during:** Task 2 (running tests after creating panels.test.tsx)
- **Issue:** `screen.getByText(/Голос/)` fails with "found multiple elements" — both CardTitle "Голос" and paragraph "Голос и аватар появятся в Phase 6" match. Same for "Тренажёр". LessonShell renders board/voice/trainer headings once, and each has title + description text.
- **Fix:** Changed `getByText(/X/)` to `getAllByText(/X/).length > 0` for texts that intentionally appear in both title and description within a panel.
- **Files modified:** `components/lesson-shell/__tests__/panels.test.tsx`
- **Verification:** All 5 unit tests pass without warnings
- **Committed in:** `524fcc8` (Task 2 commit)

**2. [Rule 1 - Bug] Fixed LessonShell DOM layout: panels rendered twice caused E2E failures**
- **Found during:** Task 3 (E2E test run — 3 of 5 tests failed with "expected visible, received hidden")**
- **Issue:** Initial LessonShell rendered panels in two containers (tablet-stack `lg:hidden` + desktop-grid `hidden lg:grid`). On desktop Chrome, `getByText('Доска').first()` resolved to the tablet-stack copy (CSS-hidden via parent). The test correctly found the element but it was hidden.
- **Fix:** Restructured LessonShell to render each panel once inside a single `flex lg:grid` container. The parent changes from flex-col to CSS Grid at the lg breakpoint; the panels themselves don't need to be duplicated.
- **Files modified:** `components/lesson-shell.tsx`
- **Verification:** All 5 E2E tests pass (panels visible, bus counter increments, end-lesson redirect works)
- **Committed in:** `40a7ba8` (Task 3 commit)

**3. [Rule 2 - Missing Critical] Mocked server action in unit tests (vitest happy-dom incompatibility)**
- **Found during:** Task 2 (first test run — "Cannot find module next/server")**
- **Issue:** `LessonShell` imports `end-lesson` (server action) which imports `@/auth` (next-auth) which imports `next/server` — server-only module not available in vitest happy-dom environment.
- **Fix:** Added `vi.mock('@/app/lesson/[id]/end-lesson', ...)` at top of test file. The mock returns a no-op so the import chain is severed before reaching server-only modules.
- **Files modified:** `components/lesson-shell/__tests__/panels.test.tsx`
- **Verification:** All 5 unit tests pass; the mock is correct (unit tests test panel render + bus, not the server action itself)
- **Committed in:** `524fcc8` (Task 2 commit)

---

**Total deviations:** 3 auto-fixed (2 Rule 1 bugs, 1 Rule 2 missing critical)
**Impact on plan:** All fixes necessary for correctness and test infrastructure. No scope creep — fixes stay within the plan's file set.

## Issues Encountered
- base-ui AlertDialog uses different composition pattern from Radix: no `asChild` support on Trigger (or renders button-in-button warning). Fixed by styling AlertDialogTrigger directly instead of wrapping a Button component.
- Neon cold-start ECONNRESET appears in server logs after some E2E tests complete (when Next.js makes a background request after redirect). Pre-existing issue, not introduced by this plan — all 20 E2E tests pass.

## User Setup Required
None - no external service configuration required. No new npm packages added to devDependencies.

## Known Stubs
- `BoardPanel`: "Здесь будет доска (Phase 4)" — intentional placeholder. Phase 4 will replace content with tldraw.
- `VoicePanel`: "Голос и аватар появятся в Phase 6" — intentional placeholder. Phase 6 will replace with 11labs voice agent.
- `TrainerPanel`: "Тренажёр появится в Phase 7" — intentional placeholder. Phase 7 will replace with HTML trainer.

These stubs are the deliverable of this plan (Phase 3 = scaffold + bus wiring). They are not incomplete — they are the explicit contract for future phases to implement into.

## Threat Flags

None — all new surface implements planned threat mitigations:
- T-03-03-01: auth() defensive check + middleware (both implemented)
- T-03-03-02: Drizzle query WHERE userId=session.user.id + notFound() (implemented)
- T-03-03-03: end-lesson WHERE user_id=$2 (implemented)
- T-03-03-04: end-lesson WHERE status='in_progress' guard (implemented)
- T-03-03-05/06: accepted risks (bus is in-memory; lessonId is UUID)

## Next Phase Readiness
- Phase 4 (tldraw board): Drop tldraw into `<BoardPanel>` body — `bus.emit('board:say', ...)` already in events.ts union via Phase 4+ extension
- Phase 6 (voice): Drop voice agent into `<VoicePanel>` — `bus.emit('voice:state', ...)` extension point ready
- Phase 7 (trainer): Drop HTML trainer into `<TrainerPanel>` — `useLessonBusEvent('trainer:input', ...)` extension point ready
- LES-01 acceptance criteria fully satisfied: 3 panels visible without tab switching, layout adapts to desktop/tablet, event bus exists with typed events, bus test button → counter increments, end-lesson returns to /lessons

---
*Phase: 03-lesson-shell*
*Completed: 2026-05-10*

## Self-Check: PASSED

**Files verified exist:**
- FOUND: app/lesson/[id]/page.tsx
- FOUND: app/lesson/[id]/end-lesson.ts
- FOUND: components/lesson-shell.tsx
- FOUND: components/panels/board-panel.tsx
- FOUND: components/panels/voice-panel.tsx
- FOUND: components/panels/trainer-panel.tsx
- FOUND: components/ui/alert-dialog.tsx
- FOUND: components/lesson-shell/__tests__/panels.test.tsx
- FOUND: e2e/lesson-shell.spec.ts
- FOUND: .planning/phases/03-lesson-shell/03-03-SUMMARY.md

**Commits verified:**
- FOUND: 61360de feat(03-03): lesson page server component + end-lesson server action
- FOUND: 524fcc8 feat(03-03): LessonShell + 3 panel placeholders + adaptive layout (5 tests green)
- FOUND: 40a7ba8 feat(03-03): Playwright E2E lesson-shell spec (LES-01 — 5 tests)

**Tests:** 81/81 unit green (5 new + 76 prior); 20/20 E2E green (5 new + 15 prior)
**Typecheck:** exits 0
**Build:** exits 0
