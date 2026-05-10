---
phase: 04-board-deploy
plan: "03"
subsystem: ui
tags: [tldraw, sse, shadcn, playwright, lesson-bus, board, react]

# Dependency graph
requires:
  - phase: 04-board-deploy
    plan: "01"
    provides: lib/board/executor.ts (executeToolCall) + lib/board/index.ts
  - phase: 04-board-deploy
    plan: "02"
    provides: app/api/draw/route.ts — POST SSE endpoint
  - phase: 03-lesson-shell
    plan: "03"
    provides: LessonShell, lesson-bus, panel placeholders, E2E patterns
provides:
  - components/panels/board-panel.tsx — full tldraw integration (Phase 3 placeholder replaced)
  - components/ui/textarea.tsx — shadcn Textarea component
  - lib/lesson-bus/events.ts — BoardSayPayload + board:say in LessonBusEvent union
  - e2e/board-panel.spec.ts — 5 Playwright smoke tests (BRD-01)
affects:
  - 05-deploy (production deploy DEFERRED — see MANUAL-ACTIONS.md)
  - 06-voice (board:say stub ready; Phase 6 will call bus.emit)
  - 07-trainer (TrainerPanel now accepts optional lessonId for Phase 7)

# Tech tracking
tech-stack:
  added:
    - "shadcn Textarea component (components/ui/textarea.tsx)"
  patterns:
    - "tldraw dynamic import ssr:false via next/dynamic — avoids window/document SSR errors"
    - "SSE ReadableStream reader pattern for POST streaming (no EventSource — requires GET)"
    - "executeDraw() helper accepts explicit promptText — avoids useState batch flush race in chip auto-submit"
    - "vi.mock('next/dynamic') + vi.mock('tldraw/tldraw.css') for unit-testable board panel"
    - "E2E: .tl-canvas CSS class as stable tldraw mount signal (no canvas-content assertions)"
    - "board:say discriminated union entry in LessonBusEvent as Phase 6 placeholder"

key-files:
  created:
    - components/ui/textarea.tsx
    - e2e/board-panel.spec.ts
  modified:
    - components/panels/board-panel.tsx
    - components/panels/voice-panel.tsx
    - components/panels/trainer-panel.tsx
    - components/lesson-shell.tsx
    - components/lesson-shell/__tests__/panels.test.tsx
    - lib/lesson-bus/events.ts
    - lib/lesson-bus/index.ts

key-decisions:
  - "executeDraw(promptText) accepts explicit string — chip auto-submit passes suggestion directly without depending on setPrompt state flush"
  - "tldraw CSS imported in board-panel.tsx (component-level) with tldraw-container wrapper div to scope styles and avoid Tailwind v4 conflicts"
  - "vi.mock('next/dynamic') in panels.test.tsx returns stub that calls onMount with mock editor — allows unit testing without tldraw DOM dependency"
  - "E2E chip click test uses .tl-canvas waitFor before asserting textarea value — ensures tldraw mounted before interaction"

requirements-completed:
  - BRD-01
  - PED-01

# Metrics
duration: 12min
completed: 2026-05-10
---

# Phase 04 Plan 03: BoardPanel UI Summary

**Full tldraw board integration replacing Phase 3 placeholder — prompt textarea, 3 suggestion chips, SSE streaming with executeToolCall, narration panel, board:say stub for Phase 6 TTS integration, and 5 Playwright E2E smoke tests**

## Performance

- **Duration:** ~12 min
- **Started:** 2026-05-10T05:33:00Z
- **Completed:** 2026-05-10T05:43:00Z
- **Tasks:** 3
- **Files created:** 3 (textarea.tsx, board-panel.tsx rewrite, board-panel.spec.ts)
- **Files modified:** 6

## Accomplishments

- Extended `lib/lesson-bus/events.ts`: added `BoardSayPayload` type and `board:say` variant to `LessonBusEvent` discriminated union. Phase 6 TTS integration will emit this without touching events.ts again.
- Full rewrite of `components/panels/board-panel.tsx` (366 lines, min 150 required):
  - tldraw via `next/dynamic(() => import('tldraw').then(m => m.Tldraw), { ssr: false })` — avoids window/document SSR errors
  - Prompt textarea (shadcn), 3 suggestion chips (Сложение в столбик, Дроби, Умножение на 10), Объяснить + Очистить buttons
  - `executeDraw(promptText)` core function: fetch POST /api/draw, ReadableStream SSE reader, executeToolCall dispatch, narration panel (say tool), error display
  - Chip auto-submit: `handleChipClick` sets prompt state AND calls `executeDraw(suggestion)` directly (avoids React batching race)
  - Phase 6 TODO comment: `_bus.emit('board:say', ...)` for TTS integration
  - Export shape `BoardPanel({ lessonId })` preserved — LessonShell needs no interface changes
