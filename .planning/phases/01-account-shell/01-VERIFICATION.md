---
phase: 01-account-shell
verified: 2026-05-10T03:10:00Z
status: human_needed
score: 5/5
overrides_applied: 0
human_verification:
  - test: "Run `vercel --prod` per MANUAL-ACTIONS.md, set 4 env vars, smoke-test production URL"
    expected: "https://klassio-XXX.vercel.app/ redirects to /login; /no-access shows neutral page; /lessons redirects to /login (middleware)"
    why_human: "Production deploy requires Vercel CLI authenticated as user; Vercel cannot be automated in this context. Build artifact is ready and passes `npm run build`."
  - test: "After deploy: submit kratov.gr@gmail.com on /login → check Gmail inbox"
    expected: "Magic link email arrives within 2 minutes; clicking it lands on /lessons with seed lesson card"
    why_human: "Russian email deliverability (assumption A2) requires a live Resend send from the production domain. Cannot verify without running server."
  - test: "After deploy: submit a mail.ru or yandex.ru address whitelisted in DB on production /login → check inbox + spam"
    expected: "Email arrives to inbox (ideally) or spam (acceptable for Phase 1 with onboarding@resend.dev sender)"
    why_human: "Research assumption A2 — RU email provider deliverability — can only be confirmed in production."
  - test: "Verify Vercel build logs show no 'Cannot find module postgres' or edge runtime errors"
    expected: "Clean deploy; Vercel function logs show no DB driver leaking into middleware bundle"
    why_human: "Edge bundle integrity check (T-01-14) is confirmed locally via grep, but production Vercel runtime provides the final proof."
---

# Phase 1: Account Shell — Verification Report

**Phase Goal:** Ребёнок попадает в свой личный кабинет по уникальной ссылке и видит список своих запланированных уроков.
**Verified:** 2026-05-10T03:10:00Z
**Status:** human_needed
**Re-verification:** No — initial verification

## Context Notes

