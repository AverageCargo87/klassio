# Phase 8: agent-control — Pattern Map

**Mapped:** 2026-05-13
**Files analyzed:** 20 (9 new production + 9 new test + 2 modified existing)
**Analogs found:** 17 / 20 (3 new files have no exact analog — noted in § No Analog Found)

---

## Critical Discovery: Code Lives in `Klassio/`, Not `tldraw-test/`

The planning docs reference paths like `tldraw-test/components/panels/voice-panel.tsx`.
The actual production codebase is at `C:\Users\krato\ClaudeVibecoding\ClaudeDesktop\Klassio\`.
`tldraw-test/` is a standalone prototype with none of the multi-panel architecture.

All pattern excerpts below use absolute paths from `Klassio/`.

---

## File Classification

| New / Modified File | Role | Data Flow | Closest Analog | Match Quality |
|---|---|---|---|---|
| `lib/client-tools/handlers.ts` | utility/handler | event-driven + request-response | `components/panels/trainer-panel.tsx` (bus emit pattern) | role-match |
| `lib/client-tools/index.ts` | utility/factory | event-driven | `lib/lesson-bus/index.ts` (barrel export pattern) | role-match |
| `lib/contextual-updates/formatters.ts` | utility/transform | transform | `lib/board/executor.ts` (pure-function transform with typed params) | role-match |
| `lib/contextual-updates/forwarder.ts` | utility/bridge | event-driven | `components/panels/voice-panel.tsx` (bus subscription + SDK call) | role-match |
| `lib/lesson-state/index.ts` | utility/state-snapshot | request-response | `lib/avatar/state-machine.ts` (pure state reducer) | role-match |
| `lib/proactive-triggers/visibility.ts` | utility | event-driven | `lib/trainer/use-trainer-idle.ts` (browser event → bus emit) | exact |
| `lib/proactive-triggers/mistakes.ts` | utility | event-driven | `lib/trainer/use-trainer-idle.ts` (streak counter via useRef) | exact |
| `lib/periodic-checkpoint/index.ts` | utility | event-driven | `lib/trainer/use-trainer-idle.ts` (setInterval + useRef pattern) | exact |
| `lib/lesson-bus/events.ts` (MODIFIED) | config | event-driven | self — extend existing | exact |
| `components/panels/voice-panel.tsx` (MODIFIED) | component | event-driven + request-response | self — extend existing | exact |
| `components/panels/board-panel.tsx` (MODIFIED) | component | event-driven | `components/panels/trainer-panel.tsx` (useLessonBusEvent subscription) | exact |
| `components/panels/trainer-panel.tsx` (MODIFIED) | component | event-driven | self — extend existing | exact |
| `components/lesson-shell.tsx` (MODIFIED) | component | request-response | self — extend existing | exact |
| `scripts/restore-agent-config.mjs` (MODIFIED) | script | request-response | self — extend existing | exact |
| `lib/__tests__/client-tool-handlers.test.ts` | test | — | `components/panels/__tests__/voice-panel.test.tsx` | exact |
| `lib/__tests__/contextual-update-formatters.test.ts` | test | — | `lib/lesson-bus/__tests__/bus.test.ts` | exact |
| `lib/__tests__/lesson-state.test.ts` | test | — | `lib/lesson-bus/__tests__/bus.test.ts` | exact |
| `lib/__tests__/periodic-checkpoint.test.ts` | test | — | `lib/avatar/__tests__/use-avatar-state.test.tsx` (timer/ref pattern) | role-match |
| `scripts/__tests__/restore-agent-config.test.ts` | test | — | `app/api/voice/signed-url/__tests__/` (fetch mock pattern) | role-match |
| `e2e/voice-agent-tools.spec.ts` | test/e2e | — | `e2e/voice-flow.spec.ts` | exact |

---

## Pattern Assignments

### `lib/client-tools/handlers.ts` (utility, event-driven + request-response)

**Analog:** `components/panels/trainer-panel.tsx` (bus.emit calls) + `components/panels/board-panel.tsx` (executeDraw pattern)

**Imports pattern** (from trainer-panel.tsx lines 1-14):
```typescript
'use client'
import { useRef, useReducer } from 'react'
import { useLessonBus } from '@/lib/lesson-bus'
import type { TrainerConfig } from '@/lib/trainer/config-schema'
```

**Bus-emit core pattern** (trainer-panel.tsx lines 31-63):
```typescript
useLessonBusEvent('trainer:highlight', ({ elementId, durationMs = 3000 }) => {
  const el = containerRef.current?.querySelector<HTMLElement>(`[data-task-id="${elementId}"]`)
  if (!el) {
    console.warn(`[TrainerPanel] trainer:highlight — element '${elementId}' not found in DOM`)
    return
  }
  el.classList.add('ring-2', 'ring-yellow-400', 'trainer-highlight')
  setTimeout(() => {
    el.classList.remove('ring-2', 'ring-yellow-400', 'trainer-highlight')
  }, durationMs)
})
```

**Fire-and-forget async fetch pattern** (board-panel.tsx lines 91-130):
```typescript
const executeDraw = useCallback(async (promptText: string) => {
  // Auto-clear board on new prompt
  const existingIds = Array.from(editor.getCurrentPageShapeIds())
  if (existingIds.length > 0) editor.deleteShapes(existingIds)
  setRunning(true)
  try {
    const res = await fetch('/api/draw', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt: userPrompt, lessonId }),
    })
    if (!res.ok) {
      const text = await res.text().catch(() => '')
      throw new Error(text || `HTTP ${res.status}`)
    }
    // SSE stream consumption follows...
  } catch (e) {
    setError(e instanceof Error ? e.message : 'Неизвестная ошибка')
  } finally {
    setRunning(false)
  }
}, [running, lessonId])
```

**Key conventions for handlers.ts:**
- Each handler is a function `(parameters: {…}) => Promise<string> | string` (SDK-required return type)
- Fire-and-forget: `void callDrawApi(prompt)` — do NOT await
- Errors returned as strings, not throws: `"Error: board unavailable, narrate verbally"`
- Bus emit: `bus.emit('trainer:goto_task', { taskId })` — exact event name from events.ts
- Log pattern: `console.warn('[client-tools] handler:name — reason')` (English internal logs)

---

### `lib/client-tools/index.ts` (utility/factory, event-driven)

**Analog:** `lib/lesson-bus/index.ts` (barrel + factory pattern)

**Barrel export pattern** (lib/lesson-bus/index.ts lines 1-24):
```typescript
// Public API of the lesson bus module.
// Import from '@/lib/lesson-bus' in consumer files.
export type { LessonBusEvent, EventPayload } from './events'
export type { ... } from './events'
export { LessonBus } from './bus'
export { LessonBusProvider, LessonBusContext } from './provider'
export { useLessonBus, useLessonBusEvent } from './hooks'
```

**Factory pattern reference** — `buildClientTools({bus, lesson, getState})` mirrors the pattern of passing dependencies explicitly rather than using singleton imports. Analogous to how `LessonBus` is passed via context rather than being a global.

**Key conventions:**
- The factory returns `ClientTools` (from `@elevenlabs/react`) — a `Record<string, ClientTool>`
- Type import: `import type { ClientTools } from '@elevenlabs/react'`
- Dependency injection: accept `bus: LessonBus`, `lessonId: string`, `getState: () => string` as parameters
- Export both the factory and the `ClientTools` type alias

---

### `lib/contextual-updates/formatters.ts` (utility/transform, transform)

**Analog:** `lib/board/executor.ts` (pure transformation functions with typed input/output)

**Pure function transform pattern** (lib/board/executor.ts lines 225-231):
```typescript
export async function executeToolCall(
  editor: Editor,
  name: string,
  rawParams: ToolParams,
): Promise<ExecuteResult> {
  const p = rawParams ?? {}
  try {
    switch (name) {
      // ...each case handles one tool type
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return { ok: false, note: `error: ${msg}` }
  }
}
```

**Key conventions for formatters.ts:**
- Pure functions: `formatAnswerSubmitted(payload: TrainerAnswerSubmittedPayload): string`
- Russian output strings, English log strings (consistent with entire codebase)
- ✓/✗ prefix convention: `"✓ task-3 (numeric, ok)"` / `"✗ task-3 (numeric): ответ 11, правильный 12"`
- Use the existing payload types from `@/lib/lesson-bus` — no new types needed
- No side effects — formatters are pure: input payload → output string

---

### `lib/contextual-updates/forwarder.ts` (utility/bridge, event-driven)

**Analog:** `components/panels/voice-panel.tsx` — the `handleMessage` callback + bus subscription pattern

**Bus subscription + SDK call bridge pattern** (voice-panel.tsx lines 119-127):
```typescript
const handleMessage = useCallback(
  (payload: { message: string; role: 'user' | 'agent' }) => {
    const text = (payload?.message ?? '').trim()
    if (!text) return
    bus.emit('voice:transcript', { text, role: payload.role, timestamp: Date.now() })
  },
  [bus],
)
```

**Phase 6.5 cleanup-bug guard (CRITICAL — MUST follow)** (voice-panel.tsx lines 207-221):
```typescript
// Latch latest conversation into a ref; empty deps = real unmount only.
const conversationRef = useRef(conversation)
conversationRef.current = conversation
useEffect(() => {
  return () => {
    const c = conversationRef.current
    if (c.status === 'connected' || c.status === 'connecting') {
      try { c.endSession() } catch (err) {
        console.error('[voice-panel] cleanup endSession:', err)
      }
    }
  }
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, []) // EMPTY DEPS — intentional: latched ref pattern
```

**Key conventions for forwarder.ts:**
- Uses `useLessonBusEvent` (NOT bare `useEffect + bus.on`) — stable subscription
- `sendContextualUpdate` reference must be latched in a ref if used in subscriptions — same pattern as conversationRef
- Event allow-list: only `answer_submitted`, `hint_opened`, `idle_15s` — NOT `task_focused`
- Import `sendContextualUpdate` from `useConversation()` return value or `useConversationControls()`

---

### `lib/lesson-state/index.ts` (utility/state-snapshot, request-response)

**Analog:** `lib/avatar/state-machine.ts` (pure state logic, no side effects)

**Pure state snapshot function pattern:**
```typescript
// No hooks, no side effects — pure function for get_lesson_state tool handler
export function getLessonStateSnapshot(
  currentTaskId: string,
  solvedTaskIds: Set<string>,
  mistakes: Array<{ taskId: string; value: string; correct: string }>,
  totalTasks: number,
): string {
  const solvedCount = solvedTaskIds.size
  const mistakesSummary = mistakes.length > 0
    ? ` mistakes=[${mistakes.slice(-3).map(m => `${m.taskId}:ans${m.value}`).join(',')}]`
    : ''
  return `STATE: ${currentTaskId} active, solved=${solvedCount}/${totalTasks}[${[...solvedTaskIds].join(',')}]${mistakesSummary}`
}
```

**Key conventions:**
- Pure function — no React hooks, no side effects, fully testable without DOM
- `Set<string>` for solved tasks (deduplicated, fast membership check)
- Mistakes array: keep last 3 only (context-window economy)
- Output format must be single-line compact string (LLM reads inline, no markdown)
- Filename: `lib/lesson-state/index.ts` — clean import via `@/lib/lesson-state`

---

### `lib/proactive-triggers/visibility.ts` (utility, event-driven)

**Analog:** `lib/trainer/use-trainer-idle.ts` — closest existing file (browser event → sendContextualUpdate bridge)

**Browser event hook pattern** — locate the idle hook:
```
C:\Users\krato\ClaudeVibecoding\ClaudeDesktop\Klassio\lib\trainer\use-trainer-idle.ts
```

**Expected pattern (from Phase 7 decisions in STATE.md):**
```typescript
'use client'
import { useEffect, useRef } from 'react'

export function useVisibilityTrigger(onHidden: () => void): void {
  const onHiddenRef = useRef(onHidden)
  onHiddenRef.current = onHidden  // latch — stable across re-renders

  useEffect(() => {
    const handler = () => {
      if (document.visibilityState === 'hidden') {
        onHiddenRef.current()
      }
    }
    document.addEventListener('visibilitychange', handler)
    return () => document.removeEventListener('visibilitychange', handler)
  }, []) // empty deps — latch pattern prevents stale closure
}
```

**Key conventions:**
- Latch callback in ref — empty deps useEffect (same Phase 6.5 cleanup-bug lesson applied here)
- Callback receives nothing — forwarder decides the message string
- `visibilitychange` is the Page Visibility API event name (standard)
- NO direct `sendContextualUpdate` call here — just calls the passed `onHidden` callback

---

### `lib/proactive-triggers/mistakes.ts` (utility, event-driven)

**Analog:** `lib/avatar/use-avatar-state.ts` — wrong-streak tracking via useRef

**Streak counter useRef pattern** (from Phase 9 decisions in STATE.md — use-avatar-state.ts):
```typescript
const wrongStreakRef = useRef(0)
// Inside bus subscription handler:
useLessonBusEvent('trainer:answer_submitted', ({ correct }) => {
  if (correct) {
    wrongStreakRef.current = 0
  } else {
    wrongStreakRef.current += 1
    if (wrongStreakRef.current >= 2) {
      // fire callback
    }
  }
})
```

**Key conventions:**
- `useRef` for streak counter — NOT `useState` (no visual output needed, matches Phase 9 decision)
- Threshold = 2 consecutive wrong answers (consistent with D-05 in Phase 9 decisions)
- Reset on correct answer
- Callback receives `{taskId, mistakeCount}` for message formatting
- Accept `onConsecutiveMistakes: (taskId: string, count: number) => void` as parameter

---

### `lib/periodic-checkpoint/index.ts` (utility, event-driven)

**Analog:** `lib/trainer/use-trainer-idle.ts` — setInterval with useRef, status-conditional start

**Timer-with-status-dep pattern** (from RESEARCH.md lines 522-537):
```typescript
// In VoicePanelInner — status is a string primitive: safe dep, no cleanup bug risk
useEffect(() => {
  if (conversation.status !== 'connected') return
  const CHECKPOINT_MS = 10 * 60 * 1000 // 10 minutes
  let count = 0
  const timer = setInterval(() => {
    count++
    // call onCheckpoint(count)
  }, CHECKPOINT_MS)
  return () => clearInterval(timer)
}, [conversation.status]) // NOTE: primitive string dep — safe (not `conversation` object)
```

**Key conventions:**
- `conversation.status` (string) in deps — SAFE. `conversation` (object) in deps — UNSAFE (re-creates on every SDK update, triggers cleanup bug)
- `count` is local to the closure, not a ref — simpler since it only increments
- Timer starts ONLY when status === 'connected', clears on disconnect
- Interval = 10 minutes (600_000 ms)
- Callback signature: `onCheckpoint: (elapsedMinutes: number, solvedCount: number, totalTasks: number, mistakeCount: number) => void`

---

### `lib/lesson-bus/events.ts` (MODIFIED — add 2 new event types)

**Analog:** self — extend existing file following established pattern (lines 1-59)

**Existing event addition pattern** (events.ts lines 36-54):
```typescript
// Phase N adds: event:name (brief comment)
export type BoardDrawRequestPayload = { prompt: string; lessonId: string }
export type BoardClearRequestPayload = Record<string, never>  // empty object

export type LessonBusEvent =
  // ... existing events ...
  // Phase 8 — Board control via client tools (OQ-1, OQ-6)
  | { type: 'board:draw_request';   payload: BoardDrawRequestPayload }
  | { type: 'board:clear_request';  payload: BoardClearRequestPayload }
```

**Barrel re-export** (index.ts):
```typescript
export type {
  // ...existing exports...
  BoardDrawRequestPayload,
  BoardClearRequestPayload,
} from './events'
```

**Key conventions:**
- Add phase comment `// Phase 8 — ...` before new variants
- Payload type defined above the union, then referenced in union
- Empty payload uses `Record<string, never>` (not `{}` — consistent with TypeScript strict)
- Export payload types from index.ts barrel

---

### `components/panels/voice-panel.tsx` (MODIFIED — add clientTools + dynamicVariables + subscriptions)

**Analog:** self — current implementation is the base

**Extension points (from RESEARCH.md lines 398-410):**

1. `VoicePanelProps` interface (lines 32-37) — add `trainerConfig?: TrainerConfig | null`:
```typescript
interface VoicePanelProps {
  lessonId: string
  topic: string
  trainerConfig?: TrainerConfig | null  // Phase 8: for get_lesson_state + mini-recap + dynamicVariables
}
```

2. `useConversation(...)` call (lines 133-139) — add `clientTools`:
```typescript
const conversation = useConversation({
  clientTools,        // Phase 8: 6 registered tools
  onConnect: handleConnect,
  onDisconnect: handleDisconnect,
  onModeChange: handleModeChange,
  onMessage: handleMessage,
  onError: handleError,
})
```

3. `startSession(...)` call (lines 174-177) — add `dynamicVariables`:
```typescript
conversation.startSession({
  signedUrl: data.signedUrl,
  connectionType: 'websocket',
  dynamicVariables: {
    lesson_topic: data.topic || topic,
    total_tasks: trainerConfig?.tasks?.length ?? 0,
  },
})
```

4. New state refs for lesson tracking (add after `isStartingRef`):
```typescript
const currentTaskIdRef = useRef<string>('')
const solvedTaskIdsRef = useRef<Set<string>>(new Set())
const mistakesRef = useRef<Array<{taskId: string; value: string; correct: string}>>([])
```

**CRITICAL — Phase 6.5 cleanup-bug guard** (voice-panel.tsx lines 207-221 — DO NOT TOUCH):
```typescript
// This pattern is locked. Any new subscriptions MUST use useLessonBusEvent,
// NOT bare useEffect + bus.on.
const conversationRef = useRef(conversation)
conversationRef.current = conversation
useEffect(() => {
  return () => { /* endSession on unmount only */ }
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, []) // EMPTY DEPS — intentional latched ref pattern
```

---

### `components/panels/board-panel.tsx` (MODIFIED — add bus subscription for board:draw_request + board:clear_request)

**Analog:** `components/panels/trainer-panel.tsx` (useLessonBusEvent subscription pattern)

**Bus subscription addition pattern** (trainer-panel.tsx lines 29-42):
```typescript
// Add after existing useLessonBus() call:
useLessonBusEvent('board:draw_request', ({ prompt, lessonId: reqLessonId }) => {
  // Use the lessonId from the event (passed by client tool handler)
  void executeDraw(prompt)
})

useLessonBusEvent('board:clear_request', () => {
  handleClear()
})
```

**Key conventions:**
- `useLessonBusEvent` (not `useEffect + bus.on`) — stable subscription
- Call existing `executeDraw` function — no duplication
- `void executeDraw(prompt)` — fire-and-forget inside the sync subscription handler
- `lessonId` in the event payload is verification only (board-panel already has it from props)

---

### `components/panels/trainer-panel.tsx` (MODIFIED — add progress UI: ring + counter + scroll)

**Analog:** self — extend existing `trainer:goto_task` handler (lines 53-63) and add state

**Current goto_task handler** (trainer-panel.tsx lines 53-63):
```typescript
useLessonBusEvent('trainer:goto_task', ({ taskId }) => {
  const el = containerRef.current?.querySelector<HTMLElement>(`[data-task-id="${taskId}"]`)
  if (!el) {
    console.warn(`[TrainerPanel] trainer:goto_task — task '${taskId}' not found in DOM`)
    return
  }
  el.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
  const focusTarget = el.querySelector<HTMLElement>('input, button')
  focusTarget?.focus()
})
```

**Extension: track currentTaskId in ref + forceUpdate**:
```typescript
const currentTaskIdRef = useRef<string | null>(null)
// In goto_task handler, add:
currentTaskIdRef.current = taskId
forceUpdate()  // already exists in component
// Then pass currentTaskId to TrainerRenderer as prop for ring/border styling
```

**Progress counter pattern:** Read `trainerConfig.tasks.length` for M, maintain solved count via `trainer:answer_submitted` subscription (same forceUpdate pattern as hintOverrides).

**Styling:** Add Tailwind class `ring-2 ring-blue-500` on current task element. "N из M" counter in CardHeader.

---

### `components/lesson-shell.tsx` (MODIFIED — thread trainerConfig to VoicePanel)

**Analog:** self — current LessonShell already passes trainerConfig to TrainerPanel (line 129)

**Current prop threading** (lesson-shell.tsx lines 122-130):
```typescript
<div className="min-h-0 flex-1 h-[22vh] lg:h-auto">
  <TrainerPanel lessonId={lessonId} trainerConfig={trainerConfig} />
</div>
```

**Extension — add trainerConfig to VoicePanel** (line 123):
```typescript
<div className="min-h-0 h-[20vh] lg:h-64 shrink-0">
  <VoicePanel lessonId={lessonId} topic={topic} trainerConfig={trainerConfig} />
</div>
```

No other changes needed — LessonShell already receives `trainerConfig` from the RSC page.

---

### `scripts/restore-agent-config.mjs` (MODIFIED — add tool definitions PATCH)

**Analog:** self — current implementation is the base

**Current PATCH body structure** (restore-agent-config.mjs lines 32-47):
```javascript
const body = {
  conversation_config: {     // NOTE: "conversation_config" NOT "conversational_config" — verified working
    agent: {
      language: 'ru',
      first_message: FIRST_MESSAGE,
      prompt: {
        prompt: PROMPT,
        llm: 'gpt-4.1-mini',
      },
    },
    tts: {
      voice_id: NATALY_VOICE_ID,
      model_id: 'eleven_multilingual_v2',
    },
  },
}
```

**Extension — add tools array to prompt object**:
```javascript
const body = {
  conversation_config: {
    agent: {
      language: 'ru',
      first_message: FIRST_MESSAGE,
      prompt: {
        prompt: PROMPT,
        llm: 'gpt-4.1-mini',
        tools: PHASE_8_TOOLS,   // Phase 8: array of 6 tool definition objects
      },
    },
    tts: {
      voice_id: NATALY_VOICE_ID,
      model_id: 'eleven_multilingual_v2',
    },
  },
}
```

**PHASE_8_TOOLS array structure** (embed inline per OQ-5 recommendation):
```javascript
const PHASE_8_TOOLS = [
  {
    type: 'client',
    name: 'draw_explanation',
    description: 'Draw a math explanation on the whiteboard...',
    response_timeout_secs: 20,
    expects_response: true,
    execution_mode: 'immediate',
    parameters: {
      type: 'object',
      properties: {
        prompt: { type: 'string', description: 'What to draw (Russian).' }
      },
      required: ['prompt']
    }
  },
  // ... 5 more tool objects (see RESEARCH.md §5 for full schemas)
]
```

**Verification section** (lines 66-79) — extend to also print `tools` count:
```javascript
console.log('  tools count  :', j.conversation_config?.agent?.prompt?.tools?.length ?? 0)
```

**Key conventions:**
- PATCH body key is `conversation_config` (NOT `conversational_config`) — VERIFIED working in Phase 6.5
- PATCH overwrites entire tools array — must include ALL 6 tools in one call (Risk 6 from RESEARCH)
- `execution_mode: 'immediate'` for all tools — supports INV-02 fire-and-forget
- Tools embedded inline in script — NOT loaded from external JSON file (OQ-5)

---

## Test File Patterns

### Test Colocation Convention

**Confirmed from codebase inspection:**
- Library modules: `lib/foo/__tests__/foo.test.ts` (e.g., `lib/lesson-bus/__tests__/bus.test.ts`)
- Library hooks: `lib/foo/__tests__/foo.test.tsx` when React hooks involved
- Components: `components/panels/__tests__/voice-panel.test.tsx`
- Scripts: no existing `scripts/__tests__/` dir — will be created new
- E2E: `e2e/voice-agent-tools.spec.ts` (flat, in `e2e/` dir, Playwright pattern)

**Vitest config** (`vitest.config.ts` lines 1-17):
```typescript
export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'happy-dom',
    setupFiles: ['./tests/setup.ts'],
    globals: true,
    include: ['**/*.{test,spec}.{ts,tsx}'],
    exclude: ['node_modules', '.next', 'e2e/**', '**/*.integration.test.ts'],
  },
  resolve: { alias: { '@': path.resolve(__dirname, './') } },
})
```

---

### `lib/__tests__/client-tool-handlers.test.ts` (unit test)

**Analog:** `components/panels/__tests__/voice-panel.test.tsx`

**Mock pattern for @elevenlabs/react** (voice-panel.test.tsx lines 30-63):
```typescript
let capturedOptions: {
  onConnect?: (p?: { conversationId: string }) => void
  // ... other callbacks
} = {}

const mockStartSession = vi.fn()
vi.mock('@elevenlabs/react', () => ({
  ConversationProvider: ({ children, ...options }: ...) => {
    capturedOptions = { ...capturedOptions, ...options }
    return React.createElement(React.Fragment, null, children)
  },
  useConversation: (options: ...) => {
    capturedOptions = { ...capturedOptions, ...options }
    return capturedReturn
  },
}))
```

**Mock for lesson bus** (voice-panel.test.tsx lines 65-75):
```typescript
const mockEmit = vi.fn()
const mockOn = vi.fn()
const mockOff = vi.fn()
const stableBus = { emit: mockEmit, on: mockOn, off: mockOff }
vi.mock('@/lib/lesson-bus', () => ({
  useLessonBus: () => stableBus,
  useLessonBusEvent: vi.fn(),
}))
```

**Key conventions for client-tool-handlers.test.ts:**
- Mock the bus: verify `bus.emit('trainer:goto_task', { taskId })` called with correct args
- Mock fetch: verify `/api/draw` called fire-and-forget (no await on test)
- Return type: assert tool handler returns a string (not void, not throws)
- Latency test: assert handler returns in < 50ms (animation is decoupled)

---

### `lib/__tests__/contextual-update-formatters.test.ts` (unit test)

**Analog:** `lib/lesson-bus/__tests__/bus.test.ts`

**Pure-function test pattern** (bus.test.ts lines 1-22):
```typescript
import { describe, it, expect, vi } from 'vitest'
import { LessonBus } from '../bus'

describe('LessonBus', () => {
  it('emits lesson:test payload to subscribed handler', () => {
    const bus = new LessonBus()
    const handler = vi.fn()
    bus.on('lesson:test', handler)
    bus.emit('lesson:test', { source: 'voice', counter: 1 })
    expect(handler).toHaveBeenCalledWith({ source: 'voice', counter: 1 })
  })
```

**Key conventions for formatters test:**
- No mocks needed — pure functions
- One `it()` per formatter + per variant (correct/wrong answer, each hint level)
- Assert exact output string (e.g., `expect(result).toBe('✓ task-3 (numeric, ok)')`)
- Negative test: assert `task_focused` has no formatter (allow-list discipline)

---

### `lib/__tests__/lesson-state.test.ts` (unit test)

**Analog:** `lib/lesson-bus/__tests__/bus.test.ts` (pure function test)

**Key conventions:**
- Test `getLessonStateSnapshot(...)` with: empty solved set, partial solved, all solved, with mistakes
- Assert output format: `"STATE: task-2 active, solved=2/5[task-1,task-2] mistakes=[task-1:ans100]"`
- Test mistakes truncation: 4+ mistakes → only last 3 in output

---

### `lib/__tests__/periodic-checkpoint.test.ts` (unit test with fake timers)

**Analog:** `lib/avatar/__tests__/use-avatar-state.test.tsx` (React hook test)

**Fake timer pattern** (vitest built-in):
```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

describe('periodic checkpoint', () => {
  beforeEach(() => { vi.useFakeTimers() })
  afterEach(() => { vi.useRealTimers() })

  it('fires callback after 10 minutes', () => {
    const onCheckpoint = vi.fn()
    // render hook or call setup function
    vi.advanceTimersByTime(10 * 60 * 1000)
    expect(onCheckpoint).toHaveBeenCalledOnce()
    expect(onCheckpoint).toHaveBeenCalledWith(expect.objectContaining({ elapsedMinutes: 10 }))
  })
})
```

---

### `scripts/__tests__/restore-agent-config.test.ts` (integration test)

**Analog:** `app/api/voice/signed-url/__tests__/` (fetch mock + env var pattern)

**Fetch mock pattern** (from vi.hoisted pattern in STATE.md Plan 06-01 decisions):
```typescript
const fetchMock = vi.hoisted(() => vi.fn())
vi.stubGlobal('fetch', fetchMock)

beforeEach(() => { fetchMock.mockReset() })

it('PATCH body includes 6 tool definitions', async () => {
  fetchMock.mockResolvedValueOnce({ ok: true, json: async () => ({}) }) // PATCH
  fetchMock.mockResolvedValueOnce({ ok: true, json: async () => ({   // GET verify
    conversation_config: { agent: { prompt: { tools: new Array(6).fill({}) } } }
  }) })
  // run script logic (extract to testable function)
  expect(body.conversation_config.agent.prompt.tools).toHaveLength(6)
})
```

---

### Component test stubs (voice-panel-tools, voice-panel-subs, trainer-panel-progress)

**Analog:** `components/panels/__tests__/voice-panel.test.tsx` (full component test template)

**Component test structure** (voice-panel.test.tsx lines 22-120):
```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, cleanup, act } from '@testing-library/react'
import React from 'react'

// 1. Mock SDK
vi.mock('@elevenlabs/react', () => ({ ... }))
// 2. Mock bus
vi.mock('@/lib/lesson-bus', () => ({ useLessonBus: () => stableBus, useLessonBusEvent: vi.fn() }))
// 3. Dynamic import after mocks
const { VoicePanel } = await import('../voice-panel')

describe('VoicePanel — Phase 8 tools wiring', () => {
  beforeEach(() => { resetMocks(); cleanup() })
  // Tests...
})
```

**voice-panel-tools.test.tsx** — assert:
- `clientTools` passed to `useConversation` with 6 keys
- `dynamicVariables` passed to `startSession` with `lesson_topic` + `total_tasks`

**voice-panel-subs.test.tsx** — assert (Phase 6.5 cleanup-bug guard):
- Bus subscription handlers do NOT re-register when `conversation` object changes identity
- Test: mount → simulate `conversation` reference change → verify `useLessonBusEvent` mock called once (not again)

**trainer-panel-progress.test.tsx** — assert:
- After `trainer:goto_task` event, current task element has ring CSS class
- "N из M" counter shows correct numbers
- `scrollIntoView` mock called with `{ behavior: 'smooth' }`

---

### `e2e/voice-agent-tools.spec.ts` (E2E, Playwright)

**Analog:** `e2e/voice-flow.spec.ts`

**E2E structure** (voice-flow.spec.ts lines 1-60):
```typescript
import { test, expect, chromium } from '@playwright/test'
import type { BrowserContext } from '@playwright/test'
import { makeTestEmail, resetTestDb, ... } from './fixtures/db-setup'
// ...seed functions + pgQuery helper...

test.describe('Voice agent tools — LLM-01 + PED-02 + HTM-01', () => {
  let context: BrowserContext

  test.beforeAll(async () => {
    // seed user + lesson
    // login once, save cookies
  })

  test.beforeEach(async ({ page }) => {
    // inject cookies
    // stub @elevenlabs/react via addInitScript (mock SDK before page load)
  })
  // Tests using window.__lessonBus and window.__voiceClientTools
})
```

**Mock SDK pattern for E2E** (from VALIDATION.md):
```typescript
// addInitScript stubs @elevenlabs/react before app code loads
await page.addInitScript(() => {
  window.__voiceClientTools = {}
  window.__mockSendContextualUpdate = vi.fn()
  // Make clientTools accessible for test assertions
})
// After page load, simulate tool call:
await page.evaluate(() => {
  window.__voiceClientTools?.goto_trainer_task?.({ taskId: 'task-3' })
})
// Assert bus event fired:
const taskFocused = await page.evaluate(() => new Promise(resolve => {
  window.__lessonBus?.on('trainer:goto_task', resolve)
}))
expect(taskFocused).toMatchObject({ taskId: 'task-3' })
```

---

## Shared Patterns

### Authentication (inherited — no new auth)

**Source:** `app/api/draw/route.ts` — `auth()` + ownership check
**Apply to:** `draw_explanation` client tool handler (calls `/api/draw` which already has auth)
```typescript
// draw_explanation does NOT need its own auth check:
// - It calls /api/draw via fetch from the browser (cookies are sent automatically)
// - /api/draw route already does auth() + ownership check server-side
// - lessonId comes from VoicePanel props (server-authoritative, not from Nataly)
```

### Error Handling as Strings (D-09)

**Source:** `RESEARCH.md` §1 (SDK return type is `string | number | void`)
**Apply to:** All 6 client tool handlers
```typescript
// Pattern: catch errors, return string — never throw
try {
  // ... tool logic
  return 'OK, drawing explanation'
} catch (err) {
  const msg = err instanceof Error ? err.message : 'unknown error'
  console.error('[client-tools] draw_explanation failed:', msg)
  return `Error: board unavailable, narrate verbally`
}
```

### Latched-Ref Cleanup (Phase 6.5 lesson — CRITICAL)

**Source:** `components/panels/voice-panel.tsx` lines 207-221
**Apply to:** Any new `useEffect` in VoicePanel; any hook that uses `conversation` reference
```typescript
// NEVER put `conversation` object in useEffect deps array
// ALWAYS latch it in a ref if needed in cleanup
const conversationRef = useRef(conversation)
conversationRef.current = conversation
useEffect(() => { /* use conversationRef.current */ }, []) // empty deps
```

### useLessonBusEvent (stable subscription)

**Source:** `lib/lesson-bus/hooks.ts` lines 27-38
**Apply to:** All new bus subscriptions in VoicePanel, BoardPanel, and hook files
```typescript
// USE THIS — auto-unsubscribes on unmount, deps-tracked
useLessonBusEvent('trainer:answer_submitted', ({ taskId, value, correct }) => {
  // handler logic
})

// NOT THIS — requires manual cleanup, error-prone
useEffect(() => {
  const handler = (...) => { }
  bus.on('trainer:answer_submitted', handler)
  return () => bus.off('trainer:answer_submitted', handler)
}, [bus]) // 'bus' in deps is fine; 'conversation' in deps is not
```

### Russian UI / English Logs

**Source:** Entire codebase — consistent in all phases
**Apply to:** All new files
```typescript
// UI strings: Russian — shown to user
setError('Ошибка голосового сервиса. Попробуйте снова.')

// Log strings: English — for developers
console.error('[voice-panel] SDK error:', message, _context)
console.warn('[TrainerPanel] trainer:goto_task — task not found in DOM')

// sendContextualUpdate to Nataly: Russian — she speaks Russian
sendContextualUpdate('✓ task-3 (числовой, верно)')
```

### useRef for Side-Effect State

**Source:** `components/panels/trainer-panel.tsx` lines 25-27; `lib/trainer/use-trainer-idle.ts`
**Apply to:** `currentTaskIdRef`, `solvedTaskIdsRef`, `mistakesRef` in VoicePanel; streak counter in mistakes.ts
```typescript
// Side-effect state (no visual output) = useRef, not useState
const hintOverrides = useRef<Map<string, number>>(new Map())
const [, forceUpdate] = useReducer((x: number) => x + 1, 0)
// Mutate ref, then call forceUpdate() if UI needs to reflect change
```

### Fire-and-Forget Fetch

**Source:** `components/panels/board-panel.tsx` lines 90-95 (`executeDraw` + `void`)
**Apply to:** `draw_explanation` client tool handler
```typescript
// Correct: fire-and-forget (supports INV-02 — Nataly speaks in parallel)
void fetch('/api/draw', { ... }).then(handleSSEStream).catch(err => console.error(...))
return 'OK, drawing explanation'  // return immediately, don't await
```

---

## No Analog Found

Files with no close match in the codebase — planner should use RESEARCH.md patterns directly:

| File | Role | Data Flow | Reason |
|---|---|---|---|
| `lib/client-tools/index.ts` (factory only) | factory | — | Factory pattern with dependency injection doesn't have an exact analog; barrel export pattern is well-covered |
| `lib/contextual-updates/forwarder.ts` | bridge | event-driven | The bus→SDK bridge is a new pattern; closest analog is the message handler in VoicePanel but forwarder.ts is standalone (not inline in component) |
| `scripts/__tests__/restore-agent-config.test.ts` | test | — | No existing `scripts/__tests__/` dir; must create; test pattern from route tests is close enough |

---

## Metadata

**Analog search scope:**
- `C:\Users\krato\ClaudeVibecoding\ClaudeDesktop\Klassio\components\panels\` (all panels)
- `C:\Users\krato\ClaudeVibecoding\ClaudeDesktop\Klassio\lib\lesson-bus\` (event bus)
- `C:\Users\krato\ClaudeVibecoding\ClaudeDesktop\Klassio\lib\trainer\` (trainer hooks)
- `C:\Users\krato\ClaudeVibecoding\ClaudeDesktop\Klassio\lib\avatar\` (state machine, streak)
- `C:\Users\krato\ClaudeVibecoding\ClaudeDesktop\Klassio\scripts\` (restore script)
- `C:\Users\krato\ClaudeVibecoding\ClaudeDesktop\Klassio\e2e\` (Playwright specs)
- `C:\Users\krato\ClaudeVibecoding\ClaudeDesktop\Klassio\components\lesson-shell.tsx` (prop threading)
- `C:\Users\krato\ClaudeVibecoding\ClaudeDesktop\Klassio\app\lesson\[id]\page.tsx` (RSC pattern)

**Files scanned:** 14 production files + 5 test files
**Pattern extraction date:** 2026-05-13

---

## PATTERN MAPPING COMPLETE

**Phase:** 8 - agent-control
**Files classified:** 20
**Analogs found:** 17 / 20

### Coverage
- Files with exact analog: 9 (all modified files self-reference + proactive triggers → use-trainer-idle)
- Files with role-match analog: 8
- Files with no analog: 3 (factory barrel, standalone forwarder, scripts test dir)

### Key Patterns Identified
- All new hooks follow Phase 6.5 latched-ref pattern: `useRef(conversation)` + `useEffect([], [])` (empty deps) — NEVER put `conversation` object in deps
- Client tool handlers return strings (not throw) and use fire-and-forget for async operations — matches SDK `ClientTool` return type `string | number | void`
- All bus subscriptions use `useLessonBusEvent` hook (NOT bare `useEffect + bus.on`) — auto-cleanup, stable
- New event types added to `lib/lesson-bus/events.ts` following established Phase 3/7/9 pattern: comment + payload type + union variant + barrel re-export
- `scripts/restore-agent-config.mjs` PATCH body key is `conversation_config` (NOT `conversational_config`) — verified working in Phase 6.5; tools array goes inside `prompt` object
- Test colocation: `lib/__tests__/` for library modules; `components/panels/__tests__/` for components; `e2e/` flat for Playwright
- Russian UI strings / English log strings — consistent throughout all phases

### File Created
`C:\Users\krato\ClaudeVibecoding\ClaudeDesktop\Klassio\.planning\phases\08-agent-control\08-PATTERNS.md`

### Ready for Planning
Pattern mapping complete. Planner can now reference analog patterns in PLAN.md files.
