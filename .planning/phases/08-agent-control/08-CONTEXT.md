# Phase 8: Agent управляет доской и тренажёром — Context

**Gathered:** 2026-05-13
**Status:** Ready for planning
**Mode:** Interactive discuss (4 areas, 11 decisions captured)

<domain>
## Phase Boundary

Nataly (11labs Conversational AI агент, `agent_7701kr9c2v7eev3tabzv4f2b0e8b`) получает право **сама дёргать доску и тренажёр** через client tools. Симметрично — события тренажёра (`answer_submitted`, `hint_opened`, `idle_15s`) идут к ней обратно через `sendContextualUpdate`, и она реагирует в живом разговоре.

**Конкретно в scope:**
- Регистрация 6 client tools у агента (4 baseline + 2 extensions)
- Wiring tools в `VoicePanel` через `clientTools` prop `useConversation`
- `sendContextualUpdate` поток из bus в Nataly (3 типа событий + mini-recap + periodic checkpoint)
- `dynamic_variables` инжекшен на старте сессии (lesson_topic, total_tasks)
- Переписывание system prompt Nataly и расширение `scripts/restore-agent-config.mjs` (PATCH tool definitions + новый промпт)
- Никаких layout-изменений (Phase 11)
- Никаких новых task-типов в тренажёре (Phase 8.5)
- Никакого Pedagogical server-side LLM (отменено в redesign фазы 2026-05-12; вернёмся если 8-mini окажется недостаточно)

**Что НЕ в scope (фиксируем явно):**
- ❌ Layout redesign (доска↓ / тренажёр↑ / Lottie-аватарки) → Phase 11
- ❌ Контент тренажёра по 5 классу (12 тем JSON-конфигов) → Phase 8.5
- ❌ Drag-drop grid / fraction tiles / multi-step task-типы → Phase 8.5
- ❌ Двухуровневая LLM (Pedagogical GPT-4o + Realtime gpt-4o-mini) → Phase 8.5+ если потребуется
- ❌ Explicit lesson phases (warmup/main/practice/review) state machine → Phase 12+ если dry-run покажет нужду
- ❌ Запись урока, контент-модерация, 152-ФЗ → Phase 10
- ❌ Stroke-drawing + SSML-синхронизация → Phase 11

</domain>

<decisions>
## Implementation Decisions

### Область 1 — Flow модель тренажёра

- **D-01 (Flow type):** **Linear-by-default + Nataly override.** Задачи в `trainerConfig.tasks` лежат по порядку, при правильном ответе курсор тренажёра идёт на следующую. Nataly через `goto_trainer_task(taskId)` может перебросить ребёнка куда угодно — назад/вперёд/повторить. Без полностью адаптивного выбора (теряется смысл счётчика «X из Y») и без жёсткого рельса (агент не сможет реагировать на ошибки).

- **D-02 (Progress UI):** **Подсветка текущей задачи + лёгкий счётчик «N из M».** Текущая задача — visual ring/border + smooth-scroll туда куда `goto_trainer_task` перевела. Решённые — галочки. Без полноэкранного progress bar, без gamification («баллы», «очки», timer). Текущая, решённые, оставшиеся — визуально различимы, но без давления.

- **D-03 (State ownership):** **Frontend canonical, Nataly performer.**
  - **Source of truth:** React state в `TrainerPanel` (current taskId + solved Set + mistakes array) + `lesson.actual_start_at`/`actual_end_at` в Neon (для resume если потребуется).
  - **Nataly получает state фрагментарно через 4 канала:**
    1. `dynamic_variables` на старте сессии — topic, total tasks (см. D-10).
    2. `sendContextualUpdate` после каждого significant event — компактный формат `"✓ task-3 ok"` или `"✗ task-3: ответ 11, правильный 12"` (см. D-08).
    3. **Mini-recap при transitions** — frontend перед каждым `goto_trainer_task` шлёт `sendContextualUpdate`: `"Переход task-3→task-4. Решено: 1,2,3. Тема task-4: переход через десяток."` Даёт Nataly свежий save-point в конце контекста.
    4. **Periodic checkpoint** каждые ~10 мин timer-based update от клиента: `"⏱ 10 мин урока. Решено: 2/7, без ошибок."`
  - **Опциональный safety net:** `get_lesson_state()` client tool возвращает компактную строку state — Nataly зовёт если сама чувствует что забыла.
  - **Pedagogical server-side LLM НЕ строим** (отложено в Phase 8.5+).
  - **Rationale:** GPT-4.1 mini имеет 1M context window — 45 мин урока ≈ 200-300K токенов, технически в окно влезает. Реальный риск — деградация внимания (lost-in-the-middle) на длинных контекстах, не token-shortage. Mitigation через инверсию памяти: frontend помнит, Nataly performirует. Деталями (timer vs event-based recap, точные формат payloads) занимается researcher/planner.

