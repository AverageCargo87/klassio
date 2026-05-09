# Phase 1: ЛК — оболочка, авторизация, список уроков — Research

**Researched:** 2026-05-09
**Domain:** Next.js 15 App Router + NextAuth v5 magic link + Drizzle/Supabase + shadcn/ui (Tailwind v4)
**Confidence:** HIGH (stack), MEDIUM (RU-specific deliverability, Vercel commercial verbatim)

## Summary

Klassio Phase 1 — это greenfield Next.js 15 проект, который ставит email magic link auth (`next-auth@5.0.0-beta.31` + Resend), Drizzle ORM на Supabase Postgres, shadcn/ui на Tailwind v4, и деплоится на Vercel. Все runtime-версии locked в CLAUDE.md → `.planning/intel/constraints.md` (`CON-runtime-versions`) совпадают со sibling проектом `tldraw-test/`, поэтому базовая `next.config.ts` / `tsconfig.json` / `globals.css` структура переиспользуема.

Главные сюрпризы для планировщика:

1. **NextAuth v5 — все ещё beta (`5.0.0-beta.31`, опубликован 2026-04-14).** Production-ready по официальной документации, но planner должен пинить точную версию (`next-auth@5.0.0-beta.31`), а не `^5` — иначе следующий beta может сломать API. Это нормальная практика для Auth.js v5 community.
2. **DrizzleAdapter требует Node runtime в middleware.** Это ломает Vercel Edge by default → нужен «split config» паттерн: `auth.config.ts` (edge-safe, без adapter) для middleware и `auth.ts` (с adapter) для route handler. См. § Pattern 1.
3. **Supabase для Vercel: используем transaction pooler (port 6543) для приложения + direct connection (port 5432) для миграций.** На transaction pooler обязателен `prepare: false` в postgres-js клиенте — иначе runtime ошибки.
4. **Whitelist в `signIn` callback срабатывает ПОСЛЕ генерации verification token, но ДО отправки письма.** Это значит: даже с whitelist Resend физически НЕ отправляет письмо для не-whitelisted email — поведение совпадает с D-02. Single «check your inbox» страница для всех случаев = security best practice (option (a) из вопроса 6).
5. **Tailwind v4 + shadcn/ui — поддержка официальная, CLI v4.7.0 (2026-05-05) умеет init с v4, нет нужды в `tailwind.config.js` (всё в `globals.css` через `@theme inline`).** Но: радикально новые CSS-переменные (oklch вместо hsl), что отличается от training-data примеров.

**Primary recommendation:** Создать новый Next.js 15 проект (НЕ копировать из `tldraw-test/`), ставить версии strictly как в Standard Stack ниже, использовать split config для NextAuth (edge middleware + node route handler), миграции через `drizzle-kit migrate` против direct DB URL, app в production через transaction pooler URL.

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

#### Auth model
- **D-01 — Email magic link auth (passwordless).** Родитель вводит email на `/login` → получает ссылку для входа на email → клик в email → залогинен. Никаких форм пароль/повторный пароль/captcha.
- **D-02 — Email whitelist в БД для анти-рандом.** Только email из таблицы `allowed_emails` (или эквивалент в `users.allowed=true`) может запросить magic link. Чужой email → запрос принимается формой, но письмо НЕ отправляется (чтобы не давать информацию о существующих юзерах) И сразу redirect на `/no-access`. Admin вручную добавляет email в whitelist через seed-скрипт / прямой SQL.
- **D-03 — Один родитель = один ребёнок в v1.** Multi-child — v2.
- **D-04 — Persistence: httpOnly secure cookie, expiry 1 год.**
- **D-05 — Multi-device permissive.** Cookie работает на любом устройстве, где она установлена.
- **D-06 — Desktop-only UI в v1.**
- **D-07 — `ACC-01` и `INV-01` в REQUIREMENTS.md обновлены под новую модель (parent-managed account).**
- **D-08 — OAuth провайдеры (TG / Google / VK) → v2.** В v1 — только email magic link.

#### Foundation tech picks
- **D-09 — NextAuth.js v5 (Auth.js) для auth.** Magic link через Resend adapter.
- **D-10 — Drizzle ORM для Supabase Postgres.**
- **D-11 — shadcn/ui + Tailwind v4 как foundation.**

#### Visual design pipeline
- **D-12 — Visual design делается пользователем в Claude Design.** Output — макеты + design tokens.
- **D-13 — Phase 1 implementation НЕ блокируется на дизайне.** Стартуем с нейтральных shadcn defaults.
- **D-14 — Tailwind v4 + shadcn/ui компоненты + кастомизация под Claude Design output.**

#### URL и routing
- **D-15 — Domain: Vercel subdomain на старте (`klassio.vercel.app` или подобный), бесплатно.** Реальный домен — когда продукт начнёт обретать форму.
- **D-16 — Корневой URL `/` — auto-redirect.** Залогинен → `/lessons`. Не залогинен → `/login`. Никакого лендинга.
- **D-17 — Routes flat structure:** `/login`, `/lessons`, `/no-access`, `/lesson/[id]` (placeholder), `/api/auth/*`, `/api/admin/*` (зарезервировано для Phase 2).
- **D-18 — `/no-access` — единая страница для всех auth-related ошибок.** Текст нейтральный: «Доступ не предоставлен. Обратитесь к репетитору.»

#### Cost rollout
- **Phase 1 fixed cost:** ~1 850 ₽/мес (Vercel Pro $20 + Supabase Free + Resend Free + домен амортизированно).
- **Phase 1 variable cost:** 0 ₽/lesson.
- **Открытый вопрос:** Vercel Pro vs Free? Pro нужен для commercial use по ToS.

### Claude's Discretion
- Точная схема `users` таблицы в Drizzle (поля и indexes — стандартные practices)
- UI text wording на `/login`, `/lessons`, `/no-access` (рус. язык, нейтрально-дружелюбно)
- Email template для magic link (рус., короткий, без брендинга на старте)
- Конкретные shadcn компоненты для использования (Form, Button, Card, Input, Toast)
- Серверная vs клиентская структура auth flow (server actions vs API routes — выбор по NextAuth best practices)
- Cookie config детали (sameSite, secure, partitioned)
- Validation библиотека (zod — дефолт)
- Конкретные nanoid / uuid для primary keys
- Логика expiry email magic link токена (по умолчанию NextAuth — 24 часа, можно оставить)

### Deferred Ideas (OUT OF SCOPE)

#### v1 (другие фазы Klassio v1)
- Полноценный admin UI → Phase 2 (ACC-04)
- Расписание view (календарь / неделя) → Phase 2 (ACC-03)
- `/lesson/[id]` 3-панельный layout + event bus → Phase 3 (LES-01)
- Прошедшие уроки секция в ЛК (с записями из Phase 10) → крючок готовится в Phase 2

#### v2 (после v1 ships)
- OAuth провайдеры (TG, Google, VK)
- Multi-child accounts
- Real домен + миграция с Vercel subdomain
- Mobile/tablet adaptation
- Self-service signup (публичная форма «запросить доступ»)
- Per-lesson links для ребёнка
- Account recovery (потерян email)
- Vercel Pro vs Free формальное решение

</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| ACC-01 | Авторизация родителя через email magic link, ребёнок использует родительскую сессию. Whitelist в БД, единая `/no-access`. | § Pattern 1 (split config), § Pattern 2 (whitelist в signIn), § Code Examples (Resend provider, signIn callback). |
| ACC-02 | Список запланированных уроков в ЛК с датами/темами/«Начать урок» (активна за 5 мин до старта). | § Drizzle schema (`lessons` table), § Code Examples (server component query с `currentTime` в pure функции «is button enabled»). |
| INV-01 | Zero-install для ребёнка — родитель логинится один раз, cookie 1 год, ребёнок открывает сайт без действий. | § Pattern 3 (cookie config в auth.ts), § Pattern 1 (middleware redirect на `/login` для unauth). |

</phase_requirements>

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Email magic link issuance | API / Backend (server action) | — | Resend SDK and `signIn` action run server-side; never client-side (API key exposure) |
| Whitelist enforcement | API / Backend (`signIn` callback) | — | DB query against `allowed_emails` must be server-side; can't trust client check |
| Session persistence (cookie) | API / Backend → Browser | — | Cookie set via NextAuth on server, sent to browser as httpOnly secure |
| Route protection | Frontend Server (middleware) | — | NextAuth middleware checks JWT cookie before render; redirects unauth |
| Lessons list rendering | Frontend Server (Server Component) | — | `app/lessons/page.tsx` is async Server Component; queries Drizzle directly |
| Login form UI | Browser (client component) | Frontend Server (server action) | `<form>` is client; `signIn('resend', {email})` action runs on server |
| Auto-redirect (`/`) | Frontend Server | — | `app/page.tsx` reads `auth()` server-side, returns `redirect()` |
| DB schema migrations | Build / DevOps | — | `drizzle-kit migrate` runs in CI/CD or local dev, never in app runtime |

