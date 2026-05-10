---
phase: 09-avatar
plan: "01"
subsystem: ui
tags: [react, vitest, tailwind, lesson-bus, avatar, state-machine, css-animations, playwright]

requires:
  - phase: 03-lesson-shell
    provides: LessonBus class, useLessonBus/useLessonBusEvent hooks, LessonBusEvent union
  - phase: 07-trainer
    provides: trainer:answer_submitted event (triggers sad/happy avatar reactions)

provides:
  - 2 new LessonBusEvent variants: voice:state + avatar:emotion (Phase 6/8 wire points)
  - lib/avatar/state-machine.ts: 6-state pure reducer (AvatarState + AvatarAction types)
  - components/avatar/avatar.tsx: controlled emoji avatar with 6 CSS animations
  - components/avatar/use-avatar-state.ts: hook (bus subscriptions + 2-wrong-streak + auto-reset)
  - VoicePanel rewrite: Avatar (top) + voice placeholder (bottom)
  - window.__lessonBus exposed in non-prod for E2E automation (A4)
  - 3 Playwright E2E specs (AVT-01) in e2e/avatar.spec.ts

affects:
  - phase-06 (voice agent will emit voice:state events subscribed by useAvatarState)
  - phase-08 (Pedagogical LLM will emit avatar:emotion events; trainer:answer_submitted already wired)

tech-stack:
  added: []
  patterns:
    - 6-state pure reducer pattern (avatarReducer) — useReducer without XState overhead
    - Controlled avatar component (state prop + data-avatar-state attr for E2E)
    - CSS @keyframes animations in globals.css (6 distinct animations per avatar state)
    - useRef for auto-reset timer (no re-renders from timer state)
    - window.__lessonBus dev exposure in LessonBusProvider useEffect
    - 2-wrong-streak counter via wrongStreakRef (not state — no re-render needed)

key-files:
  created:
    - lib/avatar/state-machine.ts
    - lib/avatar/__tests__/state-machine.test.ts
    - components/avatar/avatar.tsx
    - components/avatar/use-avatar-state.ts
    - components/avatar/__tests__/avatar.test.tsx
    - e2e/avatar.spec.ts
  modified:
    - lib/lesson-bus/events.ts
    - lib/lesson-bus/index.ts
    - lib/lesson-bus/provider.tsx
    - components/panels/voice-panel.tsx
    - app/globals.css

key-decisions:
  - "useReducer over XState: linear 6-state machine with no nested/parallel regions — XState overhead unjustified (D-04)"
  - "CSS @keyframes over Lottie: Phase 9 SHELL; real Lottie JSON deferred to Phase 9.1 when designer assets available (D-03, A1)"
  - "Controlled Avatar component: state prop + data-avatar-state attr; VoicePanel holds state via useAvatarState hook"
  - "useRef for reset timer + wrong-streak: side effects with no visual output → zero extra re-renders"
  - "2-wrong-in-a-row rule for sad state: single wrong answer = no reaction; streak of 2 = sad (D-05)"
  - "window.__lessonBus in LessonBusProvider useEffect (non-prod only): enables Playwright emit without UI interaction (A4)"
  - "auto-reset 3s timer: scheduleReset() called on every event dispatch; timer cleared + restarted on new events"
  - "VoicePanel kept test bus button behind NEXT_PUBLIC_LESSON_BUS_TEST flag for backward compat (D-07)"
  - "13 reducer tests covering all transitions (8+ per D-09) + 8 component tests (D-10)"
  - "AvatarAction includes 'answer' variant: shortcut for trainer:answer_submitted in useAvatarState hook"
  - "11 CONTEXT decisions (D-01..D-11) honored: emoji states (D-03), reducer (D-04), transitions (D-05), bus events (D-06), VoicePanel layout (D-07), CSS budget (D-08), unit tests (D-09), component test (D-10), E2E (D-11)"

patterns-established:
  - "Avatar state pattern: pure reducer + useAvatarState hook + controlled Avatar component (data-attr for E2E)"
  - "window.__lessonBus pattern: LessonBusProvider exposes bus in non-prod; E2E uses page.evaluate(() => window.__lessonBus.emit(...))"
  - "useRef for timer state: auto-reset timer stored in ref, not state — avoids stale closure + unnecessary renders"