- **D-04 (Lesson phases):** **Нет явных фаз в коде.** Структура урока («поздоровайся → объясни → дай задачи → итоги») живёт исключительно в **system prompt Nataly** как нарратив. Никаких state machine `LessonPhase`, никакого `set_lesson_phase` client tool, никаких UI-индикаторов фазы. Если в Phase 12 dry-run выявит что Nataly путает «объяснять» и «практиковать» — вернёмся к explicit phases.

### Область 2 — Layout

- **D-05 (Layout scope):** **Phase 8 НЕ трогает layout.** Текущая раскладка (BoardPanel слева большой, правая колонка из VoicePanel 256px / TranscriptPanel 224px / TrainerPanel flex-1) сохраняется. Phase 11 (уже expanded в ROADMAP) владеет полным redesign: доска↓, тренажёр↑, аватар отдельный slot, Lottie. **Edge case:** если при execute Phase 8 обнаружится что текущие пропорции делают `goto_trainer_task` подсветку/scroll реально неюзабельным — допустим **минимальный CSS hot-fix** (только пропорции), не структурный rebuild. **Backlog для Phase 11:** trainer должен получить значимый размер как фокальная зона; transcript может уехать в overlay/foldable если конкурирует за место.

### Область 3 — Board vs Trainer для объяснений

- **D-06 (Explanation split):** **Гибрид с распределением ролей.**
  - **Доска** = объяснения и анимации через существующие 15 `explain_*` сцен (Phase 5 готова). Nataly зовёт `draw_explanation({prompt: 'сложение в столбик 245+874'})`.
  - **Тренажёр** = практика через существующие 3 task-типа (numeric-input, single-choice, matching). Nataly зовёт `goto_trainer_task`/`highlight_trainer_task`.
  - **Nataly сама решает когда что** — нет хардкода «каждой задаче предшествует объяснение». Если задача очевидная (повтор) — `goto_trainer_task` без `draw_explanation`. Если ребёнок ошибся — может `draw_explanation` среди потока задач.
  - **Auto-clear доски** уже встроен в `executeDraw` (commit `2124003`). Отдельный `clear_board` tool — для случая «закончили тему, доска пустая, идём в практику без visual baggage».
  - **Связь с D-04:** в system prompt — нарративная инструкция «вводишь тему — `draw_explanation`, переходишь к практике — `goto_trainer_task`».

### Область 4 — Tool surface + event flow

- **D-07 (Client tools registered with Nataly):**

  **Baseline (4 must-have):**
  | Tool | Args | Effect |
  |---|---|---|
  | `draw_explanation` | `{ prompt: string }` | POST `/api/draw` с auth + ownership проверкой (как Phase 4) → SSE стрим → scene execution |
  | `clear_board` | `{}` | Чистит канвас |
  | `goto_trainer_task` | `{ taskId: string }` | `bus.emit('trainer:goto_task', {taskId})` — подсветка + smooth-scroll + focus |
  | `highlight_trainer_task` | `{ taskId: string, durationMs?: number }` | `bus.emit('trainer:highlight', {...})` — акцент без переключения «текущей» |

  **Extensions (2 useful):**
  | Tool | Args | Effect |
  |---|---|---|
  | `show_hint` | `{ taskId: string, hintLevel: 1\|2\|3 }` | `bus.emit('trainer:show_hint', {...})` — тренажёр уже принимает |
  | `get_lesson_state` | `{}` | Возвращает компактную строку state — safety net per D-03 |

  **Deferred:** `set_lesson_phase` (D-04), `praise_or_redirect`/`say` (Nataly это делает через голос).

