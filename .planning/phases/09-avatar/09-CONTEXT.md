# Phase 9: 2D Lottie аватар учителя — Context

**Gathered:** 2026-05-10
**Status:** Ready for planning (PARTIAL — voice triggers deferred to Phase 6 unblock)
**Mode:** `--auto` (autonomous run; user AFK)

<domain>
## Phase Boundary

В панели «голос+аватар» рендерится 2D Lottie аватар с минимум 5 состояниями (нейтрально, говорит, думает, радуется, огорчился). State machine на клиенте слушает event bus. Phase 6 voice доставит реальные триггеры; Phase 9 строит SHELL — Lottie + state machine + bus subscription, тестируемые через manual bus events.

**В scope:**
- Lottie animation files (5 states minimum) — generated via simple SVG animations OR placeholder Lottie JSON files (we'll create vector SVG-style animations using `lottie-web` or `@lottiefiles/react-lottie-player`)
- `components/avatar/` directory with state-machine logic
- AvatarState type + bus event subscription
- New bus events: `voice:state` (idle/listening/speaking/thinking) — wires to Phase 6 voice agent
- New bus event: `avatar:emotion` (happy/sad/neutral/concerned) — wires to Phase 8 Pedagogical LLM
- `VoicePanel` integration: replace placeholder with avatar + (placeholder for voice controls — Phase 6)
- Vitest unit tests for state machine
- Playwright E2E spec: navigate lesson → avatar visible → manually fire `voice:state` event → assert avatar state class changes

**НЕ в scope:**
- Real voice integration (Phase 6)
- Real Pedagogical LLM emitting emotions (Phase 8)
- High-fidelity Lottie animations (placeholder Lottie JSON OR simple CSS keyframe animations sufficient for v1)
- Sound effects / character voice
- Lip-sync to voice audio

</domain>

<decisions>
## Implementation Decisions

### Avatar implementation

- **D-01 — Lottie via `@lottiefiles/react-lottie-player`** (или `lottie-react`) — established pattern, lightweight (~50kb gzipped). Alternative: pure CSS animations on SVG. Recommended: Lottie for D-02 5+ states (easy to swap animations later).
- **D-02 — 5 states required**:
  1. `idle` (neutral, breathing) — default
  2. `listening` (slightly leaning, attentive)
  3. `speaking` (mouth movement, hand gestures)
  4. `thinking` (looking up, finger to chin)
  5. `happy` (smile, slight bounce)
  6. `sad` (concerned look — для wrong-answer streak от Phase 8)
  Use 6 states (neutral, listening, speaking, thinking, happy, sad) — covers ROADMAP minimum 5.
- **D-03 — Placeholder Lottie files for Phase 9.** Create 6 simple Lottie JSON files (looped 1-2 sec animations) — could be hand-written using Lottie playground OR generated via `airbnb/lottie-android` tooling. **Simplest path:** use 6 simple emoji-style SVG with CSS animations wrapped в Lottie format via `bodymovin` exporter. **Even simpler:** for Phase 9 SHELL, use 6 distinct Unicode emoji rendered with CSS bounce/wave animations — Lottie can swap in later.
  
  **Recommended SHELL approach:** 6 emoji + CSS animation classes (`avatar-idle`, `avatar-speaking`, etc.). Phase 9.1 (or future) replaces with proper Lottie JSON.

### State machine

- **D-04 — XState или простой reducer?** Простой `useReducer` — overhead XState не нужен для линейной state machine (no nested states, no parallel regions).
- **D-05 — State transitions:**
  - `idle` ← any state, after timeout (default 3s without other events)
  - `listening` ← `voice:state.listening`
  - `speaking` ← `voice:state.speaking`
  - `thinking` ← `voice:state.thinking` или `avatar:emotion.thinking`
  - `happy` ← `avatar:emotion.happy` или `trainer:answer_submitted{correct:true}`
  - `sad` ← `avatar:emotion.sad` или 2 `trainer:answer_submitted{correct:false}` подряд

### Bus events (new)

- **D-06 — Add to `lib/lesson-bus/events.ts`:**
  ```typescript
  | { type: 'voice:state'; payload: { state: 'idle' | 'listening' | 'speaking' | 'thinking' } }
  | { type: 'avatar:emotion'; payload: { emotion: 'neutral' | 'happy' | 'sad' | 'thinking' } }
  ```

### Layout integration

- **D-07 — `VoicePanel` rewrite** — `components/panels/voice-panel.tsx` (current = placeholder с тест-bus button). Replace with:
  - Avatar component (top half of panel)
  - Voice control area (bottom half — placeholder для Phase 6 mic button + status)
  - Keep test-bus button for compatibility (hide in production)
- **D-08 — Performance budget**: avatar should not exceed 60fps drop > 5%. CSS animations cheaper than Lottie. Lottie reduces FPS slightly но in 2D mode acceptable.

### Tests

- **D-09 — Unit tests** для state-machine reducer (8 tests covering transitions).
- **D-10 — Component test** для Avatar (mounts, accepts state prop, renders correct emoji/class).
- **D-11 — E2E** в `e2e/avatar.spec.ts`: open lesson → assert avatar element present → emit `voice:state.speaking` via test-bus exposure → assert avatar state attribute changes (data-avatar-state="speaking" or className matches).

### Claude's Discretion

- Точные эмодзи для каждого состояния:
  - idle: 🙂 (neutral)
  - listening: 👂 (cup ear)
  - speaking: 🗣️ (speaking head)
  - thinking: 🤔 (think)
  - happy: 😊 (smile)
  - sad: 😟 (concerned)
- CSS animations (bounce, wave, etc.) — pick visually-pleasing simple ones
- Avatar size (96-160px depending on layout breakpoint)
- Background style (transparent, soft-coloured circle)

</decisions>

<canonical_refs>
- `.planning/REQUIREMENTS.md` § VOI-02
- `.planning/ROADMAP.md` § Phase 9
- `.planning/PROJECT.md` § DEC-avatar-style (2D Lottie, не 3D, не видео-аватар)
- `.planning/phases/03-lesson-shell/03-CONTEXT.md` (panel slot, bus contract)
- `.planning/phases/06-voice/06-CONTEXT.md` (voice events that avatar will subscribe to — current Phase 9 wires placeholders)
- `lib/lesson-bus/events.ts` (extend with `voice:state` + `avatar:emotion`)
- `components/panels/voice-panel.tsx` (current — full rewrite)

</canonical_refs>

<assumptions>
- **A1**: Phase 9 SHELL with emoji + CSS animations (D-03). Real Lottie JSON delegated to designer / Phase 9.1. Acceptable trade-off for autonomous run где Lottie generation требует tooling.
- **A2**: 6 states (D-02), one above the минимум 5 from ROADMAP. Sad state added for Phase 8 wrong-answer streak feedback.
- **A3**: useReducer (D-04) over XState. Klassio doesn't use XState elsewhere; introducing one library for one component = scope creep.
- **A4**: Test bus exposure для E2E (`window.__lessonBus = bus` в test mode) — same pattern Phase 7 used. If not yet implemented, Phase 9 adds.

</assumptions>