**Why this matters:** Login form is the only client-side piece in Phase 1. Everything else (whitelist check, lessons query, redirects, session validation) is server-side — preserves both security and INV-01 (нулевые JS dependencies для ребёнка после первого render).

## Standard Stack

### Core (locked versions — pin EXACTLY in package.json, no `^`)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `next` | `15.5.18` | App Router, route handlers, server actions | [VERIFIED: npm view next@15.5.18 → published 2026-05-07] Locked by `CON-runtime-versions`; matches `tldraw-test/` sibling |
| `react` | `18.3.1` | UI runtime | [VERIFIED: locked by CON-runtime-versions] React 19 не тестировался под локед stack |
| `react-dom` | `18.3.1` | — | — |
| `typescript` | `^5` | strict mode | [VERIFIED: tldraw-test/package.json] |
| `tailwindcss` | `^4` (current 4.3.0) | UI styling, CSS-only `@import "tailwindcss"` | [VERIFIED: npm view tailwindcss → 4.3.0 published 2026-05-08] Locked by CON-runtime-versions |
| `@tailwindcss/postcss` | `^4` | PostCSS plugin для Tailwind v4 | [VERIFIED: tldraw-test/postcss.config.mjs uses `@tailwindcss/postcss`] |
| `next-auth` | `5.0.0-beta.31` | Auth.js v5 — magic link + adapters | [VERIFIED: npm view next-auth@beta → 5.0.0-beta.31 published 2026-04-14] **Beta but stable**; pin EXACTLY (no `^`) |
| `@auth/drizzle-adapter` | `^1.11.2` | Adapter NextAuth ↔ Drizzle | [VERIFIED: npm view → 1.11.2 published 2026-04-14] |
| `@auth/core` | `^0.41.2` (peer of next-auth) | Core types | [VERIFIED: peer dep of next-auth@beta] |
| `drizzle-orm` | `^0.45.2` | ORM | [VERIFIED: npm view → 0.45.2] |
| `drizzle-kit` | `^0.31.10` | Migrations CLI | [VERIFIED: npm view → 0.31.10] DevDep |
| `postgres` | `^3.4.9` (postgres-js) | PG driver, postgres-js flavor (NOT node-postgres) | [VERIFIED: orm.drizzle.team/docs/connect-supabase recommends postgres-js] |
| `resend` | `^6.12.3` | Email API SDK (если нужен прямой доступ; провайдер NextAuth его сам не тянет) | [VERIFIED: npm view → 6.12.3 published 2026-05-06] |
| `zod` | `^4.4.3` | Validation (login form, env vars) | [VERIFIED: npm view → 4.4.3] |

### Supporting (shadcn/ui peer deps)

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `class-variance-authority` | latest | Variant API for components | Auto-installed by shadcn init |
| `clsx` | latest | conditional className util | Auto-installed by shadcn init |
| `tailwind-merge` | latest | merge tailwind classes (in `cn()`) | Auto-installed by shadcn init |
| `lucide-react` | latest | Icon library (default for shadcn) | Auto-installed by shadcn init |
| `tw-animate-css` | latest | Animations (replaces deprecated `tailwindcss-animate`) | [CITED: ui.shadcn.com/docs/tailwind-v4 — `tailwindcss-animate` deprecated 2025-03] |
| `tsx` | `^4.21.0` | Run TypeScript scripts (`tsx scripts/seed.ts`) | DevDep; for seed.ts execution |

### Alternatives Considered (and rejected for Klassio Phase 1)

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `next-auth@beta` (v5) | `next-auth@4.24.14` (stable) | v4 has worse App Router story, no `auth()` helper; v5 является сейчас стандартом для App Router (даже в beta) |
| `postgres` (postgres-js) | `pg` (node-postgres) | postgres-js officially recommended by Drizzle for Supabase; lighter, faster cold start |
| `@auth/drizzle-adapter` | Hand-rolled session storage | DON'T — see § Don't Hand-Roll |
| `Resend` provider | Nodemailer + SMTP | Resend integrated as first-class NextAuth provider; React-friendly templates; free tier sufficient |
| `tsx` для seed | `ts-node` | tsx faster, no config needed, modern; ts-node has TS-config conflicts with Next.js |

### Installation Commands

```bash
# 1. Создать проект (выберите defaults: TypeScript yes, ESLint yes, Tailwind yes, App Router yes, src/ no, alias @/* yes)
npx create-next-app@15.5.18 klassio --typescript --tailwind --app --no-src-dir --import-alias "@/*"

# 2. Pin Next.js + React + Tailwind exactly (paranoid против patch upgrades)
cd klassio
npm install --save-exact next@15.5.18 react@18.3.1 react-dom@18.3.1
npm install --save-exact --save-dev typescript@5

# 3. Auth + DB + Email
npm install --save-exact next-auth@5.0.0-beta.31
npm install @auth/drizzle-adapter drizzle-orm postgres resend
npm install --save-dev drizzle-kit @types/node@20

# 4. Validation
npm install zod

# 5. shadcn/ui init (NB: НЕ используйте старый shadcn-ui пакет — он deprecated)
npx shadcn@latest init
# Defaults answers:
#   Style: Default (или New York)
#   Base color: Neutral (или Slate — не критично, Claude Design перекрасит)
#   Use CSS variables: Yes

# 6. Установить базовые shadcn компоненты для Phase 1
npx shadcn@latest add button input label form card sonner

# 7. Dev runner для seed-скрипта
npm install --save-dev tsx
```

**Version verification:** All versions verified via `npm view <package> version` on 2026-05-09. Re-verify before Wave 0 commit if research is older than 7 days (Auth.js v5 still in beta — release cadence ~2 weeks).

## Architecture Patterns

### System Architecture Diagram

```
┌──────────────────────────────────────────────────────────────────┐
│                  Browser (parent device)                         │
│                                                                  │
│  /login form ────POST email────┐                                 │
│                                │                                 │
│  Magic link click ─────GET ────┼──> NextAuth verify token        │
│                                │                                 │
│  /lessons render <─────HTML────┤                                 │
└────────────────────────────────┼─────────────────────────────────┘
                                 │
                                 ▼
┌──────────────────────────────────────────────────────────────────┐
│              Vercel (Node runtime, US/EU IP)                     │
│                                                                  │
│  middleware.ts ──── auth.config.ts (edge-safe, no adapter)       │
│       │                                                          │
│       ├── Has session cookie? → continue                         │
│       └── No cookie? → redirect /login                           │
│                                                                  │
│  app/api/auth/[...nextauth]/route.ts                             │
│       │                                                          │
│       ├── auth.ts (full config + DrizzleAdapter)                 │
│       │     │                                                    │
│       │     ├── Resend provider                                  │
│       │     │     │                                              │
│       │     │     └── sendVerificationRequest() ───> Resend API  │
│       │     │                                          (SMTP    │
│       │     │                                          to user) │
│       │     │                                                    │
│       │     └── callbacks.signIn ── whitelist check ──┐          │
│       │                                                │          │
│       └── PostgreSQL (Supabase pooler 6543)            │          │
│                  ▲                                     │          │
│  ┌───────────────┴────────────────────────┐  Yes ───> continue   │
│  │  users, accounts, sessions,             │  No ───> false       │
│  │  verificationTokens, allowed_emails,    │      ──> /no-access  │
│  │  lessons                                │                      │
│  └─────────────────────────────────────────┘                      │
│                                                                  │
│  app/lessons/page.tsx (async Server Component)                   │
│       │                                                          │
│       ├── auth() to get session                                  │
│       ├── db.select().from(lessons).where(userId = session.user.id) │
│       └── Render shadcn Cards with «Начать урок» button          │
└──────────────────────────────────────────────────────────────────┘
```

Data flow:
1. Parent submits email on `/login` → server action calls `signIn('resend', {email})`
2. NextAuth `signIn` callback runs whitelist check → if NOT in `allowed_emails`, return `false` → user redirected to `/no-access`
3. If whitelisted: NextAuth generates verification token, stores in `verificationTokens`, calls Resend `sendVerificationRequest`
4. Email delivered to parent → click magic link → `GET /api/auth/callback/resend?token=...&email=...` → NextAuth validates token (single-use, 24h expiry) → sets httpOnly cookie → redirects to `/lessons`
5. `/lessons` Server Component reads `auth()` session → queries Drizzle for lessons of current user → renders

