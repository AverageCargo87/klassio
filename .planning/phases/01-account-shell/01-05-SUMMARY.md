---
phase: 01-account-shell
plan: "05"
subsystem: ui
tags: [next-js, shadcn-ui, tailwind-v4, server-components, server-actions, drizzle, auth]

# Dependency graph
requires:
  - phase: 01-account-shell/01-01
    provides: test infra (vitest, happy-dom), lib/env.ts, Next.js scaffold
  - phase: 01-account-shell/01-03
    provides: lib/db/schema.ts (lessons table), lib/db/index.ts (db client)
  - phase: 01-account-shell/01-04
    provides: auth.ts (auth(), signIn(), signOut()), middleware.ts (route protection), types/next-auth.d.ts
provides:
  - app/layout.tsx: Root layout html lang="ru" + globals.css import + Klassio metadata
  - app/globals.css: Tailwind v4 base (@import "tailwindcss") + shadcn OKLCH CSS variables + @theme inline
  - app/page.tsx: Root auto-redirect (session → /lessons, anon → /login)
  - app/login/page.tsx: Email form + loginAction Server Action + silent-drop A1 UX + RU copy
  - app/lessons/page.tsx: Server Component — Drizzle query + canStartLesson per lesson + RU locale Cards
  - app/lessons/can-start.ts: Pure function canStartLesson(scheduledAt, durationMin, now): boolean
  - app/no-access/page.tsx: Neutral auth error landing (D-18)
  - app/lesson/[id]/page.tsx: Phase 3 placeholder
  - components/ui/button.tsx, card.tsx, input.tsx, label.tsx: shadcn CLI-generated components
  - components.json: shadcn config (base-nova/neutral/css-vars)
  - lib/utils.ts: cn() helper (clsx + twMerge)
affects:
  - 01-06 (E2E): Full UI surface for e2e tests — login form, /lessons route, magic link flow
  - 03+ (lesson page): /lesson/[id] placeholder replaced in Phase 3

# Tech tracking
tech-stack:
  added:
    - shadcn/ui (shadcn@4.7.0, base-nova style) — button, card, input, label components
    - clsx + tailwind-merge (via shadcn init) — cn() utility
    - class-variance-authority (via shadcn) — button variants
    - @base-ui/react (via shadcn button) — accessible button primitive
    - tw-animate-css (via shadcn init) — animation utilities
  patterns:
    - "Tailwind v4 CSS-only: @import 'tailwindcss' + @theme inline OKLCH variables — NO tailwind.config.js"
    - "shadcn/ui base-nova style with neutral color, CSS variables, RSC=true"
    - "Server Component + Server Action pattern: loginAction with 'use server' inside async page"
    - "NEXT_REDIRECT re-throw pattern: digest.startsWith('NEXT_REDIRECT') guard in try/catch"
    - "TDD pure function: canStartLesson injected 'now' for deterministic tests"
    - "Drizzle select().from().where().orderBy() chain in Server Component"

key-files:
  created:
    - app/globals.css
    - app/layout.tsx
    - app/page.tsx
    - app/login/page.tsx
    - app/lessons/page.tsx
    - app/lessons/can-start.ts
    - app/lessons/__tests__/can-start.test.ts
    - app/lessons/__tests__/page.test.tsx
    - app/no-access/page.tsx
    - app/lesson/[id]/page.tsx
    - components/ui/button.tsx
    - components/ui/card.tsx
    - components/ui/input.tsx
    - components/ui/label.tsx
    - components.json
    - lib/utils.ts
  modified:
    - package.json (shadcn deps: clsx, tailwind-merge, class-variance-authority, @base-ui/react, tw-animate-css)
    - package-lock.json

