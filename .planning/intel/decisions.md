# Decisions Intel

> Locked architectural decisions extracted from ingested ADRs.
> Synthesized by `gsd-doc-synthesizer` on 2026-05-09.

---

## Status: NO ADRs IN INGEST SET

Текущий ingest set не содержит формальных ADR-документов. Архитектурные решения присутствуют как fragments внутри PRD (VISION.md) и SPEC (BOARD-STACK.md, BOARD-STATUS.md), но не оформлены как locked ADRs.

Decisions, surfaced from non-ADR sources, перечислены ниже как **de-facto decisions** — they reflect what is currently chosen but are NOT locked. Downstream `gsd-roadmapper` should decide whether to formalize them as ADRs.

---

## De-facto decisions (from PRD/SPEC, not locked)

### DEC-board-llm-provider — OpenAI as primary LLM provider for board
- source: VISION.md (PRD), BOARD-STACK.md (SPEC), BOARD-STATUS.md (DOC)
- status: de-facto (not locked)
- statement: "Используем OpenAI Chat Completions с function calling для текущего прототипа доски. Anthropic избегаем из-за TLS-фингерпринт блокировки Cloudflare для РФ."
- scope: LLM provider for board component
- rationale: Anthropic API за Cloudflare режет по TLS JA3/JA4 для российских IP; OpenAI режет только по IP, что лечится VPN-туннелем (dev) или нероссийским хостингом (prod).

### DEC-board-current-model — gpt-4o-mini as current production model for board
- source: BOARD-STACK.md (SPEC), VISION.md (PRD)
- status: de-facto (not locked)
- statement: "Текущая модель доски — `gpt-4o-mini`. Стоимость одного разбора стабильна ~$0.0027 (~22 копейки)."
- scope: LLM model selection for `/api/draw`
- rationale: Архитектура совместима с любой OpenAI-совместимой моделью, поддерживающей function calling. gpt-4o-mini выбран по экономике.

### DEC-board-canvas-stack — tldraw v3 + Next.js 15 App Router + React 18
- source: BOARD-STACK.md (SPEC)
- status: de-facto (not locked)
- statement: "Tldraw v3.x (НЕ v4 — ломается API), Next.js ^15.5.18 App Router (НЕ Pages router), React ^18.3.1 (НЕ 19 — tldraw v3 не тестировался)."
- scope: frontend stack для board component
- rationale: tldraw v3 quirks подробно отлажены; React 19 / tldraw v4 = риск регрессий.

### DEC-board-tool-choice-required — `tool_choice: 'required'` + служебный `finish` tool
- source: BOARD-STACK.md (SPEC), BOARD-STATUS.md (DOC)
- status: de-facto (not locked)
- statement: "OpenAI агент-цикл использует `tool_choice: 'required'`, чтобы модель не могла отвечать обычным текстом и обрывать цикл. Завершение = вызов отдельного служебного tool `finish` (на клиент не уходит)."
- scope: LLM agent loop architecture
- rationale: Без `required` модель посреди объяснения отвечает текстом и выходит на `finish_reason: 'stop'`, обрывая работу.

### DEC-deploy-architecture — Vercel (frontend) + Hetzner Frankfurt (voice backend) + Cloudflare
- source: VISION.md (PRD)
- status: planned, de-facto (not locked)
- statement: "Production deploy: фронт на Vercel, voice backend-прокси на Hetzner Frankfurt (Germany), Cloudflare как CDN для РФ-юзеров. Юзер открывает сайт без VPN."
- scope: production deployment topology
- rationale: Vercel IP не в стоп-листе OpenAI; Hetzner Frankfurt держит WebSocket к 11labs; Cloudflare обслуживает фронт через московские edge-точки.

### DEC-voice-provider-mvp — 11labs Conversational AI (Path A) для MVP голоса
- source: VISION.md (PRD)
- status: planned, de-facto (not locked)
- statement: "Голосовой агент на старте — 11labs Agents с Custom LLM endpoint (Путь A: готовый Conversational AI продукт). Через 1–2 месяца возможна миграция на Путь B (свой voice pipeline) для экономики."
- scope: voice agent provider
- rationale: Скорость MVP. Свой voice pipeline (STT+LLM+TTS) — следующая итерация для unit-экономики.

### DEC-avatar-style — 2D Lottie аватар (НЕ 3D, НЕ видео)
- source: VISION.md (PRD)
- status: planned, de-facto (not locked)
- statement: "Аватар учителя — 2D-персонаж через Lottie. Несколько состояний: нейтрально, говорит, думает, радуется, огорчился. Переключение по событиям от агента."
- scope: visual avatar implementation
- rationale: 3D-аватары и видеогенерация (D-ID) — слишком дорого в realtime, плохо для русского, не нужно для 5 класса.

### DEC-llm-architecture-tier — Двухуровневая LLM (Pedagogical + Realtime)
- source: VISION.md (PRD)
- status: planned, de-facto (not locked)
- statement: "Pedagogical LLM (медленная стратегическая, Sonnet 4.6 / GPT-4o) следит за прогрессом и решает 'что делать дальше'. Realtime LLM (быстрая, gpt-4o-mini / Haiku 4.5) исполняет решения в реальном времени голоса."
- scope: LLM architecture pattern
- rationale: Стандартный паттерн voice-agents.

---

## Notes for roadmapper

Ни одно из этих решений не помечено как `locked`, потому что в ingest set нет формальных ADR. Если планируешь зафиксировать что-то из этого как обязательное к исполнению — оформи отдельный ADR через `/gsd-add-decision` с `locked: true`.