### Recommended Project Structure

```
klassio/
├── app/
│   ├── layout.tsx              # html lang="ru", body, font, global metadata
│   ├── page.tsx                # auto-redirect: залогинен → /lessons; не → /login
│   ├── globals.css             # Tailwind v4 + shadcn CSS variables
│   ├── login/
│   │   └── page.tsx            # форма email + Server Action signIn
│   ├── lessons/
│   │   └── page.tsx            # async Server Component с Drizzle query
│   ├── no-access/
│   │   └── page.tsx            # единая neutral error page
│   ├── lesson/
│   │   └── [id]/
│   │       └── page.tsx        # PLACEHOLDER (full impl Phase 3)
│   └── api/
│       └── auth/
│           └── [...nextauth]/
│               └── route.ts    # NextAuth handlers (one-liner)
├── auth.ts                     # NextAuth config WITH adapter (node)
├── auth.config.ts              # NextAuth config WITHOUT adapter (edge-safe для middleware)
├── middleware.ts               # protect /lessons, /lesson/*
├── components/
│   └── ui/                     # shadcn компоненты по мере install
├── lib/
│   ├── db/
│   │   ├── index.ts            # postgres client + drizzle()
│   │   ├── schema.ts           # users, accounts, sessions, verificationTokens, allowed_emails, lessons
│   │   └── migrate.ts          # программный runner для drizzle-orm/postgres-js/migrator
│   ├── env.ts                  # Zod-валидация env переменных (paranoid)
│   └── utils.ts                # cn() от shadcn
├── drizzle/                    # сгенерированные миграции (`drizzle-kit generate`)
│   └── 0000_*.sql              # автогенерируется
├── scripts/
│   └── seed.ts                 # 1 admin email + 1 dummy lesson
├── drizzle.config.ts           # drizzle-kit config
├── components.json             # shadcn config
├── next.config.ts              # outputFileTracingRoot (CON-nextjs-tracing-root)
├── postcss.config.mjs          # @tailwindcss/postcss plugin
├── tsconfig.json               # strict, paths @/*
├── package.json                # exact-pinned deps
├── .env.local                  # DATABASE_URL, AUTH_SECRET, AUTH_RESEND_KEY, AUTH_URL
└── .env.example                # placeholder versions
```

### Pattern 1: Split NextAuth Config (Edge-safe middleware + Node-safe handler)

**What:** NextAuth v5 configuration in TWO files. `auth.config.ts` без adapter (используется в edge middleware), `auth.ts` с DrizzleAdapter (используется в route handler и Server Components).

**Why:** DrizzleAdapter использует `postgres-js`, который требует TCP sockets — недоступны в Vercel Edge runtime. Без split config middleware валится на edge с runtime error при попытке загрузить адаптер.

**When to use:** Always for NextAuth v5 + Drizzle/Prisma adapter.

```typescript
// auth.config.ts — edge-safe, NO adapter, NO providers с DB-зависимостью
// Source: https://authjs.dev/guides/edge-compatibility
import type { NextAuthConfig } from 'next-auth'

export default {
  providers: [],  // Resend provider добавим в auth.ts
  pages: {
    signIn: '/login',
    error: '/no-access',
    verifyRequest: '/login?sent=1',  // показываем "проверьте почту" toast/banner на /login
  },
  callbacks: {
    // authorized() — РАБОТАЕТ В EDGE MIDDLEWARE
    // Returns true → request continues; false → redirect to signIn page
    authorized: async ({ auth, request }) => {
      const isLoggedIn = !!auth?.user
      const path = request.nextUrl.pathname
      const isProtected =
        path.startsWith('/lessons') || path.startsWith('/lesson/')
      if (isProtected && !isLoggedIn) return false  // → redirect to /login
      return true
    },
  },
} satisfies NextAuthConfig
```

```typescript
// auth.ts — full config WITH adapter, providers, signIn callback
// Source: https://authjs.dev/getting-started/adapters/drizzle + getting-started/providers/resend
import NextAuth from 'next-auth'
import Resend from 'next-auth/providers/resend'
import { DrizzleAdapter } from '@auth/drizzle-adapter'
import { db } from '@/lib/db'
import { allowedEmails } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'
import authConfig from './auth.config'

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: DrizzleAdapter(db),
  session: { strategy: 'jwt' },  // см. Pattern 3 — почему JWT а не database
  ...authConfig,
  providers: [
    Resend({
      from: 'Klassio <onboarding@resend.dev>',  // dev-only sender (см. Pitfall 4)
      // sendVerificationRequest: customRussianTemplate,  // см. § Code Examples
    }),
  ],
  callbacks: {
    ...authConfig.callbacks,
    // signIn — РАБОТАЕТ ТОЛЬКО В NODE RUNTIME (имеет доступ к db)
    signIn: async ({ user }) => {
      if (!user.email) return false
      const allowed = await db
        .select({ id: allowedEmails.id })
        .from(allowedEmails)
        .where(eq(allowedEmails.email, user.email.toLowerCase()))
        .limit(1)
      return allowed.length > 0  // false → AccessDenied → pages.error → /no-access
    },
  },
})
```

```typescript
// middleware.ts — runs in EDGE runtime; uses auth.config.ts only
// Source: https://authjs.dev/getting-started/installation
import NextAuth from 'next-auth'
import authConfig from './auth.config'

export const { auth: middleware } = NextAuth(authConfig)

export default middleware((req) => {
  // empty body — authorized() callback in auth.config handles redirect
})

export const config = {
  matcher: ['/lessons/:path*', '/lesson/:path*'],
}
```

```typescript
// app/api/auth/[...nextauth]/route.ts — runs in NODE runtime
import { handlers } from '@/auth'
export const { GET, POST } = handlers
```

### Pattern 2: Whitelist Enforcement в `signIn` Callback

**What:** Email check против `allowed_emails` table в callback `signIn`. Возврат `false` блокирует auth flow.

**When to use:** Anti-rando для MVP (D-02 в CONTEXT.md).

**Critical detail:** NextAuth вызывает `signIn` callback **до** генерации verification token и **до** отправки email — это значит, для не-whitelisted email письмо физически НЕ уходит, и attacker не получает фидбек о существовании email в системе. Поведение совпадает с D-02 буквально.

```typescript
// см. auth.ts выше — callback внутри
signIn: async ({ user }) => {
  if (!user.email) return false
  const email = user.email.toLowerCase().trim()
  const allowed = await db
    .select({ id: allowedEmails.id })
    .from(allowedEmails)
    .where(eq(allowedEmails.email, email))
    .limit(1)
  return allowed.length > 0
}
```

**UX with whitelist (resolves question 6):** Industry pattern — option (a) silent drop. На `/login` ВСЕГДА показываем «Если ваш email в списке — мы отправили ссылку. Проверьте почту.» (или redirect на `/login?sent=1`). НЕ редиректим на `/no-access` после submit — это раскроет whitelist (attacker может сравнить «получил redirect» vs «получил банер»). `/no-access` остаётся как landing для просроченных/невалидных magic link click'ов.

**Альтернатива (если решено иначе):** Можно redirect не-whitelisted email на `/no-access` — это быстрее и понятнее, но раскрывает whitelist. CONTEXT D-02 формулирует «redirect на `/no-access` без отправки письма» — но если planner предпочтёт security (option a), это валидно по той же D-02 причине «не давать information attacker'у». **[ASSUMED — security best practice]** — рекомендую финализировать в planning через `/gsd-add-decision`.

### Pattern 3: JWT vs Database Session (для magic link)

**What:** NextAuth поддерживает 2 session strategies — JWT (stateless cookie) и Database (cookie с session token, valid сверяется в БД).

**When to use:** Для magic link оба валидны. **Рекомендую JWT:**

| Aspect | JWT (recommended) | Database |
|--------|-------------------|----------|
| Cookie size | ~1-2 KB | ~50 bytes |
| Server lookup per request | None (just verify signature) | DB query for sessions table |
| Session revocation | Cannot invalidate before expiry | Can `DELETE FROM sessions WHERE userId=X` |
| `sessions` table needed? | No (только `verificationTokens`) | Yes |
| Edge middleware compat | Native (`auth.config.ts` reads JWT cookie) | Requires DB read in middleware (NOT edge-safe) |

**Reason JWT для Klassio:** D-04 cookie expiry 1 год, D-05 multi-device permissive — нет требования revocation. Plus middleware на edge не сможет сделать DB lookup без adapter в edge config (что мы избегаем pattern 1).

```typescript
// в auth.ts:
session: { strategy: 'jwt', maxAge: 365 * 24 * 60 * 60 },  // 1 год
```

