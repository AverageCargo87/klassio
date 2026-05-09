# Intel Synthesis Summary

> Single entry point for downstream consumers (`gsd-roadmapper`).
> Synthesized by `gsd-doc-synthesizer` on 2026-05-09.
> Mode: new (greenfield ingest, no existing .planning files).
> Precedence: ADR > SPEC > PRD > DOC.

---

## Project context (one-paragraph)

Платный AI-репетитор математики для российских пятиклассников, продаваемый на Авито под видом обычного репетитора. Урок = одно веб-приложение из трёх компонентов: голосовой агент (11labs Path A, планируется), HTML-тренажёр (планируется), интерактивная доска tldraw (рабочий прототип). Инвариант: голос + рука + текст синхронно. Главные технические ограничения — IP-блок OpenAI и TLS-фингерпринт-блок Anthropic для российских IP.

---

## Doc counts by type

- **PRD**: 1 (VISION.md, manifest_override)
- **SPEC**: 1 (BOARD-STACK.md, manifest_override)
- **DOC**: 1 (BOARD-STATUS.md, manifest_override)
- **ADR**: 0
- **UNKNOWN**: 0
- **Total**: 3 docs synthesized

---

## Decisions

- **Locked decisions**: 0 (no formal ADRs in ingest set)
- **De-facto decisions surfaced** (not locked): 8
  - DEC-board-llm-provider — OpenAI as primary LLM provider for board
  - DEC-board-current-model — gpt-4o-mini as current production model for board
  - DEC-board-canvas-stack — tldraw v3 + Next.js 15 App Router + React 18
  - DEC-board-tool-choice-required — `tool_choice: 'required'` + служебный `finish` tool
  - DEC-deploy-architecture — Vercel + Hetzner Frankfurt + Cloudflare
  - DEC-voice-provider-mvp — 11labs Conversational AI (Path A) для MVP голоса
  - DEC-avatar-style — 2D Lottie аватар
  - DEC-llm-architecture-tier — Двухуровневая LLM (Pedagogical + Realtime)

See: `.planning/intel/decisions.md`. None of these can be auto-locked by synthesis. Roadmapper / user should decide which to formalize as locked ADRs.

---

## Requirements (16)

Extracted from VISION.md (PRD):

- REQ-product-positioning — Платный AI-репетитор математики 5 класса под видом обычного репетитора
- REQ-customer-journey — 8-шаговый клиентский путь от Авито до отчёта родителю
- REQ-three-pillars — Три кита урока: HTML-урок + голосовой агент + интерактивная доска
- REQ-html-trainer — Персональный HTML-урок с контрактом data-атрибутов
- REQ-voice-agent — Голосовой агент на 11labs с Custom LLM endpoint
- REQ-2d-avatar — 2D-аватар через Lottie
- REQ-board-component — Интерактивная доска tldraw + LLM (текущий прототип)
- REQ-pedagogical-realtime-llm — Двухуровневая LLM-архитектура
- REQ-scenes-macros-primitives — Структура tools: Сцена > Макрос > Примитив
- REQ-live-explanations — Live, не заготовленные объяснения
- REQ-proactive-bot — Проактивный, не реактивный бот
- REQ-living-teacher-feel — Ощущение живого учителя у доски
- REQ-voice-hand-text-sync — Голос + рука + текст синхронно
- REQ-child-safety — Безопасность для детей — не опционально
- REQ-zero-install-invariant — Юзер не должен ставить ничего
- REQ-out-of-scope — Что мы НЕ делаем (anti-requirements)
- REQ-roadmap-priorities — Приоритизированный список НЕсделанного (informational)
- REQ-long-term-vision — Долгосрочное видение 6–12 месяцев (informational)

(18 entries total — 16 functional + 2 informational/roadmap.)

See: `.planning/intel/requirements.md`.

---

## Constraints (18)

Extracted from BOARD-STACK.md (SPEC) with overlap from BOARD-STATUS.md (DOC):

**Type breakdown:**
- **api-contract** (5): CON-api-draw-contract, CON-tools-spec, CON-executor-contract, CON-tldraw-shape-quirks, CON-openai-sdk-quirks
- **schema** (3): CON-package-json, CON-tldraw-colors, CON-environment-vars
- **protocol** (3): CON-agent-loop, CON-prod-deploy-vercel, CON-integration-checklist
- **nfr** (7): CON-runtime-versions, CON-frontend-libs, CON-backend-libs, CON-openai-rf-block, CON-anthropic-rf-block, CON-webpack-undici, CON-nextjs-tracing-root, CON-board-cost, CON-known-quirks

