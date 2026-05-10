# Phase 2: Расписание уроков + admin путь для заведения — Context

**Gathered:** 2026-05-10
**Status:** Ready for planning
**Mode:** `--auto` (Claude picked recommended defaults; user is AFK on autonomous run)

<domain>
## Phase Boundary

Ребёнок видит расписание своих будущих и прошедших уроков в ЛК. Разработчик может вручную (через CLI / прямой SQL) завести нового тестового ребёнка и тестовый урок без AI-сбора программы.

**В scope:**
- Экран «Расписание» в ЛК ребёнка с минимум 4 неделями вперёд (ACC-03)
- Секция/вкладка «Прошедшие уроки» (готовится крючок для записей из Phase 10)
- Admin CLI для создания пользователей и уроков (ACC-04)
- README/admin-guide для запуска CLI

**НЕ в scope** (deferred):
- Красивый admin UI (deferred — v2 или Phase 9+)
- Возможность ребёнка менять расписание (это привилегия admin/репетитора, всегда вне детского scope)
- AI-сбор программы (v2 целиком)
- Notifications / email reminders о предстоящих уроках (v2)
- Интеграция с внешними календарями (Google Calendar, Apple Calendar) — v2

</domain>

<decisions>
## Implementation Decisions

### Schedule view (ребёнок)

- **D-01 — Список, не календарь.** Расписание = вертикальный список будущих уроков, сгруппированный по календарным неделям (RU: пн-вс). Без drag&drop, без grid-календаря. **Rationale:** проще реализовать (нет calendar lib), лучше работает на mobile/tablet, MVP-достаточно.
- **D-02 — Горизонт 4 недели.** Список показывает уроки на ближайшие 4 календарных недели (per ACC-03 acceptance criterion). Если уроков нет — empty state «Уроков на ближайшие 4 недели не запланировано. Свяжитесь с репетитором.»
- **D-03 — Группировка по неделям.** Заголовки секций: «Эта неделя», «Следующая неделя», «12-18 мая», «19-25 мая». Только weeks, в которых есть хотя бы один урок, отображаются (нет пустых заголовков).
- **D-04 — Smart-relative формат даты.** Урок сегодня: «Сегодня в 16:00». Завтра: «Завтра в 16:00». Эта неделя (но не сегодня/завтра): «Пятница, 16:00». Следующая+ недели: «Пт 15 мая, 16:00». Локаль `ru-RU`.
- **D-05 — Past lessons inline section.** Под списком будущих уроков — отдельная collapsible секция «Прошедшие уроки» (chevron toggle). Дефолт collapsed. Внутри — те же карточки уроков, но статусы `completed`/`missed`/`cancelled` и без кнопки «Начать». Для каждого прошедшего урока — placeholder «Запись урока появится в Phase 10» (готовит крючок для recording_url из Phase 10).

### Admin path (разработчик)

- **D-06 — CLI scripts, не web UI.** Admin путь = npm-скрипты `npm run admin:create-user`, `npm run admin:create-lesson`, `npm run admin:list-users`, `npm run admin:list-lessons`. Файлы в `scripts/admin/*.ts`. **Rationale:** уже есть `pg` setup из Plan 03, нет нового auth surface, легко расширять. Web UI = scope creep для v1.
- **D-07 — No auth в CLI.** Admin CLI запускается локально с `.env.local` credentials. Подразумевается что у того, кто запускает, уже есть direct DB доступ (по умолчанию это сам разработчик). Никаких admin tokens / passwords в v1.
- **D-08 — Email = primary key для admin operations.** Admin CLI принимает `--email` для идентификации пользователя (т.к. email уникален в `user.email` и `allowed_email.email`). Не UUID, не nickname. Если email не whitelisted — admin CLI авто-добавляет в `allowed_email`.
- **D-09 — Admin CLI пишет напрямую в DB через node-postgres.** Не через Drizzle (избегаем зависимости от схема-миграций в admin scripts; если admin запускается на ветке с ещё не применённой схемой, это не должно ломать). `pg.Client` + raw SQL.
- **D-10 — Аргументы CLI через `commander` или native `process.argv` parsing.** Recommended: native `process.argv` парсер (минимум зависимостей; CLI несложный). Если станет 5+ команд с флагами — рефакторим в `commander` в отдельной фазе.

### Lesson model расширение

- **D-11 — Добавить nullable поля `recording_url` и `transcript_url` уже сейчас.** Schema migration в Wave 1 этой фазы. Phase 10 будет только populate'ить, не переписывать схему. Cost — копеечный (2 nullable text columns), а Phase 10 не блокируется на migration.
- **D-12 — Добавить nullable поле `topic` (free-text string).** В Phase 1 уроки уже имели `subject` (math/etc) — `topic` это more specific (например "Сложение в столбик", "Дроби — введение"). `topic` показывается в карточке урока в расписании. Free-text, без enum (Phase 8 решит когда topics станут data-driven).
- **D-13 — Добавить nullable поле `html_trainer_path` (string).** Phase 7 определит контракт HTML тренажёра; пока поле nullable text. Admin CLI принимает `--trainer path/to/trainer.html` опционально.

