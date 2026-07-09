---
gsd_state_version: 1.0
milestone: v1.6.0
milestone_name: milestone
status: ready_to_plan
last_updated: "2026-05-13T16:11:12.556Z"
progress:
  total_phases: 14
  completed_phases: 8
  total_plans: 29
  completed_plans: 30
  percent: 57
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

**Phase 6 IMPLEMENTATION COMPLETE. Phase 6.5 (Hetzner) — PENDING USER ACTION.**

**👉 После /clear читай первым: [`.planning/SESSION-2026-05-11-WRAPUP.md`](.planning/SESSION-2026-05-11-WRAPUP.md)**

- **Production URL**: https://klassio-one.vercel.app — DEPLOYED, working
- **Phase 1 status**: ✅ DEPLOYED. Auth end-to-end works. Известный UX bug: client-side exception на form submit (email уходит, flow завершается) — non-blocking, отложен на полировку.
- **Phase 4 status**: ✅ DEPLOYED. Board rendering работает после fixes: camera auto-fit (a36f87d) + first-byte SSE flush + thinking indicator (15a7bd6). User протестировал «объясни 245+874 в столбик» — работает. Speed/animation polish — отложено.
- **Phase 6 status**: ✅ **IMPLEMENTATION COMPLETE (2026-05-10).** Plan 06-01 + 06-02 shipped в Klassio. Manual UAT (real voice через VPN) deferred пользователю — см. `06-02-SUMMARY.md` § Manual UAT. Конфигурация агента залочена в `.planning/PHASE-6-SETUP-2026-05-10.md`:
  - ✅ Creator subscription ($11/$22) — saved $77/мо vs Pro
  - ✅ Custom LLM endpoint работает (OpenAI key через 11labs)
  - ✅ Voice: **Nataly** (Youthful, Gentle and Soft) + **Eleven Multilingual v2** (после отказа от v3 Alpha — глючил на русском)
  - ✅ LLM: **GPT-4.1 mini** (повышено с Nano — Nano галлюцинировал на арифметике; cost ~150₽/мес для 6 уроков)
  - ✅ Voice settings: Stability ~0.30, Similarity 0.75, Style 0.40, Speed 1.05
  - ✅ System Prompt finalized: gender-neutral для ребёнка (нет `(а)` скобок), женский род для себя, math accuracy rule (chain-of-thought перед похвалой), self-correction rule
  - ✅ Agent settings: Authentication ON, Allowlist (klassio-one.vercel.app + localhost:3000), First message override ON, Daily limit 100, bursting OFF
  - ✅ Advanced: Eagerness Normal, Take turn 10s, Max duration 3600s, Generate during silence ON, ASR keywords добавлены (дроби, периметр, etc.)
  - ✅ **Identifiers**: Agent ID = `agent_7701kr9c2v7eev3tabzv4f2b0e8b`, API key положен в `.env.local` (rотация после prod deploy)
  - ⚠️ **Open issues для plan 06-01 follow-up**: latency ~3s (можно срезать), потрескивание на first connect (network jitter, лечится Hetzner WS proxy позже)
  - ✅ **Plan 06-01 COMPLETE** (commits e549d39, 492f175, 40e1868, b12631e, 209e597): @elevenlabs/react SDK + lib/elevenlabs/ + signed-url route + 21 unit tests
  - ✅ **Plan 06-02 COMPLETE** (commits 8dc64de, ca87b0f, 5510696): VoicePanel rewrite (ConversationProvider + useConversation + mic-first + 4 Russian errors + bus wiring) + 17 component tests + 11 E2E tests (5 bus-driven + 1 fetch-fail UI + 5 bundle-leak scans). One Rule 1 deviation: SDK v1.6.0 API drift (useConversation now requires ConversationProvider; startSession/endSession return void). Resolved cleanly inside Task 1.
  - ⏳ **Next**: Manual UAT (D-09 #1–9) + Vercel env deploy (см. MANUAL-ACTIONS.md). Затем Phase 6.5 (Hetzner WS proxy) ИЛИ Phase 8 (Pedagogical LLM) ИЛИ Phase 10 (Recording).
- **Phase 7 status**: ✅ shell deployed; UX bugs (no retry after wrong answer, jitter) — pending редизайн.
- **Phases done implementation**: 1, 2, 3, 4, 5, 6, 7, 9 (8 из 12). Phase 6.5 — PENDING user action (Hetzner). Phases 8, 10, 11, 12 — depend on Phase 6.5 + user decisions.
- **Resume file для следующей сессии после /clear**: **`.planning/SESSION-2026-05-11-WRAPUP.md`** (главный — читать первым) + `.planning/STATE.md` (этот файл) + `.planning/MANUAL-ACTIONS.md` § Update #5.

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
| Phase 03-lesson-shell P03-03 | 12 | 3 tasks | 9 files |
| Phase 03-lesson-shell P03 | 12 | 3 tasks | 9 files |
| Phase 04-board-deploy P04-01 | 5 | 2 tasks | 11 files |
| Phase 04-board-deploy P04-02 | 4 | 2 tasks | 2 files |
| Phase 04-board-deploy P04-03 | 12 | 3 tasks | 9 files |
| Phase 05-scenes P05-01 | 13 | 3 tasks | 19 files |
| Phase 05-scenes P05-02 | 6 | 3 tasks | 16 files |
| Phase 07-trainer P07-02 | 10 | 3 tasks | 14 files |
| Phase 09-avatar P09-01 | 5 | 3 tasks | 11 files |
| Phase 06-voice P06-01 | 7 | 2 tasks | 5 files |
| Phase 08 P01 | 16min | 3 tasks | 11 files |
| Phase 08 P02 | 5min | 2 tasks | 5 files |
| Phase 08 P03 | 5min | 2 tasks | 3 files |
| Phase 08 P04 | 7 | 1 tasks | 2 files |
| Phase 08-agent-control P05 | 4min | 2 tasks | 2 files |
| Phase 08-agent-control P06 | 7min | 2 tasks | 4 files |
| Phase 08-agent-control P07 | 5min | 1 tasks | 1 files |

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

### Plan 08-02 decisions (executor — 2026-05-13)

- **Record<string, unknown> typing on client tool parameters**: matches @elevenlabs/react ClientTool signature exactly; each handler reads `parameters.taskId` / `.prompt` / etc. and runtime-checks the type before use. Static destructuring would coerce undefined to string and defeat T-08-02-01 (Spoofing via LLM-hallucinated arg shapes). Pattern for all future client tool factories.
- **getTaskTopic empty fallback uses taskId itself in mini-recap** (not empty string): preserves single-line legibility when trainerConfig lacks topic metadata. `Тема task-3: task-3.` reads less confusingly than `Тема task-3: .`. May revisit in Phase 8.5 if richer trainerConfig.task.topic field lands.
- **Russian plural simplified to genitive `ошибок:` for ≥1 mistakes**: full 3-form Russian pluralization deferred per plan body MVP acceptable rationale. Mathematically correct for counts ≥ 2, acceptable for count 1 in informal/log register. Tests assert exact string `ошибок: 2`.
- **All client tool handlers synchronous (no async keyword)**: matches SDK return type `string | number | void` and the `< 50ms` fire-and-forget timing test. Heavy work (e.g. /api/draw SSE stream) is started but NOT awaited — bus.emit('board:draw_request') hands off to BoardPanel (plan 08-05) which runs the SSE pipeline. Supports INV-02 directly.
- **No formatter exported for the focus-on-task trainer event**: D-08 allow-list discipline locked via the negative-space test in contextual-update-formatters.test.ts. Both files (formatters.ts + index.ts) avoid even mentioning the event name in comments to satisfy literal `grep -q "task_focused\|TaskFocused"` acceptance checks while documenting intent through natural-language description.

### Plan 08-03 decisions (executor — 2026-05-13)

- **Two-file split: scripts/restore-agent-config-body.mjs (pure) + scripts/restore-agent-config.mjs (orchestrator)**: Pure ESM body builder factored out of orchestrator so the PATCH payload shape (6 client tool definitions, voice/LLM/prompt structure) is vitest-testable without invoking fetch. The split mirrors plan 08-02's pure-lib pattern: side effects (fetch, readFileSync, process.env) on one side of an import boundary, pure logic on the other.
- **PHASE_8_TOOLS embedded inline in body module (OQ-5 resolution)**: Operator scp's the script to the Frankfurt VPS (RU IPs are flaky against 11labs); loading external JSON config would require bundling or path assumptions and break portability. Inline ESM constants are simplest and trivially diff-reviewable when extending in future phases.
- **Russian tool descriptions (not English)**: The 11labs LLM reads descriptions in its system context to decide WHEN to call each tool. Nataly's system prompt + ASR + TTS are all Russian; English descriptions would be the odd one out and could degrade tool-selection quality. Coherent monolingual context is the safer default.
- **execution_mode: 'immediate' + expects_response: true for all 6 tools**: Combination supports D-09 fire-and-forget (Nataly continues speaking while tool runs) AND feeds back the ack/error string so she can react to failures ("Error: board unavailable, narrate verbally" → falls back to voice explanation). expects_response:false would lose the error feedback channel; post_tool_speech would force Nataly to stop speaking until tool returns, breaking INV-02.
- **PATCH body key locked at conversation_config (snake_case, singular)**: VERIFIED working in Phase 6.5 production. Module header has a CRITICAL note warning against drifting to the adjective-form key shown in some API references. Documented prominently because the discrepancy was discovered in research and silently breaking this would silently fail PATCH (11labs ignores unknown keys).
- **PHASE-6-SETUP § 9.5 is additive (§ 9 baseline preserved verbatim)**: Diff is +78 / -0 lines. Phase 6 reproducibility intact — operators can still reproduce the Phase 6 baseline state by truncating /tmp/klassio-prompt.txt to just the § 9 content. Phase 8 extension is purely a concatenation at the end.
- **LLM-01 NOT marked complete in REQUIREMENTS.md**: This plan delivers only the agent-config piece; full LLM-01 also requires VoicePanel wiring (08-04), BoardPanel subscriber (08-05), periodic checkpoint (08-06). Consistent with siblings 08-01 + 08-02 which deferred LLM-01 completion to phase-end. Verifier or phase-completion plan marks it.

### Plan 06-01 decisions (executor — 2026-05-10)

- **Caret range ^1.6.0 for @elevenlabs/react**: 3-day-old release; minor patches expected — caret matches resend/pg/drizzle pinning style. Tldraw/openai/next/next-auth are pinned-exact because minor bumps broke builds; 11labs has no such history yet.
- **Did NOT extend lib/env.ts with ELEVENLABS_***: kept it per-request guarded inside the handler (`process.env.X || 500 'Voice service не настроен'`). Matches OPENAI_API_KEY pattern from draw route — zod is reserved for boot-time env + content schemas, NOT route handler input.
- **Did NOT add 'connected' to voice:state union (Option B)**: RESEARCH § Open Q3 recommended no-modify. onConnect maps to bus.emit('voice:state', {state: 'idle'}) until first onModeChange fires. Avoids touching lib/avatar/state-machine.ts (Phase 9 territory).
- **Topic returned in response body (defense-in-depth)**: `{signedUrl, topic}` — VoicePanel uses server-authoritative topic for firstMessage override, NOT request body. Resolves RESEARCH § Open Q4.
- **VoiceErrorKind is a flat string union, not a discriminated payload**: matches lib/lesson-bus/events.ts VoiceStatePayload shape — no `type` discriminator needed because consumers switch on the string for 5 Russian error messages (RESEARCH § Pitfall 1).
- **Auth before body parse — load-bearing order**: tested via unit test (request with malformed JSON + auth() returning null asserts 401 not 400). Prevents malformed-body DOS bypassing auth.
- **vi.hoisted + vi.stubGlobal for fetch mock**: first such test in repo. Vitest 4.x hoisting requires `vi.hoisted(() => {const fetchMock = vi.fn(); return {fetchMock}})` before `vi.stubGlobal('fetch', fetchMock)`. Reset via `fetchMock.mockReset()` in `beforeEach`. Pattern to reuse for future HTTP-wrapping libs.

### Plan 09-01 decisions (executor — 2026-05-10)

- **CSS animations over Lottie (D-03, D-08)**: Phase 9 SHELL uses emoji + CSS @keyframes. Lottie deferred to Phase 9.1 when designer assets available. CSS is cheaper (D-08 FPS budget) and swappable.
- **useReducer over XState (D-04)**: Linear 6-state machine with no nested/parallel regions. XState overhead unjustified.
- **window.__lessonBus in LessonBusProvider useEffect**: Co-located with bus lifecycle. NODE_ENV !== 'production' guard. Cleanup on unmount. Pattern formalised for E2E in Phase 9 (was ad-hoc in Phase 7).
- **2-wrong-streak threshold = 2 (D-05)**: wrongStreakRef (useRef) tracks consecutive wrong answers. Resets on correct. Sad on >=2 consecutive wrong. Consistent with D-05.
- **useRef for timer + streak**: Timer and streak counter are side-effect state — no visual output. Using state would add unnecessary re-renders. Consistent with Phase 7 useTrainerIdle pattern.

### Plan 07-02 decisions (executor — 2026-05-10)

- **config-loader throws (not returns null)**: Explicit error semantics; callers use .catch(() => null) at page.tsx level. Matches Next.js RSC conventions for graceful degradation without silent failures.
- **hintLevelOverride via Math.max**: Task component local state is source of truth; bot override only advances (never retreats) the hint display. Prevents race conditions between local user clicks and bot commands.
- **Voice integration deferred to Phase 8**: trainer:answer_submitted events are emitted by task components but no bot reactions wired yet. Phase 8 TODO comment added at top of trainer-panel.tsx.
- **E2E lesson-shell.spec.ts updated (deviation Rule 1)**: Old counter-based tests removed (TrainerPanel no longer has event counter). Replaced with placeholder visibility assertions.

### Plan 07-01 decisions (executor — 2026-05-10)

- **useRef for idle state (not useState)**: lastActivityAt, lastEmitAt, intervalRef are refs — polling is a side effect with no visual output. Zero re-renders needed from useTrainerIdle.
- **MatchingTask stable shuffle via localeCompare(item+seed)**: Deterministic per task.id, SSR-safe. No Math.random to avoid hydration mismatch.
- **tasks.min(1) in schema per critical constraint**: Empty tasks array rejected by trainerConfigSchema. Plan action body showed no min but critical constraints #2 require min(1).
- **vi.mock + await import() for test isolation**: Mock @/lib/lesson-bus before dynamic import of component — simpler than real LessonBusProvider, avoids circular import issues in vitest.

### Plan 05-02 decisions (executor — 2026-05-10)

- **explainSimpleEquation uses explicit type='multiply'|'add' discriminant**: Avoids coefficient-sign inference heuristics. Cleaner LLM schema, unambiguous TypeError for invalid type.
- **explainDecimalMultiplication uses toFixed(totalDec) and strips trailing zeros**: Avoids floating-point display artifacts (0.1×0.2=0.020000000000000004) at MVP without complex rounding logic. T-05-02-04 accepted as-is.
- **explainLongDivision skips leading digit groups < divisor on first position**: Matches standard Russian уголок curriculum (first quotient group collects leftmost digits until sum >= divisor). No leading zero digit in quotient.
- **Rectangle visual size capped at 280×180 with Math.max(60,dim*20) floor**: Ensures visible rectangle even for width=height=1 while capping large numbers.

### Plan 05-01 decisions (executor — 2026-05-10)

- **allBoardTools count is 24 not 25**: Plan said "9 + 15 + finish = 25" but finish is already in the 9 drawTools — actual count is 24. The must_haves say "LLM receives 24+ tools" which is satisfied.
- **Side-effect import pattern for registry**: Each scene file calls registerScene() at module load time. Route.ts imports all 8 scene files as side effects. Avoids circular imports.
- **Test mock via _streamFactory variable**: Module-level _streamFactory variable lets each test override the OpenAI stream mock without re-hoisting vi.mock.

### Plan 04-03 decisions (executor — 2026-05-10)

- **executeDraw(promptText) accepts explicit string:** Chip click sets prompt state AND calls executeDraw(suggestion) directly. handleDraw() reads from `prompt` state which may not flush before executeDraw runs. Passing the string explicitly avoids the React batching race entirely.
- **tldraw CSS at component level:** `import 'tldraw/tldraw.css'` in board-panel.tsx with a `tldraw-container` wrapper div. Component-level import scopes the CSS and avoids global Tailwind v4 conflicts. Build verified clean.
- **vi.mock('next/dynamic') for unit tests:** Mock returns synchronous stub that calls `onMount` with a mock editor in useEffect. Allows testing BoardPanel prompt/chip/submit flow without tldraw DOM dependencies in vitest happy-dom.
- **E2E: no form submission:** Board E2E specs assert only UI presence and chip interaction. No OpenAI calls, no SSE wait. Avoids OPENAI_API_KEY dependency in CI and SSE timing flakiness.

### Plan 04-02 decisions (executor — 2026-05-10)

- **OpenAI mock uses function constructor (not arrow):** Arrow functions cannot be used with `new`. The route calls `new OpenAI({ apiKey })`, so the vi.mock must use `function MockOpenAI() { return {...} }` rather than `vi.fn().mockImplementation(()=>({...}))`.
- **process.env.OPENAI_API_KEY set inline in happy-path tests:** Route checks for missing key after ownership verification. Setting it per-test (with cleanup) is simpler than mocking lib/env.
- **Error messages 401/403/400 in Russian per constraint:** "Войдите в систему" (401), "Промпт обязателен" (400), "lessonId обязателен" (400), "Этот урок не ваш" (403). Server logs remain English.

### Plan 03-03 decisions (executor — 2026-05-10)

- **Single render of panels (no DOM duplicates)**: Rendering panels once inside a single `flex lg:grid` parent avoids duplicate elements in DOM. Earlier dual-container approach (one for tablet, one for desktop) caused E2E selectors to find CSS-hidden copies first.
- **AlertDialogTrigger styled directly**: base-ui Trigger renders its own native `<button>`. Wrapping shadcn `<Button>` inside it creates button-in-button DOM nesting error. Solution: apply buttonVariants CSS directly as className on AlertDialogTrigger.
- **E2E seeds lesson as in_progress**: Direct seed to status='in_progress' avoids pg transition DML on first page load during E2E, eliminating timing race conditions.
- **Mock end-lesson server action in Vitest**: Server action imports next-auth which imports next/server (server-only), incompatible with vitest happy-dom. `vi.mock('@/app/lesson/[id]/end-lesson')` severs the chain at import time.
- **LessonShell receives only string primitives from RSC**: lessonId (UUID string) + topic (string) — no Date objects across the RSC→Client boundary.

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

- ✅ Plan 06-01 Voice server foundation — complete (2 TDD tasks, 4 commits, 21 new tests passing). @elevenlabs/react@^1.6.0 + lib/elevenlabs/{types,get-signed-url}.ts + POST /api/voice/signed-url. VOI-01 satisfied. Plan 06-02 (VoicePanel UI + E2E) unblocked.
- ✅ Plan 09-01 Avatar SHELL — complete (3 tasks, 301 tests passing). 6-state emoji avatar with CSS animations, state machine, VoicePanel rewrite, window.__lessonBus, 3 E2E specs. VOI-02 satisfied.
- ✅ Plan 01-01 Bootstrap — complete (3 tasks, 5 tests passing).
- ✅ Plan 01-02 Account provisioning — complete (Neon + Resend + AUTH_SECRET provisioned; A1 silent-drop resolved; Vercel Hobby decision recorded).
- ✅ Plan 01-03 Schema push + seed — complete (2 tasks, 2 commits, 12 tests passing). 6 Drizzle tables in live Neon DB; seed idempotent; custom db-push.ts for Neon ECONNRESET quirk.
- ✅ Plan 01-04 — Magic link auth — complete (NextAuth v5 split-config, DrizzleAdapter, whitelist, Resend template; 24 unit + 9 integration tests green).
- ✅ Plan 01-05 — UI routes — complete (5 routes in Russian, 35 tests, shadcn/ui + Tailwind v4).
- ✅ Plan 01-06 — E2E suite — implementation complete (8 spec files, 10 E2E tests green locally; deploy deferred).
- ✅ Plan 03-01 — Lesson timestamps schema — complete (actual_start_at + actual_end_at columns in Neon, idempotent migration).
- ✅ Plan 03-02 — Event bus core — complete (LessonBus class, LessonBusEvent union, LessonBusProvider, useLessonBus + useLessonBusEvent hooks; 10 bus tests green).
- ✅ Plan 03-03 — Lesson shell — complete (lesson page + LessonShell + 3 panels + E2E; LES-01 satisfied; 81 unit + 20 E2E green).
- ✅ Plan 04-01 — Board library layer — complete (tldraw executor + tools schema, 23 tests, instrumentation.ts).
- ✅ Plan 04-02 — SSE draw endpoint — complete (POST /api/draw with auth + ownership + agent loop, 8 tests, 112 total).
- **USER ACTION REQUIRED:** Complete Phase 1 production deploy + RU email test — см. `.planning/MANUAL-ACTIONS.md` Phase 1 Wave 6 Task 3.
- **Phase 4 prerequisite:** Перед Phase 4 (production deploy) апгрейднуть Vercel **Hobby → Pro** ($20/мо). Hobby ToS запрещает commercial use — как только первый beta-юзер откроет URL, нужен Pro. Решение зафиксировано в плане 01-02 SUMMARY и COSTS.md § 7 Tracking.
- (Опционально) формализовать какое-либо из 8 locked decisions как ADR через `/gsd-add-decision`.
- (Параллельно) ты ведёшь визуальный дизайн ЛК в Claude Design (https://claude.com/design); как появятся макеты — переносим tokens (цвета, типографика) в `tailwind.config` Klassio.

### Active blockers

- Нет.

---

## Session Continuity

- **Last session**: 2026-05-13 — Plan 08-02 executed (Wave 1 GREEN pure-lib implementation — lib/lesson-state + lib/contextual-updates + lib/client-tools). 2 commits (d9af6d2, 3e48276). 20/20 target tests GREEN (4 lesson-state + 8 contextual-update-formatters + 8 client-tool-handlers). tsc --noEmit clean. Other Wave 0 RED scaffolds (08-03/04/06/07/08) intentionally still RED. LLM-01 + PED-02 partial (full completion requires plans 08-03 through 08-08).
- **Next session entry point**: Plan 08-03 (Wave 1 agent config — scripts/restore-agent-config-body.mjs builder + extended restore-agent-config.mjs + PHASE-6-SETUP § 9.5 addendum). Parallel-safe with 08-02 since 08-03 is a Node.js script with no shared imports.
- **What new Claude Code session needs to read first** (порядок):
  1. `PROJECT.md` — core value, locked decisions, anti-scope, invariants.
  2. `STATE.md` (этот файл) — где мы сейчас, что блокирует.
  3. `ROADMAP.md` — phase, в котором работаем (Phase 1 на старте).
  4. `REQUIREMENTS.md` — конкретные acceptance criteria для requirements фазы.
  5. (По необходимости) `.planning/intel/constraints.md` — для специфических технических ограничений.
  6. (По необходимости) `BOARD-STATUS.md` и `.planning/intel/context.md` — для grаблищ прошлых сессий и сетевой саги.
- **Что НЕ нужно перечитывать каждую сессию**: VISION.md (core отжата в PROJECT.md), BOARD-STACK.md (контракты в `.planning/intel/constraints.md`).

**Planned Phase:** 8 (agent-control) — 8 plans — 2026-05-13T14:15:16.180Z