**Note:** Даже на JWT strategy, `verificationTokens` таблица всё ещё нужна для magic link flow (хранит одноразовые tokens 24h до клика). `sessions` таблица в schema.ts может быть, но не используется — оставить для совместимости с adapter, либо опустить (DrizzleAdapter принимает custom mapping без sessionsTable).

### Pattern 4: Server Component для `/lessons`

**What:** `app/lessons/page.tsx` — async Server Component, читает session через `auth()`, делает Drizzle query, рендерит shadcn Cards.

**Why:** Никакого client-side state не нужно (D-06 desktop-only, D-13 нет анимаций v1) — pure server render. Минимум JS на клиенте.

```typescript
// app/lessons/page.tsx
import { auth } from '@/auth'
import { redirect } from 'next/navigation'
import { db } from '@/lib/db'
import { lessons } from '@/lib/db/schema'
import { eq, asc } from 'drizzle-orm'
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'

export default async function LessonsPage() {
  const session = await auth()
  if (!session?.user?.id) redirect('/login')  // safety net (middleware уже проверил)

  const userLessons = await db
    .select()
    .from(lessons)
    .where(eq(lessons.userId, session.user.id))
    .orderBy(asc(lessons.scheduledAt))

  const now = Date.now()
  const upcoming = userLessons.filter(l => l.scheduledAt.getTime() > now - 60*60*1000)  // прошло меньше часа = всё ещё «в работе»
  const past = userLessons.filter(l => l.scheduledAt.getTime() <= now - 60*60*1000)

  return (
    <main className="container mx-auto p-6">
      <h1 className="text-2xl font-semibold mb-4">Уроки</h1>
      {upcoming.length === 0 && past.length === 0 && (
        <p className="text-muted-foreground">Пока уроков нет. Репетитор добавит их позже.</p>
      )}
      {upcoming.map(lesson => {
        const fiveMinBefore = lesson.scheduledAt.getTime() - 5 * 60 * 1000
        const lessonOver = lesson.scheduledAt.getTime() + lesson.durationMin * 60 * 1000
        const canStart = now >= fiveMinBefore && now <= lessonOver
        return (
          <Card key={lesson.id} className="mb-3">
            <CardHeader>
              <CardTitle>{lesson.topic}</CardTitle>
              <CardDescription>
                {lesson.scheduledAt.toLocaleString('ru-RU')} · {lesson.durationMin} мин
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button disabled={!canStart} asChild={canStart}>
                {canStart ? <a href={`/lesson/${lesson.id}`}>Начать урок</a> : 'Начать урок'}
              </Button>
            </CardContent>
          </Card>
        )
      })}
      {/* past secondary section ... */}
    </main>
  )
}
```

**Note about ACC-02:** «Кнопка активна за 5 мин до старта» — Server Component делает snapshot на момент render. Если пользователь сидит на странице 10 минут — кнопка не «оживёт» сама. Для v1 это ОК (родитель освежит страницу). Если нужна реактивность — добавить `<RealtimeButton scheduledAt=...>` client component с `setInterval(1000)`. **Откладываю в Claude's Discretion.**

### Anti-Patterns to Avoid

- **Anti-pattern:** Importing `db` или `auth.ts` из middleware. Result: edge runtime crash (Cannot find module 'postgres'). Use Pattern 1 split config.
- **Anti-pattern:** Using `session: { strategy: 'database' }` with edge middleware. Same as above.
- **Anti-pattern:** Setting whitelist email check в client component (даже как «UX optimization» «показать ошибку без отправки»). Result: whitelist exposed via API call inspection. ВСЯ проверка ТОЛЬКО в `signIn` callback на сервере.
- **Anti-pattern:** `npx shadcn-ui@latest init` (старый пакет, deprecated). Use `npx shadcn@latest init`.
- **Anti-pattern:** `tailwind.config.js` файл. В v4 не нужен — все темы в CSS через `@theme inline`.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Magic link token generation | Custom `crypto.randomBytes` + DB table | NextAuth `verificationTokens` + Resend provider | Single-use enforcement, 24h expiry, secure compare — все edge cases уже покрыты |
| Email template rendering | String concatenation в HTML | NextAuth `sendVerificationRequest` override (или `react-email`) | Backbone HTML email templates сложные (table-based layout для Outlook), NextAuth даёт fallback default |
| Session cookie management | `Set-Cookie` headers manually | NextAuth `auth()` + `signIn()` / `signOut()` | httpOnly, Secure, SameSite, expiration, rotation — NextAuth обрабатывает |
| Password hashing — N/A | — | NO PASSWORDS in v1 (D-01) | — |
| Form validation в server actions | Manual `if (!email.match(/.../))` | `zod` schema + `safeParse` | Type-safe, structured errors, refinements |
| Connection pool management | Manual `pg.Pool` | postgres-js `postgres()` (auto-pools) | Less config, native to Drizzle |
| Random ID generation | `Date.now() + Math.random()` | `crypto.randomUUID()` (Web API, Node 19+) | Globally unique, cryptographically secure, native (no dep) |
| OS-level cron / scheduling | — | OUT OF SCOPE Phase 1 | (Phase 2 admin) |

**Key insight:** В Phase 1 целая логика auth/session/email — это NextAuth + Resend. Не пытайтесь "упростить" (e.g., "просто send Resend.emails.send в server action"). NextAuth даёт: token storage, single-use, expiration, signIn/signOut hooks, session refresh, edge-safe checks — реализовать вручную = неделя работы и три CVE.

## Runtime State Inventory

> Phase 1 — greenfield phase (нет существующего кода Klassio для миграции). Inventory не применим.

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| Stored data | None — Klassio БД не существует, создаётся в Phase 1 | — |
| Live service config | None — Resend/Supabase/Vercel projects ещё не созданы | Будут созданы в Wave 1 (provisioning task) |
| OS-registered state | None | — |
| Secrets/env vars | None — `.env.local` создаётся с нуля | Будет создан в Wave 1 (env scaffolding task) |
| Build artifacts | None | — |

**Verified by:** `ls -la /c/Users/krato/ClaudeVibecoding/ClaudeDesktop/Klassio/` — только `.git/`, `.planning/`, `BOARD-STACK.md`, `BOARD-STATUS.md`, `VISION.md`. No `package.json`, no `node_modules`, no `app/`.

## Common Pitfalls

### Pitfall 1: Edge runtime trying to load DrizzleAdapter
**What goes wrong:** Middleware при первом запросе валится с `Module not found: Can't resolve 'postgres'` или `TCP sockets are not available in Edge runtime`.
**Why it happens:** `auth.ts` import'ит DrizzleAdapter, который тянет postgres-js, который требует Node TCP. Если middleware импортирует `auth.ts` напрямую — bundler затягивает adapter в edge bundle.
**How to avoid:** Pattern 1 split config — middleware импортирует ТОЛЬКО `auth.config.ts` (без adapter, без providers).
**Warning signs:** Build succeeds, но первый request на `/lessons` валится с 500 на Vercel logs.

### Pitfall 2: Supabase transaction pooler без `prepare: false`
**What goes wrong:** Random runtime errors типа `prepared statement "..." does not exist`. Особенно после первого `vercel deploy` или при cold start.
**Why it happens:** Transaction pooler (port 6543) переиспользует соединения для коротких транзакций — prepared statements не выживают между транзакциями.
**How to avoid:** В `lib/db/index.ts`:
```typescript
const client = postgres(process.env.DATABASE_URL!, { prepare: false })
export const db = drizzle({ client })
```
**Warning signs:** Errors appear under load, не reproducible локально (где обычно direct connection).

### Pitfall 3: drizzle-kit migrate против pooler URL
**What goes wrong:** `drizzle-kit migrate` падает с непонятными ошибками или ОЧЕНЬ медленно (multiple round-trips).
**Why it happens:** Migrations создают/изменяют schema — это long-running с prepared statements. Transaction pooler не подходит.
**How to avoid:** Иметь ДВА env vars: `DATABASE_URL` (pooler 6543, для app) и `DATABASE_URL_DIRECT` (direct 5432, для миграций). В `drizzle.config.ts` использовать direct:
```typescript
dbCredentials: { url: process.env.DATABASE_URL_DIRECT! }
```
**Warning signs:** Migration зависает или валится с timeout.

### Pitfall 4: Resend `from` без верификации домена
**What goes wrong:** В production письма не приходят, или приходят в спам, или Resend возвращает 403 «Domain not verified».
**Why it happens:** В Phase 1 у нас Vercel subdomain (`klassio.vercel.app`), который не верифицируем в Resend. Нельзя использовать `noreply@klassio.app` без DNS DKIM/SPF.
**How to avoid:** В Phase 1 использовать ТЕСТОВЫЙ адрес `Klassio <onboarding@resend.dev>` — Resend разрешает отправку с него (rate-limit 3000/мес и 100/день — соответствует D-15). При покупке домена (v2) — верифицировать его и заменить sender.
**Warning signs:** Resend dashboard показывает "from is not from a verified domain".

