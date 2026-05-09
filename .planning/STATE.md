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

- **Current phase**: Phase 1 — ЛК — оболочка, авторизация по ссылке, список уроков.
- **Current plan**: TBD (фаза ещё не разобрана на планы — вызов `/gsd-plan-phase 1` ожидается).
- **Status**: Roadmap создан, фазы не запущены.
- **Progress (overall v1)**: `[░░░░░░░░░░░░░░░░░░░░] 0/12 phases complete`.

### Recent transitions

- **2026-05-09**: Ingest pipeline завершён, intel synthesis готов (3 docs, 18 requirements, 18 constraints, 8 de-facto decisions, 0 conflicts). Юзер залочил v1 scope и granularity (fine). PROJECT.md, REQUIREMENTS.md, ROADMAP.md, STATE.md созданы. Готовы к запуску Phase 1 через `/gsd-plan-phase 1`.

---

## Performance Metrics

> Заполняется по мере работы. На старте — пусто.

| Метрика | Значение | Дата |
|---|---|---|
| Phases complete | 0 / 12 | 2026-05-09 |
| Requirements implemented | 0 / 21 | 2026-05-09 |
| v1 success metric verified | ❌ | — |
| Cost per 45-min lesson (Pedagogical + Realtime + 11labs) | TBD (watermark в Phase 8) | — |
| Cost per board explanation (gpt-4o-mini, столбиковое сложение) | ~22 копейки (~$0.0027) | прототип, см. CON-board-cost |
| Production deploy live | ❌ (Phase 4) | — |

---

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

### Open questions / decisions to revisit

- **Pedagogical LLM модель**: GPT-4o зафиксирован по умолчанию. Если экономика на gpt-4.1 или gpt-5 окажется лучше — пересмотреть в Phase 8.
- **Видеозапись урока**: composite экрана vs только аудио + screencast — выбор делается в Phase 10.
- **Хранилище записей**: S3 в Hetzner или AWS вне РФ — выбор в Phase 10.
- **Согласие 152-ФЗ**: при первом входе ребёнка в ЛК vs предварительно через admin (ACC-04) — выбор в Phase 10.
- **Anthropic comeback**: с туннель-VPN possibly работает (см. `.planning/intel/context.md` § Потенциальные TODO). Проверить одним curl-запросом из Node без прокси через api.anthropic.com. Если 200 — можно вернуться, и тогда agent-loop вообще не нужен (Anthropic делает всё в одном ответе → дешевле в 20×). Но это **только при отдельном новом decision** — в v1 по умолчанию остаёмся на OpenAI.

### Active todos

- Запустить `/gsd-plan-phase 1` для разбора Phase 1 на планы.
- (Опционально) формализовать какое-либо из 8 locked decisions как ADR через `/gsd-add-decision` — синтез предлагает рассматривать DEC-deploy-architecture, DEC-llm-architecture-tier и DEC-voice-provider-mvp как кандидатов на формальные ADRs.

### Active blockers

- Нет.

---

## Session Continuity

- **Last session**: 2026-05-09 — ingest + planning files generation. Завершено успешно.
- **Next session entry point**: `/gsd-plan-phase 1` — разобрать Phase 1 на планы.
- **What new Claude Code session needs to read first** (порядок):
  1. `PROJECT.md` — core value, locked decisions, anti-scope, invariants.
  2. `STATE.md` (этот файл) — где мы сейчас, что блокирует.
  3. `ROADMAP.md` — phase, в котором работаем (Phase 1 на старте).
  4. `REQUIREMENTS.md` — конкретные acceptance criteria для requirements фазы.
  5. (По необходимости) `.planning/intel/constraints.md` — для специфических технических ограничений.
  6. (По необходимости) `BOARD-STATUS.md` и `.planning/intel/context.md` — для grаблищ прошлых сессий и сетевой саги.
- **Что НЕ нужно перечитывать каждую сессию**: VISION.md (core отжата в PROJECT.md), BOARD-STACK.md (контракты в `.planning/intel/constraints.md`).
