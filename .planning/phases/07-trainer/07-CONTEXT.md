# Phase 7: HTML-тренажёр — контракт data-атрибутов + event bus — Context

**Gathered:** 2026-05-10
**Status:** Ready for planning (PARTIAL — voice reactions deferred to Phase 8/11 since Phase 6 voice not yet executed)
**Mode:** `--auto` (autonomous run; user AFK)

<domain>
## Phase Boundary

В третьей панели lesson page (компонент `TrainerPanel`) появляется HTML-тренажёр с заданиями. Ребёнок решает → bus получает события → бот может команды отдать (highlight/hint/goto). Phase 6 voice integration deferred — Phase 7 строит **контракт + UI**, Phase 8 wires voice reactions поверх готовой шины.

**В scope:**
- Контракт data-атрибутов (`data-block`, `data-task-id`, `data-task-type`, `data-correct`, `data-hint-level`)
- 3 task types: `numeric-input`, `single-choice`, `matching`
- Bus events from trainer: `trainer:answer_submitted`, `trainer:hint_opened`, `trainer:task_focused`, `trainer:idle_15s`
- Bus commands to trainer: `trainer:highlight`, `trainer:show_hint`, `trainer:goto_task` (subscribed by TrainerPanel)
- Static lesson configuration: each `lesson` row может ссылаться на `htmlTrainerPath` (из Phase 2 schema column) который указывает на JSON config файл с trainer content
- Sample lesson configs (1-2 файла) в `public/trainer-configs/` — для seed lesson + test lessons из admin CLI
- Trainer renderer (client component) который читает JSON config и рендерит HTML с правильными data-атрибутами
- Vitest unit tests для:
  - Trainer renderer (snapshot of rendered HTML for each task type)
  - Event emitter logic (мок bus, assert event payloads)
  - Command handler (mock DOM, assert highlight/hint/goto effects)
- Playwright E2E spec: open lesson → trainer renders → answer numeric task → assert bus event fired (через test-bus listener) → manually fire highlight command → assert visible class change

**НЕ в scope (deferred):**
- Voice reactions to wrong answer (Phase 6/8 — bot speaks via 11labs)
- AI-generated personalized trainer content (v2)
- Pedagogical LLM watching trainer state (Phase 8 — LLM-01)
- Stroke-drawing animation на board parallel with trainer (Phase 11)
- Recording trainer state (Phase 10)
- Multiple-task adaptive paths (v2 — currently linear)

</domain>

<decisions>
## Implementation Decisions

### Data attribute contract (HTM-01 acceptance #2)

- **D-01 — Required attributes:**
  - `data-block` — top-level container marker. Trainer root: `<div data-block="trainer">`.
  - `data-task-id` — unique within lesson (e.g., `task-1`, `task-2`). Used in bus events + commands.
  - `data-task-type` — one of `numeric-input` | `single-choice` | `matching`.
  - `data-correct` — correct answer encoded as string (numeric value, option index, or pairing JSON).
  - `data-hint-level` — `0` (no hints opened), `1` (first hint), `2` (second), max `3`.
  - Optional: `data-task-status` — `pending` | `answered` | `correct` | `wrong`. Trainer renderer manages.

- **D-02 — JSON config schema** для lesson trainer content (validated via zod):
  ```typescript
  type TrainerConfig = {
    title: string  // "Сложение в столбик"
    tasks: Array<{
      id: string
      type: 'numeric-input' | 'single-choice' | 'matching'
      prompt: string  // "Реши: 245 + 874 = ?"
      correct: string | number | Array<[string, string]>  // depends on type
      hints?: string[]  // up to 3
      options?: string[]  // for single-choice/matching
    }>
  }
  ```

### Bus events (HTM-01 acceptance #3)

- **D-03 — Event types added to lesson-bus:**
  ```typescript
  | { type: 'trainer:answer_submitted'; payload: { taskId: string; value: string; correct: boolean } }
  | { type: 'trainer:hint_opened'; payload: { taskId: string; hintLevel: number } }
  | { type: 'trainer:task_focused'; payload: { taskId: string } }
  | { type: 'trainer:idle_15s'; payload: { lastActivityAt: number } }
  ```