### Pitfall 5: Russian email providers (`mail.ru`, `yandex.ru`) deliverability
**What goes wrong:** Magic link от Resend с `onboarding@resend.dev` валится в спам у российских провайдеров (или вообще rejected).
**Why it happens:** `resend.dev` — generic test sender, нет персонализированного reputation. Yandex.ru использует aggressive ML spam filter (Spamooborona). [ASSUMED — based on regional provider behavior, not Resend-specific verified]
**How to avoid:**
1. **In Phase 1 testing:** При первом seed создать тестовых пользователей на Gmail (надёжная доставка с resend.dev). Российские email — реальный test после верификации домена в v2.
2. **Document in README:** «Если ваш email на mail.ru/yandex.ru и письмо не пришло — проверьте спам».
3. **Long-term fix (v2):** Купить домен `klassio.ru` или `.app`, верифицировать в Resend, отправлять с `Klassio <noreply@klassio.app>` — собственная reputation.
**Warning signs:** В Resend dashboard «delivered» статус, но юзер на yandex.ru не видит письма.

### Pitfall 6: AUTH_SECRET не задан → cryptic JWT errors
**What goes wrong:** В production все signIn flows валятся с «JWT signature verification failed».
**Why it happens:** NextAuth подписывает JWT через `AUTH_SECRET`. Если не задан — каждый serverless invocation генерирует случайный → cookies, выпущенные на одном invocation, невалидны на другом.
**How to avoid:** Сгенерировать через `npx auth secret` (CLI пишет в `.env.local`), скопировать в Vercel env vars (`vercel env add AUTH_SECRET production`).
**Warning signs:** Всё работает локально, но не в production (или работает на 1 из 5 деплоев).

### Pitfall 7: NextAuth v5 beta breaking changes между patch
**What goes wrong:** `npm install` подтянул новый `5.0.0-beta.32`, и API сломался (callback signature, helper renamed, etc.)
**Why it happens:** v5 — beta, не следует semver строго. Каждый beta может ломать API.
**How to avoid:** Pin EXACTLY `5.0.0-beta.31` (without `^`). Plan upgrade as conscious decision, не auto.
**Warning signs:** Вчера работало, после npm install — TypeScript errors.

### Pitfall 8: Tailwind v4 — `tailwind.config.js` more not respected
**What goes wrong:** Plan копирует Tailwind v3 паттерн с `tailwind.config.ts` colors, и они не применяются.
**Why it happens:** v4 читает темы из CSS `@theme inline { --color-... }`, не из JS config.
**How to avoid:** В Phase 1 НЕ создавать `tailwind.config.js/ts`. Все темы — в `app/globals.css`. Если Claude Design output даёт design tokens — переводить в CSS variables, не в JS config.
**Warning signs:** Кастомные colors не работают; класс `bg-primary` показывает дефолт.

### Pitfall 9: Vercel commercial use Hobby plan
**What goes wrong:** Vercel замечает paid product, suspend deployment, требует upgrade.
**Why it happens:** [VERIFIED: vercel.com/docs/limits/fair-use-guidelines] «Hobby teams are restricted to non-commercial personal use only». Asking for donations also counts.
**How to avoid:** Сразу Pro $20/мес перед публичным деплоем. В Phase 1 для testing на `klassio.vercel.app` без юзеров — Hobby ОК; перед первым реальным юзером (даже бесплатным beta) — upgrade. **Costs §:** заложено в COSTS.md.
**Warning signs:** Email от Vercel «your project violates fair use».

### Pitfall 10: Russia geographic restrictions для Vercel/Supabase/Resend
**What goes wrong:** Один из поставщиков (Vercel/Supabase/Resend) внезапно блокирует РФ-IP в админ-панели или биллинге.
**Why it happens:** EU 20th sanctions package (April 2026) расширил restrictions; US OFAC sanctions ongoing. [CITED: tradecomplianceresourcehub.com 20th EU package]
**Status check (2026-05-09):**
- **Vercel:** US-based, accepts payments via international cards. РФ-резидент с валидной нерезидентской картой (Wise/Tinkoff Black USD/etc.) может оплачивать. Никаких explicit РФ blocks в ToS на 2026-05-09. [ASSUMED — based on absence of explicit restriction]
- **Supabase:** US-based. Free tier работает. Pro tier — оплата картой (нужна нерезидентская). [ASSUMED]
- **Resend:** US-based. Free tier работает globally. [ASSUMED]
- **End-user side (РФ юзеры открывают сайт):** No blocks — нет ничего, что блокировало бы РФ IP на Vercel/Supabase/Resend application layer. Это отличается от OpenAI/Anthropic.
**How to avoid:** В Phase 1 риск низкий (admin = разработчик в РФ, юзеры — РФ родители/дети). Backup plan: при росте — Cloudflare Workers как proxy edge, или мигрировать на Hetzner self-hosted (но это слом deploy strategy DEC-deploy-architecture).
**Warning signs:** Cannot login to Vercel dashboard, Supabase API returns 403.

## Code Examples

### 1. `lib/db/index.ts` — postgres-js client
```typescript
// Source: https://orm.drizzle.team/docs/connect-supabase
import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import * as schema from './schema'
import { env } from '@/lib/env'

// prepare: false обязательно для Supabase transaction pooler (port 6543)
const client = postgres(env.DATABASE_URL, { prepare: false })

export const db = drizzle({ client, schema })
```

### 2. `lib/db/schema.ts` — Полная схема (NextAuth + Klassio)
```typescript
// Source: https://authjs.dev/getting-started/adapters/drizzle (PostgreSQL schema)
// + Klassio-specific tables (users.childName, users.childAge, allowed_emails, lessons)
import {
  boolean,
  timestamp,
  pgTable,
  text,
  primaryKey,
  integer,
  pgEnum,
  uuid,
  index,
} from 'drizzle-orm/pg-core'
import type { AdapterAccountType } from '@auth/core/adapters'

// === NextAuth required tables ===

export const users = pgTable('user', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  name: text('name'),
  email: text('email').unique(),
  emailVerified: timestamp('emailVerified', { mode: 'date' }),
  image: text('image'),
  // === Klassio extensions ===
  childName: text('child_name'),         // имя ребёнка (D-03 один родитель = один ребёнок)
  childAge: integer('child_age'),        // 9-11 для 5 класса
  createdAt: timestamp('created_at', { mode: 'date' }).defaultNow().notNull(),
  lastLoginAt: timestamp('last_login_at', { mode: 'date' }),
})

export const accounts = pgTable(
  'account',
  {
    userId: text('userId').notNull().references(() => users.id, { onDelete: 'cascade' }),
    type: text('type').$type<AdapterAccountType>().notNull(),
    provider: text('provider').notNull(),
    providerAccountId: text('providerAccountId').notNull(),
    refresh_token: text('refresh_token'),
    access_token: text('access_token'),
    expires_at: integer('expires_at'),
    token_type: text('token_type'),
    scope: text('scope'),
    id_token: text('id_token'),
    session_state: text('session_state'),
  },
  (account) => [{ compoundKey: primaryKey({ columns: [account.provider, account.providerAccountId] }) }],
)

// sessions table — required for adapter even on JWT strategy (adapter type contract)
export const sessions = pgTable('session', {
  sessionToken: text('sessionToken').primaryKey(),
  userId: text('userId').notNull().references(() => users.id, { onDelete: 'cascade' }),
  expires: timestamp('expires', { mode: 'date' }).notNull(),
})

export const verificationTokens = pgTable(
  'verificationToken',
  {
    identifier: text('identifier').notNull(),
    token: text('token').notNull(),
    expires: timestamp('expires', { mode: 'date' }).notNull(),
  },
  (vt) => [{ compositePk: primaryKey({ columns: [vt.identifier, vt.token] }) }],
)

// === Klassio-specific tables ===

export const allowedEmails = pgTable(
  'allowed_email',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    email: text('email').notNull().unique(),
    addedAt: timestamp('added_at', { mode: 'date' }).defaultNow().notNull(),
    notes: text('notes'),  // free-form — for admin notes ("родитель Маши, добавлен 2026-05-09")
  },
  (t) => [index('allowed_email_email_idx').on(t.email)],
)

export const lessonStatusEnum = pgEnum('lesson_status', [
  'scheduled',
  'in_progress',
  'completed',
  'cancelled',
])

export const lessons = pgTable(
  'lesson',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    scheduledAt: timestamp('scheduled_at', { mode: 'date' }).notNull(),
    topic: text('topic').notNull(),
    durationMin: integer('duration_min').notNull().default(45),
    htmlTemplateUrl: text('html_template_url'),  // placeholder для Phase 7 HTML trainer
    status: lessonStatusEnum('status').notNull().default('scheduled'),
    createdAt: timestamp('created_at', { mode: 'date' }).defaultNow().notNull(),
  },
  (t) => [
    index('lesson_user_id_idx').on(t.userId),
    index('lesson_scheduled_at_idx').on(t.scheduledAt),
  ],
)
```

