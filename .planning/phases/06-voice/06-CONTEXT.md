# Phase 6: Голос — 11labs Conversational AI (Klassio frontend integration) — Context

**Status:** Ready for planning
**Updated:** 2026-05-11 (was DEFERRED in 2026-05-09 draft; now baseline complete in 11labs)
**Mode:** standard (subscription активна, agent baseline протестирован, Hetzner WS proxy DEFERRED)
**Source of truth (read first):** `.planning/PHASE-6-SETUP-2026-05-10.md`

<domain>
## Phase Boundary

Голосовой учитель говорит по-русски в браузере **dev-юзера через VPN-туннель** (для smoke). Hetzner WS-proxy для РФ-юзеров без VPN отложен на отдельный sub-phase (6.5) — поставится перед первым beta-юзером в РФ.

В этой фазе:
- Подключаем 11labs Conversational AI Klassio agent (`agent_7701kr9c2v7eev3tabzv4f2b0e8b`) к VoicePanel в lesson UI
- Server-side эндпойнт генерирует signed WebSocket URL (Authentication=ON на agent)
- Browser использует `@elevenlabs/react` SDK для подключения через signed URL
- При старте conversation передаём `lesson_topic` через **first_message override** (System prompt НЕ override-им)
- Wire `voice:state` event bus → avatar (Phase 9 contract уже готов: `listening` 👂, `speaking` 🗣️, `idle` 🙂)
- API ключи **только server-side** (`ELEVENLABS_API_KEY`, `ELEVENLABS_AGENT_ID` без `NEXT_PUBLIC_` — клиент дёргает `/api/voice/signed-url`)

</domain>

<locked_decisions>
## Locked Decisions (final, baseline tested)

### D-01 — 11labs subscription tier: Creator $22 ✅
**(was Pro $99 in original draft)**
- Creator achieves Custom LLM endpoint feature.
- Saved $77/мес (~6 160 ₽/мес) vs original Pro recommendation.
- Phase 6 watermark в COSTS.md обновлён (commit 79c5791).

### D-02 — Hetzner WS proxy: DEFERRED to Phase 6.5
- Не нужен для dev (VPN handles `openai.com`/`elevenlabs.io` блок).
- Поставим перед: (a) первый РФ-юзер без VPN, (b) public beta launch.
- Klassio frontend в этой фазе подключается **напрямую** к 11labs WebSocket (signed URL).

### D-03 — LLM model: GPT-4.1 mini ✅
**(was GPT-4.1 Nano in early test)**
- Nano галлюцинировал на двузначной арифметике (подтвердил 25+48=70). Mini fixes.
- Cost ~150 ₽/мес для 6 уроков (vs 39 ₽ Nano) — копейки vs honest math.
- Connected through 11labs Custom LLM endpoint, наш `OPENAI_API_KEY`.

### D-04 — TTS / Voice
- **Voice**: Nataly (Youthful, Gentle and Soft) — молодой женский, мягкий
- **TTS family**: Eleven Multilingual v2 (rock-solid для русского)
  - **NOT v3 Conversational Alpha** — глючил на русском (повторы, «инопланетный язык»). Audio tags `[warmly]` убраны из промпта.
- Voice settings в 11labs UI: Stability 0.30, Similarity 0.75, Style 0.40, Speed 1.05
- voice_id **не нужен в коде** — голос привязан к Agent ID на 11labs стороне.

### D-05 — Server-only env vars (no client exposure)
- `ELEVENLABS_API_KEY` — server-side, для `getSignedUrl` API call
- `ELEVENLABS_AGENT_ID` — server-side, передаётся в `getSignedUrl(agentId, apiKey)`
- Клиент НИКОГДА не видит ни ключ ни Agent ID
- Authentication=ON на агенте + signed URL — единственный валидный путь подключения

### D-06 — Override policy
- ✅ Разрешено override: `first_message` (для передачи `lesson_topic` + (когда добавим в БД) `child_name`)
- ❌ НЕ разрешено override: `system_prompt`, `LLM`, `voice` (security)
- Override настроен в 11labs Security tab: только First message ON

### D-07 — Bus events
- Phase 9 уже создал contract: `voice:state` (`idle | connected | listening | speaking`) и `avatar:emotion` (`happy | sad | thinking | neutral`)
- 11labs SDK callbacks → bus events:
  - `onConnect` → `voice:state` `connected`
  - `onModeChange({mode:'listening'})` → `voice:state` `listening` (avatar listens 👂)
  - `onModeChange({mode:'speaking'})` → `voice:state` `speaking` (avatar speaks 🗣️)
  - `onDisconnect` → `voice:state` `idle`
  - `onError(err)` → toast + log
