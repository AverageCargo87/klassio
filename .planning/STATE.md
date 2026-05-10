---
gsd_state_version: 1.0
milestone: v2.5
milestone_name: milestone
status: unknown
last_updated: "2026-05-10T04:47:00.000Z"
progress:
  total_phases: 12
  completed_phases: 2
  total_plans: 12
  completed_plans: 11
  percent: 92
---

# Klassio — STATE

> Project memory. Где мы сейчас, что уже решено, что блокирует.
> Источники истины — `PROJECT.md`, `REQUIREMENTS.md`, `ROADMAP.md`.
> Этот файл — короткий навигационный snapshot, обновляется по ходу работы.
>
> Дата создания: 2026-05-09.

---

## Project Reference

- **Project**: Klassio — AI-репетитор математики для российских пятиклассников.
- **Core value (one-liner)**: Платформа урока, в которой голосовой AI-учитель ведёт ребёнка через персональный 45–60 минутный урок математики с тремя синхронными каналами (голос + интерактивная доска tldraw + HTML-тренажёр), задеплоенная так, что российский ребёнок открывает сайт без VPN.
- **v1 success metric**: Один полный 45-минутный урок проходит end-to-end без вмешательства разработчика — ребёнок открывает личную ссылку → ЛК → выбирает урок → проводит урок (голос + доска + тренажёр синхронно) → запись урока сохраняется и доступна в ЛК.
- **v1 scope (locked)**: Платформа урока, без воронки клиентов. Лендинг, Авито, TG-бот, диалоговый сбор программы, автоотчёт родителю — отложены в v2.
- **Granularity**: fine (12 фаз).
- **Source language**: Russian (preserved from VISION.md и intel synthesis).

---

## Current Position

Phase: 3
Plan: 3 (03-01 complete, 03-02 complete, 03-03 next)

- **Current phase**: Phase 3 — Lesson Shell (страница урока + статус-машина).
- **Current plan**: Plan 03-02 complete. LessonBus core built (events + bus + provider + hooks). 76 unit tests green.
- **Status**: **Phase 3 in progress** (2/3 plans, 76 unit tests green).
- **Progress (overall v1)**: `[██████████] Phase 3 underway. Plan 03-03 next.`.
- **Resume file**: None — 03-03 is next plan.

### Recent transitions

