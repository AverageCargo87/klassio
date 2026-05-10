---
phase: 03-lesson-shell
plan: "02"
subsystem: ui
tags: [react-context, typescript, discriminated-union, pub-sub, event-bus, vitest, testing-library]

# Dependency graph
requires:
  - phase: 03-lesson-shell
    plan: "01"
    provides: "actual_start_at + actual_end_at schema columns — no direct dep but same phase"
provides:
  - "LessonBusEvent discriminated union with lesson:test, lesson:start, lesson:end variants"
  - "LessonBus class: Map<string, Set<handler>> pub/sub with on/off/emit/clear"
  - "LessonBusProvider React Context — one bus per lesson page mount, cleared on unmount"
  - "useLessonBus() hook — typed bus access, throws outside provider"
  - "useLessonBusEvent() hook — typed subscription with auto-cleanup on unmount"
  - "@/lib/lesson-bus barrel exports"
affects:
  - "03-lesson-shell/03-03 — lesson page imports LessonBusProvider + useLessonBusEvent"
  - "03-lesson-shell/03-04 — voice placeholder emits lesson:test via useLessonBus"
  - "03-lesson-shell/03-05 — trainer placeholder subscribes via useLessonBusEvent"
  - "04+ — extends LessonBusEvent union with board:say, voice:state, trainer:input etc."

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Discriminated union + Extract<> generic for type-safe payload narrowing"
    - "Map<string, Set<handler>> internal memory model — no history, no replay"
    - "React Context + useMemo(() => new LessonBus(), []) — one instance per mount"
    - "useEffect with bus.on/bus.off return — automatic subscription cleanup"
    - "TDD RED-GREEN cycle: failing test suite → implementation → all green"

key-files:
  created:
    - lib/lesson-bus/events.ts
    - lib/lesson-bus/bus.ts
    - lib/lesson-bus/provider.tsx
    - lib/lesson-bus/hooks.ts
    - lib/lesson-bus/index.ts
    - lib/lesson-bus/__tests__/bus.test.ts
    - lib/lesson-bus/__tests__/hooks.test.tsx
  modified: []

key-decisions:
  - "LessonBus as class (not factory function) — cleaner `new` instantiation in useMemo"
  - "useMemo (not useState) for bus instance in provider — both are stable per mount, useMemo is idiomatic for derived values"
  - "AnyHandler = (payload: any) => void internal cast — required bridge between typed public API and Map storage"
  - "EventPayload<E> helper type exported from events.ts — enables consumer type narrowing without re-importing Extract"
  - "Zero external dependencies — pure React + TypeScript per constraint #5"

patterns-established:
  - "Event bus extension pattern: add variants to LessonBusEvent union in events.ts — bus.ts + hooks.ts unchanged"
  - "Cross-panel communication: emit from panel A via useLessonBus(), receive in panel B via useLessonBusEvent()"
  - "Barrel import pattern: all symbols from @/lib/lesson-bus — no deep imports needed"

requirements-completed: [LES-01]

# Metrics
duration: 7min
completed: 2026-05-10
---

# Phase 3 Plan 02: Event Bus Core Summary

**Typed in-memory pub/sub bus (LessonBus class + React Context + useLessonBusEvent hook) with discriminated union events and 10 Vitest tests — zero external dependencies**

## Performance

- **Duration:** ~7 min
- **Started:** 2026-05-10T04:40:00Z
- **Completed:** 2026-05-10T04:47:00Z
- **Tasks:** 2
- **Files modified:** 7 (all created)

## Accomplishments
- `LessonBusEvent` discriminated union with 3 variants (lesson:test, lesson:start, lesson:end) and `EventPayload<E>` helper type for consumer type narrowing
- `LessonBus` class with Map-based pub/sub: generic `on/off/emit` methods with TypeScript payload narrowing, `clear()` for unmount cleanup
- `LessonBusProvider` React Context: one bus instance per mount via `useMemo`, clears on unmount via `useEffect` cleanup
- `useLessonBus()` + `useLessonBusEvent()` typed hooks — throws outside provider, auto-unsubscribes on unmount
- 10 Vitest tests all green (6 bus unit + 4 hook integration); 76 total tests passing (no regressions)