(18 constraints — type breakdown sums to 18 with one entry counted under both nfr and operational categories.)

See: `.planning/intel/constraints.md`.

**Critical RU-specific constraints:**
- CON-openai-rf-block — `api.openai.com` режет российские IP с `403 unsupported_country_region_territory`. Решается VPN-туннелем (dev) или нероссийским хостингом (prod).
- CON-anthropic-rf-block — `api.anthropic.com` режет по TLS-фингерпринту JA3/JA4 через Cloudflare. Не лечится сменой IP. Текущее решение: Anthropic избегаем, остаёмся на OpenAI.

---

## Context topics (10)

Extracted from BOARD-STATUS.md (DOC) and supplementary VISION.md context:

- Project identity & current state (2026-05-09 snapshot)
- Файловая структура проекта
- История крупных решений (почему OpenAI, не Anthropic)
- Сетевая ситуация юзера (САГА — не повторять диагностику)
- Что подтверждено работающим (end-to-end)
- Что НЕ нужно делать (ловушки прошлых сессий)
- Потенциальные TODO
- Команды быстрого старта
- Контракт работы Claude Code в этом проекте
- Глоссарий проекта
- Конкуренты и позиционирование

See: `.planning/intel/context.md`.

---

## Conflicts

- **0 BLOCKERS** — no LOCKED-vs-LOCKED contradictions, no cycles, no UNKNOWN-low docs.
- **0 WARNINGS** — only one PRD in ingest set, no competing acceptance variants possible.
- **4 INFO** — auto-resolved drift between SPEC and DOC on tool count + current model; project-path drift in DOC; no formal ADRs surfaced as note.

See: `.planning/INGEST-CONFLICTS.md`.

---

## Cross-ref graph (no cycles)

```
VISION.md
  ├─→ BOARD-STACK.md
  ├─→ BOARD-STATUS.md
  └─→ tldraw-test/ (directory pointer, not a doc)

BOARD-STACK.md
  └─→ code files only (app/api/draw/route.ts, lib/tools.ts, lib/executor.ts,
       instrumentation.ts, next.config.ts, app/page.tsx, app/layout.tsx,
       app/globals.css, .env.local)

BOARD-STATUS.md
  └─→ code files only (same as above plus README.md, ~/package-lock.json,
       .env.local.example)
```

DFS confirmed acyclic. Cycle-detection cap (depth 50) not approached.

---

## Pointers for `gsd-roadmapper`

- **Locked decisions input**: `.planning/intel/decisions.md` (currently no locked ADRs — all entries are de-facto)
- **Requirements input**: `.planning/intel/requirements.md`
- **Constraints input**: `.planning/intel/constraints.md`
- **Background context input**: `.planning/intel/context.md`
- **Conflict report**: `.planning/INGEST-CONFLICTS.md` (no blockers, no warnings — safe to proceed)

**Special notes for roadmapper:**
1. **No locked ADRs.** Several de-facto decisions (especially around RU-specific blockers, model choice, deployment topology, voice provider Path A) are strong candidates for formalization as locked ADRs — consider prompting user during PROJECT.md generation.
2. **Status of components** (from VISION.md «Где мы сейчас»):
   - **Board (interactive whiteboard)**: working prototype shipped, end-to-end verified.
   - **Voice agent (11labs)**: planned, not built.
   - **HTML lesson trainer**: planned, not built.
   - **2D Lottie avatar**: planned, not built.
   - **Pedagogical+Realtime LLM split**: planned, not built.
   - **Production deploy**: planned, not done.
   - **TG-bot business orchestration**: planned, not built.
3. **Source language preserved**: all extracted content is in Russian per the source docs. Keep this when generating PROJECT.md/REQUIREMENTS.md/ROADMAP.md.
4. **Product invariants** are stronger than features — the VISION.md «Контракт работы с Claude Code» section and the «Что мы не делаем» list are explicit anti-pattern guardrails. Roadmapper should surface these prominently in PROJECT.md.
