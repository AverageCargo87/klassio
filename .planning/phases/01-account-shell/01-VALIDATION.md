---
phase: 01
slug: account-shell
status: complete
nyquist_compliant: true
wave_0_complete: true
created: 2026-05-09
last_updated: 2026-05-10
---

# Phase 01 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.
> Source: `01-RESEARCH.md` § Validation Architecture.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest 2.x (unit/integration) + Playwright 1.4x (E2E) |
| **Config file** | `vitest.config.ts` + `playwright.config.ts` (Wave 0 installs) |
| **Quick run command** | `npm run test` (vitest, ~10s) |
| **Full suite command** | `npm run test && npm run test:e2e` (vitest + Playwright, ~60s) |
| **Estimated runtime** | ~10s quick, ~60s full |

---

## Sampling Rate

- **After every task commit:** Run `npm run test` (vitest, fast feedback)
- **After every plan wave:** Run `npm run test && npm run test:e2e` (full suite)
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** 60 seconds

---

## Per-Task Verification Map

> Filled by planner per task. Initial seed shows the shape — planner must complete during planning.

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 01-04-T1 | 04 | 4 | ACC-01 | T-01-01 (whitelist enum) | Email not in whitelist → callback returns false; pure helper isolated | unit | `npm run test -- whitelist` | ✅ | ✅ green |
| 01-04-T1 | 04 | 4 | ACC-01 | T-01-04 (cookie hijack) | httpOnly + sameSite=lax + secure(prod) + maxAge 365d | unit | `npm run test -- cookie-config` | ✅ | ✅ green |
| 01-04-T1 | 04 | 4 | ACC-01 | — | Russian template POSTs to api.resend.com with bearer token | unit | `npm run test -- email-template` | ✅ | ✅ green |
| 01-04-T2 | 04 | 4 | ACC-01 | T-01-01, T-01-05 | Live Neon whitelist lookup, case-insensitive | integration | `npm run test:integration` | ✅ | ✅ green |
| 01-05-T2 | 05 | 5 | ACC-02 | — | canStartLesson pure function, 8 boundary cases | unit | `npm run test -- can-start` | ✅ | ✅ green |
| 01-05-T2 | 05 | 5 | ACC-02 | — | /lessons Server Component renders Cards from Drizzle data | unit | `npm run test -- lessons/__tests__` | ✅ | ✅ green |
| 01-06-T1 | 06 | 6 | INV-01 | — | Middleware redirects unauth /lessons → /login | E2E | `npm run test:e2e -- protected-routes` | ✅ | ✅ green |
| 01-06-T1 | 06 | 6 | — | — | / → /login (unauth); /no-access renders neutral copy | E2E | `npm run test:e2e -- root-redirect no-access` | ✅ | ✅ green |
| 01-06-T2 | 06 | 6 | ACC-01 | — | Happy path: form → magic link → /lessons with seed lesson | E2E | `npm run test:e2e -- login-happy-path` | ✅ | ✅ green |
| 01-06-T2 | 06 | 6 | ACC-01 | T-01-01, T-01-05 | Whitelisted + non-whitelisted both → /login?sent=1 (uniform) | E2E | `npm run test:e2e -- whitelist-uniform-response` | ✅ | ✅ green |
| 01-06-T2 | 06 | 6 | ACC-01 | T-01-02 | Magic link single-use: 2nd click → /no-access (NOT /lessons) | E2E | `npm run test:e2e -- magic-link-single-use` | ✅ | ✅ green |
| 01-06-T2 | 06 | 6 | INV-01 | T-01-04 | Cookie maxAge ≈ 365 days verified; / after login → /lessons | E2E | `npm run test:e2e -- persist-session` | ✅ | ✅ green |

**Test suite totals (all green locally — 2026-05-10):**
- 24 vitest unit tests (lib/auth, lib/db, app/lessons)
- 9 vitest integration tests (whitelist against live Neon)
- 10 Playwright E2E tests (7 user journeys + sanity + global-setup)
- **Total: 43 tests**

**Manual / deferred verifications:**
- A2 (mail.ru / yandex.ru email deliverability): **PENDING** — see `.planning/MANUAL-ACTIONS.md` Phase 1 Wave 6 Task 3
- A3 (RU user access without VPN): **PENDING** — see `.planning/MANUAL-ACTIONS.md` Phase 1 Wave 6 Task 3

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `vitest.config.ts` — vitest config with React support
- [ ] `playwright.config.ts` — Playwright config (browsers: chromium for v1)
- [ ] `tests/setup.ts` — shared test setup (env loading, db reset hooks)
- [ ] `tests/fixtures.ts` — fixtures: testUser, testLesson, allowedEmail
- [ ] Install: `vitest @vitejs/plugin-react @testing-library/react happy-dom @playwright/test`
- [ ] CI script in `package.json`: `"test": "vitest run"`, `"test:e2e": "playwright test"`

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Russian email deliverability (mail.ru/yandex.ru) | ACC-01 | Resend `onboarding@resend.dev` test sender может попадать в spam РФ-провайдеров. Автоматизированно не проверишь. | После Wave 5 (production deploy): отправить magic link на mail.ru / yandex.ru / gmail.com адреса (3+ шт.), проверить inbox vs spam. Зафиксировать в COSTS.md разд. 6 как открытый вопрос если есть проблемы. |
| Visual rendering под Claude Design tokens | INV-01 | Visual design в активной разработке в Claude Design (юзер). Phase 1 ships с нейтральными shadcn defaults. Visual regression — out of scope для v1. | Manual review после интеграции первого Claude Design output. |
| Vercel commercial use ToS | ACC-01 | Hobby tier OK для dev/testing; Pro tier нужен перед первым реальным beta-юзером. | Перед публикацией ссылки реальному родителю — переключиться на Vercel Pro ($20/мес). |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references (vitest + Playwright + fixtures all in place from Plan 01)
- [x] No watch-mode flags (`vitest run`, `playwright test`)
- [x] Feedback latency < 60s for unit; ~90s for full E2E (acceptable per VALIDATION.md sampling rate)
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** Phase 1 complete 2026-05-10
