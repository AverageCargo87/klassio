---
session_date: 2026-06-04
previous_handoff: .planning/SESSION-2026-06-03-HANDOFF.md
type: автономная backend-сессия — весь бэкенд AI-репетитора собран
branch: v2-claude-design (НЕ запушен, НЕ слит)
---

# Klassio — backend AI-репетитора собран (2026-06-04)

Автономная сессия: реализован весь бэкенд из плана handoff 06-03 (пункты 2–6
+ каркас порта). 9 локальных коммитов на `v2-claude-design`, **ничего не
запушено**, 11labs cloud agent **не тронут**.

## Что сделано (9 коммитов поверх fd9fb06)

| # | Коммит | Что |
|---|---|---|
| 1 | `2e363c2` | **Схема трекинга в Neon** (migration 0003, ПРИМЕНЕНА): tutor_session, lesson_attempt, skill_mastery, progress_event + 3 enum. Только новые таблицы, старые не тронуты. `scripts/apply-0003-tutor-migration.ts` (fresh-conn-per-stmt из-за Neon ECONNRESET). |
| 2 | `21a0647` | **Серверная модерация поведения** (`lib/moderation/`) — RU мат/грубость, точность-first (anchored токены + allowlist: «небо/корабля/спутник» не ложно-срабатывают), эвазии (leet/латиница/«с у к а»), эскалация warn→escalate→родителю. 37 тестов. |
| 3 | `709edf6` | **Data-access слой** (`lib/tutor/`): sessions (start/resume, first/Nth), tracking (upsert попытки + EWMA mastery), reports (для ЛК), dynamic-vars. Проверено на живой Neon (EWMA 0→0.4→0.64, upsert, агрегаты). |
| 4 | `2b4205e` | **7 API-роутов** `/api/tutor/*`: session, signed-url, attempt, event, phase, complete, moderation. Auth+ownership+zod. event-роут принимает только client-safe типы (нельзя подделать модерацию/завершение). 11 тестов. |
| 5 | `a055897` | **11labs агент «Аня»**: промпт (`scripts/tutor-agent-prompt.md`, фазы/smalltalk/mood/модерация/адаптация), 8 client-tools, restore-скрипт. Имена tools **не пересекаются** с math-агентом (защита прода). 6 тестов. |
| 6 | `cfd5562` | **Браузерные хендлеры tools** (`lib/tutor-tools/`) + bus-события + формат сигнала усталости `[СОСТОЯНИЕ]`. 19 тестов. |
| 7 | `d728d24` | **ЛК родителя** `/cabinet/reports`: результаты уроков, mastery (слабые сверху), уведомления о поведении + ack. Бейдж непросмотренных на `/cabinet`. |
| 8 | `4dda615` | **Роут `/tutor/[subject]/[slug]`** + каркас: полная обвязка голоса/tools/модерации/трекинга, минимальный stage (плейсхолдеры доски/тренажёра). |
| 9 | `82232e3` | href урока 1 → `/tutor/okr-mir-4/astronom` (status остаётся coming-soon). |

(Коммиты 1–9 выше; в таблице 9 строк — это и есть весь набор.)

## Проверено

- `npm run typecheck` — чисто.
- `npx vitest run` — **491 passed**, 3 failed. Эти 3 — ПРЕДСУЩЕСТВУЮЩИЕ (math-агент:
  `voice-panel.test.tsx` VOI-01-K про firstMessage, который в коде намеренно
  убран, + `restore-agent-config.test.ts` TTS baseline). Я их НЕ трогал.
- `npm run build` — чисто, все роуты компилируются.
- Data-слой прогнан против живой Neon (создание/upsert/EWMA/агрегаты/cleanup).

## ЧТО ОСТАЛОСЬ (нужен ты / живой тест)

1. **Провижн агента «Аня»** (мутация cloud — не делал без OK):
   ```
   ELEVENLABS_API_KEY=... node scripts/restore-tutor-agent.mjs --create
   ```
   Выведет `agent_...` → добавь в `.env.local` как `ELEVENLABS_TUTOR_AGENT_ID`.
   Пока не задан — `/api/tutor/signed-url` фолбэчит на math-агента (в UI висит
   предупреждение, голос будет «про математику»).
2. **Порт дизайна** `.tmp/sketches/tutor/anya-tutor-clean.html` → `components/tutor`
   (заменить плейсхолдеры TutorStage реальными досками/тренажёром). Вся обвязка
   голоса/tools/трекинга уже готова — дизайн встаёт сверху.
3. **Реальный тренажёр в tutor**: подписка `trainer:answer_submitted`→`/api/tutor/attempt`
   уже есть; нужен сам интерактив + проброс skillTag для skill_mastery.
4. **Латентность 11labs** (handoff п.5): измерить RTT custom-LLM, `optimize_streaming_latency`,
   Flash TTS, регион. Нужен живой агент.
5. **Флип урока 1** в `lib/curriculum/okr-mir-4.ts`: `coming-soon`→`available` после п.1–2.

## Файлы (новое)

```
lib/moderation/{normalize,wordlist,detect,index}.ts (+__tests__)
lib/tutor/{types,sessions,tracking,reports,dynamic-vars,contextual-updates,http,index}.ts (+__tests__)
lib/tutor-tools/{handlers,index}.ts (+__tests__)
lib/curriculum/index.ts                       ← (subject,slug)→title резолвер
app/api/tutor/{session,signed-url,attempt,event,phase,complete,moderation}/route.ts
app/cabinet/reports/{page,actions}.ts(x)
app/tutor/[subject]/[slug]/page.tsx
components/tutor/tutor-lesson.tsx
scripts/tutor-agent-prompt.md
scripts/restore-tutor-agent{,-body}.mjs (+__tests__)
scripts/apply-0003-tutor-migration.ts
drizzle/0003_lyrical_richard_fisk.sql
```

## Не забыть (инварианты)

- **НЕ push / merge в master** без OK (origin auto-deploy на Vercel prod).
- **НЕ патчить 11labs cloud** без OK (live math-урок). restore-tutor-agent.mjs готов, но не запускался.
- Деплой превью — через `vercel` CLI (по желанию; я не деплоил).
- `.env.local` — добавить `ELEVENLABS_TUTOR_AGENT_ID` после провижна.