- **D-04 — Event emission rules:**
  - `answer_submitted` — fired on form submit OR option click (single-choice / matching). NOT fired on partial input (no fire-on-keystroke).
  - `hint_opened` — fired when child clicks "Показать подсказку" button.
  - `task_focused` — fired when input/button gains focus (debounced 300ms to avoid stale events).
  - `idle_15s` — fired by setTimeout polling every 5 sec; if no event from trainer for 15+ sec → emit. Reset on any other event.

### Bus commands (HTM-01 acceptance #4)

- **D-05 — Commands trainer subscribes to:**
  ```typescript
  | { type: 'trainer:highlight'; payload: { elementId: string; durationMs?: number } }
  | { type: 'trainer:show_hint'; payload: { taskId: string; hintLevel: number } }
  | { type: 'trainer:goto_task'; payload: { taskId: string } }
  ```

- **D-06 — Command effects (visible UI changes):**
  - `highlight` — adds CSS class `trainer-highlight` (yellow glow + 2px outline ~ Tailwind `ring-2 ring-yellow-400`) на element с указанным `data-task-id` или `data-element-id`. Default duration 3000ms.
  - `show_hint` — увеличивает `data-hint-level` на task до указанного уровня + ренденит соответствующий hint text under task. Если `hintLevel > 3` → no-op + console.warn.
  - `goto_task` — scroll'ит to task с указанным id + adds focus to its input. Если task не существует → no-op + console.warn.

### Task type renderers (HTM-01 acceptance #5)

- **D-07 — `numeric-input`:** `<input type="text" inputmode="numeric" pattern="[0-9.,]+">` + button «Ответить». On submit → validate → fire event → if correct: green check, if wrong: red X + offer hint button.
- **D-08 — `single-choice`:** radio group или buttons (visual: button group). Каждая опция кликабельна → fire event с index.
- **D-09 — `matching`:** drag-and-drop OR click-to-pair (выбор простого подхода для v1: click-to-pair). User clicks left item, then right item — pair created. On all pairs created → fire event с array.

### Renderer architecture

- **D-10 — `components/panels/trainer-panel.tsx`** = `'use client'`. Receives `lessonId` prop (Phase 4 added это). Fetches trainer config based on `lesson.htmlTrainerPath` (server data via prop OR client-side fetch — pick: prop из server component drilling). Lesson page server component reads lesson.htmlTrainerPath, fetches JSON, passes to LessonShell → TrainerPanel.
- **D-11 — Renderer component**: `components/trainer/trainer-renderer.tsx` accepts `TrainerConfig` prop, renders root `<div data-block="trainer">` с individual task components.
- **D-12 — Per-task-type components**: `components/trainer/numeric-input-task.tsx`, `single-choice-task.tsx`, `matching-task.tsx`. Каждый pure component, accept task config + onSubmit callback.
- **D-13 — Trainer state hook**: `useTrainerState(taskId)` manages local state for one task (input value, focused, answered, hint level). Internally uses `useLessonBus` to emit events on user actions.

### Sample lesson configs

- **D-14 — `public/trainer-configs/sample-column-addition.json`** — 5 tasks теста на сложение в столбик. Mix of types:
  - 2× `numeric-input` (245+874=?, 1234+567=?)
  - 1× `single-choice` (Сколько единиц в 7+8?)
  - 1× `matching` (Match: column → name like "единицы", "десятки", "сотни")
  - 1× `numeric-input` (final 999+101=?)
- **D-15 — `public/trainer-configs/sample-fractions.json`** — fewer tasks (3) about fractions. For demo of fraction-comparison scene from Phase 5 paired with this trainer.
- **D-16 — Admin CLI extension**: `scripts/admin/create-lesson.ts` (Phase 2) accepts `--trainer-config <filename>` referring to `public/trainer-configs/<filename>.json`. Default for new lessons: `sample-column-addition.json`.

### Idle detection

- **D-17 — `useTrainerIdle()` hook**: subscribes to all trainer event types via lesson-bus, tracks last event timestamp, sets timer 15 sec → emits `trainer:idle_15s`. Resets on any event (including incoming command). Limits emit rate (max 1 idle event per 30 sec to avoid spam).

### Testing