- **2026-05-10 (#12 — execute 03-02)**: Plan 03-02 (Event bus core) executed in ~7 min. 2 tasks, 2 commits (c69c740, 96386b3). LessonBus class (Map pub/sub, on/off/emit/clear), LessonBusEvent discriminated union (3 variants), LessonBusProvider (React Context), useLessonBus() + useLessonBusEvent() hooks. 10 new tests (6 bus + 4 hooks), 76 total green. Zero external deps. No deviations.

- **2026-05-10 (#11 — execute 03-01)**: Plan 03-01 (Lesson timestamps schema migration) executed in ~10 min. 2 tasks, 2 commits (4edbb85, 9d4ffdb). Added actual_start_at + actual_end_at nullable timestamp columns to Neon lesson table. TDD: RED→GREEN cycle confirmed. Migration applied via scripts/apply-0002-migration.ts (pg + IF NOT EXISTS). 66 tests all green. LES-01 complete. Auto-fix: updated 3 lesson fixtures in 2 test files (TypeScript type error after schema extension).

- **2026-05-10 (#10 — execute 02-03)**: Plan 02-03 (Admin guide + Schedule E2E) executed in ~35 min. 2 tasks, 2 commits (d831e69, e76630c). docs/admin-guide.md (RU, quickstart + 4 CLI commands + FAQ + troubleshooting). README.md created. e2e/schedule-grouping.spec.ts (5 tests: heading, week header, smart date, past collapsed/expanded). Fixed stale heading selector in login-happy-path.spec.ts. 15 E2E tests all green. ACC-03 + ACC-04 complete.

- **2026-05-10 (#9 — execute 02-01)**: Plan 02-01 (Schema migration + admin CLI) executed in ~10 min. 2 tasks, 2 commits (1add440, 9c001a2). 3 nullable lesson columns added to Neon (recording_url, transcript_url, html_trainer_path). 4 admin CLI scripts: create-user (idempotent), create-lesson, list-users, list-lessons. 43 tests total (was 35). ACC-04 complete. Migration applied via scripts/apply-0001-migration.ts (pg + IF NOT EXISTS, Neon-safe). Smoke tests passed against live Neon.

- **2026-05-10 (#8 — execute 01-06 Task 4)**: Phase 1 implementation signed off. 10 Playwright E2E tests all green locally (cecbf84, 0c7af18). Runtime DB client migrated postgres-js → neon-http for Vercel serverless compatibility. VALIDATION.md updated with as-built test IDs (43 tests total). STATE.md, COSTS.md, MANUAL-ACTIONS.md updated. Production deploy DEFERRED to user manual action — see MANUAL-ACTIONS.md.
- **2026-05-10 (#7 — execute 01-06 Tasks 1-2)**: 8 Playwright E2E spec files written (login-happy-path, whitelist-uniform-response, magic-link-single-use, protected-routes, root-redirect, persist-session, no-access) + e2e/fixtures/db-setup.ts. lib/db/index.ts migrated from postgres-js to neon-http (stateless, immune to TCP termination). All 10 E2E tests green.
- **2026-05-09 (#6 — execute 01-03)**: Plan 01-03 (Drizzle schema push + seed) executed in ~54 min. 2 tasks, 2 commits (e0ada84, 78b80db). 6-table schema (user, account, session, verificationToken, allowed_email, lesson) pushed to live Neon DB. Seed idempotent: admin email + user + test lesson. 12 tests passing. Key discovery: postgres-js Extended Query Protocol causes ECONNRESET on Neon Free tier for parameterized DML — fixed by using pg (node-postgres) in seed script. drizzle-kit push introspection also hangs on Neon — fixed by custom db-push.ts using drizzle-kit generate + direct SQL apply.
- **2026-05-09 (#5 — execute 01-01)**: Plan 01-01 (Bootstrap) executed in ~30 min. 3 tasks, 3 commits (061abe0, 9c09bd4, 3c9b0af). Next.js 15.5.18 scaffolded, vitest 4.x + Playwright 1.59 wired (5 tests passing), zod env validation in place (`lib/env.ts`). One auto-fix: --reporter=basic → --reporter=verbose (basic removed in vitest 4.x). `.env.example` documents contract for Plan 02 provisioning.
- **2026-05-09 (#4 — plan-phase 1)**: Phase 1 разобрана на **6 PLAN.md в 6 волнах** (Wave 1 scaffold → Wave 6 E2E + production deploy). Research проведён (NextAuth v5 split-config, Drizzle pooler/direct, Tailwind v4 quirks, A1 silent-drop рекомендация). VALIDATION.md создан (vitest + Playwright). Plan checker нашёл 3 BLOCKER + 1 WARNING + 2 INFO на iteration 1 — все исправлены revision'ом (frontmatter completeness, schema test robustness, comment accuracy). Coverage: ACC-01 (6 plans), ACC-02 (4), INV-01 (4) — все 100%. **Wave 2 и Wave 6 — `autonomous: false`** (требуют human-in-loop для external account provisioning + production deploy + RU email deliverability check).
- **2026-05-09 (#3 — discuss-phase 1)**: Phase 1 CONTEXT.md создан (interactive mode, 4 areas: Auth, Foundation tech, Visual, URL/routing). 18 implementation decisions залочены (D-01..D-18). **Auth-модель Phase 1 значительно изменилась** vs initial roadmap: с «personal token-in-URL для ребёнка» на «email magic link для родителя + child uses parent session». ACC-01 и INV-01 в REQUIREMENTS.md обновлены под новую модель. Stack picks: NextAuth.js v5, Drizzle ORM, shadcn/ui. Visual design выносится в Claude Design (Anthropic SaaS) — Phase 1 implementation не блокируется на дизайне.
- **2026-05-09 (#2 — costs)**: Создан COSTS.md с unit-экономикой (target variable < 200 ₽/lesson, fixed ~12k ₽/мес, break-even 15 уроков/мес). Phase 6 — главный watermark по расходам.
- **2026-05-09 (#1 — ingest)**: Ingest pipeline завершён, intel synthesis готов (3 docs, 18 requirements, 18 constraints, 8 de-facto decisions, 0 conflicts). Юзер залочил v1 scope и granularity (fine). PROJECT.md, REQUIREMENTS.md, ROADMAP.md, STATE.md созданы.

---

## Performance Metrics

> Заполняется по мере работы. На старте — пусто.

| Метрика | Значение | Дата |
|---|---|---|
| Phases complete | 0 / 12 | 2026-05-09 |
| Plans complete (Phase 1) | 3 / 6 | 2026-05-09 |
| Requirements addressed (plan 01-01) | ACC-01, ACC-02, INV-01 (scaffold) | 2026-05-09 |
| Requirements implemented (plan 01-03) | ACC-01 (schema), ACC-02 (schema) | 2026-05-09 |
| Requirements implemented | 0 / 21 | 2026-05-09 |
| v1 success metric verified | ❌ | — |
| Cost per 45-min lesson (Pedagogical + Realtime + 11labs) | TBD (watermark в Phase 8) | — |
| Cost per board explanation (gpt-4o-mini, столбиковое сложение) | ~22 копейки (~$0.0027) | прототип, см. CON-board-cost |
| Production deploy live | ❌ (Phase 4) | — |

---
| Phase 01 P02 | 30min | 3 tasks | 4 files |
| Phase 01 P03 | 54min | 2 tasks | 11 files |
| Phase 01-account-shell P01-04 | 12min | 2 tasks | 13 files |
| Phase 01-account-shell P05 | 7 | 3 tasks | 18 files |
| Phase 02-admin P02 | 7 | 2 tasks | 8 files |
| Phase 02-admin P02-03 | 35 | 2 tasks | 4 files |
| Phase 03-lesson-shell P03-01 | 10 | 2 tasks | 8 files |
| Phase 03 P03-01 | 10 | 2 tasks | 8 files |
| Phase 03-lesson-shell P03-02 | 7 | 2 tasks | 7 files |

## Accumulated Context

### Locked decisions (с момента создания проекта)

См. `PROJECT.md` § «Locked decisions» — 8 решений из ingest set, залоченных юзером путём утверждения v1 scope:

1. DEC-board-llm-provider — OpenAI primary, Anthropic избегаем.
2. DEC-board-current-model — gpt-4o-mini для доски.
3. DEC-board-canvas-stack — tldraw v3 + Next.js 15 App Router + React 18.
4. DEC-board-tool-choice-required — `tool_choice: 'required'` + `finish` tool.
5. DEC-deploy-architecture — Vercel + Hetzner Frankfurt + Cloudflare.
6. DEC-voice-provider-mvp — 11labs Conversational AI Path A.
7. DEC-avatar-style — 2D Lottie, не 3D, не видео.
8. DEC-llm-architecture-tier — Pedagogical (slow GPT-4o) + Realtime (fast gpt-4o-mini).

Любое отступление требует нового decision через `/gsd-add-decision`.

### Critical constraints (mandatory awareness в любой работе)

- **CON-openai-rf-block**: OpenAI режет РФ IP. Dev — VPN-туннель, prod — Vercel ходит с американского IP.
- **CON-anthropic-rf-block**: Anthropic режет TLS-фингерпринтом через Cloudflare. Не лечится IP. **По умолчанию избегаем.**
- **CON-runtime-versions**: Node ≥20, Next.js ^15.5.18 (App Router), React ^18.3.1, tldraw ^3.15.6, TypeScript ^5 strict, Tailwind ^4.
- **CON-tldraw-shape-quirks**: TextShape `richText` (через `toRichText` helper); ArrowShape `text: string` plain. НЕ перепутать.
- **CON-board-cost**: ~22 копейки на разбор на gpt-4o-mini. Watermark при добавлении сцен и Pedagogical LLM.
- **CON-known-quirks**: hard-avoid Anthropic; hard-avoid `tool_choice='auto'` для board LLM; hard-avoid убирать `outputFileTracingRoot` из `next.config.ts`.

Полный список — `.planning/intel/constraints.md`.

### Product invariants (cross-cutting guardrails)

См. `PROJECT.md` § «Product invariants». Применяются ко всем фазам и решениям:

1. **Голос + рука + текст синхронно** (LES-02, INV-02 в Phase 11).
2. **Live-объяснения, не заготовленные** (PED-01 в Phase 4).
3. **Проактивный, не реактивный бот** (PED-02 в Phase 8).
4. **Юзер не должен ставить ничего** (INV-01 в Phase 1, foundational).
5. **Ощущение живого учителя у доски** (BRD-03 в Phase 11).

### Plan 03-02 decisions (executor — 2026-05-10)

- **LessonBus as class (not factory)**: `new LessonBus()` in `useMemo` is idiomatic React; class gives clean TypeScript type for Context value.
- **useMemo for bus instantiation (not useState)**: both stable per mount; useMemo signals "derived, stable reference" without the setter noise.
- **AnyHandler internal cast**: typed public API (generic `on/off/emit`) requires `any` cast internally to store handlers in `Map<string, Set>` — eslint-disable comment added.
- **EventPayload<E> exported**: consumers narrow types with `EventPayload<'lesson:test'>` without re-importing Extract<> utility.
- **Zero new npm packages**: bus implemented with Map + Set — no mitt, no Zustand, no RxJS.

### Plan 03-01 decisions (executor — 2026-05-10)

- **Migration via scripts/apply-0002-migration.ts (pg + IF NOT EXISTS)**: drizzle-kit push hangs on Neon ECONNRESET. Same proven pattern as Phase 2 Plan 01 — pg client + IF NOT EXISTS guards for idempotency.
- **drizzle-kit generate → rename + add IF NOT EXISTS**: drizzle-kit generate produces valid SQL but without IF NOT EXISTS guards. Rename file to canonical name, add guards manually before applying.
- **Both columns nullable (no .notNull())**: existing lesson rows get NULL — no data migration, no backfill, backward-compatible.

### Plan 02-01 decisions (executor — 2026-05-10)

- **Migration via scripts/apply-0001-migration.ts (not db-push.ts)**: db-push.ts applies ALL .sql files including already-applied 0000 — hangs on postgres.js awaiting CREATE TABLE responses. One-shot pg script with IF NOT EXISTS is Neon-safe.
- **parseArgs exported from create-user.ts, inlined in others**: plan requires no separate module; each script self-contained; unit tests import from create-user.
- **T-02-04 mitigated**: --date validated with YYYY-MM-DD regex before timestamp construction.

### Plan 02-03 decisions (executor — 2026-05-10)

- **login-once-in-beforeAll with addCookies**: E2E suites sharing one email must authenticate once in `beforeAll` with `chromium.launch()`, save `context.cookies()`, and inject via `page.context().addCookies()` per test. Avoids single-use magic link token exhaustion when N tests share one email address.
- **Explicit goto timeout (8s) + retry in goToLessons**: Neon Free tier cold-start causes `ERR_ABORTED` on `/lessons` page load (Drizzle select ECONNRESET). Tests stall at 35s on default 30s timeout. Fix: explicit 8s timeout + 3 retries with 2.5s wait. `/api/auth/session` warmup hit before navigation (mirrors global-setup.ts pattern).
- **docs/ directory created**: Product-side docs separate from `.planning/` (process docs). `docs/admin-guide.md` is the first file. Future product docs go here.

### Plan 01-01 decisions (executor — 2026-05-09)

- **vitest 4.x reporter**: `--reporter=verbose` (not `--reporter=basic` — removed in vitest 4.x; `minimal` also works)
- **env test isolation**: `vi.resetModules()` before each test (not dynamic import with query string — more reliable)
- **dual DATABASE_URL**: established in envSchema now, even before DB code in Plan 03 — env validation must come first
- **vitest.config.ts exclude**: `tests/fixtures.ts` excluded explicitly — it's fixture data, not a test file

### Open questions / decisions to revisit

- **Pedagogical LLM модель**: GPT-4o зафиксирован по умолчанию. Если экономика на gpt-4.1 или gpt-5 окажется лучше — пересмотреть в Phase 8.
- **Видеозапись урока**: composite экрана vs только аудио + screencast — выбор делается в Phase 10.
- **Хранилище записей**: S3 в Hetzner или AWS вне РФ — выбор в Phase 10.
- **Согласие 152-ФЗ**: при первом входе ребёнка в ЛК vs предварительно через admin (ACC-04) — выбор в Phase 10.
- **Anthropic comeback**: с туннель-VPN possibly работает (см. `.planning/intel/context.md` § Потенциальные TODO). Проверить одним curl-запросом из Node без прокси через api.anthropic.com. Если 200 — можно вернуться, и тогда agent-loop вообще не нужен (Anthropic делает всё в одном ответе → дешевле в 20×). Но это **только при отдельном новом decision** — в v1 по умолчанию остаёмся на OpenAI.
- **A2 — Russian email deliverability with `onboarding@resend.dev` (deferred from plan 01-06, 2026-05-10):** Production deploy not yet run (user AFK). Test pending: submit to mail.ru / yandex.ru addresses, check inbox vs spam. If spam — mitigation: verify own domain in Resend (Phase 2 follow-up). Results to be recorded after user completes MANUAL-ACTIONS.md Task 3.
- **A3 — RU users open without VPN (deferred from plan 01-06, 2026-05-10):** No production URL yet — user AFK. Re-test after production deploy confirmed. If no RU tester available at that time — defer to Phase 4 when Cloudflare CDN added per DEC-deploy-architecture.

### Active todos

- ✅ Plan 01-01 Bootstrap — complete (3 tasks, 5 tests passing).
- ✅ Plan 01-02 Account provisioning — complete (Neon + Resend + AUTH_SECRET provisioned; A1 silent-drop resolved; Vercel Hobby decision recorded).
- ✅ Plan 01-03 Schema push + seed — complete (2 tasks, 2 commits, 12 tests passing). 6 Drizzle tables in live Neon DB; seed idempotent; custom db-push.ts for Neon ECONNRESET quirk.
- ✅ Plan 01-04 — Magic link auth — complete (NextAuth v5 split-config, DrizzleAdapter, whitelist, Resend template; 24 unit + 9 integration tests green).
- ✅ Plan 01-05 — UI routes — complete (5 routes in Russian, 35 tests, shadcn/ui + Tailwind v4).
- ✅ Plan 01-06 — E2E suite — implementation complete (8 spec files, 10 E2E tests green locally; deploy deferred).
- **USER ACTION REQUIRED:** Complete Phase 1 production deploy + RU email test — см. `.planning/MANUAL-ACTIONS.md` Phase 1 Wave 6 Task 3.
- **Phase 4 prerequisite:** Перед Phase 4 (production deploy) апгрейднуть Vercel **Hobby → Pro** ($20/мо). Hobby ToS запрещает commercial use — как только первый beta-юзер откроет URL, нужен Pro. Решение зафиксировано в плане 01-02 SUMMARY и COSTS.md § 7 Tracking.
- (Опционально) формализовать какое-либо из 8 locked decisions как ADR через `/gsd-add-decision`.
- (Параллельно) ты ведёшь визуальный дизайн ЛК в Claude Design (https://claude.com/design); как появятся макеты — переносим tokens (цвета, типографика) в `tailwind.config` Klassio.

### Active blockers

- Нет.

---

## Session Continuity

- **Last session**: 2026-05-09 — Plan 01-03 executed (Drizzle schema push + seed — 2 tasks, 12 tests passing, live Neon DB verified).
- **Next session entry point**: Plan 01-04 (magic link auth — NextAuth v5 + Resend + DrizzleAdapter). `autonomous: true`.
- **What new Claude Code session needs to read first** (порядок):
  1. `PROJECT.md` — core value, locked decisions, anti-scope, invariants.
  2. `STATE.md` (этот файл) — где мы сейчас, что блокирует.
  3. `ROADMAP.md` — phase, в котором работаем (Phase 1 на старте).
  4. `REQUIREMENTS.md` — конкретные acceptance criteria для requirements фазы.
  5. (По необходимости) `.planning/intel/constraints.md` — для специфических технических ограничений.
  6. (По необходимости) `BOARD-STATUS.md` и `.planning/intel/context.md` — для grаблищ прошлых сессий и сетевой саги.
- **Что НЕ нужно перечитывать каждую сессию**: VISION.md (core отжата в PROJECT.md), BOARD-STACK.md (контракты в `.planning/intel/constraints.md`).

**Planned Phase:** 01 (ЛК — оболочка, авторизация, список уроков) — 6 plans — 2026-05-09T18:42:59.621Z