- Added shadcn `<Textarea>` component (`components/ui/textarea.tsx`)
- Updated `LessonShell` to pass `lessonId` to `<BoardPanel>`, `<VoicePanel>`, `<TrainerPanel>`
- Updated `VoicePanel` and `TrainerPanel` to accept optional `lessonId` prop (Phase 6/7 readiness)
- Updated `panels.test.tsx`: 5 new BoardPanel tests with mocked `next/dynamic`, `tldraw/tldraw.css`, and `lib/board executeToolCall`; total unit tests 117 (all green)
- Created `e2e/board-panel.spec.ts`: 5 Playwright smoke specs — canvas renders, textarea visible, chips visible, chip fills textarea, no console errors

## Task Commits

1. **Task 1: extend lesson-bus events.ts** — `a0f1cf2` (feat)
2. **Task 2: board-panel.tsx rewrite + shadcn Textarea + LessonShell + panel signatures + tests** — `a8001f0` (feat)
3. **Task 3: E2E board panel spec** — `64997f9` (feat)

## Files Created/Modified

- `lib/lesson-bus/events.ts` — BoardSayPayload + board:say in LessonBusEvent (modified)
- `lib/lesson-bus/index.ts` — exports BoardSayPayload (modified)
- `components/ui/textarea.tsx` — shadcn Textarea component (created)
- `components/panels/board-panel.tsx` — full rewrite, 366 lines (modified)
- `components/lesson-shell.tsx` — passes lessonId to all 3 panels (modified)
- `components/panels/voice-panel.tsx` — optional lessonId prop added (modified)
- `components/panels/trainer-panel.tsx` — optional lessonId prop added (modified)
- `components/lesson-shell/__tests__/panels.test.tsx` — 5 new BoardPanel tests (modified)
- `e2e/board-panel.spec.ts` — 5 Playwright smoke specs (created)

## Decisions Made

- **executeDraw(promptText) takes explicit string:** Chip click calls `setPrompt(suggestion)` AND `executeDraw(suggestion)` directly. If it relied on `handleDraw()` which reads `prompt` state, the React batch flush race would send an empty/stale prompt. Passing the string explicitly avoids the race entirely.
- **tldraw CSS at component level:** `import 'tldraw/tldraw.css'` in board-panel.tsx (not globals.css) with a `tldraw-container` div wrapper. This scopes the CSS import and avoids global Tailwind v4 conflicts. Build verified clean.
- **vi.mock('next/dynamic'):** The mock returns a synchronous component stub that calls `onMount` in `useEffect` with a mock editor object. This makes the board panel unit-testable in vitest happy-dom without any real tldraw DOM dependencies.
- **E2E: no form submission:** Board E2E specs do not submit the prompt or assert draw output. This avoids OPENAI_API_KEY dependency in CI and SSE timing flakiness. The 5 specs assert UI presence and chip interaction only.

## Deploy Status

Production deploy is DEFERRED to user manual action.
See `.planning/MANUAL-ACTIONS.md` for step-by-step instructions:
- Vercel deploy: `vercel --prod` with OPENAI_API_KEY env var
- Cloudflare CDN setup in front of Vercel
- DNS configuration
- DEP-01 acceptance criteria #4–#6 (RU user without VPN smoke test)

Phase 4 implementation is complete. Deploy is a user action.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Chip auto-submit race with React useState batching**
- **Found during:** Task 2 implementation review + test run
- **Issue:** Plan's template called `setPrompt(suggestion)` then `handleDraw()` in chip click handler. `handleDraw` reads from `prompt` state, which hasn't been updated yet when handleDraw captures it in its `useCallback` closure (React batches state updates). Chip submit would fire with empty/previous prompt.
- **Fix:** Extracted `executeDraw(promptText: string)` helper that accepts the prompt text directly. `handleChipClick` calls `setPrompt(suggestion)` (for UI) AND `executeDraw(suggestion)` (for submit), bypassing the state flush dependency.
- **Files modified:** `components/panels/board-panel.tsx`
- **Commit:** a8001f0