- **D-18 — Unit tests**: per task-type renderer (mounted via testing-library), event emission (mock bus, assert), command handlers (mock DOM, assert class changes), idle hook (vi.useFakeTimers).
- **D-19 — Integration test** в `app/api/draw/__tests__/route.test.ts` НЕ нужен — Phase 7 trainer не вызывает /api/draw. Но добавим vitest test для trainer-renderer + bus integration (mount renderer, mock bus, simulate user action, assert event).
- **D-20 — E2E spec** `e2e/trainer-panel.spec.ts`: login → start lesson → trainer renders 5 tasks → fill numeric task → click answer → assert success state → manually inject `trainer:highlight` command via test bus exposure → assert highlight visible. ~3 specs.

### Voice integration deferred

- **D-21 — Phase 6/8 wire voice reactions** to trainer events. Phase 7 establishes the bus contract; bot integration is out of scope. Document this clearly in TrainerPanel comments + SUMMARY.

### Claude's Discretion

- Точная стилизация trainer UI (colors, spacing) — следуем Phase 1 shadcn/ui patterns
- Иконки success/error (✓ / ✗ unicode vs Lucide icons)
- Toast/alert library — нужен ли для feedback? Recommended: inline только (no toast library)
- Hint text rendering (rich text vs plain) — plain в Phase 7

</decisions>

<specifics>
## Specific Ideas

- Sample task `numeric-input`:
  ```html
  <div data-task-id="task-1" data-task-type="numeric-input" data-correct="1119" data-hint-level="0">
    <p>Реши: 245 + 874 = ?</p>
    <input type="text" inputmode="numeric" />
    <button>Ответить</button>
    <button data-action="hint">Показать подсказку</button>
  </div>
  ```
- Sample task `single-choice`:
  ```html
  <div data-task-id="task-2" data-task-type="single-choice" data-correct="1" data-hint-level="0">
    <p>Сколько единиц в сумме 7+8?</p>
    <button data-option="0">15</button>
    <button data-option="1">5 (с переносом 1)</button>
    <button data-option="2">5</button>
  </div>
  ```
- Visual states: pending=neutral, focused=blue ring, answered correct=green border + ✓, wrong=red border + ✗ shake animation.

</specifics>

<canonical_refs>
- `.planning/PROJECT.md` (locked decisions)
- `.planning/REQUIREMENTS.md` § HTM-01
- `.planning/ROADMAP.md` § Phase 7
- `.planning/phases/03-lesson-shell/03-CONTEXT.md` (bus contract, panel slot)
- `.planning/phases/04-board-deploy/04-03-SUMMARY.md` (BoardPanel pattern reference for Phase 7 TrainerPanel)
- `.planning/phases/05-scenes/05-CONTEXT.md` (scenes ↔ trainer contract — Phase 8 wires together)
- `lib/lesson-bus/` (Phase 3 + Phase 4 bus + events.ts)
- `lib/db/schema.ts` (lesson.htmlTrainerPath column from Phase 2)
- `scripts/admin/create-lesson.ts` (Phase 2 — extend with `--trainer-config`)
- `components/panels/trainer-panel.tsx` (current placeholder — full rewrite)
- `app/lesson/[id]/page.tsx` (server component — pass trainer config to LessonShell)

</canonical_refs>

<assumptions>
- **A1**: Phase 7 = full implementation of UI + bus contract + 3 task types + 2 sample configs. Voice integration deferred to Phase 6/8 — добавляем only TODO comments.
- **A2**: 5 tasks per sample config — moderate density, not overwhelming для 9-11 year old. User can extend by editing JSON.
- **A3**: Click-to-pair for matching task (D-09) — simpler than DnD, works on touch devices. Alternative: full DnD with @dnd-kit. Defer DnD until needed.
- **A4**: Plain hint text (no markdown rendering). Alternative: markdown via `react-markdown`. Defer markdown — adds dep + complexity.
- **A5**: Idle threshold 15 seconds (per ROADMAP success criterion). Может быть aggressive для first-time learners — user может tweak constant в `useTrainerIdle()`.
- **A6**: Trainer config delivered via Next.js `public/` static files. Alternative: stored в DB and served via API. Static files = simpler for Phase 7, can migrate later.

</assumptions>
