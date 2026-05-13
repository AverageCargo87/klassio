# Phase 8: Agent управляет доской и тренажёром — Discussion Log

> **Audit trail only.** Не использовать как input для planning/research/execution.
> Решения зафиксированы в `08-CONTEXT.md` — этот лог сохраняет рассмотренные альтернативы.

**Date:** 2026-05-13
**Phase:** 08-agent-control
**Areas discussed:** Flow модель тренажёра, Layout, Board vs Trainer для объяснений, Tool surface + event flow
**Mode:** Interactive (user dismissed batch AskUserQuestion initially, switched to plain-text conversational)
**Source for gray areas:** `08-OPEN-QUESTIONS.md` (user-authored 2026-05-12) — Q1-Q7

---

## Selection of gray areas to discuss

| Option | Description | Selected |
|--------|-------------|----------|
| Flow модель тренажёра (Q1+Q4+Q7) | Linear/Parallel/Adaptive + progress tracking + phase semantics | ✓ |
| Layout — где трeнажёр в Phase 8 (Q2) | Phase 11 owns redesign — trogga ли Phase 8 layout | ✓ |
| Board vs Trainer для объяснений (Q6) | Animation на доске / интерактивные слоты в тренажёре / гибрид | ✓ |
| Tool surface + event flow (Q5 + technical) | Какие client tools, как зарегистрированы, какие events идут | ✓ |

**User's choice:** «все давай обсудим» (Other freeform → interpreted as all 4 selected via multiSelect logic)

---

## Область 1 — Flow модель тренажёра

### Q1.1 — Какая модель прохождения тренажёра? (D-01)

| Option | Description | Selected |
|--------|-------------|----------|
| Адаптивный (Recommended) | Nataly сама выбирает следующую через `goto_trainer_task`. Симметрия с agent-control. | |
| Линейный | Жёсткий рельс 1→2→3, прогресс-бар «3/10». Nataly комментирует. | |
| Параллельный пул | Все задачи сразу, ребёнок выбирает. Плохо для 5 класса. | |

**Initial AskUserQuestion dismissed.** User says «что-то между 1 и 2» → I misinterpret as Flow → propose 3 variants A/B/C of hybrid Flow.

**User correction:** «я про то что фокус на конкретной задаче но и общий прогресс видно. сколько задач решил» → realized user was answering Q4 (Progress UI), but the answer also IMPLIES Linear flow («сколько решил» → подразумевает defined total).

**User's choice (after my reflection):** **Linear-by-default + Nataly override via `goto_trainer_task`** — confirmed «оба да».

**Notes:** Не полностью адаптивный (полная свобода теряет смысл счётчика «X из Y»). Не жёстко линейный (агент не сможет реагировать на ошибки). Hybrid.

---

### Q1.2 — Что видит ребёнок по прогрессу? (D-02)

| Option | Description | Selected |
|--------|-------------|----------|
| Visual cue текущей задачи (Recommended) | Ring + smooth-scroll на текущую. Без счётчика — чтобы не давить цифрой. | |
| Progress bar + счётчик | Явный «3/10 задач», галочки. Геймификация, но риск «быстрее выполнить». | |
| Ничего — всё через голос | Только Nataly нарратирует прогресс. Risk: ребёнок теряет ориентиры. | |

**Initial AskUserQuestion dismissed.**

**User's choice:** **Hybrid вариантов 1 и 2** — подсветка текущей + лёгкий счётчик «N из M» (без полноэкранного progress bar, без gamification).

**Notes:** User: «фокус на конкретной задаче но и общий прогресс видно. сколько задач решил». Конфирмировал «оба да».

---

### Q1.3 — Кто держит state прогресса урока? (D-03)

| Option | Description | Selected |
|--------|-------------|----------|
| Агент Nataly (Recommended) | Она помнит «разобрали units, теперь tens». Trainer пассивен. | |
| Сам тренажёр | Tренажёр ведёт counter, агент может get_progress. | |
| Pedagogical server-side LLM | Возврат к старой Phase 8. Не выбирать. | |