- **D-08 (Trainer events → Nataly через `sendContextualUpdate`):**

  | Event | Forwarded? | Update format |
  |---|---|---|
  | `trainer:answer_submitted` | ✅ | `"✓ task-3 (numeric, ok)"` или `"✗ task-3 (numeric): ответ 11, правильный 12"` |
  | `trainer:hint_opened` | ✅ | `"Открыл подсказку уровня 2 на task-3"` |
  | `trainer:idle_15s` | ✅ | `"Ребёнок молчит 15 сек на task-4"` |
  | `trainer:task_focused` | ❌ | Слишком шумно — каждый клик = update. Internal-only. |

  Плюс из D-03: автоматический mini-recap при `goto_trainer_task` (frontend перед эмитом события шлёт recap-update) + periodic checkpoint каждые ~10 мин.

- **D-09 (Client tool return semantics):**
  - **Fire-and-forget с быстрым ack** — tool возвращает короткую строку (`"OK, drawing column addition"`) сразу, не ждёт завершения анимации. Nataly может говорить параллельно с рисованием → поддерживает INV-02 (голос + рука синхронно).
  - **Ошибки как строки**, не throws. `/api/draw` упал → tool возвращает `"Error: board unavailable, narrate verbally"` → Nataly сама решает что сказать.
  - **Конкуренция**: `draw_explanation` auto-clear'ит доску (уже в `executeDraw`, commit `2124003`).

- **D-10 (`dynamic_variables` на старте session):**
  - `lesson_topic` — из `lesson.topic` (уже есть в БД и пробрасывается в `VoicePanel` как prop).
  - `total_tasks` — `trainerConfig.tasks.length` (или 0 если config отсутствует).
  - `task_summaries` — **опционально**, начнём БЕЗ. Если в Phase 12 dry-run покажет что Nataly не знает что её ждёт впереди и плохо planning'ует — добавим (короткие prompts первых 50 символов через `\n`).
  - `child_name` — **НЕ в v1** (модель «один родитель = один ребёнок», имя в whitelist не хранится). Добавить в v2 multi-child.

- **D-11 (System prompt + agent config updates):**
  - **Source of truth для prompt:** `.planning/PHASE-6-SETUP-2026-05-10.md` § System Prompt — обновляется в Phase 8.
  - **PATCH механизм:** `scripts/restore-agent-config.mjs` уже PATCH'ит voice/LLM/prompt. Расширяем чтобы он также пушил **tool definitions** (name + description + JSON-schema params + `type: 'client'`) — иначе LLM не знает что tools существуют.
  - **Содержание нового системного промпта (контур):**
    1. Описание tool surface (что есть какой инструмент, когда вызывать).
    2. Behavioral instructions (новая тема → `draw_explanation`; практика → `goto_trainer_task`; 2+ ошибки → `show_hint` или повтор `draw_explanation`; молчание 15с → подключайся).
    3. Структура урока 45-60 мин как нарратив (D-04): «поздоровайся → объясни → дай задачи → итоги».
    4. Использование `dynamic_variables`: «{{lesson_topic}}, всего {{total_tasks}} задач».
    5. Что значат `✓`/`✗` в `sendContextualUpdate` (это твоё «глаза» — реагируй адекватно).
  - **Reproducibility:** запуск `node scripts/restore-agent-config.mjs` после Phase 8 деплоя приводит агента в Phase-8-state из репозитория. Phase 6.5 уже доказал что это критично — конфиг агента может дрейфовать в 11labs UI к demo-template.

### Claude's Discretion

Эти моменты — реализация, отдаются planner/researcher без переспрашивания:

- Точные return strings client tools (`"OK, drawing column addition"` vs `"drawing"` — Claude подбирает короткую и понятную для LLM-контекста).
- Точный формат `sendContextualUpdate` payloads — pluralization, knife formatting `✓`/`✗` vs `OK`/`WRONG`, длина mini-recap.
- Cadence для periodic checkpoint (10 мин — рекомендация; planner может предложить event-driven вариант например «каждые 3 task transitions»).
- JSON schema для client tools параметров (валидация taskId regex и т.п.).
- Где живёт state для periodic checkpoint timer (LessonShell vs VoicePanel vs отдельный hook).
- Тесты: какие unit/component/E2E нужны под client tool wiring, mini-recap emit, dynamic_variables passing.
- Mock стратегия для 11labs SDK `clientTools` в тестах.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Project-level fundamentals
- `.planning/PROJECT.md` § «Locked decisions» — DEC-board-tool-choice-required (tool_choice='required'), DEC-board-llm-provider (OpenAI primary), DEC-voice-provider-mvp (11labs Path A), DEC-llm-architecture-tier (двухуровневая — но redefined per 8-mini approach)
- `.planning/PROJECT.md` § «Product invariants» — INV-01 (zero-install), INV-02 (голос+рука+текст синхронно — критично для D-09 fire-and-forget)
- `.planning/REQUIREMENTS.md` § LLM-01, PED-02, HTM-01 — acceptance criteria источники для этой фазы
- `.planning/ROADMAP.md` § Phase 8 (REVISED 2026-05-12 — client-tools-path, not two-tier LLM)
- `.planning/SESSION-2026-05-12-WRAPUP.md` — context redefinition фазы и user-ordering A→C→B

### Phase 8 user-authored questions
- `.planning/phases/08-agent-control/08-OPEN-QUESTIONS.md` — Q1-Q7 которые user написал 2026-05-12 после Phase 6.5 unblock. Эти вопросы — основа этой discuss-сессии.

### Прошлые фазы (input/dependencies)
- `.planning/phases/06-voice/06-CONTEXT.md` — voice subsystem decisions (11labs Path A, signed URL, ConversationProvider)
- `.planning/phases/06.5-hetzner-proxy/06.5-SUMMARY.md` — h2.nexus proxy architecture (всё WS-движение идёт через proxy, никаких прямых WS из браузера)
- `.planning/PHASE-6-SETUP-2026-05-10.md` — Полная спецификация агента Nataly (voice, LLM, system prompt, ASR, advanced settings). **Будет обновляться в Phase 8** — D-11.
- `.planning/phases/07-trainer/07-CONTEXT.md` — trainer event/command contract (события и команды которые мы расширяем в Phase 8)
- `.planning/phases/05-scenes/05-CONTEXT.md` — 15 `explain_*` scenes (Phase 5 готова) — output channel для `draw_explanation` tool из D-07
- `.planning/phases/04-board-deploy/04-CONTEXT.md` — `/api/draw` endpoint contract (auth, ownership, SSE) — то что `draw_explanation` invокит

### Living code (must inspect)
- `lib/lesson-bus/events.ts` — canonical event contract. Phase 8 будет расширять (добавим `voice:contextual_update`? — solution для planner) либо использовать существующие.
- `components/panels/voice-panel.tsx` — current `useConversation` integration. Phase 8 расширяет prop `clientTools` + добавляет `dynamicVariables` в `startSession`.
- `components/panels/trainer-panel.tsx` — current trainer command subscriptions (`highlight`, `show_hint`, `goto_task`). Phase 8 НЕ переписывает — wiring уже есть.
- `components/panels/board-panel.tsx` — current `/api/draw` invocation pattern (BoardPanel вызывает напрямую через `executeDraw`). Phase 8 НЕ заменяет — добавляет parallel путь через client tool.
- `app/api/draw/route.ts` — endpoint что `draw_explanation` дёргает (auth + ownership + agent-loop с `tool_choice: 'required'`).
- `scripts/restore-agent-config.mjs` — agent config PATCH script. Phase 8 расширяет (D-11) — добавить tool definitions push.
- `public/trainer-configs/sample-column-addition.json` — пример config'а тренажёра (5 задач разных типов, hint strings). taskIds (`task-1`..`task-5`) — это то что Nataly будет передавать в `goto_trainer_task`.

