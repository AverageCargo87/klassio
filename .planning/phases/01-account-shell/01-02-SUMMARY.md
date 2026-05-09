---
phase: 01-account-shell
plan: "02"
subsystem: infra
tags: [neon, postgres, resend, vercel, auth-secret, env, provisioning, security]

# Dependency graph
requires:
  - phase: 01-account-shell/01-01
    provides: .env.example contract + lib/env.ts zod validation + test infra
provides:
  - Real credentials in .env.local (DATABASE_URL, DATABASE_URL_DIRECT, AUTH_SECRET, AUTH_RESEND_KEY, SEED_ADMIN_EMAIL)
  - Neon Postgres project provisioned (eu-central-1 Frankfurt, Postgres 17.8)
  - Resend account + API key provisioned
  - D-02 silent-drop UX security decision documented (A1 resolved)
  - Vercel Hobby plan decision recorded (Phase 4 upgrade tracked)
  - COSTS.md § 7 tracking populated
  - STATE.md Active todos updated with Phase 4 Pro upgrade reminder
affects:
  - 01-03 (schema push to live Neon DB — DATABASE_URL_DIRECT ready)
  - 01-04 (magic link auth — Resend + AUTH_RESEND_KEY ready; D-02 silent-drop UX locked)
  - 01-06 (Vercel deploy — AUTH_SECRET ready; Hobby plan active)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Silent-drop UX for non-whitelisted email (OWASP ASVS V3.2 user enumeration mitigation)"
    - "Neon Free tier as Postgres provider (pooler URL for DATABASE_URL, direct for DATABASE_URL_DIRECT)"
    - "Vercel Hobby for dev phases (Phase 1-3), Pro before first beta user (Phase 4)"

key-files:
  created:
    - .env.local (gitignored — 5 real credentials)
  modified:
    - .planning/phases/01-account-shell/01-CONTEXT.md (D-02 silent-drop, D-10 Neon, cost rollout, Vercel decision)
    - .planning/COSTS.md (Razdel 1 Vercel + DB rows, Razdel 4 Phase 1 row, Razdel 5 Vercel resolved, Razdel 6 tracking rows)
    - .planning/STATE.md (frontmatter status/progress, Active todos Phase 4 reminder)

key-decisions:
  - "A1 resolved: non-whitelisted email gets silent drop (same /login?sent=1 response as whitelisted — no /no-access redirect) per OWASP ASVS V3.2 user enumeration mitigation"
  - "DB provider switched Supabase -> Neon Free (eu-central-1 Frankfurt, Postgres 17.8) due to user Supabase account constraint"
  - "Vercel Hobby for Phase 1-3 dev/testing; upgrade to Pro before Phase 4 first beta user"

patterns-established:
  - "Single-response auth UX: whitelisted and non-whitelisted emails both see /login?sent=1 (silent drop for non-whitelisted)"
  - "Neon connection pattern: pooled URL (pgbouncer=true) for DATABASE_URL, direct URL for DATABASE_URL_DIRECT"

requirements-completed: [ACC-01]

# Metrics
duration: 30min
completed: "2026-05-09"
---

# Phase 1, Plan 02: Account Provisioning Summary

**Neon Postgres + Resend + AUTH_SECRET provisioned; D-02 silent-drop security decision locked; Vercel Hobby chosen for Phase 1-3**

## Performance

- **Duration:** ~30 min (Tasks 1-2 human-approved inline; Task 3 auto-executed)
- **Started:** 2026-05-09T19:30:00Z
- **Completed:** 2026-05-09T20:30:00Z
- **Tasks:** 3/3 (Task 1 + Task 2 human-approved by user during orchestration; Task 3 auto-executed)
- **Files modified:** 4 (3 planning docs + .env.local gitignored)

## Accomplishments