This phase revised the auth model from a child-specific token URL to parent magic-link login (child uses parent's cookie on shared device). The goal text says "личная ссылка" — in the implemented model this is the magic link URL emailed to the parent after login, consistent with the ROADMAP success criteria and CONTEXT.md D-01. All five ROADMAP success criteria map correctly to the parent-auth-then-child-sessions model.

Production deploy was intentionally deferred: user was AFK during the autonomous run. `MANUAL-ACTIONS.md` documents the step-by-step deploy checklist. Build artifact is complete and `npm run build` passes cleanly. The implementation gap is **external/manual only** — all code, tests, and infrastructure are in place.

DB provider pivoted from Supabase to Neon (eu-central-1 Frankfurt) in Plan 02 due to user account constraint. Code is Postgres-agnostic; only `.env.local` URL format differs. No Supabase imports exist in source code.

---

## Goal Achievement

### Observable Truths (Roadmap Success Criteria)

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Parent reaches personal cabinet via unique link (magic link) — no public registration form | VERIFIED | `app/login/page.tsx` — email-only form, no registration fields. Magic link via Resend. `app/api/auth/[...nextauth]/route.ts` wired. E2E `login-happy-path.spec.ts` tests full flow. |
| 2 | Session persists — child re-opens URL without re-auth (INV-01) | VERIFIED | `lib/auth/config-options.ts`: `session.strategy = 'jwt'`, `maxAge = 365 * 24 * 60 * 60`. Cookie: httpOnly, sameSite=lax, secure in prod. E2E `persist-session.spec.ts` verifies cookie expires ≈ 365 days and `/ → /lessons` works in same browser context. |
| 3 | Lesson list shows date/time/topic; nearest first; empty state if no lessons (ACC-02) | VERIFIED | `app/lessons/page.tsx` queries `db.select().from(schema.lessons).where(eq(userId)).orderBy(asc(scheduledAt))`. Renders shadcn Cards with `ru-RU` locale. Empty state: "Пока уроков нет. Репетитор добавит их позже." Past lessons in separate section. |
| 4 | Expired/invalid magic link → neutral "link invalid" page | VERIFIED | `lib/auth/config-options.ts`: `pages.error = '/no-access'`. `app/no-access/page.tsx`: "Доступ не предоставлен. Обратитесь к репетитору." E2E `no-access.spec.ts` asserts both Russian phrases visible. |
| 5 | Child needs nothing beyond following the link — zero-install, no registration (INV-01) | VERIFIED | All routes server-rendered. `middleware.ts` protects `/lessons` and `/lesson/*` — unauth redirects to `/login`. No client-side extensions or plugins required. `app/page.tsx` auto-redirects based on session. E2E `protected-routes.spec.ts` confirms middleware redirect. |

**Score:** 5/5 truths verified

### Deferred Items

None — all roadmap success criteria are met in the implementation. Production deploy is a human action, not an unmet success criterion.

---

## Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `auth.ts` | Full NextAuth with DrizzleAdapter + Resend + signIn whitelist callback | VERIFIED | Exports handlers, auth, signIn, signOut. DrizzleAdapter wired with all 4 Neon tables. signIn callback calls `isEmailWhitelisted`. |
| `auth.config.ts` | Edge-safe config (no DB adapter) | VERIFIED | Re-exports `authConfigOptions`. No `@/lib/db` import. |
| `middleware.ts` | Edge middleware protecting /lessons and /lesson/* | VERIFIED | matcher: `['/lessons/:path*', '/lesson/:path*']`. Imports only `./auth.config` — NOT `./auth`. |
| `app/api/auth/[...nextauth]/route.ts` | NextAuth route handler | VERIFIED | `export const { GET, POST } = handlers` |
| `lib/auth/email-template.ts` | Russian Resend email template | VERIFIED | Subject "Вход в Klassio", POSTs to `https://api.resend.com/emails` with bearer auth. |
| `lib/auth/whitelist.ts` | Email whitelist helper | VERIFIED | `isEmailWhitelisted` normalizes email (trim + lowercase), queries `allowedEmails` table. |
| `lib/auth/config-options.ts` | Shared auth config options | VERIFIED | `strategy: 'jwt'`, `maxAge: 365 * 24 * 60 * 60`, `httpOnly: true`, `sameSite: 'lax'`, `providers: []`. |
| `lib/db/schema.ts` | 6-table Drizzle schema | VERIFIED | All 6 tables: user, account, session, verificationToken, allowed_email, lesson. `lessonStatusEnum` with 4 values. onDelete cascade on all FK userId columns. |
| `lib/db/index.ts` | Drizzle client (neon-http) | VERIFIED | Uses `@neondatabase/serverless` neon() HTTP client + `drizzle-orm/neon-http`. Stateless HTTP — immune to TCP termination on Neon Free tier. |
| `lib/env.ts` | Zod env validation | VERIFIED | `envSchema.parse(process.env)`. Validates DATABASE_URL (url), DATABASE_URL_DIRECT (url), AUTH_SECRET (min 32), AUTH_RESEND_KEY (min 10). |
| `app/layout.tsx` | Root layout with lang="ru" | VERIFIED | `<html lang="ru">`. Imports globals.css. |
| `app/globals.css` | Tailwind v4 + shadcn CSS variables | VERIFIED | `@import "tailwindcss"`, `@theme inline`, OKLCH color definitions. No tailwind.config.js. |
| `app/page.tsx` | Root auto-redirect | VERIFIED | Reads session: logged in → `/lessons`, not logged in → `/login`. |
| `app/login/page.tsx` | Email form + silent-drop loginAction | VERIFIED | Server Action with `'use server'`. Calls `signIn('resend', ...)`. Re-throws NEXT_REDIRECT success; catches AccessDeniedError and error redirects → uniform `/login?sent=1`. Russian copy: "Email родителя", "Отправить ссылку", banner text. |
| `app/lessons/page.tsx` | Server Component lessons list | VERIFIED | Queries DB for user's lessons. Renders upcoming/past sections. Calls `canStartLesson` per lesson. |
| `app/lessons/can-start.ts` | Pure canStartLesson function | VERIFIED | `canStartLesson(scheduledAt, durationMin, now)`: active 5 min before through end. 8 unit tests across boundary cases. |
| `app/no-access/page.tsx` | Neutral error page | VERIFIED | "Доступ не предоставлен" + "Обратитесь к репетитору." |
| `app/lesson/[id]/page.tsx` | Phase 3 placeholder | VERIFIED | Exists. Shows "Страница урока появится в Phase 3." Route protected by middleware. |
| `scripts/seed.ts` | Idempotent seed script | VERIFIED | Inserts admin email + user + upcoming lesson. `onConflictDoNothing` / `onConflictDoUpdate` for idempotency. |
| `drizzle.config.ts` | Drizzle-kit config | VERIFIED | `process.env.DATABASE_URL_DIRECT` (NOT pooler). Correct separation for migrations. |
| `tests/fixtures.ts` | Shared test fixtures | VERIFIED | Exports `allowedEmail`, `testUser`, `testLesson`, `fixedNow`. |
| `e2e/fixtures/db-setup.ts` | E2E DB fixture | VERIFIED | `seedTestUser`, `resetTestDb`, `readMagicLinkFor`, `closeTestDb`, `makeTestEmail`. Uses `DATABASE_URL_DIRECT`. `e2e-test+` prefix for cleanup. |
| E2E spec files (8 total) | Full Playwright suite | VERIFIED | login-happy-path, whitelist-uniform-response, magic-link-single-use, persist-session, protected-routes, root-redirect, no-access, sanity. All present in `e2e/`. |

---

## Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `auth.ts signIn callback` | `lib/auth/whitelist.ts isEmailWhitelisted` | Direct import and call | WIRED | `signIn: async ({ user }) => await isEmailWhitelisted(user?.email)` |
| `lib/auth/whitelist.ts` | `allowedEmails` table in Neon DB | `db.select().from(schema.allowedEmails).where(eq(...))` | WIRED | Drizzle query with normalized email. Integration test verifies against live Neon. |
| `middleware.ts` | `auth.config.ts` (authorized callback) | `NextAuth(authConfig).auth` | WIRED | `import authConfig from './auth.config'` — no `@/lib/db` in middleware. |
| `app/lessons/page.tsx` | `auth()` from `@/auth` | Server Component call | WIRED | `const session = await auth()` — uses session.user.id to query lessons. |
| `app/lessons/page.tsx` | `db.select().from(schema.lessons)` | Drizzle query | WIRED | `db.select().from(schema.lessons).where(eq(schema.lessons.userId, session.user.id)).orderBy(asc(schema.lessons.scheduledAt))` |
| `app/lessons/page.tsx` | `canStartLesson` | Import and call per lesson | WIRED | `import { canStartLesson } from './can-start'` called in `.map()` for each lesson. |
| `app/login/page.tsx loginAction` | `signIn('resend', ...)` | Server Action | WIRED | `await signIn('resend', { email: raw, redirectTo: '/login?sent=1' })` — both success redirect and error paths route to `/login?sent=1`. |
| `lib/auth/email-template.ts` | `https://api.resend.com/emails` | `fetch` with Bearer auth | WIRED | POST with Authorization header using `provider.apiKey`. Subject "Вход в Klassio". Unit test verifies. |
| `e2e/login-happy-path.spec.ts` | `e2e/fixtures/db-setup.ts readMagicLinkFor` | Import | WIRED | Reads `verificationToken` table from Neon to construct magic link URL, bypassing server-side Resend interception. |

---

## Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|---------------|--------|--------------------|--------|
| `app/lessons/page.tsx` | `userLessons` | `db.select().from(schema.lessons).where(eq(userId)).orderBy(asc(scheduledAt))` — Drizzle query to Neon | Yes — queries live DB via neon-http | FLOWING |
| `app/lessons/page.tsx` | `session.user.id` | `auth()` → JWT token.sub → session callback maps `token.sub → session.user.id` | Yes — real JWT session from cookie | FLOWING |
| `lib/auth/whitelist.ts` | rows from `allowedEmails` | `db.select({id}).from(allowedEmails).where(eq(email, normalized)).limit(1)` | Yes — live DB query | FLOWING |

---

## Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Build compiles without DB/edge leaks | `npm run build` | All 7 routes compiled; middleware 87.1kB; no postgres module error | PASS |
| TypeScript strict passes | `npm run typecheck` | Exit 0 — no TS errors | PASS |
| Unit test suite (24 tests) | `npm run test` | 35 tests pass (9 files) — confirmed live run | PASS |
| Middleware does NOT import @/lib/db | `grep "@/lib/db" middleware.ts auth.config.ts lib/auth/config-options.ts` | No matches | PASS |
| lang="ru" in root layout | File read | `<html lang="ru">` present | PASS |
| No Supabase imports in source | grep (excluding node_modules) | Only comments in lib/env.ts (stale template text, not imports or URLs) | PASS |

Note: `npm run test` returned 35 tests passing (not 24 as reported in SUMMARY). The count difference is because SUMMARY.md counted 24 unit tests, but additional tests from Plans 03-05 were included in the final run. Both counts confirm the suite is green.

---

## Requirements Coverage

| Requirement | Source Plans | Description | Status | Evidence |
|-------------|-------------|-------------|--------|----------|
| ACC-01 | 01-01, 01-02, 01-03, 01-04, 01-05, 01-06 | Email magic link auth, whitelist enforcement, JWT 1yr session | SATISFIED | `auth.ts` + `lib/auth/whitelist.ts` + `lib/auth/email-template.ts`. signIn callback queries allowed_email. JWT maxAge=365 days. E2E login-happy-path + whitelist-uniform-response green. |
| ACC-02 | 01-03, 01-05, 01-06 | Lessons list with date/time/topic, active button 5min before | SATISFIED | `app/lessons/page.tsx` + `app/lessons/can-start.ts`. Drizzle query, ru-RU locale, canStartLesson boundary tested (8 cases). |
| INV-01 | 01-01, 01-04, 01-05, 01-06 | Zero-install for child; parent authenticates once per year | SATISFIED | Server-rendered routes, middleware protection. Cookie maxAge=365 days verified in E2E persist-session.spec.ts. Child opens browser → already in ЛК via parent's cookie. |

**Orphaned requirements check:** REQUIREMENTS.md maps ACC-03, ACC-04 to Phase 2 — not orphaned for Phase 1.

---

## Anti-Patterns Found

| File | Pattern | Severity | Impact |
|------|---------|----------|--------|
| `lib/env.ts` lines 8, 10 | Comments say "Supabase transaction pooler" / "Supabase direct connection" (stale template text) | Info | None — comments only, no code paths. DB is actually Neon. Cosmetic: update comments to say "Neon" in future cleanup. |
| `app/lesson/[id]/page.tsx` | Returns placeholder "Страница урока появится в Phase 3." | Info — intentional | Phase 3 placeholder by design. Route is middleware-protected. Tracked in ROADMAP Phase 3. |

No blockers found. The lesson/[id] placeholder is the correct Phase 1 implementation per plan.

---

## Human Verification Required

### 1. Production Deploy to Vercel

**Test:** Follow `.planning/MANUAL-ACTIONS.md` Phase 1, Wave 6, Task 3: `vercel login && vercel link && vercel env add ... (4 vars) && vercel --prod`
**Expected:** Production URL live; `/ → /login`, `/no-access → "Доступ не предоставлен"`, `/lessons → /login` (middleware); `npm run build` artifact deploys cleanly.
**Why human:** Vercel CLI deploy requires authenticated session as kratov.gr@gmail.com. Cannot automate from this context. Build artifact is ready.

### 2. Gmail Magic Link Round-Trip in Production

**Test:** On production URL, submit kratov.gr@gmail.com (seeded in allowed_email) on /login → check Gmail inbox within 2 minutes → click magic link → verify land on /lessons with seed lesson card.
**Expected:** Email arrives (likely inbox with onboarding@resend.dev sender for Gmail). Magic link leads to /lessons. Seed lesson "Сложение в столбик" card visible.
**Why human:** Requires live production Resend send and real email inbox check.

### 3. RU Email Deliverability (Assumption A2)

**Test:** After deploy, add a mail.ru or yandex.ru address to allowed_email via SQL, submit on production /login, check inbox + spam folder.
**Expected:** Email arrives (inbox is ideal; spam is acceptable for Phase 1 — not a blocker).
**Why human:** Russian ISP deliverability behavior with onboarding@resend.dev test sender. Cannot simulate programmatically. Research assumption A2 requires real-world test.

### 4. RU User Access Without VPN (Assumption A3)

**Test:** Have a contact in Russia open production URL without VPN and attempt full login flow.
**Expected:** Site loads; login form submits; magic link delivered; /lessons accessible.
**Why human:** Roskomnadzor blocking status of Vercel and Resend cannot be determined without a real RU IP. Acceptable to defer to Phase 4 (when Cloudflare CDN added per DEC-deploy-architecture).

---

## Gaps Summary

No implementation gaps. All 5 roadmap success criteria are verified in code, tests, and build artifact.

The 4 human verification items above are all **external/manual** — they require production infrastructure that is intentionally deferred per MANUAL-ACTIONS.md:
- Deploy: user action (Vercel CLI auth required)
- Email deliverability: real-world test on live production URL
- RU access: requires RU tester or RU IP

These items do NOT block Phase 2 development (Phase 2 scope is independent of Phase 1 deploy status, per ROADMAP.md and 01-06-SUMMARY.md).

---

*Verified: 2026-05-10T03:10:00Z*
*Verifier: Claude (gsd-verifier)*
