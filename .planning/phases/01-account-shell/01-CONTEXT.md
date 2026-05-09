# Phase 1: ЛК — оболочка, авторизация, список уроков — Context

**Gathered:** 2026-05-09
**Status:** Ready for planning
**Phase slug:** `01-account-shell`

<domain>
## Phase Boundary

Phase 1 строит **минимальный личный кабинет (ЛК) родителя** как точку входа в продукт Klassio. Деплоится в прод (не localhost), защищён от рандомов через email whitelist. Родитель логинится через email magic link — без регистрационных форм, без пароля, без OAuth. После входа видит список запланированных уроков своего ребёнка.

**Это первая фаза** — здесь устанавливается фундамент: auth-модель, БД-foundation, выбор библиотек, structure роутов. Эти решения будут влиять на все 12 фаз.

**В скоупе:**
- Email magic link auth (NextAuth.js v5 + Resend)
- Email whitelist в БД (анти-рандом для MVP)
- Базовая модель данных (User, Lesson) через Drizzle ORM на Neon Postgres
- Routes: `/login`, `/lessons`, `/no-access`, `/api/auth/*`
- Auto-redirect с `/` на `/lessons` (если залогинен) или `/login` (если нет)
- shadcn/ui + Tailwind v4 как foundation для UI
- Deploy на Vercel (subdomain типа `klassio.vercel.app` на старте — реальный домен потом)
- Минимальный seed-скрипт для создания первого тестового родителя + тестового урока (admin path упрощённый — полный admin UI в Phase 2)

**Вне скоупа Phase 1 (отдельные фазы):**
- Расписание view (календарь / неделя) → Phase 2
- Полноценный admin UI для заведения детей/уроков → Phase 2
- Lesson page `/lesson/[id]` (3-панельный layout) → Phase 3
- Любая интеграция доски / голоса / тренажёра → Phase 4+
- Visual polish под Claude Design макеты → итеративно после Phase 1 ships
- OAuth провайдеры (TG / Google / VK) → v2

</domain>

<decisions>
## Implementation Decisions

### Auth model

- **D-01 — Email magic link auth (passwordless).** Родитель вводит email на `/login` → получает ссылку для входа на email → клик в email → залогинен. Никаких форм пароль/повторный пароль/captcha.
- **D-02 — Email whitelist в БД для анти-рандом (resolved 2026-05-09, plan 01-02).** Только email из таблицы `allowed_emails` может запросить magic link. UX поведение для не-whitelisted email: **silent drop** (security best practice).
  - Whitelisted email: signIn callback returns true → NextAuth генерирует token → Resend отправляет письмо → user видит на `/login?sent=1` баннер «Если ваш email в нашем списке, мы отправили ссылку. Проверьте почту.»
  - Non-whitelisted email: signIn callback returns false → NextAuth НЕ отправляет письмо → user редиректится на ТУ ЖЕ страницу `/login?sent=1` с тем же баннером (НЕ на `/no-access`).
  - Rationale: разные ответы для whitelisted vs non-whitelisted leak whitelist content via timing/redirect difference (user enumeration attack — OWASP ASVS V3.2). Single response = attacker не может определить, существует ли email в системе.
  - `/no-access` остаётся как landing для просроченных/невалидных magic link click'ов (где attacker уже имеет token и пытается его использовать после expiry — там разница ответов уже не важна, наоборот, user должен понять что link expired).
  - Admin вручную добавляет email через seed-скрипт / прямой SQL (полный admin UI — Phase 2 / ACC-04).
  - **Note:** This resolves research assumption A1. Original CONTEXT D-02 wording said "redirect на /no-access" for non-whitelisted; the security-best-practice silent drop is a refinement, not a contradiction (D-02 rationale "не давать информацию о существующих юзерах" is preserved more strongly).
- **D-03 — Один родитель = один ребёнок в v1.** Для упрощения. Имя/возраст ребёнка — поля в профиле родителя (или отдельная таблица `children` с FK на `users`, но в v1 жёстко 1:1). Multi-child — v2.
- **D-04 — Persistence: httpOnly secure cookie, expiry 1 год.** После клика magic link сервер ставит cookie. Повторно логиниться не нужно.
- **D-05 — Multi-device permissive.** Cookie работает на любом устройстве, где она установлена. Никаких device-bound токенов. Реалистично: один родительский комп — но не блокируем перенос.
- **D-06 — Desktop-only UI в v1.** Layout рассчитан на десктоп. Мобильная/планшетная адаптация — v2 (mentioned VISION.md уже).
- **D-07 — `ACC-01` и `INV-01` требуют пересмотра в REQUIREMENTS.md.** Старая модель была «personal token-in-URL для ребёнка, без регистрации». Новая модель: «parent-managed account (email magic link), child uses parent's authenticated session — INV-01 still holds для ребёнка». Я обновляю REQUIREMENTS.md в этом же коммите.
- **D-08 — OAuth провайдеры (TG / Google / VK) → v2.** NextAuth заранее поддерживает их, но настройка/тестирование откладываем. В v1 — только email magic link.