### 3. `drizzle.config.ts` — Migrations config
```typescript
// Source: https://orm.drizzle.team/docs/get-started/postgresql-new
import 'dotenv/config'
import { defineConfig } from 'drizzle-kit'

export default defineConfig({
  out: './drizzle',
  schema: './lib/db/schema.ts',
  dialect: 'postgresql',
  dbCredentials: {
    // Use DIRECT connection (port 5432), не pooler — миграции требуют prepared statements
    url: process.env.DATABASE_URL_DIRECT!,
  },
  verbose: true,
  strict: true,
})
```

### 4. `lib/env.ts` — Zod validation env vars (paranoid)
```typescript
// Source: https://github.com/colinhacks/zod
import { z } from 'zod'

const envSchema = z.object({
  DATABASE_URL: z.string().url(),
  DATABASE_URL_DIRECT: z.string().url(),
  AUTH_SECRET: z.string().min(32),
  AUTH_RESEND_KEY: z.string().min(10),
  AUTH_URL: z.string().url().optional(),  // Vercel auto-sets in production via VERCEL_URL
})

export const env = envSchema.parse(process.env)
```

### 5. Custom Russian email template
```typescript
// Source: https://authjs.dev/getting-started/providers/resend
// Передаётся в Resend({ sendVerificationRequest: ... })
import type { EmailConfig } from 'next-auth/providers/email'

export async function sendVerificationRequest(params: {
  identifier: string
  url: string
  provider: EmailConfig
}) {
  const { identifier: email, url, provider } = params
  const { host } = new URL(url)

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${provider.apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: provider.from,
      to: email,
      subject: 'Вход в Klassio',
      html: htmlBody({ url, host }),
      text: textBody({ url, host }),
    }),
  })
  if (!res.ok) {
    throw new Error(`Resend send failed: ${res.status} ${await res.text()}`)
  }
}

function htmlBody({ url, host }: { url: string; host: string }) {
  return `
<!DOCTYPE html>
<html lang="ru">
<body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:#f9fafb;padding:40px 0;">
  <table width="100%" cellpadding="0" cellspacing="0" border="0">
    <tr><td align="center">
      <table width="480" cellpadding="0" cellspacing="0" border="0" style="background:#fff;border-radius:8px;padding:32px;">
        <tr><td>
          <h1 style="font-size:20px;color:#111;margin:0 0 16px;">Klassio</h1>
          <p style="color:#444;line-height:1.5;margin:0 0 24px;">
            Здравствуйте! Перейдите по ссылке ниже, чтобы войти в личный кабинет:
          </p>
          <p>
            <a href="${url}" style="background:#111;color:#fff;text-decoration:none;padding:12px 20px;border-radius:6px;display:inline-block;">
              Войти в Klassio
            </a>
          </p>
          <p style="color:#888;font-size:13px;line-height:1.5;margin:24px 0 0;">
            Ссылка действительна 24 часа. Если вы не запрашивали вход — просто проигнорируйте это письмо.
          </p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`
}

function textBody({ url, host }: { url: string; host: string }) {
  return `Klassio — вход в личный кабинет

Перейдите по ссылке: ${url}

Ссылка действительна 24 часа. Если вы не запрашивали вход — просто проигнорируйте это письмо.`
}
```

### 6. `app/login/page.tsx` — Login form с Server Action
```typescript
// Server Component с inline Server Action — самый простой паттерн NextAuth v5
import { signIn, auth } from '@/auth'
import { redirect } from 'next/navigation'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ sent?: string }>
}) {
  const session = await auth()
  if (session?.user) redirect('/lessons')
  const { sent } = await searchParams

  async function loginAction(formData: FormData) {
    'use server'
    const email = String(formData.get('email') ?? '').trim().toLowerCase()
    if (!email || !email.includes('@')) return  // basic check; полный — в zod

    try {
      // signIn с Resend provider; redirect: false → не делаем follow,
      // показываем "проверьте почту" на /login?sent=1
      await signIn('resend', { email, redirectTo: '/login?sent=1' })
    } catch (error) {
      // signIn callback вернул false (не в whitelist) → throw AccessDeniedError
      // → перехвачено NextAuth → redirect на pages.error = /no-access
      // BUT: для security лучше показать "проверьте почту" одинаково для whitelist и non-whitelist
      // → переключить redirect на /login?sent=1 в обоих случаях (см. Pattern 2 UX)
      redirect('/login?sent=1')
    }
  }

  return (
    <main className="container mx-auto max-w-md p-6 mt-12">
      <h1 className="text-2xl font-semibold mb-2">Вход в Klassio</h1>
      <p className="text-muted-foreground mb-6">
        Введите email родителя — мы отправим ссылку для входа.
      </p>
      {sent && (
        <div className="mb-4 p-3 bg-green-50 border border-green-200 rounded text-sm">
          Если ваш email в нашем списке, мы отправили ссылку для входа. Проверьте почту.
        </div>
      )}
      <form action={loginAction} className="space-y-4">
        <div>
          <Label htmlFor="email">Email родителя</Label>
          <Input id="email" name="email" type="email" required autoComplete="email" />
        </div>
        <Button type="submit" className="w-full">Отправить ссылку</Button>
      </form>
    </main>
  )
}
```

### 7. `scripts/seed.ts` — Минимальный seed для end-to-end testing
```typescript
// Source: drizzle docs + custom; runnable via `tsx scripts/seed.ts`
import 'dotenv/config'
import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import * as schema from '../lib/db/schema'

const ADMIN_EMAIL = process.env.SEED_ADMIN_EMAIL ?? 'kratov.gr@gmail.com'

async function main() {
  const client = postgres(process.env.DATABASE_URL_DIRECT!, { prepare: false, max: 1 })
  const db = drizzle({ client, schema })

  console.log('1. Adding admin email to whitelist...')
  await db.insert(schema.allowedEmails)
    .values({ email: ADMIN_EMAIL.toLowerCase(), notes: 'admin (seed)' })
    .onConflictDoNothing()

  console.log('2. Creating admin user...')
  const [user] = await db.insert(schema.users)
    .values({
      email: ADMIN_EMAIL.toLowerCase(),
      childName: 'Тест-ребёнок',
      childAge: 10,
    })
    .onConflictDoUpdate({
      target: schema.users.email,
      set: { childName: 'Тест-ребёнок', childAge: 10 },
    })
    .returning()

  console.log('3. Adding test lesson (now + 1 hour)...')
  const oneHourLater = new Date(Date.now() + 60 * 60 * 1000)
  await db.insert(schema.lessons).values({
    userId: user.id,
    scheduledAt: oneHourLater,
    topic: 'Сложение в столбик',
    durationMin: 45,
    status: 'scheduled',
  })

  console.log(`✓ Seed complete. Login as ${ADMIN_EMAIL}`)
  await client.end()
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
```

`package.json` script:
```json
{ "scripts": { "db:seed": "tsx scripts/seed.ts" } }
```

### 8. `app/globals.css` — Tailwind v4 + shadcn baseline
```css
/* Source: https://ui.shadcn.com/docs/tailwind-v4 */
@import "tailwindcss";
@import "tw-animate-css";

@custom-variant dark (&:is(.dark *));

:root {
  --radius: 0.625rem;
  --background: oklch(1 0 0);
  --foreground: oklch(0.145 0 0);
  --card: oklch(1 0 0);
  --card-foreground: oklch(0.145 0 0);
  --popover: oklch(1 0 0);
  --popover-foreground: oklch(0.145 0 0);
  --primary: oklch(0.205 0 0);
  --primary-foreground: oklch(0.985 0 0);
  --secondary: oklch(0.97 0 0);
  --secondary-foreground: oklch(0.205 0 0);
  --muted: oklch(0.97 0 0);
  --muted-foreground: oklch(0.556 0 0);
  --accent: oklch(0.97 0 0);
  --accent-foreground: oklch(0.205 0 0);
  --destructive: oklch(0.577 0.245 27.325);
  --border: oklch(0.922 0 0);
  --input: oklch(0.922 0 0);
  --ring: oklch(0.708 0 0);
}

.dark {
  --background: oklch(0.145 0 0);
  --foreground: oklch(0.985 0 0);
  /* ... full dark mode variables */
}

@theme inline {
  --color-background: var(--background);
  --color-foreground: var(--foreground);
  --color-card: var(--card);
  --color-card-foreground: var(--card-foreground);
  --color-primary: var(--primary);
  --color-primary-foreground: var(--primary-foreground);
  --color-muted: var(--muted);
  --color-muted-foreground: var(--muted-foreground);
  --color-border: var(--border);
  --color-input: var(--input);
  --color-ring: var(--ring);
  --radius-md: var(--radius);
  --radius-lg: calc(var(--radius) + 2px);
}

@layer base {
  * {
    @apply border-border outline-ring/50;
  }
  body {
    @apply bg-background text-foreground;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  }
}
```