**Initial AskUserQuestion dismissed.**

**User concern raised in conversation:** «на 45-60 минут разговора у агента действительно может закончиться контекстное окно... но на стороне пользователя — не должно быть видно и слышно что ИИ учитель путается и что-то забывает».

**Discussion:**
- Quick fact check: GPT-4.1 mini = 1M context window. 45 min ≈ 200-300K tokens → влезает технически.
- Реальный риск — lost-in-the-middle degradation, не token shortage.
- Proposed inversion: **frontend = source of truth, Nataly = performer.** Mini-recap mechanism + dynamic_variables + compact contextual updates.

**User's choice:** **«да зафиксируй как то что надо будет сделать»** — confirmed frontend-canonical, Nataly-performer architecture. Explicit Pedagogical server-side LLM deferred to Phase 8.5+.

**Notes:** Конкретные механизмы (timer-based vs event-based recap, формат payloads) — research/plan-phase territory. User acknowledged technical unclarity but trusted recommended architecture.

---

### Q1.4 — Нужны ли explicit lesson phases (warmup/main/practice/review)? (D-04)

| Option | Description | Selected |
|--------|-------------|----------|
| Нет (Recommended) | Фазы в system prompt как нарратив. Никаких state machine. | ✓ |
| Да, explicit + client tool | `set_lesson_phase` + UI индикаторы. Жёсткая рамка. | |
| Отложить до Phase 12 | После dry-run решим. | |

**User's choice:** Нет (covered in single «оба да» confirmation alongside D-03).

**Notes:** Структура урока живёт в Nataly's system prompt («поздоровайся → объясни → дай задачи → итоги»). Если в Phase 12 dry-run выявит дрейф — revisit.

---

## Область 2 — Layout

### Q2 — Phase 8 трогает layout? (D-05)

| Option | Description | Selected |
|--------|-------------|----------|
| НЕТ — wiring только (Recommended) | Phase 11 expanded в ROADMAP включает «доска↓ / тренажёр↑ / Lottie». Не делать дважды. | ✓ |
| Минимальный resize | Только пропорции трёх панелей. Не структурный. | |
| Полный redesign в Phase 8 | Дублирует Phase 11, ballooning. | |

**User's choice:** **«ок согласен»** — Phase 8 не трогает layout. Допустимый edge case — минимальный CSS hot-fix если `goto_trainer_task` подсветка/scroll сломается на текущих пропорциях.

**Notes:** Backlog для Phase 11: trainer как focal zone должен получить значимый размер; transcript может уехать в overlay/foldable.

---

## Область 3 — Board vs Trainer для объяснений

### Q6 — Где живут объяснения? (D-06)

| Option | Description | Selected |
|--------|-------------|----------|
| Гибрид (Recommended) | Доска для анимаций (15 `explain_*` scenes из Phase 5) + тренажёр для практики (3 типа). Nataly orchestrates. | ✓ |
| Анимация на доске + парал. задача в тренажёре | Эквивалент гибриду, но строго каждой задаче предшествует draw. | |
| Всё в тренажёре с интерактивными слотами | Обесценивает Phase 5; требует новых task-типов (Phase 8.5). | |

**User's choice:** **«да»** — гибрид.

**Notes:** Nataly сама решает когда `draw_explanation` vs когда сразу `goto_trainer_task`. Не хардкодим «каждой задаче — объяснение». Auto-clear доски уже встроен (commit `2124003`).

---

## Область 4 — Tool surface + event flow

### Q4.1 — Какие client tools у Nataly? (D-07)

| Option | Description | Selected |
|--------|-------------|----------|
| Baseline 4 + Extensions 2 (Recommended) | draw_explanation, clear_board, goto_trainer_task, highlight_trainer_task + show_hint, get_lesson_state | ✓ |
| Только baseline 4 | Минимум — без show_hint и get_lesson_state | |
| Baseline + extensions + `set_lesson_phase` | Полный набор включая explicit phases (отменено в D-04) | |