- `board:say` event (Phase 4 stub) — пока **не подключаем** к voice TTS. Phase 8 wire это вместе с Pedagogical LLM.

### D-08 — Out of scope for Phase 6 (defer)
- ❌ Custom tools (`trigger_board_scene`, `highlight_trainer_task`, `get_lesson_state`, `praise_or_redirect`) — Phase 8
- ❌ Audio recording (152-ФЗ согласие, S3 storage) — Phase 10
- ❌ Hetzner WS proxy — Phase 6.5
- ❌ Pedagogical LLM tier (slow GPT-4o for proactive triggers) — Phase 8
- ❌ Real Russian beta-user smoke test без VPN — после Hetzner unblock

### D-09 — UAT-критерий для Phase 6
Dev успешно проходит:
1. Логинится в Klassio через magic link
2. Открывает lesson page
3. Жмёт «Запустить голос» в VoicePanel
4. Браузер запрашивает доступ к микрофону (mic permission flow)
5. Говорит в микрофон → бот отвечает голосом по-русски (Nataly через Multilingual v2)
6. Avatar в VoicePanel реагирует: 👂 когда юзер говорит, 🗣️ когда бот говорит, 🙂 в idle
7. Тема урока (из БД, передаётся через first_message override) фигурирует в greeting агента
8. Жмёт «Stop» → conversation корректно завершается, avatar → idle
9. Reload page → можно начать заново
10. DevTools Network: `ELEVENLABS_API_KEY` отсутствует в client bundle/network requests; signed URL в WS-handshake содержит signature но не сам ключ

</locked_decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Phase 6 source of truth (final config)
- `.planning/PHASE-6-SETUP-2026-05-10.md` — финальная конфигурация 11labs agent (System Prompt, voice settings, Security, Advanced, Tools, Identifiers, plan 06-01 scope)

### Project decisions
- `.planning/PROJECT.md` § DEC-voice-provider-mvp (11labs Path A — confirmed)
- `.planning/PROJECT.md` § DEC-deploy-architecture (Vercel + Hetzner Frankfurt + Cloudflare — Hetzner deferred to 6.5)
- `.planning/PROJECT.md` § DEC-llm-architecture-tier (Pedagogical + Realtime — Phase 6 only Realtime via Custom LLM)

### Phase 6 requirements
- `.planning/REQUIREMENTS.md` § VOI-01 (11labs Agents с Custom LLM endpoint)
- `.planning/ROADMAP.md` § Phase 6 (6 success criteria)

### Cross-phase contracts
- `.planning/phases/03-lesson-shell/03-01-PLAN.md` — schema migration (lesson.actual_start_at/end_at)
- `.planning/phases/03-lesson-shell/03-02-PLAN.md` — LessonBus event contract (Phase 3, used here)
- `.planning/phases/03-lesson-shell/03-03-PLAN.md` — LessonShell + 3 panels (VoicePanel placeholder lives here)
- `.planning/phases/04-board-deploy/04-02-PLAN.md` — POST /api/draw SSE pattern (auth + ownership + zod-free validation — копируем pattern для /api/voice/signed-url)
- `.planning/phases/09-avatar/09-01-PLAN.md` — Avatar state machine + voice:state event contract (already lives in lib/lesson-bus/types.ts)

### Constraints
- `.planning/intel/constraints.md` § CON-openai-rf-block (OpenAI режет РФ — для dev VPN, 11labs ходит к OpenAI с серверной стороны US)
- `.planning/intel/constraints.md` § CON-runtime-versions (Next.js 15.5.18 App Router, React 18, TypeScript strict)

### External (research will fetch)
- `https://elevenlabs.io/docs/conversational-ai/quickstart` — getting started
- `https://elevenlabs.io/docs/conversational-ai/customization/authentication` — signed URL flow
- `https://elevenlabs.io/docs/conversational-ai/customization/llm/customize-llm-prompt#dynamic-variables` — first_message override / dynamic variables
- `https://www.npmjs.com/package/@elevenlabs/react` — React hook SDK
- `useConversation` hook API surface, callback contract

</canonical_refs>

<specifics>
## Specifics — files to create / modify (planning-mapper input)

