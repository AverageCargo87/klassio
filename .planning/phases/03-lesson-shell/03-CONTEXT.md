# Phase 3: Lesson page shell — три-панельный layout + event bus — Context

**Gathered:** 2026-05-10
**Status:** Ready for planning
**Mode:** `--auto` (Claude picked recommended defaults; user is AFK on autonomous run)

<domain>
## Phase Boundary

Существует страница урока `/lesson/[id]` с тремя видимыми панелями (доска / голос+аватар / HTML-тренажёр) и in-memory event-шиной между ними. Панели = placeholders (без реального tldraw, 11labs, тренажёра — это всё в Phase 4/6/7). Цель: рельсы и контракты для следующих фаз.

**В scope:**
- 3-panel responsive layout (desktop + tablet)
- Event bus с типизированными событиями + React Context провайдер
- Lesson page server component: ownership check, status transition, "Завершить урок" button
- Test event flow доказывающий что bus работает (placeholder UI emits event → другой placeholder UI react)
- Phase 1-2 наследие: auth(), middleware, schema всё реюзается без изменений

**НЕ в scope** (deferred):
- Реальный tldraw board (Phase 4)
- Реальный голосовой агент / 11labs (Phase 6)
- Реальный HTML тренажёр (Phase 7)
- 2D Lottie аватар (Phase 9)
- Mobile layout (<768px) — explicit non-priority per ACC
- Lesson cancellation logic (закрыл вкладку = что? — defer to Phase 8/12)
- Lesson recording (Phase 10)

</domain>

<decisions>
## Implementation Decisions

### Layout

- **D-01 — Desktop (≥1024px): 3 column layout.** Доска (центр-лево) = ~60% ширины, правая колонка split: голос+аватар (top, ~25% ширины × ~30vh высоты), тренажёр (bottom, ~25% ширины × ~70vh высоты). Доска занимает 100vh.
  - **Rationale:** доска = main visual для math explanations (дроби рисуются крупно). Voice/avatar = маленький, Lottie 2D, не нужно много места. Тренажёр = форма, нужна средняя ширина.
- **D-02 — Tablet (768-1024px): vertical stack.** Доска top (60vh), голос+аватар middle (15vh), тренажёр bottom (25vh). Все три видны одновременно (ACC LES-01: «без переключения вкладок»).
- **D-03 — Mobile (<768px): show prompt, not full layout.** Render placeholder: «Klassio лучше работает на планшете или ноутбуке. Пожалуйста, открой урок с устройства побольше.» Не блокируем urок, но not priority. Для autonomous mode — этот placeholder проще чем поддерживать mobile-first layout.
- **D-04 — Tailwind breakpoints.** `lg:` (>=1024px) = 3-col, `md:` (768-1024px) = stacked, default = mobile prompt. Используем CSS Grid для desktop layout, Flexbox для tablet stack.
- **D-05 — Panel borders/visual separation.** Каждая панель = `<Card>` из shadcn/ui (re-use Phase 1 component). Тонкие borders, минимальный padding. Panel headings: «Доска», «Голос», «Тренажёр».

### Event bus

- **D-06 — Typed pub/sub via React Context.** Custom `LessonBusProvider` оборачивает страницу урока. Provides `{ on(event, handler), off(event, handler), emit(event, payload) }`. Type-safe через discriminated union events. **Rationale:** zero deps, full type safety, easy to swap implementation в Phase 4+ если понадобится (e.g. на BroadcastChannel для cross-tab или на Zustand для persisted state).
- **D-07 — Event types (Phase 3 baseline).** Discriminated union в `lib/lesson-bus/events.ts`:
  - `lesson:test` — payload: `{ source: string; counter: number }` (proof-of-bus)
  - `lesson:start` — payload: `{ lessonId: string; at: Date }` (emitted by page on mount)
  - `lesson:end` — payload: `{ lessonId: string; at: Date }` (emitted on "Завершить урок" click)
  - **Phase 4+ extends this list:** `board:say`, `board:scene`, `voice:state`, `trainer:input`, `trainer:answer`. Phase 3 only needs the 3 above to demo the contract.