### External docs (для researcher)
- 11labs Conversational AI SDK docs — `clientTools` prop в `useConversation`, `sendContextualUpdate`, `dynamic_variables` в `startSession`. **Critical**: проверить какие именно сигнатуры у tools (sync vs async), формат args (object vs JSON string), return type (string vs Promise<string>), как 11labs валидирует JSON schema params.
- 11labs Agents API — endpoint для PATCH tool definitions в agent config (для D-11). Альтернатива UI — программный path для reproducibility.
- OpenAI GPT-4.1 mini context window (1M tokens) — фактчек для D-03 risk analysis.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets

- **`useConversation` hook + `ConversationProvider`** (`components/panels/voice-panel.tsx`): `useConversation` принимает `clientTools` prop — это extension point для Phase 8. `startSession` принимает `dynamicVariables` — extension point для D-10.
- **Lesson bus** (`lib/lesson-bus/`): уже типизированные events для trainer (4 input + 3 command). Phase 8 client tools будут эмитить эти же события. Возможно добавим новый event для contextual updates (или вызовем 11labs SDK напрямую из VoicePanel — planner решит).
- **`/api/draw` endpoint** (`app/api/draw/route.ts`): auth + ownership + agent-loop уже есть. `draw_explanation` client tool делает POST с тем же payload что BoardPanel — переиспользуем без изменений серверной части.
- **`executeToolCall` executor** (`lib/board/executor.ts`): рисует на доске. Auto-clear на новый prompt уже включён (commit `2124003`). FADE_IN/highlight pacing уже откалиброваны (Phase 6.5 fix).
- **`restore-agent-config.mjs`** (`scripts/`): PATCH-механизм для agent config. Phase 8 расширяет — добавляет tool definitions push.
- **15 `explain_*` scenes** (`lib/board/scenes/`): полный покрытие баз 5 класса. `draw_explanation` через систему prompt натирает Nataly использовать эти scenes (через ID имена).
- **`window.__lessonBus`** (LessonBusProvider non-prod expose, Phase 9 D-11): уже есть для E2E. Phase 8 E2E тесты могут симулировать SDK client tool invocations без реального 11labs.

### Established Patterns

- **Server-only env vars**: `OPENAI_API_KEY`, `ELEVENLABS_API_KEY`, `ELEVENLABS_AGENT_ID`, `VOICE_PROXY_HMAC_SECRET` — never в browser bundle. Phase 8 НЕ добавляет новых клиентских secrets — все tool definitions push идут с сервера.
- **Auth + ownership pattern**: `/api/draw` использует `auth()` → проверяет `userId === lesson.userId`. `draw_explanation` client tool инвокирует через тот же путь — auth наследуется (cookie + Drizzle ownership-check).
- **TDD**: vitest для unit + Playwright для E2E (Phase 6 reference: 21+17 unit + 11 E2E tests).
- **Russian error messages** (внешние) + English logs (внутренние) — устоявшийся pattern с Phase 1.
- **Commit cadence**: TDD RED → GREEN → atomic commits per task (Phase 1-7 reference).
- **Phase 6.5 cleanup-bug lesson**: `useEffect` deps `[conversation]` re-runs на каждый status update. Если Phase 8 добавляет state в VoicePanel — следить за тем же anti-pattern. Latched refs + empty deps как escape hatch.

### Integration Points

- **VoicePanel** ←→ Phase 8: добавляется `clientTools` prop в `useConversation`, `dynamicVariables` в `startSession`. Внутри handlers — вызовы `bus.emit('trainer:goto_task', ...)`, fetch к `/api/draw`, и т.д.
- **TrainerPanel** ←→ Phase 8: ничего не меняется (уже подписан на нужные events). Phase 8 НЕ переписывает.
- **TranscriptPanel** ←→ Phase 8: вероятно ничего не меняется (уже подписан на `voice:transcript`). Если хотим показать в transcript «учительница вызвала draw_explanation» — это nice-to-have, не блокирующее.
- **LessonShell**: возможно понадобится timer state для periodic checkpoint (D-03). Альтернатива — в VoicePanel держать. Planner решит.
- **scripts/restore-agent-config.mjs** ←→ Phase 8: расширяется (D-11). Сам script остаётся идемпотентным.

</code_context>

<specifics>
## Specific Ideas

