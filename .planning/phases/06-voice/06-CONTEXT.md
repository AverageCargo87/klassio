# Phase 6: Голос — 11labs Conversational AI через Hetzner WS-прокси — Context

**Status:** BLOCKED — DEFERRED to user manual action (Phase 6 contains $-significant decisions Claude cannot make autonomously)
**Mode:** `--auto` (autonomous run hit blocking dependencies; deferred per user's "ручное отмечай" directive)

<domain>
## Phase Boundary

Голосовой учитель говорит по-русски в браузере ребёнка из РФ без VPN. 11labs Conversational AI (Path A — готовый продукт) через Hetzner Frankfurt WS-proxy. API ключи только на сервере.

</domain>

<why_blocked>
## Why this phase is blocked for autonomous run

Phase 6 содержит **четыре блокирующих внешних артефакта** которые Claude не может создать или решить автономно:

1. **$99/мес 11labs Pro commitment** (CON-board-cost watermark — главный financial milestone)
   - Custom LLM endpoint требуется в Pro (не Business $1320). Per project pointer: "Перед Phase 6 верифицировать что Custom LLM endpoint доступен в Pro".
   - User должен подтвердить готовность платить + проверить tier.

2. **11labs аккаунт + способ оплаты для нерезидента РФ**
   - Per REQ-voice-agent: "Платежи 11labs — нерезидентская карта или посредник (out of dev scope, но залок для prod-доступа)"
   - User должен решить и провести платёжный флоу.

3. **Hetzner server provisioning** (Frankfurt CCX13/CPX21 ~€10/мес)
   - SSH key generation
   - Server creation
   - SSH access setup
   - DNS pointer
   - Firewall config
   - Все шаги требуют user'а в Hetzner cloud console.

4. **Voice selection + child approval**
   - Per success criterion #5: «тестовая выборка реплик прослушана и одобрена для возрастной категории 9–11 лет»
   - Требует user'а слушать voice samples + ребёнка тестировать
   - Subjective decision (которая русская озвучка комфортна детям 9-11)

</why_blocked>

<draft_decisions>
## Draft Decisions (for user review when unblocking)

These are Claude's recommended defaults. User should confirm/override before Phase 6 execution.

- **D-01 — 11labs Pro tier ($99/мес)** — assumes Custom LLM endpoint available; verify before subscribing.
- **D-02 — Hetzner CCX13** (€10/мес, 2 vCPU, 8 GB RAM) — overkill для Phase 6 WS proxy, но даёт headroom для Phase 8 Pedagogical LLM (если Hetzner-hosted) и recording (Phase 10 если поднимаем S3 на Hetzner).
- **D-03 — WS proxy implementation: Node.js + ws library** на Hetzner. Простой forward: client WS ↔ Hetzner ↔ 11labs. Auth: session cookie из Klassio (Vercel) → Hetzner проверяет через shared HMAC secret (Vercel injects user_id signed token; Hetzner validates).
- **D-04 — Voice candidate**: «Sergey» (multilingual v2) или «Anna» (multilingual v2). Final pick требует прослушать sample на детях.
- **D-05 — Custom LLM endpoint в Phase 6 = заглушка** (gpt-4o-mini напрямую без Pedagogical/Realtime split). Phase 8 заменит на real LLM-01 architecture.
- **D-06 — Hetzner deploy: PM2 + nginx-ssl** или Docker. Phase 6 пишем PM2 для скорости, Docker если есть time.
- **D-07 — Bus integration**: voice agent emits `voice:state` (idle/listening/speaking/thinking) и `voice:say` (текст что бот произнёс) на lesson-bus. Board panel слушает `voice:say` для синхронизации с tldraw (готовка к Phase 11 stroke + SSML).
- **D-08 — `board:say` event** (added в Phase 4 stub) wires to voice TTS в Phase 6 — board scenes которые yield `say` primitive triggers voice.

</draft_decisions>

<execution_blocked_until>
## Execution unblocked when user provides

1. **11labs account active** with Custom LLM endpoint enabled (Pro plan $99/mo or higher tier confirmed)
2. **11labs API key** — placed in `.env.local` as `ELEVENLABS_API_KEY=` (NOT committed)
3. **Hetzner server up** — SSH access working from user's machine, public IP captured
4. **Voice ID selected** — confirmed RU voice ID from 11labs dashboard
5. **HMAC secret** generated for Vercel↔Hetzner trust handshake
6. **Decision on Custom LLM endpoint** — for Phase 6 use stub (gpt-4o-mini), or wait for Phase 8?

После выполнения этих 6 пунктов user сообщает Claude «Phase 6 unblocked», и Claude:
- Перезапустит discuss-phase 6 с реальными credentials
- Сгенерирует plans (1) deploy WS proxy на Hetzner, (2) wire 11labs Agent в Klassio frontend, (3) E2E test
- Выполнит plans автономно

</execution_blocked_until>

<canonical_refs>
- `.planning/PROJECT.md` § DEC-voice-provider-mvp (11labs Path A)
- `.planning/REQUIREMENTS.md` § VOI-01
- `.planning/ROADMAP.md` § Phase 6 (6 success criteria)
- `.planning/intel/constraints.md` § CON-openai-rf-block, CON-anthropic-rf-block
- `.planning/intel/context.md` § Network saga (Cloudflare/Vercel routing)
- `.planning/MANUAL-ACTIONS.md` § Phase 6 (detailed step-by-step for user)

</canonical_refs>