### 9. `next.config.ts` — Klassio Phase 1 (упрощённый vs tldraw-test)
```typescript
// Source: tldraw-test/next.config.ts simplified — Phase 1 не нуждается в undici/instrumentation
import path from 'node:path'
import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  // CON-nextjs-tracing-root: лочим workspace root, иначе Next.js находит ~/package-lock.json
  outputFileTracingRoot: path.resolve(__dirname),
}

export default nextConfig
```
**Note:** Klassio Phase 1 НЕ делает внешних API calls (нет OpenAI/Anthropic/11labs в Phase 1) → instrumentation.ts с ProxyAgent НЕ нужен. Добавится в Phase 4 (где появляется доска и /api/draw → OpenAI).

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| NextAuth v4 with `getServerSession()` and `useSession()` everywhere | Auth.js v5 with universal `auth()` helper (works in Server Components, Route Handlers, Middleware) | v5 beta launched 2024, stable-ish 2025 | Cleaner API, server-first, edge-aware |
| Tailwind v3 with `tailwind.config.ts` для theme | Tailwind v4 — `@theme inline { ... }` в CSS, no JS config needed | v4 GA Jan 2025 | Less boilerplate, faster builds, OKLCH colors |
| `npx shadcn-ui@latest` (deprecated package) | `npx shadcn@latest` | Mid-2024 | Old package archived, must use new |
| `tailwindcss-animate` plugin | `tw-animate-css` | March 2025 deprecation | Drop-in replacement |
| `pg` (node-postgres) для Drizzle на Supabase | `postgres` (postgres-js) | Drizzle docs always recommended postgres-js for Supabase | Lighter, faster, recommended |
| Database session strategy by default | JWT strategy для magic link (когда edge middleware нужен) | Edge runtime ecosystem maturation | Required для split config pattern |
| `getStaticProps` / `getServerSideProps` (Pages Router) | Async Server Components in App Router | Next.js 13.4 (May 2023) | Klassio uses App Router only |

**Deprecated/outdated:**
- `next-auth@4.x` для App Router — workable, но v5 cleaner. v4 Pages Router patterns точно не использовать.
- `tailwind.config.js` для tailwindcss@4 — игнорируется, всё в CSS.
- `getServerSession()` — заменён на `auth()` в v5.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Whitelist UX — option (a) silent drop "проверьте почту" для всех vs option (b) explicit /no-access — recommended option (a) per security best practice | Pattern 2 | Если planner/user предпочтут (b) — измените `loginAction` для перехвата AccessDeniedError и redirect на /no-access. Не критично для core impl. |
| A2 | Russian email providers (mail.ru, yandex.ru) deliverability с `onboarding@resend.dev` может страдать | Pitfall 5 | Реальный risk в production; mitigated через verified domain в v2 |
| A3 | Vercel/Supabase/Resend на 2026-05-09 не имеют explicit РФ-resident blocks | Pitfall 10 | High impact if wrong; verify before production deploy by checking each service's billing/account TOS |
| A4 | DrizzleAdapter требует `sessions` table в schema даже на JWT strategy (для type contract) | Pattern 3 | Если adapter поддерживает `sessionsTable: undefined` — можно опустить таблицу. Verify в planning через минимальный smoke test. |
| A5 | NextAuth v5 beta API stable между beta.31 → beta.32 для использованных features (Resend provider, signIn callback, Drizzle adapter) | Standard Stack | Pin exact version mitigates; будущие upgrades — explicit decision |
| A6 | `prepare: false` on postgres-js достаточно для Supabase transaction pooler (нет других gotchas) | Pitfall 2 | Production load testing reveal; fall back на session pooler (port 5432, supports prepared statements но IPv4) |

**Note:** All other claims in this research are either VERIFIED via npm registry / file inspection, or CITED from official documentation URLs.

## Open Questions

1. **Vercel commercial use timing — когда переходить с Hobby на Pro?**
   - What we know: COSTS.md заложил Pro ($20/мес) в Phase 1 fixed cost. Vercel ToS: "commercial use" = anything with paid users.
   - What's unclear: Beta/free testing с друзьями = commercial? Vercel сам не activate-suspend без warning.
   - Recommendation: В Phase 1 — Hobby ОК для dev/testing. Перед первым реальным beta-юзером (даже бесплатным) — upgrade to Pro. Решение в Wave 1 (provisioning task).

2. **Custom domain vs vercel.app subdomain — когда покупать?**
   - What we know: D-15 — vercel.app subdomain на старте, реальный домен потом. COSTS.md: ~50 ₽/мес амортизированно.
   - What's unclear: Resend deliverability на mail.ru/yandex.ru без верифицированного домена.
   - Recommendation: Phase 1 — vercel subdomain + `onboarding@resend.dev` sender. Если первый Gmail-родитель работает — keep going. Покупка домена triggered Phase 2+ когда появятся mail.ru/yandex.ru родители.

3. **Реактивность кнопки «Начать урок» (за 5 мин) — нужна ли?**
   - What we know: ACC-02 «активна за 5 минут до начала».
   - What's unclear: Server-render snapshot достаточно (юзер реально откроет страницу за пару минут до)? Или нужен real-time обновление?
   - Recommendation: Phase 1 — server snapshot (просто пользователь освежит страницу). Если в Phase 2 появятся feedback issues — добавить мини client component с `setInterval(30000)`.

4. **Schema — `child_name`/`child_age` в `users` или отдельная `children` таблица?**
   - What we know: D-03 один родитель = один ребёнок в v1, multi-child v2.
   - What's unclear: Готовиться к v2 сейчас (extra table now)?
   - Recommendation: Поля в `users` (как в schema выше). v2 миграция = создать `children` table + перенести данные. Это дешевле, чем over-engineering сейчас.

5. **`sessions` table в schema — нужна ли при JWT strategy?**
   - See Assumption A4 above.
   - Recommendation: Включить в schema (соответствует Auth.js docs pattern), даже не используется для read/write.

## Environment Availability

> Klassio Phase 1 — local dev на Windows 11. Production — Vercel. Probing local environment:

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | All build/dev | ✓ | v24.13.0 (≥20 required) | — |
| npm | Package install | ✓ | 11.6.2 | — |
| PostgreSQL local | Local DB testing (optional) | Unknown — not verified | — | Supabase remote (no local DB needed) |
| Git | Version control | ✓ | (in tldraw-test/) | — |
| Vercel CLI | `vercel deploy`, env management | Not verified | — | Web UI |
| Supabase CLI | Local migrations dev (optional) | Not verified | — | Direct connection via `psql` или Supabase Studio |
| Resend account | Send emails | Account creation needed (Wave 1) | — | — |
| Supabase account | Postgres hosting | Account creation needed (Wave 1) | — | Local Postgres if absolutely needed |
| Vercel account | Deploy | Existing (юзер kratov.gr@gmail.com) | — | — |

**Missing dependencies with no fallback:**
- Supabase project (Wave 1 task)
- Resend project + API key (Wave 1 task)
- Vercel project (Wave 1 task)

**Missing dependencies with fallback:**
- Vercel CLI (use web UI for env vars)
- Local PostgreSQL (use Supabase remote even for dev)

## Validation Architecture

> nyquist_validation enabled (no config.json — treat as enabled per researcher protocol).

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Vitest 4.1.5 (для unit/integration), Playwright 1.59.1 (E2E) |
| Config file | `vitest.config.ts` (Wave 0), `playwright.config.ts` (Wave 0) |
| Quick run command | `npx vitest run --reporter=basic` |
| Full suite command | `npx vitest run && npx playwright test` |

**Why Vitest над Jest:** Vitest — modern default для Vite/Next.js экосистемы (2025+), фастер cold start, native ESM, лучше TS интеграция. Jest требует `next/jest` адаптер.