key-decisions:
  - "D-14 implemented: Tailwind v4 CSS-only — @import 'tailwindcss' + @theme inline OKLCH palette, NO tailwind.config.js"
  - "A1 silent-drop end-to-end: loginAction re-throws NEXT_REDIRECT, catches AccessDeniedError → redirect('/login?sent=1') — uniform for both whitelisted and non-whitelisted submissions"
  - "canStartLesson signature: (scheduledAt, durationMin, now) — 'now' injected for testability, no Date.now() inside"
  - "canStartLesson window: scheduledAt-5min (inclusive) to scheduledAt+durationMin (inclusive)"
  - "shadcn-ui style: base-nova (shadcn v4 default) — slightly different from 'new-york' but meets D-13 neutral defaults requirement"
  - "D-16: / → auth() redirect, no landing page in v1"
  - "D-18: /no-access neutral text 'Доступ не предоставлен. Обратитесь к репетитору.'"
  - "Server Component test pattern: import Page dynamically after mocking @/auth and @/lib/db; mock drizzle-orm eq/asc"

patterns-established:
  - "loginAction NEXT_REDIRECT guard: check error.digest.startsWith('NEXT_REDIRECT') before catching — standard Next.js Server Action pattern"
  - "Server Component mocking in vitest: vi.mock('@/auth'), vi.mock('@/lib/db'), vi.mock('drizzle-orm'), vi.resetModules() in beforeEach"
  - "Lessons page split: upcoming (scheduledAt+durationMin >= now) vs past; canStartLesson on each upcoming"

requirements-completed: [ACC-01, ACC-02, INV-01]

# Metrics
duration: 7min
completed: "2026-05-10"
---

# Phase 1, Plan 05: UI Routes + Tailwind v4 + shadcn/ui + canStartLesson Summary

**5 UI routes (/, /login, /lessons, /no-access, /lesson/[id] placeholder) + shadcn/ui scaffold + Tailwind v4 OKLCH globals.css + canStartLesson pure function with 8 boundary-case TDD tests; npm run build PASS, 35/35 unit tests PASS**

## Performance

- **Duration:** ~7 min
- **Started:** 2026-05-09T21:09:06Z
- **Completed:** 2026-05-10T00:22:00Z
- **Tasks:** 3/3
- **Files created:** 16 new, 2 modified

## Accomplishments

- shadcn/ui initialized (base-nova style, neutral color, CSS variables) with 4 components: button, card, input, label. `lib/utils.ts` cn() helper wired.
- `app/globals.css` with Tailwind v4 CSS-only syntax (`@import "tailwindcss"` + `@theme inline` OKLCH palette). No `tailwind.config.js` — Pitfall 8 preempted.
- `app/layout.tsx` sets `html lang="ru"`, imports globals.css, metadata in Russian.
- `canStartLesson(scheduledAt, durationMin, now)` pure function: window = scheduledAt−5min to scheduledAt+durationMin (inclusive). 8 TDD boundary tests (RED→GREEN). All pass.
- `/lessons` Server Component: Drizzle query by userId, upcoming/past split, Cards with RU locale time, canStartLesson-gated Start button.
- `/login` Server Action: `loginAction` re-throws NEXT_REDIRECT, catches `AccessDeniedError` → silent-drop to `/login?sent=1` (A1 end-to-end, T-01-01 mitigated). Russian copy throughout.
- `/no-access`: neutral RU text (D-18). `/`: auth()-based redirect (D-16). `/lesson/[id]`: Phase 3 placeholder.
- `npm run build` compiles all 7 routes (5 page + 2 static) without edge bundle DB leak. Middleware 87.1 kB (no postgres in bundle).

## Task Commits

1. **Task 1: shadcn/ui init + Tailwind v4 globals.css + root layout + cn utility** — `b566988`
   - Files: app/globals.css, app/layout.tsx, components.json, components/ui/{button,card,input,label}.tsx, lib/utils.ts, package.json, package-lock.json

