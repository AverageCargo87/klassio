---
phase: 01
slug: account-shell
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-05-09
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
| 01-XX-XX | XX | N | ACC-01 | T-01-01 (whitelist bypass) | Email not in whitelist → no token issued, generic response | integration | `npm run test -- whitelist` | ❌ W0 | ⬜ pending |
| 01-XX-XX | XX | N | ACC-01 | T-01-02 (token replay) | Magic link single-use; second click → /no-access | integration | `npm run test -- magic-link` | ❌ W0 | ⬜ pending |
| 01-XX-XX | XX | N | ACC-02 | — | Lessons list ordered by scheduled_at ASC, returns only own | unit | `npm run test -- lessons-query` | ❌ W0 | ⬜ pending |
| 01-XX-XX | XX | N | INV-01 | — | Child UI flow (page open → already logged in via parent cookie) | E2E | `npm run test:e2e -- session-persist` | ❌ W0 | ⬜ pending |

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

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 60s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