- **D-08 — Memory model: simple Map<event, Set<handler>>.** No history, no replay (новый subscriber не получает прошлые события). Если в Phase 4+ понадобится — добавим `LATEST_VALUE` опционально per event.
- **D-09 — Hooks.** `useLessonBus()` возвращает `{ on, off, emit }` типизированно. `useLessonBusEvent(event, handler)` — convenience subscriber с auto-cleanup в useEffect.
- **D-10 — Bus instance scope.** Один bus per lesson page mount (не глобальный). При unmount — все subscribers cleared. Это значит, если есть navigation guard (например пользователь закрыл вкладку и вернулся) — bus стартует заново. ОК для Phase 3 — реальные state (lesson status) живёт в БД.

### Lesson page server component

- **D-11 — `app/lesson/[id]/page.tsx`** заменяет placeholder из Phase 1. Server Component. Делает:
  1. `auth()` → проверка session (middleware уже redirect'ит, defensive double-check)
  2. Drizzle query `lesson` by id, where userId = session.user.id (ownership)
  3. Если не найден или не принадлежит — `notFound()` (Next.js 404)
  4. Если status === 'completed' / 'cancelled' / 'missed' — render read-only view с "Урок завершён, вернуться в ЛК"
  5. Если status === 'scheduled' AND `canStartLesson(scheduledAt, durationMin, now) === false` — render "Урок ещё не начался" с обратным таймером
  6. Если status === 'scheduled' AND can-start-true → server action transitions to 'in_progress' (UPDATE lesson SET status='in_progress')
  7. Если status === 'in_progress' → render 3 панели + bus
- **D-12 — "Завершить урок" Server Action.** В `app/lesson/[id]/end-lesson.ts`. UPDATE lesson SET status='completed', `actualEndAt` = now (новое nullable поле в schema?). Затем redirect('/lessons').
- **D-13 — `actualEndAt` nullable column?** Phase 1 schema имеет `scheduledAt`, `durationMin`, status. Сейчас Phase 3 добавляем nullable timestamp `actual_end_at` (и `actual_start_at`?) для аналитики. **Recommended:** добавить оба — `actual_start_at` (момент когда status стал 'in_progress'), `actual_end_at` (момент завершения). Поможет в Phase 10 (recording duration), Phase 12 (E2E).
- **D-14 — Status transition concurrency.** Если ребёнок открыл lesson page в 2 вкладках — обе попытаются UPDATE status. Решение: idempotent UPDATE (UPDATE lesson SET status='in_progress', actual_start_at=COALESCE(actual_start_at, now()) WHERE id=?). Не блокируем — let last write win, but первый actual_start_at preserved.

### Adaptive layout details

- **D-15 — CSS Grid template для desktop.** `grid-template-columns: 1fr 24rem` (board flexible, right column fixed 24rem). Right column = `grid-template-rows: 12rem 1fr` (avatar fixed 12rem height, trainer flex). Всего 100vh.
- **D-16 — Resize handling.** Page reload или window resize crossing breakpoint → re-render через CSS media queries (no JS-controlled layout).
- **D-17 — Mobile prompt стилистика.** Centered card с emoji 🖥️📱, RU text, ссылка "Вернуться в расписание" (`/lessons`).

### Test event flow

- **D-18 — "Тест шины" button** в **voice placeholder** (top right). При клике emits `lesson:test` event с counter инкрементируется по нажатию.
- **D-19 — Trainer placeholder listens** на `lesson:test` и показывает «Получено N тестовых событий» — счётчик растёт. **Rationale:** доказывает что emit из panel A → handler в panel B работает (cross-panel communication через bus).
- **D-20 — Test button hidden in production.** Wrap test button в `process.env.NODE_ENV !== 'production'` check (или фичефлаг env var). Но в Phase 3 production deploy ещё не запустился (Phase 1 deferred), так что button visible во всех env'ах текущей фазы. Фичефлаг env: `NEXT_PUBLIC_LESSON_BUS_TEST=true`. Default `true` для Phase 3 demo, `false` после Phase 11.

### Claude's Discretion

- Точные иконки для panel headings (Lucide icons OK — уже в deps)
- Spacing между панелями (gap-2 / gap-4)
- Точная стилизация placeholder text внутри панелей
- Имена React contexts (`LessonBusContext` vs `LessonEventContext`)
- Имена hooks (`useLessonBus` vs `useLessonEvents`)
- Тестовая стратегия: vitest unit для bus subscribe/emit/cleanup, vitest component для useLessonBusEvent hook, Playwright E2E для page render + test-event flow (приоритет: bus unit tests + 1 E2E — сильное coverage)

</decisions>

<specifics>
## Specific Ideas

- Заголовки панелей: «Доска» (board), «Голос» (voice+avatar), «Тренажёр» (HTML trainer). Простые, дети 5 класса понимают.
- Placeholder content в каждой панели до Phase 4/6/7:
  - Доска: иконка `<Pencil />` + «Здесь будет доска (Phase 4)»
  - Голос: иконка `<Mic />` + «Голос+аватар появятся в Phase 6» + кнопка [Тест шины]
  - Тренажёр: иконка `<BookOpen />` + «Тренажёр появится в Phase 7» + счётчик «Получено N тестовых событий»
- "Завершить урок" — primary button в правом верхнем углу страницы (sticky / fixed). Цвет destructive vs primary? — primary (т.к. legitimate user action), но с confirm dialog «Точно завершить урок?» чтобы случайно не закрыть.
- При status='completed' page показывает: «Урок проведён DATE. Запись появится в Phase 10. ‹Вернуться в ЛК›».

</specifics>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Project & milestone

- `.planning/PROJECT.md` — locked decisions, invariants
- `.planning/REQUIREMENTS.md` § LES-01 (lesson architecture acceptance criteria)
- `.planning/ROADMAP.md` § Phase 3 (Goal + Success Criteria — 5 items)

### Phase 1-2 deliverables (re-use, do not re-build)

- `.planning/phases/01-account-shell/01-CONTEXT.md` — auth, RU language, locked stack
- `.planning/phases/01-account-shell/01-04-SUMMARY.md` — auth() pattern, middleware behavior, NextAuth split-config
- `.planning/phases/01-account-shell/01-05-SUMMARY.md` — UI patterns, shadcn/ui, Tailwind v4
- `.planning/phases/01-account-shell/01-06-SUMMARY.md` — neon-http migration, E2E test pattern, magic-link extraction Pattern A/B
- `.planning/phases/02-admin/02-CONTEXT.md` — schedule UI patterns, smart-date formatting
- `.planning/phases/02-admin/02-02-SUMMARY.md` — `/lessons` page server component pattern, week grouping, RSC→client serialization (ISO strings)
- `lib/db/schema.ts` — current `lesson` table; Phase 3 may add `actual_start_at` / `actual_end_at`
- `lib/db/index.ts` — neon-http client (re-use)
- `app/lessons/page.tsx` — `/lessons` linking to `/lesson/[id]` via Start button (re-use)
- `app/lessons/can-start.ts` — re-use unchanged (used to gate page entry)
- `auth.ts` — auth() server function

### External docs

- React Context patterns — https://react.dev/reference/react/createContext
- Discriminated unions in TypeScript — https://www.typescriptlang.org/docs/handbook/2/narrowing.html#discriminated-unions
- Tailwind v4 grid utilities — https://tailwindcss.com/docs/grid-template-columns
- Lucide icons (already in shadcn deps) — https://lucide.dev

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets

- **shadcn `<Card>`** (`components/ui/card.tsx`) — wrap each panel.
- **shadcn `<Button>`** — for "Завершить урок" + Test bus button.
- **shadcn `<Collapsible>`** (added in Phase 2) — could be used for confirm dialog or expandable info, but D-12 confirm uses simpler shadcn `<Dialog>` if needed.
- **`auth()`** (`@/auth`) — re-use for session retrieval in server component.
- **`canStartLesson()`** (`app/lessons/can-start.ts`) — re-use for entry guard.
- **`db`** (`@/lib/db`) — neon-http client for read queries.
- **`pg` (node-postgres)** — for the status update (DML on Neon Free reliable via pg).
- **`Intl.DateTimeFormat('ru-RU')`** — for date display in lesson-completed view.

### Patterns to Follow

- **Server Component + Server Action** for page-level data fetching + mutations (per Next.js 15 App Router).
- **`'use client'` boundary**: only the bus provider, hooks, and panel placeholders need client. The page shell itself = server component.
- **RSC→Client serialization**: pass IDs / serialized objects across the boundary, не Date objects.
- **Idempotent DML for status transitions** — match the `COALESCE(actual_start_at, now())` pattern.
- **Test event button = dev fixture**: hide via env var в production, but не блокируется в Phase 3.

### Anti-patterns to Avoid

- **Не плодить глобальные синглтоны для bus** — bus = per-page-mount React Context, не window-level.
- **Не использовать window.addEventListener** для cross-panel events — bus инкапсулирует это.
- **Не блокировать render через client-only checks** — server component делает auth + ownership + status transition; client просто получает hydrated tree.

</code_context>

<deferred_ideas>
## Deferred Ideas (out of phase scope)

- **Lesson cancellation logic** (window close, tab close, navigation away) — defer to Phase 12 (E2E QA) or never (since lesson-end via "Завершить урок" button is explicit).
- **Multi-tab coordination** (BroadcastChannel for syncing bus across tabs) — defer until real use case (e.g., parent watching from second device).
- **Persisted bus state across navigation** — defer; current page-mount-scoped bus is fine.
- **Mobile-first layout** — explicit non-priority per LES-01 acceptance.
- **Lesson timer / countdown** ("осталось 30 мин") — minor UX nicety, defer to Phase 9 or 11.
- **Offline mode / network failure handling** — defer to Phase 12.

</deferred_ideas>

<assumptions>
## Assumptions Made (auto-mode)

- **A1**: Bus implementation = React Context custom (D-06), not Zustand or mitt. If Phase 4+ shows context re-renders cause perf issues, refactor to Zustand or `useSyncExternalStore`. For Phase 3 placeholders, perf не критично.
- **A2**: Test event button visible in current env (D-20 fichflag default true). User might want it hidden after Phase 3 — flag exists для override.
- **A3**: Lesson status auto-transition (scheduled → in_progress) on first valid visit (D-11). Alternative: explicit "Войти в урок" click. Auto seems lower-friction для child.
- **A4**: Confirm dialog для "Завершить урок". Alternative: instant exit. Confirm prevents accidental exit (kid clicks).
- **A5**: `actual_start_at` + `actual_end_at` nullable timestamps добавлены в Phase 3 schema migration (D-13). Alternative: defer until Phase 10. Включаем сейчас — бесплатно, Phase 10 не блокируется.
- **A6**: Mobile = simple prompt, not адаптивный layout (D-03). User said «телефон не приоритет» — это honor.
- **A7**: 3-event baseline для bus (D-07): test, start, end. Phase 4 extends. Recommended over более широкого baseline т.к. Phase 4-7 все добавят свои events с известными именами; не пытаемся predict-and-lock сейчас.

User can override на return через `/gsd-discuss-phase 3 --refine` или просто «Claude, в Phase 3 переделай X».

</assumptions>