**2. [Rule 1 - Bug] panels.test.tsx: existing BoardPanel test asserted 'Phase 4' placeholder**
- **Found during:** Task 2 (test run after board-panel.tsx rewrite)
- **Issue:** The Phase 3 test `expect(screen.getByText(/Phase 4/)).toBeDefined()` fails after rewrite because the Phase 4 placeholder text is gone. Also `BoardPanel` now requires `lessonId` prop (TypeScript error).
- **Fix:** Updated panels.test.tsx: changed BoardPanel test to assert `Доска` heading and `textarea with placeholder`, added `vi.mock('next/dynamic')` and `vi.mock('tldraw/tldraw.css')` for test isolation, added 5 new tests (heading, textarea, chips, fetch call). Removed Phase 4 placeholder assertion.
- **Files modified:** `components/lesson-shell/__tests__/panels.test.tsx`
- **Commit:** a8001f0

**3. [Rule 2 - Missing critical] chip click test needed fetch mock to avoid unhandled promise rejection**
- **Found during:** Task 2 test run (unhandled error from chip click auto-submit)
- **Issue:** `handleChipClick` auto-submits which calls `fetch()`. The `vi.fn()` stub (no return value) returned `undefined`, causing `.then()` TypeError as unhandled exception. Without a mock returning a valid response, the test showed as "unhandled error" even though assertions passed.
- **Fix:** Added proper fetch mock (ReadableStream with done event) in the chip-click test case.
- **Files modified:** `components/lesson-shell/__tests__/panels.test.tsx`
- **Commit:** a8001f0

## Known Stubs

- `VoicePanel.lessonId` prop: accepted but ignored (`_lessonId`). Phase 6 voice integration will use it.
- `TrainerPanel.lessonId` prop: accepted but ignored (`_lessonId`). Phase 7 trainer integration will use it.
- `_bus` in BoardPanel: `useLessonBus()` result stored but not used. Phase 6 will call `_bus.emit('board:say', ...)` when `say` tool fires.
- These stubs are intentional — they are Phase 6/7 extension points, not missing functionality for Phase 4.

## Threat Flags

None. All threats in the plan's `<threat_model>` addressed:
- T-04-03-01: Narration texts rendered via React JSX (auto-escaping); no `dangerouslySetInnerHTML`
- T-04-03-02: Accepted — lessonId from server-rendered page.tsx (DB-verified); /api/draw re-validates
- T-04-03-03: Accepted — button disabled while running; MAX_AGENT_TURNS=30 on server
- T-04-03-04: Accepted — error text shown in UI; MVP-acceptable; Phase 12 QA will audit

---
*Phase: 04-board-deploy*
*Completed: 2026-05-10*

---

## Self-Check: PASSED

Files verified:
- FOUND: components/panels/board-panel.tsx (366 lines, ≥150 minimum)
- FOUND: components/ui/textarea.tsx
- FOUND: lib/lesson-bus/events.ts (BoardSayPayload + board:say in union)
- FOUND: lib/lesson-bus/index.ts (BoardSayPayload exported)
- FOUND: components/lesson-shell.tsx (lessonId passed to all 3 panels)
- FOUND: components/panels/voice-panel.tsx (optional lessonId prop)
- FOUND: components/panels/trainer-panel.tsx (optional lessonId prop)
- FOUND: components/lesson-shell/__tests__/panels.test.tsx (5 new BoardPanel tests)
- FOUND: e2e/board-panel.spec.ts (5 smoke tests)

Commits verified:
- FOUND: a0f1cf2 feat(04-03): extend lesson-bus events.ts with board:say stub for Phase 6
- FOUND: a8001f0 feat(04-03): rewrite board-panel.tsx with tldraw + prompt UI + SSE processing
- FOUND: 64997f9 feat(04-03): Playwright E2E smoke spec for board panel (BRD-01)

Tests: 117/117 unit tests green (5 new BoardPanel tests added)
Build: npm run build passes (lesson/[id] route 26.8 kB)
TypeScript: tsc --noEmit exits 0