2. **Task 2 (TDD): canStartLesson pure function + /lessons Server Component + /lesson/[id] placeholder** — `5d6824e`
   - Files: app/lessons/can-start.ts, app/lessons/page.tsx, app/lessons/__tests__/can-start.test.ts, app/lessons/__tests__/page.test.tsx, app/lesson/[id]/page.tsx

3. **Task 3: / + /login (silent-drop loginAction) + /no-access** — `70b81db`
   - Files: app/page.tsx, app/login/page.tsx, app/no-access/page.tsx

## Files Created/Modified

- `app/globals.css` — Tailwind v4 CSS-only base + shadcn OKLCH palette (light + dark) + @theme inline + @layer base
- `app/layout.tsx` — html lang="ru", Klassio metadata, globals.css import
- `app/page.tsx` — auth() redirect gate (D-16)
- `app/login/page.tsx` — loginAction Server Action; signIn('resend') with NEXT_REDIRECT re-throw; AccessDeniedError silent-drops; RU copy throughout
- `app/lessons/page.tsx` — Server Component; Drizzle select; upcoming/past split; canStartLesson per lesson; RU locale; empty state
- `app/lessons/can-start.ts` — canStartLesson(scheduledAt, durationMin, now): boolean; 5-min pre-window
- `app/lessons/__tests__/can-start.test.ts` — 8 boundary tests (TDD RED→GREEN)
- `app/lessons/__tests__/page.test.tsx` — 3 render tests; mocked auth + db + drizzle-orm
- `app/no-access/page.tsx` — neutral RU error landing (D-18)
- `app/lesson/[id]/page.tsx` — Phase 3 placeholder (Next.js 15 async params)
- `components/ui/button.tsx`, `card.tsx`, `input.tsx`, `label.tsx` — shadcn CLI-generated
- `components.json` — shadcn config
- `lib/utils.ts` — cn() (clsx + twMerge)
- `package.json`, `package-lock.json` — shadcn dependencies added

## Decisions Made

1. **shadcn base-nova style (not new-york)** — shadcn v4 default when `-d` flag is used is `base-nova`. Both meet D-13 neutral defaults; base-nova is the current upstream default. No functional difference for Phase 1.

2. **NEXT_REDIRECT guard via digest property** — Next.js redirect() throws a special error with `digest` starting with `NEXT_REDIRECT`. This must be re-thrown inside Server Actions or the redirect is swallowed. Pattern: `if (error.digest?.startsWith('NEXT_REDIRECT')) throw error` then catch everything else for silent-drop.

3. **Server Component test: mock drizzle-orm eq/asc** — The lessons page imports `eq` and `asc` from `drizzle-orm`. In tests, these need to be mocked too (`vi.mock('drizzle-orm', () => ({ eq: vi.fn(), asc: vi.fn() }))`) since the mocked `db.select()` chain doesn't use them, but the import fails if drizzle-orm can't resolve.

4. **vi.resetModules() in page test beforeEach** — Each test imports `../page` dynamically after setting up mocks. `vi.resetModules()` ensures the module is fresh (not cached with stale mocks) between tests.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] shadcn init requires globals.css to exist before detecting Tailwind v4**
- **Found during:** Task 1 (shadcn init)
- **Issue:** `npx shadcn@latest init -y -d` failed with "No Tailwind CSS configuration found" because globals.css didn't exist yet. shadcn v4 detects Tailwind by finding `@import "tailwindcss"` in the CSS file, not by finding tailwind.config.js (since Tailwind v4 has no JS config).
- **Fix:** Created `app/globals.css` with full OKLCH palette first (from RESEARCH Code Example 8), then re-ran `npx shadcn@latest init -y -d`. shadcn updated globals.css adding its additional theme variables (chart, sidebar tokens) — a superset, not a conflict.
- **Files modified:** app/globals.css (created then updated by shadcn)
- **Committed in:** b566988