### NEW
- `app/api/voice/signed-url/route.ts` — Next.js Route Handler (POST):
  - `auth()` guard (NextAuth) → 401 «Войдите в систему»
  - Parse JSON `{ lessonId: string }` → 400 «lessonId обязателен» if missing
  - Drizzle ownership check `WHERE lesson.id = lessonId AND lesson.userId = session.user.id` → 403 «Этот урок не ваш»
  - Read `process.env.ELEVENLABS_API_KEY` + `process.env.ELEVENLABS_AGENT_ID` → 500 «Voice service не настроен» if missing
  - Call `lib/elevenlabs/get-signed-url.ts` → returns `{ signedUrl: string }`
  - JSON response with signed URL + lesson topic (for client to use as first_message override)
- `lib/elevenlabs/get-signed-url.ts` — server util:
  - `getSignedUrl(agentId: string, apiKey: string): Promise<string>`
  - GET `https://api.elevenlabs.io/v1/convai/conversation/get-signed-url?agent_id={agentId}` with header `xi-api-key: {apiKey}`
  - Returns `data.signed_url` from JSON response
  - Throws on non-200
- `lib/elevenlabs/types.ts` — TypeScript types for SDK callbacks (Mode, ConversationStatus)
- `e2e/voice-flow.spec.ts` — Playwright:
  - Login as test user (cookie injection via `tests/fixtures/db-setup.ts`)
  - Navigate to lesson page
  - Mock `@elevenlabs/react` `useConversation` (vi.mock at module level — NOT actual 11labs connect)
  - Click «Запустить голос» button
  - Assert window.__lessonBus emits `voice:state` event with `connected`
  - Assert avatar state changes after mocked `onModeChange`
  - Assert `Stop` returns to idle

### MODIFY
- `components/panels/voice-panel.tsx` — replace Phase 6 placeholder:
  - Add «Запустить голос» / «Stop» mic button (shadcn Button)
  - Use `useConversation` from `@elevenlabs/react`:
    - `onConnect` → bus.emit('voice:state', { state: 'connected' })
    - `onModeChange({mode})` → bus.emit('voice:state', { state: mode })  (mode: 'listening' | 'speaking')
    - `onDisconnect` → bus.emit('voice:state', { state: 'idle' })
    - `onError(err)` → toast + console.error
  - On click «Start»: fetch `/api/voice/signed-url` → call `conversation.startSession({ signedUrl, overrides: { firstMessage: ... } })`
  - mic permission UX: if browser denies — show error message «Разрешите доступ к микрофону»
  - Strip Phase 6 placeholder text

- `lib/lesson-bus/types.ts` — extend `voice:state` payload variants:
  - Currently has: `idle | listening | speaking` (Phase 9)
  - Add: `connected` (state between mic-grab and first user/agent turn)
  - Already has full discriminated union shape — just add to union

- `package.json` — add `@elevenlabs/react` dependency (latest)

- `.env.example` — already has `ELEVENLABS_API_KEY` + `ELEVENLABS_AGENT_ID` (committed earlier)

### TOUCH (verify exists, no changes expected)
- `lib/auth.ts` / `auth.ts` — `auth()` function from NextAuth (used in /api/voice/signed-url)
- `lib/db/schema.ts` — lesson table (for ownership check)
- `app/lesson/[id]/page.tsx` — passes `lessonId` and `topic` to LessonShell → VoicePanel

</specifics>

<deferred>
## Deferred Ideas

These are explicitly NOT in scope for plan 06-01:

- ❌ Hetzner WS proxy — Phase 6.5
- ❌ Custom tools `trigger_board_scene` etc. — Phase 8
- ❌ Audio recording / 152-ФЗ — Phase 10
- ❌ Pedagogical LLM (slow proactive tier) — Phase 8
- ❌ `child_gender` in DB + override — Phase 6.5 or follow-up (currently using gender-neutral в System Prompt)
- ❌ Latency optimization (Eagerness=High, Turbo v2.5) — measure first после frontend integration, оптимизировать в follow-up
- ❌ Hetzner WS proxy РФ smoke test — после 6.5
- ❌ API key ротация — manual user action после первого prod deploy (recorded in MANUAL-ACTIONS.md)

## Open Questions / Test Plan

**Latency budget:** ~3s baseline в 11labs Test UI. Цель prod: <2.5s. Если frontend integration ещё добавит 200-500ms (из-за signed URL fetch + WS handshake) — total ~3.5s. Acceptable for Phase 6 acceptance, optimize in 6.5.

**Network audio crackling:** наблюдалось в Test Agent UI на dev VPN. Не блокер — VPN добавляет jitter. Hetzner WS proxy в РФ устранит для прод-юзеров.

</deferred>

---

*Phase: 06-voice*
*Context updated: 2026-05-11 (after baseline test session 2026-05-10)*
*Original draft: 2026-05-09 (was DEFERRED awaiting subscription)*
