# Phase 4: Production deploy + порт прототипа доски в Klassio — Context

**Gathered:** 2026-05-10
**Status:** Ready for planning (PARTIAL execution — port only, deploy deferred)
**Mode:** `--auto` (autonomous run; user AFK)

<domain>
## Phase Boundary

Two distinct workstreams в одной фазе по ROADMAP:

**Workstream A — Board port (autonomous):** портировать tldraw-prototype из `../tldraw-test/` в Klassio как board panel в lesson page. Это replace placeholder в `components/panels/board-panel.tsx` (Phase 3).

**Workstream B — Production deploy (DEFERRED to user):** Vercel deploy + Cloudflare CDN setup + DNS + HTTPS. Те же требования что и Phase 1 Wave 6 Task 3 (тоже было deferred). Будет закрыто пользователем после возврата.

**Сегодня в scope (autonomous):**
- Port `tldraw-test/app/page.tsx` → `components/panels/board-panel.tsx` (Klassio's board panel)
- Port `tldraw-test/lib/tools.ts` + `lib/executor.ts` → `lib/board/`
- Port `tldraw-test/app/api/draw/route.ts` → `app/api/draw/route.ts` (Klassio)
- Port `instrumentation.ts` (HTTPS_PROXY conditional, dev only) — verify it works в Klassio
- Port `next.config.ts` settings: `outputFileTracingRoot`, `serverExternalPackages: ['undici']`
- Add `tldraw`, `openai`, `undici` deps к Klassio package.json (exact-pinned)
- Wire BoardPanel в LessonShell (replace placeholder)
- Hook board events на lesson-bus (например board emits `board:say` event for future Phase 6 voice integration)
- E2E test: open lesson → board renders → enter prompt "объясни 245+874 в столбик" → SSE stream начинается → shapes rendered (без vertices assertions — тяжело тестировать canvas, ограничимся "no errors + canvas div present + at least 1 shape created")
- Тесты: смок-тесты для tools.ts (zod-валидация input shape), executor.ts (мок tldraw editor)

**НЕ в scope (defer to user):**
- `vercel --prod` deploy
- Cloudflare DNS / CDN setup
- Domain registration / HTTPS cert
- Production smoke tests с РФ IP без VPN
- DEP-01 acceptance criteria #4-#6 (production-only verification)

**Не в scope этой фазы вообще:**
- Voice agent + 11labs (Phase 6)
- Avatar (Phase 9)
- HTML trainer integration (Phase 7)
- Pre-canned scenes (Phase 5 — Phase 4 ставит rails, Phase 5 building on top)

</domain>

<decisions>
## Implementation Decisions

### Code organization

- **D-01 — Board panel = `'use client'` component.** `components/panels/board-panel.tsx` replaces the Phase 3 placeholder. Keeps the same export shape (uses `useLessonBus` hook) so `LessonShell` doesn't need changes.
- **D-02 — Board library под `lib/board/`.** Перенос `tldraw-test/lib/{executor,tools}.ts` → `lib/board/{executor,tools}.ts`. Index barrel `lib/board/index.ts`.
- **D-03 — API endpoint at `app/api/draw/route.ts`.** Same path as prototype — порт 1-в-1 с минимальными изменениями (env var lookup → process.env.OPENAI_API_KEY same).
- **D-04 — `tldraw` deps добавляются к Klassio package.json** с exact-pinned versions (CON-runtime-versions): `tldraw@3.15.6`, `openai@6.37.0`, `undici@8.2.0`. Использовать `npm install --save-exact`.
- **D-05 — instrumentation.ts портируется** в Klassio root. В dev — HTTPS_PROXY tunnel (если задан), в prod — no-op. Это критично т.к. Vercel ходит к OpenAI с американского IP напрямую, а dev на РФ требует VPN tunnel.

### Lesson page integration

- **D-06 — Board prompt input.** В прототипе был отдельный input field на странице. В Klassio — board занимает основную панель (Phase 3 desktop layout: left ~60%). Prompt input — в верхней части board panel header («Что объяснить?» + textarea + кнопка «Объяснить»). На больших экранах — справа от tldraw canvas.
- **D-07 — Lesson context передаётся в `/api/draw`.** Вместо anonymous prototype — endpoint получает `{ prompt, lessonId }`. lessonId позволит в будущем (Phase 8) учитывать lesson topic / prior history. В Phase 4 — просто валидируем что lessonId принадлежит current user (через session).
- **D-08 — auth() guard на `/api/draw`.** Endpoint защищён: `auth()` → если null → 401. Иначе принимает prompt+lessonId, валидирует ownership, стримит SSE.
- **D-09 — board events НЕ на lesson-bus в Phase 4.** Wiring к bus оставляем placeholder (комментарий «// TODO Phase 6: emit board:say to bus when SSE includes say tool»). Phase 6 (voice) будет первым консьюмером bus от board. Phase 4 — autonomous board (без других панелей слушающих).

### tldraw quirks (RESEARCH/intel reminders)

- **D-10 — TextShape `richText`** через `toRichText('text')` helper. CON-tldraw-shape-quirks.
- **D-11 — ArrowShape `text: string` plain** — НЕ `richText`. Не перепутать.
- **D-12 — `tool_choice: 'required'`** в OpenAI calls + `finish` tool как exit signal. CON-known-quirks.
- **D-13 — Fallback `JSON.parse(arguments)`** для OpenAI tool calls. Структурированный output может быть как `arguments: string` (требует parse) или уже распарсенный (защита через try/catch).

### Deps + config

- **D-14 — `outputFileTracingRoot: path.resolve(__dirname)`** в `next.config.ts`. Уже есть в Klassio с Phase 1 (CON-known-quirks: hard-avoid убирать этот ключ).
- **D-15 — `serverExternalPackages: ['undici']`** добавляется в `next.config.ts`. undici используется для HTTPS_PROXY tunnel; должен быть external server-side package чтобы Next.js не bundle'ил.
- **D-16 — Build / dev parity.** Prototype работал на `next dev` and `next build`. Verify оба работают в Klassio после порта.

### Testing

- **D-17 — Unit tests для `lib/board/`:** vitest для tools.ts (zod input schema), executor.ts (мок tldraw Editor). 8-10 тестов.
- **D-18 — E2E smoke** для board panel: navigate to lesson → board canvas div renders → prompt input visible → submit prompt → wait for SSE response → no console errors. Skip canvas-content assertions (tldraw canvas = `<canvas>` element — content внутри = WebGL pixels, нельзя assertion'ить через DOM).
- **D-19 — НЕ делать deep tests на agent-loop.** Это OpenAI + network — flaky в CI/Windows. Покрытие через manual smoke (run prototype-style prompt после порта). E2E ограничена «no error» level.

### Deploy (deferred, документировано)

- **D-20 — Production deploy = SAME pattern как Phase 1 Wave 6 Task 3.** vercel CLI login → link → env vars (this time + `OPENAI_API_KEY`) → `vercel --prod`. Cloudflare setup — отдельный пункт в MANUAL-ACTIONS.md.
- **D-21 — Cloudflare setup steps:** add domain (klassio.app or vercel.app subdomain initially), add Cloudflare proxy в front of Vercel (via custom domain CNAME), enable "Auto Minify" off (Next.js handles), enable "Brotli" on. Detailed in MANUAL-ACTIONS.md when пользователь дойдёт до этого.
- **D-22 — DNS pointer (RU users без VPN):** Cloudflare's Russian PoP покрывает РФ-юзеров. Vercel сам по себе может быть intermittent для РФ (зависит от IP routing). Cloudflare proxy = stable layer.

### Claude's Discretion

- Стиль для prompt input UI (textarea height, placeholder text)
- Точные строки error messages в `/api/draw` (но обязательно RU для user-facing)
- Конкретные log statements в server (можно EN — debugging audience)
- Decision на использование SSE vs Streaming Response API в Next.js 15 (prototype использует SSE — оставить)

</decisions>

<specifics>
## Specific Ideas

- Board panel header: «Доска» (heading) + textarea «Что объяснить?» + button «Объяснить» (primary). Disabled while streaming.
- При streaming: show spinner + cancel button (если возможно cancel SSE — abortController).
- Empty state: «Доска готова. Введи пример или задай вопрос боту.»
- Prompt suggestions кнопки (chips): «Сложение в столбик», «Дроби: введение», «Умножение на 10» — три preset prompts чтобы demo'ить board без typing.

</specifics>

<canonical_refs>
## Canonical References

### Project & milestone

- `.planning/PROJECT.md` — locked decisions
- `.planning/REQUIREMENTS.md` § BRD-01, DEP-01, PED-01
- `.planning/ROADMAP.md` § Phase 4
- `.planning/intel/constraints.md` § CON-tldraw-shape-quirks, CON-known-quirks
- `BOARD-STACK.md` (project root) — full board architecture spec
- `BOARD-STATUS.md` (project root) — prototype state snapshot

### Phase 1-3 deliverables (inheritance)

- `.planning/phases/03-lesson-shell/03-CONTEXT.md` — bus contract, lesson page structure
- `.planning/phases/03-lesson-shell/03-03-SUMMARY.md` — LessonShell adaptive layout, panel placeholders
- `lib/lesson-bus/` — bus API (Phase 4 wires future events)
- `auth.ts` — auth() for `/api/draw` guard
- `lib/db/schema.ts` — `lesson` table for ownership check

### Prototype source (port from)

- `../tldraw-test/app/page.tsx` (300 lines) — main board UI
- `../tldraw-test/lib/executor.ts` (469 lines) — tldraw shape executor
- `../tldraw-test/lib/tools.ts` (192 lines) — OpenAI function calling tools schema
- `../tldraw-test/app/api/draw/route.ts` (275 lines) — SSE agent-loop endpoint
- `../tldraw-test/instrumentation.ts` (37 lines) — undici proxy
- `../tldraw-test/next.config.ts` (40 lines) — outputFileTracingRoot + serverExternalPackages
- `../tldraw-test/package.json` — exact deps versions

### External docs (no need to fetch — already in BOARD-STACK.md)

- tldraw v3 docs — referenced via BOARD-STACK.md
- OpenAI function calling — referenced via BOARD-STACK.md
- Vercel deploy — used in Phase 1 Wave 6 (same patterns)
- Cloudflare proxy — researched in `intel/context.md`

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets

- **`auth()` from `@/auth`** — guard on `/api/draw`. Same pattern as `app/lessons/page.tsx`.
- **`db` from `@/lib/db`** — for ownership check (lessonId → user_id query).
- **`pg` (node-postgres)** — already имеется, не нужен для board (read-only access pattern).
- **shadcn `<Card>`, `<Button>`** — для board panel header / prompt UI.
- **shadcn `<Textarea>`** — нужно add'ить (`npx shadcn@latest add textarea`).
- **lesson-bus** — `useLessonBus` doesn't fire from board panel в Phase 4, but `LessonBusProvider` provides context which board panel may use в Phase 6.

### Patterns to Follow

- **Server Component for page-level data + Client Component for interactivity** — board panel = `'use client'` (uses tldraw which needs window).
- **API route auth check first, then validate, then stream.** Match prototype but add auth.
- **SSE streaming** with `Response(stream, { headers: { 'Content-Type': 'text/event-stream' } })` — direct port from prototype.
- **Идемпотентность** для `/api/draw` POST — каждый call новый, не нужно ON CONFLICT.

### Anti-patterns to Avoid

- **Не пытаться запустить `npm run dev` для verification** — это long-running. Используем `npm run build` + smoke test через Playwright E2E.
- **Не commit'ить `.env.local`** — `OPENAI_API_KEY` уже в gitignore через .env.local pattern.
- **Не убирать `outputFileTracingRoot`** в next.config — CON-known-quirks hard-avoid.
- **Не использовать `tool_choice: 'auto'`** для board LLM — CON-known-quirks (модель уходит в text generation вместо tool calls).
- **Не делать `richText` для ArrowShape.text** — TypeError.

</code_context>

<deferred_ideas>
## Deferred Ideas (out of phase scope)

- **Lesson context in /api/draw**: passing lesson topic / past attempts to LLM — Phase 8.
- **Voice + board integration** (board emits `say` event для voice TTS) — Phase 6.
- **Trainer + board integration** (trainer wrong answer → board explains the error) — Phase 8.
- **Stroke animation / SSML sync** — Phase 11.
- **Production deploy** — DEFERRED to user manual action (per autonomous run constraints).
- **Cloudflare CDN setup** — DEFERRED to user.
- **Domain registration** — DEFERRED.

</deferred_ideas>

<assumptions>
## Assumptions Made (auto-mode)

- **A1**: Phase 4 = PARTIAL run. Code port = autonomous. Deploy = deferred user action. Acceptable per user's "продолжай автономно, ручное отмечай" directive.
- **A2**: Port preserves prototype's exact UX as much as possible — mostly mechanical move + integrate with lesson page. Не делаем UX redesign в Phase 4.
- **A3**: New deps (`tldraw`, `openai`, `undici`) добавляем exact-pinned. Prototype use `^15.5.18` (caret) для Next, но Klassio Phase 1 уже использует exact pinning per RESEARCH Pitfall 7.
- **A4**: `OPENAI_API_KEY` пользователь добавит в `.env.local` после порта (если ещё нет). У него есть из прототипа — копирует. Я добавлю в `.env.example` template.
- **A5**: Prompt suggestions chips (3 preset) — добавляем для лучшего demo experience. Пользователь может убрать если не нравится.
- **A6**: E2E smoke = navigate + render + submit + no-error. Не deep canvas content assertions.

User can override на return через chat instructions.

</assumptions>