**User's choice:** Все сразу как предложено («давай все сделаем как ты предлагаешь и будем тестировать»).

---

### Q4.2 — Какие trainer events форвардятся к Nataly? (D-08)

| Option | Description | Selected |
|--------|-------------|----------|
| Significant only (Recommended) | answer_submitted + hint_opened + idle_15s. task_focused — нет. | ✓ |
| Каждое keystroke | Включая task_focused — спам контекста. | |
| Pull-based через get_current_task_state | Чище но медленнее. | |

**User's choice:** Significant only (covered by «давай все сделаем как ты предлагаешь»).

**Notes:** Плюс автоматический mini-recap при `goto_trainer_task` + periodic checkpoint каждые ~10 мин (per D-03).

---

### Q4.3 — Tool return semantics? (D-09)

| Option | Description | Selected |
|--------|-------------|----------|
| Fire-and-forget + быстрый ack (Recommended) | Tool возвращает строку сразу, анимация продолжается в фоне. Голос+рука синхронно (INV-02). | ✓ |
| Wait-for-completion | Tool блокируется до конца анимации. Nataly не может говорить параллельно. Ломает INV-02. | |
| Throw on error | Errors как exceptions — Nataly не может gracefully handle. | |

**User's choice:** Fire-and-forget (covered by «давай все сделаем»).

---

### Q4.4 — Что инжектим в dynamic_variables? (D-10)

| Option | Description | Selected |
|--------|-------------|----------|
| lesson_topic + total_tasks (Recommended) | Минимум для D-03 архитектуры. `task_summaries` отложим если потребуется. | ✓ |
| + task_summaries сразу | Полный план для Nataly. Риск: разрастание promptа. | |
| + child_name | Multi-child — v2. | |

**User's choice:** Minimum — lesson_topic + total_tasks. task_summaries — если в Phase 12 окажется нужным. child_name — v2.

---

### Q4.5 — Обновление system prompt + agent config? (D-11)

| Option | Description | Selected |
|--------|-------------|----------|
| Расширить restore-agent-config.mjs (Recommended) | Источник правды в `PHASE-6-SETUP-2026-05-10.md`. Script PATCH'ит prompt + tool defs. Reproducible. | ✓ |
| Manual UI update | Phase 6.5 уже показал что 11labs UI может reset'нуть конфиг — не reproducible. | |
| Inline в Vercel deploy script | Скрытие конфига в deploy pipeline. | |

**User's choice:** Reproducible script approach (covered by «давай все сделаем»).

---

## Claude's Discretion (выяснилось в обсуждении)

- Точные return strings (`"OK, drawing column addition"` vs alternatives).
- Точный формат `sendContextualUpdate` payloads (`✓ task-3 ok` vs `OK_task3` и т.п.).
- Cadence periodic checkpoint (10 мин — рекомендация; planner может предложить event-driven).
- JSON schema для client tools params (taskId regex и т.п.).
- Где живёт timer state для periodic checkpoint (LessonShell vs VoicePanel).
- Тестовая стратегия для 11labs SDK `clientTools` mocking.

## Deferred Ideas (детально в CONTEXT.md § Deferred Ideas)

- Pedagogical server-side LLM → Phase 8.5+
- Explicit set_lesson_phase + state machine → revisit после Phase 12
- Resume after reload → не MVP
- task_summaries в dynamic_variables → если потребуется
- child_name → v2 multi-child
- Новые task-типы (drag-drop, fraction tiles, multi-step) → Phase 8.5 контент
- praise_or_redirect/say tools → не нужны (Nataly через голос)
- Stroke-drawing + SSML → Phase 11
- Lottie аватарки → Phase 11
- Layout redesign → Phase 11
- Pull-based get_progress → не MVP
- Anthropic возврат → требует обхода CON-anthropic-rf-block
- get_lesson_state rate-limiting → Phase 12 polish