- Real credentials provisioned and verified: Neon pooler `SELECT 1` → Postgres 17.8, Neon direct `SELECT 1` → neondb, Resend `GET /domains` → HTTP 200 (empty list as expected for fresh account), env validation passes via `lib/env.ts` zod parse (6 keys OK)
- D-02 ambiguity resolved in CONTEXT.md: non-whitelisted email gets silent drop (same `/login?sent=1` response — no `/no-access` redirect). Eliminates user enumeration attack surface per OWASP ASVS V3.2.
- Vercel Hobby decision locked: 0 ₽/mo for Phase 1-3 dev/testing; Phase 4 upgrade to Pro ($20/mo) tracked in STATE.md Active todos and COSTS.md § 7.

## Task Commits

Tasks 1 and 2 were human-action / decision checkpoints approved by the user inline (no separate commits — these tasks produce only credentials in .env.local and a verbal decision, not code). Task 3 produced the planning doc updates:

1. **Task 1: [HUMAN] Provision Neon + Resend accounts and fill .env.local** — approved by user (credentials verified via smoke tests)
2. **Task 2: [HUMAN] Decide Vercel plan** — `hobby-now-pro-later` chosen by user
3. **Task 3: Record decisions in CONTEXT.md, COSTS.md, STATE.md** — `4c615aa` (docs)

**Plan metadata:** (this commit)

## Files Created/Modified

- `.env.local` — 5 real credentials (DATABASE_URL, DATABASE_URL_DIRECT, AUTH_SECRET, AUTH_RESEND_KEY, SEED_ADMIN_EMAIL). Gitignored — NOT committed.
- `.planning/phases/01-account-shell/01-CONTEXT.md` — D-02 updated (silent-drop, A1 resolved); D-10 updated (Neon deviation note); cost rollout updated (Hobby + Neon = ~0 ₽/mo); Vercel open question resolved; Neon docs reference added; descriptive Supabase mentions updated
- `.planning/COSTS.md` — Раздел 1 Vercel row (Hobby → Pro before Phase 4); Раздел 1 Database row (Neon Free); Раздел 4 Phase 1 rollout row; Раздел 5 Vercel resolved; Раздел 6 § 7 Tracking rows (2 new rows: Vercel Hobby choice + DB provider switch)
- `.planning/STATE.md` — frontmatter status=executing, completed_plans=2; Active todos updated (01-02 complete, 01-03 next, Phase 4 upgrade reminder)

## Decisions Made

1. **A1 → silent-drop** — Non-whitelisted emails receive the same `/login?sent=1` response as whitelisted (no information leak via redirect target). Rationale: different responses for whitelisted vs non-whitelisted leak whitelist membership via timing/redirect difference (user enumeration attack — OWASP ASVS V3.2). Implementation lands in Plan 04 (`lib/auth.ts` signIn callback).
2. **Vercel Hobby for Phase 1-3** — User chose `hobby-now-pro-later`: 0 ₽/mo for dev/testing phases. ToS compliant (only developer accessing). Phase 4 prerequisite: upgrade to Pro before first beta user opens URL. Tracked in STATE.md Active todos.
3. **DB provider: Neon (not Supabase)** — See deviations below.

## Deviations from Plan

### Spec Evolution (Rule 2 — missing critical: external constraint)

**1. [Rule 2 - Spec Evolution] DB provider Supabase → Neon**
- **Found during:** Task 1 (provisioning)
- **Issue:** User had $40 unpaid debt on Supabase account blocking project creation. Supabase was the originally planned Postgres provider (described in D-10 and several CONTEXT.md references).
- **Fix:** Pivoted to Neon Free tier (AWS eu-central-1 Frankfurt, Postgres 17.8). Code is Postgres-agnostic: Drizzle ORM works identically, only the URL format in `.env.local` differs. Neon URL: `<endpoint>-pooler.<region>.aws.neon.tech` for pooler vs Supabase's `aws-0-eu-central-1.pooler.supabase.com`. D-10 wording updated with deviation note. All descriptive CONTEXT.md Supabase references updated to Neon. COSTS.md updated.
- **Files modified:** `.planning/phases/01-account-shell/01-CONTEXT.md`, `.planning/COSTS.md`
- **Verification:** Neon pooler `SELECT 1` returned Postgres 17.8; direct `SELECT 1` returned neondb. Both smoke tests green.
- **Committed in:** `4c615aa` (Task 3 commit)