**Why Playwright over Cypress:** Playwright — официальный recommend Microsoft/Vercel; native Next.js support; multi-browser; better magic link e2e (умеет parse mailbox).

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| ACC-01 | Whitelist email — allowed → magic link sent | unit | `vitest run lib/auth/__tests__/whitelist.test.ts` | ❌ Wave 0 |
| ACC-01 | Whitelist email — NOT allowed → no email + redirect | integration | `vitest run lib/auth/__tests__/whitelist.test.ts` | ❌ Wave 0 |
| ACC-01 | Magic link click → cookie set → /lessons | E2E | `playwright test e2e/login.spec.ts` (mock Resend, intercept email) | ❌ Wave 0 |
| ACC-01 | Просроченный/невалидный magic link → /no-access | E2E | `playwright test e2e/expired-link.spec.ts` | ❌ Wave 0 |
| ACC-01 | Cookie 1 год — verify Set-Cookie header expiry | unit | `vitest run lib/auth/__tests__/cookie-config.test.ts` | ❌ Wave 0 |
| ACC-02 | `/lessons` показывает upcoming lessons sorted | unit | `vitest run app/lessons/__tests__/page.test.tsx` (mock db) | ❌ Wave 0 |
| ACC-02 | Кнопка «Начать урок» disabled до 5 мин до старта | unit | `vitest run app/lessons/__tests__/can-start.test.ts` (pure function) | ❌ Wave 0 |
| ACC-02 | Empty state — нет уроков → текст «Пока уроков нет» | unit | `vitest run app/lessons/__tests__/page.test.tsx` | ❌ Wave 0 |
| INV-01 | Cookie persists across reload (no re-login required) | E2E | `playwright test e2e/persist-session.spec.ts` | ❌ Wave 0 |
| INV-01 | Unauthenticated visit `/lessons` → redirect `/login` | E2E | `playwright test e2e/protected-routes.spec.ts` | ❌ Wave 0 |
| INV-01 | Авто-redirect `/` → `/lessons` (auth) или `/login` (no auth) | E2E | `playwright test e2e/root-redirect.spec.ts` | ❌ Wave 0 |

### Sampling Rate

- **Per task commit:** `npx vitest run --reporter=basic` (≤10s for Phase 1 unit suite)
- **Per wave merge:** `npx vitest run && npx playwright test --project=chromium` (~60s)
- **Phase gate:** Full suite (vitest + playwright all browsers) green before `/gsd-verify-work`

### Wave 0 Gaps

- [ ] `vitest.config.ts` — config с jsdom env для React tests, alias `@/*`
- [ ] `playwright.config.ts` — config с baseURL `http://localhost:3000`, webServer для `npm run dev`
- [ ] `lib/auth/__tests__/whitelist.test.ts` — unit + integration для signIn callback
- [ ] `lib/auth/__tests__/cookie-config.test.ts` — verify NextAuth cookie expiry config
- [ ] `app/lessons/__tests__/page.test.tsx` — Server Component test (см. Next.js docs для async component testing)
- [ ] `app/lessons/__tests__/can-start.test.ts` — pure function `canStartLesson(scheduledAt, durationMin, now)`
- [ ] `e2e/login.spec.ts` — happy path с Resend mock (intercept fetch, extract magic link from intercept body, simulate click)
- [ ] `e2e/expired-link.spec.ts` — token expiry path
- [ ] `e2e/protected-routes.spec.ts` — middleware redirect
- [ ] `e2e/root-redirect.spec.ts` — `/` redirect logic
- [ ] `e2e/persist-session.spec.ts` — cookie persistence across reload
- [ ] `tests/fixtures/seed-test-db.ts` — fixture для setting up isolated test DB before each E2E run
- [ ] Framework install: `npm install --save-dev vitest @vitest/coverage-v8 jsdom @testing-library/react @testing-library/jest-dom @playwright/test` + `npx playwright install chromium`

**Visual regression:** D-13 visual в flux через Claude Design — visual regression tests не имеют смысла в Phase 1. Skip.

## Sources

### Primary (HIGH confidence)
- [authjs.dev/getting-started/installation](https://authjs.dev/getting-started/installation) — NextAuth v5 install, AUTH_SECRET, route handler path
- [authjs.dev/getting-started/authentication/email](https://authjs.dev/getting-started/authentication/email) — Email magic link flow, DB requirement
- [authjs.dev/getting-started/providers/resend](https://authjs.dev/getting-started/providers/resend) — Resend provider config, sendVerificationRequest, token expiry
- [authjs.dev/getting-started/adapters/drizzle](https://authjs.dev/getting-started/adapters/drizzle) — DrizzleAdapter, PG schema (full TypeScript code block)
- [authjs.dev/guides/edge-compatibility](https://authjs.dev/guides/edge-compatibility) — Split config pattern, why DB adapters require Node runtime
- [authjs.dev/reference/nextjs](https://authjs.dev/reference/nextjs) — signIn callback signatures, pages config, error handling
- [orm.drizzle.team/docs/connect-supabase](https://orm.drizzle.team/docs/connect-supabase) — postgres-js driver, transaction pooler quirks (`prepare: false`)
- [orm.drizzle.team/docs/get-started/postgresql-new](https://orm.drizzle.team/docs/get-started/postgresql-new) — drizzle.config.ts, push vs migrate workflows
- [orm.drizzle.team/docs/migrations](https://orm.drizzle.team/docs/migrations) — Programmatic migrate.ts pattern
- [supabase.com/docs/guides/database/connecting-to-postgres](https://supabase.com/docs/guides/database/connecting-to-postgres) — 3 connection types (direct, session pooler, transaction pooler)
- [ui.shadcn.com/docs/installation/next](https://ui.shadcn.com/docs/installation/next) — shadcn/ui install for Next.js 15
- [ui.shadcn.com/docs/installation/manual](https://ui.shadcn.com/docs/installation/manual) — Manual install с Tailwind v4 components.json
- [ui.shadcn.com/docs/tailwind-v4](https://ui.shadcn.com/docs/tailwind-v4) — Tailwind v4 migration guide, OKLCH colors, @theme inline
- [resend.com/docs/dashboard/domains/introduction](https://resend.com/docs/dashboard/domains/introduction) — Domain verification, SPF/DKIM
- [resend.com/docs/send-with-nextjs](https://resend.com/docs/send-with-nextjs) — Test sender `onboarding@resend.dev`
- [resend.com/pricing](https://resend.com/pricing) — Free tier 3000/мес, 100/day
- [vercel.com/docs/limits/fair-use-guidelines](https://vercel.com/docs/limits/fair-use-guidelines) — Hobby = non-commercial, Pro required for commercial
- npm registry queries (npm view) — version verification for all packages on 2026-05-09

### Secondary (MEDIUM confidence)
- Cross-checked NextAuth v5 split config pattern with multiple sources (authjs.dev edge-compatibility + GitHub discussions)
- Drizzle Supabase migrations connection (direct vs pooler) — synthesized from Drizzle docs ("transaction pool mode requires `prepare: false`") + Supabase docs (transaction pooler best for serverless app, direct for migrations)

### Tertiary (LOW confidence)
- Russian email provider deliverability for `onboarding@resend.dev` — based on general regional provider behavior (Yandex Spamooborona ML filter), not Resend-specific verified data. Marked as A2 in Assumptions Log.
- Vercel/Supabase/Resend РФ-resident billing acceptance on 2026-05-09 — based on absence of explicit blocks in public docs as of search date. Marked as A3 in Assumptions Log.

## Metadata

**Confidence breakdown:**
- Standard stack (versions, install commands): HIGH — все версии verified via npm registry на 2026-05-09
- Architecture patterns (split config, signIn callback, JWT strategy): HIGH — official Auth.js docs cited
- Drizzle schema (full code): HIGH — copy-pasteable from authjs.dev official Drizzle adapter docs
- Supabase connection strategy (pooler/direct, prepare: false): HIGH — both official docs confirm
- shadcn/ui Tailwind v4 setup: HIGH — official docs, post-v4 release
- Russian email deliverability: LOW — assumption A2, needs production validation
- Vercel/Supabase/Resend РФ availability: LOW-MEDIUM — assumption A3, no explicit RF blocks found but no positive confirmation either
- Whitelist UX recommendation (silent drop vs explicit redirect): MEDIUM — assumption A1, both interpretations of D-02 valid; recommend security default (silent drop) but planner may decide otherwise
- Validation strategy (Vitest + Playwright): HIGH — modern Next.js standard, all wave 0 gaps explicitly listed

**Research date:** 2026-05-09
**Valid until:** 2026-06-09 (30 days for stable stack; re-verify NextAuth beta version before each new wave start — beta cadence ~2 weeks)