- **Auto-clear доски на новый `draw_explanation`** уже реализован в `executeDraw` (commit `2124003`). Реюзим, не дублируем.
- **Pacing pacing на доске** — `FADE_IN_MS=1500`, `DIGIT_STAGGER=450`, highlight `duration_ms=4000` (Phase 6.5 fix). Не трогать в Phase 8 без причины.
- **System prompt дрейф предотвращается** через `scripts/restore-agent-config.mjs` — Phase 6.5 показал что 11labs UI может reset'нуть конфиг к demo-template. Phase 8 расширяет этот script (D-11).
- **Cost watermark**: каждый `draw_explanation` ≈ 22 копейки на gpt-4o-mini. Per урок 5-10 вызовов → ~1-2 рубля variable cost от доски (приемлемо в COSTS.md envelope < 200 ₽/lesson).
- **`taskId` convention**: используем существующий формат из `sample-column-addition.json` — `"task-1"`, `"task-2"`, …. Не вводим UUIDs в Phase 8 (избыток для MVP, легко регексом валидировать в tool schema).
- **`agent_7701kr9c2v7eev3tabzv4f2b0e8b`** — фиксированный agent ID, не менять. В `.env.local` + Vercel prod.
- **Voice (Nataly) + Multilingual v2 + GPT-4.1 mini** — конфиг агента не меняется в Phase 8, только system prompt и tool definitions.

</specifics>

<deferred>
## Deferred Ideas

- **Pedagogical server-side LLM** (двухуровневая архитектура GPT-4o slow + gpt-4o-mini fast) — Phase 8.5+ если client-tools-path 8-mini окажется недостаточным (Nataly теряет нить урока, не справляется с recap'ом сама, и т.д.). Полная спецификация уже зафиксирована в `08-llm/08-CONTEXT.md` (старый draft) — оттуда можно восстановить.
- **Explicit `set_lesson_phase` client tool + LessonPhase state machine** (warmup→main→practice→review) — revisit после Phase 12 dry-run, если Nataly путается между «объяснять» и «практиковать».
- **Resume lesson после browser reload** — пока MVP assumption: ребёнок проходит урок in one sitting. Если в Phase 12 окажется реальной проблемой — добавим (state в Neon `lesson.in_progress_state` JSONB).
- **`task_summaries` в `dynamic_variables`** — начнём БЕЗ (см. D-10). Добавить если Nataly плохо planning'ует «куда ведёт урок».
- **`child_name` в `dynamic_variables`** — v2 multi-child.
- **Новые task-типы** (drag-drop grid для прямоугольников/периметра, fraction tiles визуально, drag-drop digits to places, free-text input, multi-step problems) — Phase 8.5 контент-фаза.
- **`praise_or_redirect` или `say` как explicit tools** — не нужны, Nataly это делает через голос. Если потребуется — добавим тогда.
- **Stroke-drawing анимация для линий и SSML-маркеры** — Phase 11 (синхронизация голос+рука).
- **Lottie аватарки с эмоциями** — Phase 11.
- **Layout redesign** (доска↓ / тренажёр↑ / dedicated avatar slot) — Phase 11.
- **`get_progress()` от тренажёра как pull** (альтернатива sendContextualUpdate push) — рассматривали в Q5(c), не выбираем для MVP (push простoy, надёжнее, симметричнее с D-03 frontend-canonical).
- **`get_lesson_state` логика hardening** — если выяснится что Nataly слишком часто его зовёт «на всякий случай», ввести rate limit или throttle. Phase 12 polish.
- **Возврат к Anthropic** для Pedagogical LLM — отдельный decision требует обхода CON-anthropic-rf-block (TLS-fingerprint blocking). Не в Phase 8.

</deferred>

---

*Phase: 08-agent-control*
*Context gathered: 2026-05-13*
*Areas discussed: Flow модель тренажёра, Layout, Board vs Trainer для объяснений, Tool surface + event flow*
*Decisions captured: 11 (D-01..D-11)*
*Deferred ideas: 12 (Pedagogical LLM, lesson phases SM, resume, task_summaries, child_name, new task-types, praise/say tools, stroke-drawing, Lottie, layout redesign, pull-vs-push, Anthropic comeback)*