### Foundation tech picks

- **D-09 — NextAuth.js v5 (Auth.js) для auth.** Стандарт в Next.js, magic link через Resend adapter, OAuth providers будут готовы для v2.
- **D-10 — Drizzle ORM для Postgres-as-a-service (Neon в Phase 1).** Лёгкий (~2 KB), edge-compatible, быстрый cold start на Vercel, TypeScript types из схемы. Сейчас дефолт в Next.js экосистеме. **Deviation note (2026-05-09, plan 01-02):** изначально планировался Supabase, переключились на **Neon** (eu-central-1 Frankfurt, Postgres 17.8) из-за внешнего ограничения у пользователя ($40 долг на Supabase аккаунте). Код Postgres-агностичен: меняется только URL в `.env.local`. Если в будущем понадобится PgBouncer-specific фича или RLS — можно вернуться к Supabase или мигрировать на любой managed Postgres.
- **D-11 — shadcn/ui + Tailwind v4 как foundation.** Copy-paste компоненты в `components/ui/`, ты владеешь кодом, легко перекрашивать под Claude Design output.

### Visual design pipeline

- **D-12 — Visual design делается пользователем в Claude Design (Anthropic SaaS-инструмент).** Палитра, типографика, layout, состояния, иллюстрации. Output — макеты + design tokens. См. https://support.claude.com/en/articles/14604416-getting-started-with-claude-design.
- **D-13 — Phase 1 implementation НЕ блокируется на дизайне.** Стартуем с нейтральных shadcn defaults (системные шрифты, нейтральная палитра). Итерируем визуал по мере выхода Claude Design output. Это не задерживает MVP-deploy.
- **D-14 — Tailwind v4 + shadcn/ui компоненты + кастомизация под Claude Design output.** При появлении Claude Design макетов: tokens (цвета, spacing, typography) идут в `tailwind.config` / CSS переменные, конкретные компоненты обновляются в `components/ui/`.

### URL и routing

- **D-15 — Domain: Vercel subdomain на старте, бесплатно.** Например `klassio.vercel.app` или `klassio-app.vercel.app`. Реальный домен (klassio.ru / .app / .io) — после того как продукт начнёт обретать форму. Не блокируем deploy на покупку домена.
- **D-16 — Корневой URL `/` — auto-redirect.** Залогинен → `/lessons`. Не залогинен → `/login`. Никакого лендинга (vision: лендинг → v2).
- **D-17 — Routes flat structure:**
  - `/login` — форма email + кнопка «отправить ссылку»
  - `/lessons` — список запланированных уроков (главный экран ЛК)
  - `/no-access` — единая страница ошибки auth
  - `/lesson/[id]` — placeholder в Phase 1 (полноценная страница в Phase 3)
  - `/api/auth/*` — NextAuth handlers
  - `/api/admin/*` — placeholder для Phase 2 admin path (НЕ строим в Phase 1, но место зарезервировано)