**2. [Rule 3 - Blocking] page.test.tsx required vi.mock('drizzle-orm') to mock eq/asc imports**
- **Found during:** Task 2 (page test RED→GREEN)
- **Issue:** `app/lessons/page.tsx` imports `eq, asc` from `drizzle-orm`. The mocked db.select() chain doesn't actually call them, but vitest/vite tries to resolve `drizzle-orm` during module loading. Without the mock, the import would try to initialize the real drizzle-orm, potentially pulling in postgres.js.
- **Fix:** Added `vi.mock('drizzle-orm', () => ({ eq: vi.fn(), asc: vi.fn() }))` to page.test.tsx.
- **Files modified:** app/lessons/__tests__/page.test.tsx
- **Committed in:** 5d6824e

---

**Total deviations:** 2 auto-fixed (both Rule 3 — blocking issues discovered during execution)
**Impact on plan:** Both fixes are standard and necessary. No scope creep. shadcn globals.css update is a superset of planned content.

## Issues Encountered

None beyond the 2 auto-fixed blocking issues above.

## Threats Addressed

| Threat | Status | How |
|--------|--------|-----|
| T-01-01: whitelist enumeration via redirect-target diff | Mitigated (end-to-end) | loginAction redirects to /login?sent=1 for BOTH success and AccessDeniedError — A1 silent-drop complete |
| T-01-05: response timing/shape enumeration | Mitigated | loginAction uniform response shape; signIn callback constant-shape DB query (Plan 04) closes both halves |
| T-01-15: confused-deputy session ID | Mitigated | /lessons queries `where eq(lessons.userId, session.user.id)` — parameterized, session-derived |
| T-01-16: open redirect | Mitigated | All redirectTo values are hard-coded strings — no formData input reaches redirect target |
| T-01-17: lesson UUID disclosure via /lesson/[id] | Accepted (documented in plan) | Route is middleware-protected; ownership check deferred to Phase 3 |

## Known Stubs

- `app/lesson/[id]/page.tsx` — Intentional Phase 3 placeholder. Text: "Страница урока появится в Phase 3". Plan-specified behavior; Phase 3 (LES-01) will replace with 3-panel lesson page.

## Threat Flags

None — no new trust boundaries beyond plan's threat model.

## Next Phase Readiness

Plan 06 (E2E) can now:
- Drive the full magic-link login flow: `/login` form → Resend email → magic link click → `/lessons`
- Assert the seed lesson card renders (topic "Сложение в столбик", disabled button since scheduledAt is 2026-06-01)
- Test whitelist enumeration uniform response (T-01-01/T-01-05 — same response for whitelisted and non-whitelisted)
- Test magic link single-use (T-01-02 — replay protection)
- Verify `/no-access` renders for expired magic links

## Self-Check: PASSED

| Item | Status |
|------|--------|
| app/layout.tsx | FOUND |
| app/globals.css | FOUND |
| app/page.tsx | FOUND |
| app/login/page.tsx | FOUND |
| app/lessons/page.tsx | FOUND |
| app/lessons/can-start.ts | FOUND |
| app/lessons/__tests__/can-start.test.ts | FOUND |
| app/lessons/__tests__/page.test.tsx | FOUND |
| app/no-access/page.tsx | FOUND |
| app/lesson/[id]/page.tsx | FOUND |
| components/ui/button.tsx | FOUND |
| components/ui/card.tsx | FOUND |
| components/ui/input.tsx | FOUND |
| components/ui/label.tsx | FOUND |
| components.json | FOUND |
| lib/utils.ts | FOUND |
| task commit b566988 | FOUND |
| task commit 5d6824e | FOUND |
| task commit 70b81db | FOUND |
| lang="ru" in app/layout.tsx | PRESENT |
| @import "tailwindcss" in app/globals.css | PRESENT |
| @theme inline in app/globals.css | PRESENT |
| NO tailwind.config.js | CONFIRMED |
| npm run typecheck | PASSED |
| npm run build | PASSED (7 routes, no edge bundle DB leak) |
| npm run test (35 tests) | PASSED |