## Task Commits

Each task was committed atomically:

1. **Task 1: events.ts + bus.ts (RED → GREEN)** - `c69c740` (feat)
2. **Task 2: provider.tsx + hooks.ts + index.ts (RED → GREEN)** - `96386b3` (feat)

**Plan metadata:** (final commit below)

_Both tasks followed TDD: failing test suite written first, then implementation to GREEN._

## Files Created/Modified
- `lib/lesson-bus/events.ts` — LessonBusEvent discriminated union + LessonTestPayload/LessonStartPayload/LessonEndPayload + EventPayload<E> helper
- `lib/lesson-bus/bus.ts` — LessonBus class: Map<string, Set<AnyHandler>> storage, generic on/off/emit/clear with TypeScript narrowing
- `lib/lesson-bus/provider.tsx` — LessonBusProvider ('use client'): createContext, useMemo bus instantiation, useEffect cleanup
- `lib/lesson-bus/hooks.ts` — useLessonBus() + useLessonBusEvent() ('use client'): context read + throw guard + useEffect subscription
- `lib/lesson-bus/index.ts` — barrel re-exports all public symbols from @/lib/lesson-bus
- `lib/lesson-bus/__tests__/bus.test.ts` — 6 unit tests: emit, multi-subscriber, off, clear, no-throw-empty
- `lib/lesson-bus/__tests__/hooks.test.tsx` — 4 integration tests: on/off/emit access, throw-outside-provider, emit→handler, unmount cleanup

## Decisions Made
- Used `class LessonBus` (not factory function) — `new LessonBus()` in `useMemo` is more idiomatic than `createLessonBus()` for React; class provides better TypeScript type for context value
- `useMemo` (not `useState`) for bus instantiation — both are stable per mount; `useMemo(() => new LessonBus(), [])` signals "derived from nothing, stable reference"
- Internal `AnyHandler = (payload: any) => void` cast necessary to store typed handlers in `Map<string, Set>` without losing public-API generics
- `EventPayload<E>` helper type exported from events.ts so consumers can write `EventPayload<'lesson:test'>` without re-importing `Extract<>`

## Deviations from Plan

None - plan executed exactly as written. Both tasks followed TDD RED/GREEN cycle as specified. No auto-fixes required.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required. Zero new npm packages added.

## Known Stubs

None — this plan builds pure library code (no UI rendering, no data source). No stubs introduced.

## Threat Flags

None — all new surface is in-memory, same JS origin, client-side only. Trust model verified per plan threat register (T-03-02-01 through T-03-02-03 all accepted).

## Next Phase Readiness
- `@/lib/lesson-bus` module ready for import by Plan 03-03 (lesson page) and 03-04/03-05 (panel placeholders)
- `LessonBusProvider` wraps lesson page client tree — Plan 03-03 adds it to layout
- Phase 4+ extends `LessonBusEvent` union in `events.ts` only — bus.ts, provider.tsx, hooks.ts unchanged
- All 76 Vitest tests green; typecheck + build passing

---
*Phase: 03-lesson-shell*
*Completed: 2026-05-10*

## Self-Check: PASSED

**Files verified exist:**
- FOUND: lib/lesson-bus/events.ts
- FOUND: lib/lesson-bus/bus.ts
- FOUND: lib/lesson-bus/provider.tsx
- FOUND: lib/lesson-bus/hooks.ts
- FOUND: lib/lesson-bus/index.ts
- FOUND: lib/lesson-bus/__tests__/bus.test.ts
- FOUND: lib/lesson-bus/__tests__/hooks.test.tsx
- FOUND: .planning/phases/03-lesson-shell/03-02-SUMMARY.md

**Commits verified:**
- FOUND: c69c740 feat(03-02): lesson bus events discriminated union + LessonBus class (6 tests green)
- FOUND: 96386b3 feat(03-02): LessonBusProvider + hooks (useLessonBus, useLessonBusEvent) — 10 tests green

**Tests:** 76/76 green (10 new + 66 prior)
**Typecheck:** exits 0
**Build:** exits 0