- **D-18 — `/no-access` — единая страница для всех auth-related ошибок** (просрочена ссылка, не в whitelist, отозванный доступ). Текст нейтральный: «Доступ не предоставлен. Обратитесь к репетитору.» Не различаем причины (security best practice — не давать info attacker'у).

### Cost rollout (для трекинга, см. COSTS.md)

- **Phase 1 fixed cost (current):** ~0 ₽/мес (Vercel Hobby + Neon Free + Resend Free, домен ещё не куплен). Перед Phase 4: апгрейд Vercel Pro = +$20/мо.
- **Phase 1 variable cost:** 0 ₽/lesson (нет API-вызовов в Phase 1 за пределами auth — Resend free до 3000 emails/мес).
- **Vercel plan (resolved 2026-05-09, plan 01-02):** Hobby (free) для Phase 1 dev/testing. Upgrade to Pro $20/мес перед Phase 4 prod-deploy / первым beta-юзером. См. STATE.md Active todos.

### Claude's Discretion

В этих местах — Claude (планировщик / executor) решает детали без ре-обращения к юзеру:
- Точная схема `users` таблицы в Drizzle (поля и indexes — стандартные practices)
- UI text wording на `/login`, `/lessons`, `/no-access` (рус. язык, нейтрально-дружелюбно)
- Email template для magic link (рус., короткий, без брендинга на старте)
- Конкретные shadcn компоненты для использования (Form, Button, Card, Input, Toast)
- Серверная vs клиентская структура auth flow (server actions vs API routes — выбор по NextAuth best practices)
- Cookie config детали (sameSite, secure, partitioned)
- Validation библиотека (zod — дефолт)
- Конкретные nanoid / uuid для primary keys
- Логика expiry email magic link токена (по умолчанию NextAuth — 24 часа, можно оставить)

### Folded Todos

Нет — todo system в проекте пока не настроен (`gsd-sdk query todo.match-phase 1` вернул `count: 0`).

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents (researcher, planner, executor) MUST read these перед planning или implementation.**

### Project foundation (must-read)
- `.planning/PROJECT.md` — core value, locked decisions (8 шт.), product invariants (5 шт.), anti-scope, контракт работы с Claude Code.
- `.planning/REQUIREMENTS.md` — 21 v1 requirement с acceptance criteria. ⚠️ **ACC-01 и INV-01 будут обновлены в этом же коммите** под parent-as-user model — читать обновлённую версию.
- `.planning/ROADMAP.md` — Phase 1 detail section (lines ~56–67), success criteria, dependencies.
- `.planning/STATE.md` — current project position, recent transitions, locked decisions reference.
- `.planning/COSTS.md` — Phase 1 cost rollout (current: ~0 ₽/мес — Vercel Hobby + Neon Free; ~1 850 ₽/мес перед Phase 4 при апгрейде на Pro); раздел 7 для tracking фактических списаний.

### Tech stack constraints (что нельзя нарушать)
- `.planning/intel/constraints.md` — все 18 constraints. Особое внимание для Phase 1:
  - `CON-runtime-versions` — Node ≥20, Next.js ^15.5.18, React ^18.3.1, TypeScript ^5 strict, Tailwind ^4
  - `CON-nextjs-tracing-root` — `outputFileTracingRoot` обязательно в `next.config.ts` для корректной сборки
  - `CON-environment-vars` — env var management в Vercel
  - `CON-prod-deploy-vercel` — production deploy strategy

### Reference patterns (read для подсмотра)
- `BOARD-STACK.md` — технические quirks Next.js 15 + Tailwind v4 + instrumentation pattern. **Phase 1 использует тот же runtime stack.**
- `BOARD-STATUS.md` — gotchas из работы с прототипом (env var conflicts, webpack quirks, etc.)
- `../tldraw-test/` — sibling directory, рабочий пример Next.js 15 setup. Можно подсмотреть `next.config.ts`, `tsconfig.json`, `tailwind.config`, `app/layout.tsx`, `instrumentation.ts`. **НЕ копировать вслепую** — некоторые quirks (instrumentation для proxy) для Phase 1 не нужны.

### Внешние документации (по мере имплементации)
- NextAuth.js v5 docs — https://authjs.dev (magic link flow, Resend adapter, callback config, middleware-based session protection)
- Drizzle ORM docs — https://orm.drizzle.team (schema definition, migrations, query builder)
- Neon docs — https://neon.tech/docs (Postgres connection strings — pooled vs direct, Drizzle integration, autosuspend behaviour for free tier)
- shadcn/ui docs — https://ui.shadcn.com (component installation, theme customization для Tailwind v4)
- Resend docs — https://resend.com/docs (магические письма, free tier 3000/мес)
- Claude Design — https://support.claude.com/en/articles/14604416-getting-started-with-claude-design (для understanding workflow визуального дизайна)

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable assets / patterns (из `../tldraw-test/`)
- **Next.js 15 App Router setup** — пример рабочего `next.config.ts` с `outputFileTracingRoot` (нужен для корректной сборки Vercel — `package-lock.json` юзера в `~` иначе становится root).
- **Tailwind v4 config** — `globals.css` с `@import "tailwindcss"` (CSS-only синтаксис, не v3).
- **TypeScript strict mode** — `tsconfig.json` с strict + paths setup.
- **`instrumentation.ts` pattern** — для Phase 1 НЕ нужен (это для proxy при работе с РФ-IP в dev; Phase 1 не делает внешних API-вызовов кроме auth/Resend).

### Established patterns (наследуем)
- **App Router** (НЕ Pages router) — все routes в `app/`.
- **Russian source language** — комментарии и UI на русском (lang="ru" в `app/layout.tsx`).
- **`'use client'` директивы** — только где реально нужно (минимум).

### Integration points (новые в Phase 1)
- `lib/db.ts` — Drizzle client + Neon connection (новый)
- `lib/db/schema.ts` — таблицы `users`, `lessons`, `allowed_emails` (новый)
- `lib/auth.ts` — NextAuth config + Resend adapter + whitelist callback (новый)
- `app/api/auth/[...nextauth]/route.ts` — NextAuth handler (новый)
- `app/login/page.tsx` — форма входа (новый)
- `app/lessons/page.tsx` — список уроков, server component с Drizzle query (новый)
- `app/no-access/page.tsx` — error страница (новый)
- `app/page.tsx` — auto-redirect logic (новый, заменяет default Next.js boilerplate)
- `middleware.ts` — protect `/lessons`, `/lesson/*` от unauthenticated (NextAuth middleware) (новый)
- `components/ui/*` — shadcn компоненты по мере install (Button, Form, Input, Card)
- `scripts/seed.ts` — создать первого admin'а + тестовый урок для проверки end-to-end (новый)

### Что НЕ создаём в Phase 1
- `app/lesson/[id]/page.tsx` — placeholder OK, полноценная страница в Phase 3
- `app/admin/*` — admin UI весь — Phase 2
- `app/api/draw/*` — порт прототипа доски — Phase 4
- Никакой Lottie / 11labs / tldraw / OpenAI integration в Phase 1

</code_context>

<specifics>
## Specific Ideas / Preferences

- **Visual язык**: «Claude Design» эстетика, но конкретное оформление приходит от пользователя через Claude Design tool. До этого — нейтральные shadcn defaults.
- **Anti-rando философия**: «не давать information attacker'у» — все auth-ошибки сводятся к одному `/no-access` с нейтральным текстом, без раскрытия причин (просрочен токен / нет в whitelist / отозван — все одно сообщение).
- **Free-first deploy**: Vercel subdomain (Hobby), Neon Free, Resend Free — стартуем без financial commitment. Реальный домен и Vercel Pro — когда продукт начнёт показывать тракшн (перед Phase 4).
- **Будущая совместимость с Claude Design workflow**: design tokens и компоненты должны быть легко перекрашиваемы (CSS variables через Tailwind v4 theme tokens — стандартный подход).

</specifics>

<deferred>
## Deferred Ideas (для будущих фаз / v2)

### v1 (другие фазы Klassio v1)
- **Полноценный admin UI** для добавления родителей в whitelist + создания уроков → **Phase 2** (ACC-04 admin path)
- **Расписание view** (календарь / неделя) → **Phase 2** (ACC-03)
- **`/lesson/[id]` 3-панельный layout + event bus** → **Phase 3** (LES-01)
- **Прошедшие уроки секция в ЛК** (с записями из Phase 10) → крючок готовится в Phase 2

### v2 (после v1 ships)
- **OAuth провайдеры** — Telegram bot для magic link delivery, Google OAuth, VK OAuth, custom providers через NextAuth
- **Multi-child accounts** — один родитель → N детей (расширение схемы `children` table)
- **Real домен** (klassio.ru / .app / .io) + миграция с Vercel subdomain
- **Mobile/tablet adaptation** — responsive layouts (VISION.md упоминает это как target)
- **Self-service signup** — публичная форма «запросить доступ» вместо email whitelist (после прохождения waitlist period)
- **Per-lesson links** — отдельные просрочиваемые ссылки на конкретные уроки (если ребёнок открывает не с маминого компа)
- **Account recovery** — что делать если родитель потерял доступ к email
- **Vercel Pro timing** — resolved (2026-05-09, plan 01-02): Hobby → Pro перед Phase 4 при первом beta-юзере. Если Phase 4 откладывается — пересмотреть usage метрики на тот момент.

### Reviewed Todos (not folded)
Нет — todo system пуст.

</deferred>

---

*Phase: 01-account-shell*
*Context gathered: 2026-05-09*
*Source: /gsd-discuss-phase 1, interactive mode, 4/4 areas discussed*