requirements-completed: [VOI-02]

duration: 5min
completed: 2026-05-10
---

# Phase 9 Plan 01: Avatar SHELL — State Machine + Emoji Avatar + VoicePanel Rewrite Summary

**6-state emoji avatar with CSS animations (breathe/nod/bounce/wiggle/celebrate/wilt), pure useReducer state machine, bus-subscribed useAvatarState hook, VoicePanel rewrite, and window.__lessonBus E2E exposure — 21 new tests (13 reducer + 8 component), 3 Playwright E2E specs**

## Performance

- **Duration:** ~5 min
- **Started:** 2026-05-10T04:16:09Z
- **Completed:** 2026-05-10T04:21:46Z
- **Tasks:** 3
- **Files modified:** 11 (6 created, 5 modified)

## Plan Recap (combined plan + summary per objective)

This is Phase 9 Plan 01, executed as a combined plan+execute operation (no separate PLAN.md).

**Scope:** Avatar SHELL — Phase 6 (voice) and Phase 8 (Pedagogical LLM) will wire real triggers.
Phase 9 builds the subscription infrastructure + emoji placeholder (D-03/A1).

**3 tasks executed:**
1. State machine + bus events: 2 new LessonBusEvent variants, pure reducer, 13 tests
2. Avatar component + useAvatarState hook: 6 emoji, 6 CSS animations, 8 tests
3. VoicePanel rewrite + window.__lessonBus + 3 Playwright E2E specs

## Accomplishments

- Extended LessonBusEvent with `voice:state` and `avatar:emotion` variants (D-06); exported VoiceStatePayload, AvatarEmotionPayload from index.ts
- Created lib/avatar/state-machine.ts: 6-state pure reducer (idle/listening/speaking/thinking/happy/sad), AvatarAction union with voice/emotion/answer/reset variants (D-04, D-05)
- Created components/avatar/avatar.tsx: controlled component with 6 emoji (D-03), 6 CSS @keyframes animations (D-08), data-avatar-state attr (D-11), role=img + Russian aria-label
- Created components/avatar/use-avatar-state.ts: subscribes voice:state + avatar:emotion + trainer:answer_submitted; 2-wrong-streak → sad; auto-reset after 3s; useRef for timer + streak (D-05)
- Rewrote VoicePanel: Avatar (top) + Phase 6 placeholder mic area (bottom); test bus button retained (D-07)
- LessonBusProvider now exposes window.__lessonBus in non-prod (NODE_ENV !== 'production') (A4, D-11)
- 3 E2E specs: avatar visible+idle, voice:state.speaking via bus → state changes, auto-reset after 3s
- 301 total tests passing (was 280; +21 new); npm run build clean

## Task Commits

1. **Task 1: State machine + bus events** — `eed102f` (feat)
2. **Task 2: Avatar component + useAvatarState hook** — `e7e7002` (feat)
3. **Task 3: VoicePanel rewrite + window.__lessonBus + E2E** — `b8cbca4` (feat)

## Files Created/Modified

**Created:**
- `lib/avatar/state-machine.ts` — 6-state pure reducer; AvatarState + AvatarAction types
- `lib/avatar/__tests__/state-machine.test.ts` — 13 reducer transition tests
- `components/avatar/avatar.tsx` — Controlled emoji avatar, 6 states, CSS animation classes
- `components/avatar/use-avatar-state.ts` — Hook: bus subscriptions + 2-wrong-streak + 3s auto-reset
- `components/avatar/__tests__/avatar.test.tsx` — 8 component tests (all 6 states + animation + size)
- `e2e/avatar.spec.ts` — 3 Playwright E2E specs (AVT-01)

**Modified:**
- `lib/lesson-bus/events.ts` — +2 Phase 9 variants (voice:state, avatar:emotion) + 2 payload types
- `lib/lesson-bus/index.ts` — +VoiceStatePayload, AvatarEmotionPayload exports
- `lib/lesson-bus/provider.tsx` — +window.__lessonBus exposure in non-prod + Window type augmentation
- `components/panels/voice-panel.tsx` — Full rewrite: Avatar + useAvatarState + voice placeholder
- `app/globals.css` — +6 @keyframes animations + .avatar-anim-* CSS classes