**2. [Rule 2 - Spec Evolution] Vercel Hobby instead of Pro (COSTS.md originally assumed Pro)**
- **Found during:** Task 2 (decision checkpoint)
- **Issue:** COSTS.md Phase 1 fixed cost assumed Vercel Pro $20/mo (~1850 ₽/mo total). User chose Hobby for Phase 1-3.
- **Fix:** COSTS.md updated to reflect ~0 ₽/mo current Phase 1 cost. Vercel Hobby → Pro upgrade reminder added to STATE.md Active todos. COSTS.md § 7 Tracking row added. Раздел 4 rollout and Раздел 6 open question updated.
- **Files modified:** `.planning/COSTS.md`, `.planning/STATE.md`
- **Committed in:** `4c615aa` (Task 3 commit)

**3. [Rule 2 - Spec Evolution] A1 resolution: silent-drop UX**
- **Found during:** Research phase (pre-plan) surfaced as assumption A1; resolved here in Task 3
- **Issue:** Original CONTEXT.md D-02 said "redirect на /no-access" for non-whitelisted email, contradicting the rationale "не давать информацию о существующих юзерах". Research identified the conflict as assumption A1.
- **Fix:** D-02 updated with explicit security rationale: single response (`/login?sent=1`) for both whitelisted and non-whitelisted = no user enumeration attack surface. `/no-access` remains for expired/invalid magic link clicks (where attacker already has the token). This is a refinement, not a contradiction — the original D-02 rationale is preserved more strongly.
- **Files modified:** `.planning/phases/01-account-shell/01-CONTEXT.md`
- **Committed in:** `4c615aa` (Task 3 commit)

---

**Total deviations:** 3 spec evolutions (all Rule 2 — necessary for external constraint + security correctness). No scope creep.
**Impact on plan:** All deviations necessary. Neon is Postgres-agnostic — zero code impact on Plans 03-06. Vercel Hobby saves ~5400 ₽ over 3 phases with zero ToS risk. A1 silent-drop prevents user enumeration vulnerability in Plan 04 implementation.

## Smoke Test Results (all green)

| Test | Command | Result |
|------|---------|--------|
| env validation | `npx tsx -e "import('./lib/env.ts')"` | 6 keys parsed (DATABASE_URL, DATABASE_URL_DIRECT, AUTH_SECRET, AUTH_RESEND_KEY, AUTH_URL, SEED_ADMIN_EMAIL) |
| Neon pooler | `postgres(DATABASE_URL) SELECT 1` | Postgres 17.8, pooler OK |
| Neon direct | `postgres(DATABASE_URL_DIRECT) SELECT 1` | neondb, direct OK |
| Resend API | `GET /domains` with AUTH_RESEND_KEY | HTTP 200, data: [] (expected for fresh account) |

## Issues Encountered

None beyond the documented deviations above.

## Next Phase Readiness

- **Plan 01-03 (Drizzle schema push + seed)** — fully unblocked. DATABASE_URL and DATABASE_URL_DIRECT verified working against live Neon instance. Plan 03 references both env vars generically — no code change needed for Neon vs Supabase pivot.
- **Plan 01-04 (magic link auth)** — unblocked. AUTH_RESEND_KEY verified. D-02 silent-drop decision locked — Plan 04 can hard-code the correct signIn callback behavior without ambiguity.
- **Plan 01-06 (Vercel deploy)** — AUTH_SECRET ready. Vercel Hobby plan active (upgrade reminder tracked for Phase 4).
- **Open follow-up (Plan 06):** Russian email deliverability (mail.ru / yandex.ru) still needs manual verification — deferred to Plan 06 production smoke test per research assumption A2.

---
*Phase: 01-account-shell*
*Completed: 2026-05-09*
