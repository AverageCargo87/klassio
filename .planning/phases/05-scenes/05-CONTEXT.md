# Phase 5: Сцены — методические `explain_*` tools — Context

**Gathered:** 2026-05-10
**Status:** Ready for planning
**Mode:** `--auto` (autonomous run; user AFK)

<domain>
## Phase Boundary

Расширить OpenAI tools schema 12-15 новыми высокоуровневыми сценами `explain_*` для основных тем программы 5 класса. Бот предпочитает сцены over примитивы (system prompt encouragement). Каждая сцена expands server-side в серию primitive tool_use events стримящихся клиенту — клиент остаётся примитив-only без изменений.

**В scope:**
- 12-15 scene functions в `lib/board/scenes/` (pure functions, server-side expand)
- Schema entries в `lib/board/tools.ts` для OpenAI function calling
- Server-side interception: agent-loop в `app/api/draw/route.ts` распознаёт scene calls и emits expanded primitives via SSE
- System prompt update: poo поощрение использовать сцены over примитивы для известных тем
- Unit tests для каждой сцены: assertion'ы на shape sequence (e.g. column_addition(245,874) emits N primitives in correct order)
- Cost monitoring note (acceptance #4): измерить avg tokens на сцену vs на manual primitive composition

**НЕ в scope:**
- HTML тренажёр (Phase 7)
- Voice trigger / SSML (Phase 11)
- Stroke animation (Phase 11) — primitives append-only без анимации в Phase 5
- Pedagogical/Realtime LLM split (Phase 8) — Phase 5 scenes called via single LLM call в Phase 4 endpoint
- Trainer integration (bot reacts to wrong answer with scene) — Phase 8

</domain>

<decisions>
## Implementation Decisions

### Scene catalog (15 сцен на программу 5 класса)

- **D-01 — 15 scenes по программе 5 класса:**
  1. `explain_column_addition(a, b)` — сложение в столбик
  2. `explain_column_subtraction(a, b)` — вычитание в столбик
  3. `explain_multiplication_grid(a, b)` — умножение в столбик (или сетка)
  4. `explain_long_division(dividend, divisor)` — деление в столбик
  5. `explain_fraction_addition(a, b, c, d)` — a/b + c/d (с приведением к общему знаменателю)
  6. `explain_fraction_subtraction(a, b, c, d)` — a/b - c/d
  7. `explain_fraction_comparison(a, b, c, d)` — сравнение дробей
  8. `explain_fraction_simplification(numerator, denominator)` — сокращение дроби
  9. `explain_decimal_addition(a, b)` — сложение десятичных
  10. `explain_decimal_multiplication(a, b)` — умножение десятичных
  11. `explain_percent_calculation(value, percent)` — N% от X
  12. `explain_rectangle_area(width, height)` — площадь прямоугольника
  13. `explain_rectangle_perimeter(width, height)` — периметр
  14. `explain_simple_equation(coefficient, value)` — solve `c·x = v` или `x + c = v`
  15. `explain_arithmetic_mean(numbers)` — среднее арифметическое

  Источник curriculum: РФ ФГОС, программа 5 класса по математике. Все сцены покрывают темы 1 четверти + начало 2 (натуральные числа, действия, простые дроби, проценты, площади).

### Architecture

- **D-02 — Server-side scene expansion.** LLM вызывает `explain_*(args)`. Server agent-loop в `/api/draw/route.ts` распознаёт scene name (по prefix `explain_`), вызывает соответствующую функцию из `lib/board/scenes/<scene-name>.ts` которая возвращает Iterable<{ name: string; input: unknown }> primitive tool calls, и emits каждый primitive по SSE как отдельный `tool_use` event. **Rationale:** клиент остаётся zero-knowledge о сценах — только executeToolCall(primitive). Тестирование сцен = pure JS testing. Logic переиспользуется в Phase 8 (proactive triggers).
- **D-03 — Scenes return `Iterable<PrimitiveCall>`** где `PrimitiveCall = { name: PrimitiveName; input: PrimitiveInput }`. Используется generator function (`function* explainColumnAddition(a, b) { yield create_text(...); yield create_line(...); ... }`). Server iterate'ит и emit'ит каждый yield по SSE.
- **D-04 — Primitives unchanged.** 9 текущих примитивов (Phase 4 port'нуло их 1-в-1) сохраняются как acceptance #5. Сцены вызывают только эти примитивы.
- **D-05 — `explain_*` tool schemas** добавляются в `lib/board/tools.ts` рядом с примитивами. OpenAI получает 9 + 15 = 24 tools (плюс `finish` exit signal).
- **D-06 — System prompt update.** В `app/api/draw/route.ts` добавляется секция в system prompt: «Для тем программы 5 класса (сложение/вычитание в столбик, умножение, деление, дроби, проценты, площади/периметры, простые уравнения, среднее арифметическое) предпочитай сцены `explain_*`. Используй примитивы только если: (а) запрошенная тема не покрыта сценой, (б) ребёнок просит конкретную модификацию что не покрывается сценой.»

### Scene implementation pattern

- **D-07 — Pure JS generator functions.** Каждая сцена в отдельном файле `lib/board/scenes/<scene-name>.ts`, default export = `function* sceneName(args): Generator<PrimitiveCall>`. Без зависимости на tldraw (это server-side).
- **D-08 — Coordinates planning.** Каждая сцена назначает absolute coordinates на virtual canvas (e.g., 800×600). Layout sensible для типичных значений (3-digit numbers in column addition fit in column ~150 wide). Если значения большие — scene может adjust spacing dynamically.
- **D-09 — Wait tool вставляется между логическими шагами.** Например, after writing first number, scene yields `wait(800ms)` before writing second number. Поощряет «живость» обяснения (готовит к Phase 11 stroke animation).
- **D-10 — Каждая сцена начинается с `clear_board` или нет?** Решение: сцена sama НЕ clear'ит board (LLM сам добавит `clear_board()` если нужно перед сценой). Это позволяет combine multiple scenes на одном canvas (e.g., dual-explanation для сравнения).

### Schema for scene tools

- **D-11 — Tool input zod schemas.** В `lib/board/tools.ts` для каждой сцены определена zod schema input args с descriptions для LLM (помогают модели понять semantics). Например:
  ```typescript
  explain_column_addition: {
    description: 'Объясни сложение двух натуральных чисел в столбик. Используй для тем "сложение многозначных чисел". Подходит для чисел 2-5 знаков.',
    parameters: z.object({
      a: z.number().int().positive().describe('Первое слагаемое'),
      b: z.number().int().positive().describe('Второе слагаемое')
    })
  }
  ```
- **D-12 — All scenes return `void`** в OpenAI semantics (server doesn't return anything to LLM after scene execution; LLM moves to next iteration of agent loop). Match primitive convention.

### Testing

- **D-13 — Unit tests per scene** в `lib/board/scenes/__tests__/<scene-name>.test.ts`. Each test:
  - Calls scene function with sample args
  - Collects all yielded primitives into array
  - Asserts count + key shapes (e.g., column_addition(245, 874) yields ≥10 primitives, includes specific text values "245", "874", "1119")
  - Asserts coordinate sanity (no negative coords, no off-canvas)
  - Asserts wait between major steps
- **D-14 — Integration test** в `app/api/draw/__tests__/route.test.ts`: mock OpenAI returning `explain_column_addition({a:245,b:874})` → assert SSE stream contains expected sequence of tool_use events with primitive names + final `done` event.

### Cost monitoring (acceptance #4)

- **D-15 — Tokens per scene call** ≈ tokens for input args (small) + tokens for tool description (already in tool schema, ~50 per tool). LLM no longer needs to «think through» the scene — saves output tokens compared to manual primitive composition.
- **D-16 — Estimated cost per разбор через сцену.** Manual composition ≈ 22 копейки (CON-board-cost baseline). Scene call: input tokens slightly higher (24 vs 9 tools = ~150 extra prompt tokens), output tokens significantly lower (LLM emits 1 scene call vs 10-20 primitives). Net: similar cost ±10%. **Acceptance #4 ok если average cost <30 копеек per разбор**.
- **D-17 — Cost tracking inline в SSE done event.** `route.ts` already returns usage stats (Phase 4 plan 02) — Phase 5 adds field `scene_used: string | null` indicating если LLM выбрал scene. Helps track scene preference rate.

### Claude's Discretion

- Точные coordinates / spacing / colors в каждой сцене — следуем prototype tldraw color palette
- Естественный flow scene (e.g., column_addition: write a, write +, write b, write line, write result vs alternative orderings) — pedagogically reasonable order
- Wait durations (300ms, 500ms, 800ms) — подбираем «человечный rhythm»
- Empty edge cases (a=0, b=0, fraction with zero denominator) — assert и throw в scene; LLM получит error и может retry с valid input
- Названия variables in code (snake_case за кадром, camelCase в TS naming convention)

</decisions>

<specifics>
## Specific Ideas

- Scene `explain_column_addition(245, 874)` пример последовательности:
  1. create_text "245" (top-right of column)
  2. wait 400ms
  3. create_text "+" (left of bottom number)
  4. create_text "874" (below 245)
  5. wait 600ms
  6. create_line (horizontal line below 874)
  7. wait 300ms
  8. create_text "9" (units column, говорит «5+4=9»)
  9. wait 400ms
  10. create_text "11" в столбце десятков (smaller, on top of 4+7)
  11. create_text "1" под 9 (ones of 11)
  12. create_text "1" наверху сотен (carry)
  13. wait 400ms
  14. create_text "1" (hundreds, "1 carry + 2+8 = 11" — show full process)
  15. ... etc until result "1119" complete
- Total ~15-20 primitives per simple scene; ~30+ для complex (long division).
- For scene `explain_fraction_simplification(6, 8)`:
  1. create_text "6/8"
  2. create_text "↓" (arrow down)
  3. create_text "GCD(6,8)=2"
  4. create_text "6÷2=3"
  5. create_text "8÷2=4"
  6. create_text "3/4" (final result, larger or boxed)
- All Russian text (numerator/denominator labels, "сократи", etc.)

</specifics>

<canonical_refs>
## Canonical References

### Project & milestone

- `.planning/PROJECT.md` — locked decisions
- `.planning/REQUIREMENTS.md` § BRD-02
- `.planning/ROADMAP.md` § Phase 5 (5 success criteria)
- `BOARD-STACK.md` (root) — sections on tools schema, agent-loop architecture
- `.planning/COSTS.md` — CON-board-cost watermark (~22 копейки baseline)

### Phase 4 deliverables

- `.planning/phases/04-board-deploy/04-01-SUMMARY.md` — lib/board/tools.ts + executor.ts (primitives unchanged)
- `.planning/phases/04-board-deploy/04-02-SUMMARY.md` — /api/draw agent-loop pattern
- `lib/board/tools.ts` (current — extend with 15 scene schemas)
- `lib/board/executor.ts` (unchanged — only handles primitives)
- `lib/board/index.ts` (extend exports for scenes)
- `app/api/draw/route.ts` (extend agent loop with scene interception)

### External docs

- OpenAI function calling — sufficient examples в Phase 4 SUMMARY
- РФ ФГОС программа 5 класса по математике — context (no need to fetch — основные темы общеизвестны)

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets

- **`lib/board/tools.ts`**: extend with 15 scene tool schemas (zod-validated input args)
- **`lib/board/executor.ts`**: unchanged — primitives only
- **`app/api/draw/route.ts`**: extend agent-loop with scene interception
- **`lib/lesson-bus/events.ts`**: Phase 4 added `board:say` stub — Phase 5 may add `board:scene` event for trainer integration in Phase 8

### Patterns to Follow

- **Generator functions** для scenes — clean iteration semantics, easy testing
- **Pure JS server-side** — no React, no tldraw editor, no DOM — testable в vitest без jsdom
- **Coordinate space convention**: virtual canvas (0,0) top-left, scene-local layout. Server expands → primitives carry absolute coordinates → tldraw API accepts.
- **Russian text in scenes** — все user-visible text strings RU

### Anti-patterns to Avoid

- **Не делать клиентские scene functions** — это logic должна быть server-side для testability + Phase 8 reuse
- **Не клонировать всю scene логику в LLM prompt** — pollute context window, defeat purpose. LLM просто видит что есть `explain_*` tools.
- **Не делать сцены async** — generator functions sync. Wait emitted as `wait` primitive, не `setTimeout`.

</code_context>

<deferred_ideas>
## Deferred Ideas

- **Параметрическая typography** (font sizes auto-scale based on number length) — defer; current fixed-size acceptable
- **Macro-сцены** (compose multiple `explain_*` into one mega-explanation) — defer; LLM может call multiple scenes itself
- **Visual themes** (light/dark, kids vs teen styling) — defer to Phase 9 with avatar
- **Geometry constructions с углами** (e.g., explain_triangle_area, explain_circle_area) — Phase 9+ т.к. требует Lottie или специальные shape primitives
- **Scenes for 6+ classes** — backlog, Klassio v1 = 5 класс only

</deferred_ideas>

<assumptions>
## Assumptions Made (auto-mode)

- **A1**: 15 scenes список (D-01) — selected by Claude based on common 5th grade RU math curriculum. User may have different priorities (e.g., добавить геометрию, убрать decimals если programa 6 класс). Override на return.
- **A2**: Server-side expansion (D-02) over client-side. Alternative: send scene calls к client, client expands. Server-side выбран т.к. testability + reuse в Phase 8 (proactive triggers).
- **A3**: Generator functions (D-07). Alternative: array return. Generators = idiomatic for streaming, easy to add lazy/conditional yields в будущем.
- **A4**: Coordinates назначаются scene'ой (D-08), не LLM. Alternative: LLM выбирает coordinates. Saves tokens + ensures consistent layout, но менее flexible. Acceptable trade-off для consistent UX.
- **A5**: Cost watermark <30 копеек per разбор (D-16). Alternative: hard cap baseline 22 копейки (no growth allowed). Allow ~36% growth т.к. extra prompt tokens for scene tool descriptions; acceptance #4 says «watermark, рост допустим, но не порядка».
- **A6**: System prompt update (D-06) language: ringside encouragement, не hard rule. LLM может всё ещё use primitives если scene не подходит. Alternative: hard fallback (force scenes — error if primitive used). Soft choice better для edge cases.

</assumptions>