### Admin guide / README

- **D-14 — `docs/admin-guide.md` — отдельный документ.** Не в `README.md` корня (тот про продукт), не в `.planning/` (та про процесс). Новая директория `docs/` для product-side документации. **Rationale:** разделение — root README продаёт идею, docs/* объясняют как использовать.
- **D-15 — Admin guide включает:** quickstart (создать тестового ребёнка + урок за 30 сек), список доступных команд с примерами, FAQ ("как удалить юзера", "как изменить расписание"), troubleshooting (env vars, DB connection).

### Claude's Discretion

- Имена npm-скриптов (`admin:create-user` vs `admin:user:create` vs `admin-create-user`) — Claude решает в planner-фазе по конвенциям npm scripts community.
- Конкретный formatting prefix для CLI output (`✓ Created user...` vs `[ADMIN] Created user...`) — Claude решает.
- Эмодзи в CLI output (✓/✗/⚠) — Claude решает (рекомендация: использовать Unicode glyphs, они работают в Windows PowerShell ≥7 и macOS/Linux terminals).
- Порядок секций в admin-guide.md — Claude решает.
- Конкретный colour/spacing для week section headers в `/lessons` — следуем shadcn/ui defaults из Phase 1, Claude дополняет.
- Тестовая стратегия для admin CLI scripts — Claude решает (рекомендация: smoke tests против Neon test branch, не extensive unit tests т.к. это thin DB-wrapper).

</decisions>

<specifics>
## Specific Ideas

- В будущих уроках карточка содержит: smart-relative дата (D-04), время (HH:mm), длительность («45 мин»), topic (D-12), и `[Начать]` button если в окне per `canStartLesson` из Phase 1.
- В прошедших уроках карточка содержит: дата, время, статус («Проведён» / «Пропущен» / «Отменён»), placeholder для recording (Phase 10).
- Empty state будущих: см. D-02 текст.
- Empty state прошедших: «Прошедших уроков пока нет.»
- Пример CLI output:
  ```
  $ npm run admin:create-user -- --email kid@example.ru --child-name "Маша" --child-age 10
  ✓ Created user maria-1234abcd (email: kid@example.ru)
  ✓ Whitelisted email kid@example.ru
  ✓ Magic link URL: https://klassio.vercel.app/login (parent enters email to receive link)
  ```

</specifics>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Project & milestone

- `.planning/PROJECT.md` — locked decisions (D-09 NextAuth v5, D-10 Drizzle/Neon), invariants (INV-01 zero-install, RU language)
- `.planning/REQUIREMENTS.md` § ACC-03 (Расписание acceptance criteria), § ACC-04 (Admin path acceptance criteria)
- `.planning/ROADMAP.md` § Phase 2 (Goal + Success Criteria — 4 items)

### Phase 1 deliverables (re-use, do not re-build)

- `.planning/phases/01-account-shell/01-CONTEXT.md` — D-02 silent-drop, D-09 NextAuth, D-10 Drizzle/Neon, D-15 vercel.app subdomain
- `.planning/phases/01-account-shell/01-RESEARCH.md` — Drizzle/Neon pitfalls, postgres-js pooler/direct dual-URL pattern
- `.planning/phases/01-account-shell/01-03-SUMMARY.md` — schema exports (`user`, `account`, `session`, `verificationToken`, `allowedEmail`, `lesson`), seed pattern, `pg` workaround for Neon Free DML
- `.planning/phases/01-account-shell/01-04-SUMMARY.md` — auth.ts wiring, session augmentation (Session.user.childName/childAge per D-03 of Phase 1)
- `.planning/phases/01-account-shell/01-05-SUMMARY.md` — `/lessons` Server Component pattern, canStartLesson signature, shadcn/ui Card + Button used
- `lib/db/schema.ts` — current lesson table shape (Phase 2 will extend)
- `lib/db/index.ts` — neon-http client (use this, not postgres-js — runtime queries)
- `app/lessons/page.tsx` — refactor target (will gain weekly grouping + past section)
- `app/lessons/can-start.ts` — pure function to re-use unchanged
- `scripts/seed.ts` — pattern for admin CLI scripts (uses `pg` for DML reliability on Neon Free)

### External docs

- shadcn/ui Tabs / Collapsible — https://ui.shadcn.com/docs/components/collapsible (для D-05 past lessons collapsible)
- date-fns Russian locale — https://date-fns.org/v4.1.0/docs/Locale (для D-04 smart-relative formatting). Уже не нужен Tailwind config — используем `Intl.DateTimeFormat('ru-RU')` или date-fns если нужны relative formats.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets (re-use, don't rebuild)

- **`db` client** (`lib/db/index.ts`): neon-http stateless. Use for all read queries in `/lessons`. **Do NOT** use postgres-js — Phase 1 migration removed it.
- **Schema exports** (`lib/db/schema.ts`): `lesson`, `user`, `allowedEmail`, `lessonStatusEnum` — re-use in admin CLI and schedule queries.
- **`auth()` from `@/auth`**: Server-component-friendly session retrieval. Use in `/lessons` (already does this in Phase 1).
- **`canStartLesson(scheduledAt, durationMin, now)`** (`app/lessons/can-start.ts`): pure function, 8 boundary tests. Re-use unchanged.
- **shadcn/ui components in `components/ui/`**: `button`, `card`, `input`, `label`. Phase 2 may add `separator` or `collapsible` via `npx shadcn@latest add`.
- **`pg` (node-postgres)**: already in deps from Phase 3/4. Use in admin CLI scripts for reliable DML on Neon Free pooler.
- **Russian locale convention**: `Intl.DateTimeFormat('ru-RU', {...})` already used in `app/lessons/page.tsx`. Re-use the same locale for week headers.

### Patterns to Follow

- **Server Component for /lessons**: keep server-only. Schedule expansion stays server-rendered (no client-side fetching unless interaction demands it; only the collapse toggle for past lessons may need a small client component).
- **Drizzle queries via tagged-template-style or builder**: existing code uses builder pattern (`db.select().from(lesson).where(eq(...))`). Continue this.
- **Migration via custom `scripts/db-push.ts`**: Phase 3 uses this (drizzle-kit push hangs on Neon — see Plan 03 deviations). For Phase 2 schema additions, generate SQL with drizzle-kit, push via custom script.
- **Idempotent admin operations**: admin CLI must use `INSERT ... ON CONFLICT DO NOTHING` or update-or-insert patterns to be safely re-runnable. Match the `scripts/seed.ts` pattern.
- **dotenv loading via `--env-file=.env.local`** (Node ≥20.6) for tsx scripts. Also `import { config } from 'dotenv'; config({ path: '.env.local' })` works as fallback.

### Anti-patterns to Avoid

- **postgres-js for DML against Neon Free pooler** — known ECONNRESET issue (Plan 03/04 deviations). Use `pg` for any non-trivial DML in admin CLI.
- **drizzle-kit push hang on Neon** — use the custom push script from Phase 1.
- **Importing `lib/db` in middleware/auth.config** — edge runtime forbids it. Doesn't apply to Phase 2 (admin CLI is Node, /lessons is Server Component).
- **Returning Date objects from server to client across RSC boundary without serialization care** — Next.js 15 handles this for plain data, but if a Date passes through `'use client'` consumer, it'll be a string. Keep date formatting server-side where possible.

</code_context>

<deferred_ideas>
## Deferred Ideas (out of phase scope)

- **Email/SMS reminders** for upcoming lessons (e.g., 30 min before scheduledAt) — promising but new capability. Backlog as v2 candidate.
- **Calendar integration** (Google Calendar / Apple Calendar export) — v2.
- **Cancel/reschedule UI for child** — explicitly out of v1 scope per ACC-03 acceptance criterion (child cannot modify schedule).
- **Bulk admin operations** (CSV import for batch user/lesson creation) — defer until 5+ users in beta.
- **Admin UI for non-developer operators** (e.g., a friend/colleague can use it without DB access) — defer until first non-dev operator joins the project.
- **Recording-availability indicator** (badge on past lesson cards once Phase 10 ships) — Phase 10 will add the visual; Phase 2 just preps the schema column.

</deferred_ideas>

<assumptions>
## Assumptions Made (auto-mode without user confirmation)

These are decisions I made because user is on a 12h autonomous run. Listed here so user can review and override on return:

- **A1**: Past lessons collapsed by default (D-05). Alternative: expanded by default. Reasoning for default-collapsed: clean visual, primary content (upcoming) gets focus.
- **A2**: Admin path is CLI-only (D-06), no web UI. Alternative: minimal admin web UI gated by special token. Reasoning: faster to ship, no auth-on-auth-on-auth complexity, dev-only in v1.
- **A3**: New schema fields (`recording_url`, `transcript_url`, `topic`, `html_trainer_path`) all nullable text strings. Alternative: structured JSONB column. Reasoning: simpler queries, smaller migration; restructure later if needed.
- **A4**: `topic` is free-text (D-12), not enum or table reference. Alternative: enum bound to Phase 5 scenes. Reasoning: Phase 5 scenes are not yet defined; over-coupling now creates rework.
- **A5**: Schedule grouping = calendar weeks Monday-Sunday (D-03). Alternative: rolling 7-day windows. Reasoning: Russian/European convention, matches "эта неделя / следующая неделя" mental model.
- **A6**: Smart-relative date formatting tier breakpoints: today/tomorrow/this-week/further (D-04). Alternative: always full date. Reasoning: kid-friendly, less cognitive load when checking schedule.
- **A7**: No retroactive migration for existing seed lesson — D-12 (`topic`) and D-13 (`html_trainer_path`) are nullable, so the existing test lesson (created in Phase 1 seed) gets `topic = null`. Admin CLI in Phase 2 will UPDATE it with a real topic before E2E tests need it. Alternative: backfill via migration script. Reasoning: 1 row, hand-update or admin CLI suffices.

If user disagrees with any assumption — they can run `/gsd-discuss-phase 2 --refine` after returning, or just tell Claude in chat to revise the affected decisions and re-plan.

</assumptions>