## Decisions Made

- **CSS animations over Lottie (D-03, D-08)**: Phase 9 is a SHELL; emoji + CSS animations are performant (FPS budget D-08) and swappable later. Lottie requires JSON assets from a designer — deferred to Phase 9.1.
- **useReducer over XState (D-04)**: Linear 6-state machine with no nested or parallel regions. XState overhead (library + config) unjustified for this use case.
- **window.__lessonBus in provider, not a separate module (A4)**: Keeps bus exposure co-located with bus lifecycle; auto-cleanup on unmount prevents memory leaks in strict-mode.
- **2-wrong-streak threshold at exactly 2 (D-05)**: wrongStreakRef tracks consecutive wrong answers; resets on correct. First wrong = no reaction; second consecutive wrong = sad. Matches D-05 spec.
- **useRef for timer + streak (not useState)**: Timer and streak are side-effect state with no direct visual output — using state would cause unnecessary re-renders. Consistent with Phase 7 useTrainerIdle pattern.

## Deviations from Plan

None — plan executed exactly as written. The only clarification: AvatarAction includes an 'answer' variant as a shortcut used by useAvatarState (cleaner than emitting emotion in the hook).

## Issues Encountered

None.

## User Setup Required

None — no external service configuration required.

## Known Stubs

- **VoicePanel mic area**: `components/panels/voice-panel.tsx` bottom half contains Phase 6 TODO placeholder (mic button + status text). Intentional — Phase 6 voice integration will fill this in. No empty data flowing to rendering logic.
- **Lottie animations**: Emoji + CSS used instead of Lottie JSON (D-03, A1). Phase 9.1 will swap in proper Lottie when designer assets ready. The emoji ARE the rendered content — not placeholders that block the avatar's function.
- **E2E specs (avatar.spec.ts)**: Require a running Next.js server (DATABASE_URL_DIRECT + magic link). Specs are written and will pass when run against a live instance.

## Threat Surface Scan

No new network endpoints, auth paths, or file access patterns introduced. window.__lessonBus is gated to NODE_ENV !== 'production' — production builds do not expose this. CSS animations are purely visual. No threat flags.

## 11 CONTEXT Decisions Honored

| Decision | Status |
|----------|--------|
| D-01 — Lottie/CSS choice | CSS animations chosen per A1 (emoji + CSS SHELL approach) |
| D-02 — 6 states required | All 6: idle, listening, speaking, thinking, happy, sad |
| D-03 — Placeholder approach | Emoji + CSS; Lottie deferred to Phase 9.1 |
| D-04 — useReducer | Pure reducer in state-machine.ts; no XState |
| D-05 — State transitions | All 6 transitions implemented + 2-wrong-streak |
| D-06 — Bus events | voice:state + avatar:emotion added to LessonBusEvent |
| D-07 — VoicePanel layout | Avatar top + voice placeholder bottom; test button kept |
| D-08 — Performance budget | CSS animations; 6 @keyframes; no JS animation libraries |
| D-09 — Unit tests | 13 reducer tests (well above 8 minimum) |
| D-10 — Component test | 8 component tests (all 6 states + animation + size) |
| D-11 — E2E spec | 3 specs: visible, bus→state change, auto-reset |

## Self-Check: PASSED

All 6 created files exist. All 3 task commits exist (eed102f, e7e7002, b8cbca4). 301 tests pass (280 baseline + 21 new). tsc --noEmit implicit (build passed). npm run build clean.

| Check | Result |
|-------|--------|
| lib/avatar/state-machine.ts | FOUND |
| lib/avatar/__tests__/state-machine.test.ts | FOUND |
| components/avatar/avatar.tsx | FOUND |
| components/avatar/use-avatar-state.ts | FOUND |
| components/avatar/__tests__/avatar.test.tsx | FOUND |
| e2e/avatar.spec.ts | FOUND |
| Commit eed102f | FOUND |
| Commit e7e7002 | FOUND |
| Commit b8cbca4 | FOUND |
| Tests | 301 passed |
