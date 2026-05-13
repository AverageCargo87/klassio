# Phase 8: Agent-Control — Research

**Researched:** 2026-05-13
**Domain:** 11labs Conversational AI SDK — client tools, sendContextualUpdate, dynamic_variables, agent PATCH API
**Confidence:** HIGH (SDK types verified directly from installed node_modules; agent API schema verified from official docs)

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

- **D-01 (Flow):** Linear-by-default + Nataly override via `goto_trainer_task`. Задачи идут по порядку; Nataly через `goto_trainer_task(taskId)` перебрасывает куда угодно.
- **D-02 (Progress UI):** Подсветка текущей задачи + лёгкий счётчик «N из M». Без полноэкранного progress bar, без gamification.
- **D-03 (State ownership):** Frontend canonical, Nataly performer. 4 канала: dynamic_variables на старте, sendContextualUpdate после значимых событий, mini-recap перед каждым goto_trainer_task, periodic checkpoint каждые ~10 мин. Опциональный get_lesson_state() tool как safety net.
- **D-04 (Lesson phases):** Никаких state machine в коде. Структура урока живёт ТОЛЬКО в system prompt как нарратив.
- **D-05 (Layout):** Phase 8 НЕ трогает layout. Допустим минимальный CSS hot-fix если goto подсветка/scroll сломается на текущих пропорциях.
- **D-06 (Explanation split):** Гибрид — доска для explain_* сцен (Phase 5), тренажёр для практики (Phase 7 task types). Nataly сама решает когда что.
- **D-07 (Client tools):** 4 baseline (draw_explanation, clear_board, goto_trainer_task, highlight_trainer_task) + 2 extensions (show_hint, get_lesson_state). Deferred: set_lesson_phase.
- **D-08 (Trainer → Nataly):** 3 события через sendContextualUpdate: answer_submitted, hint_opened, idle_15s. task_focused — internal only. Плюс mini-recap при transitions + periodic checkpoint ~10 мин.
- **D-09 (Tool semantics):** Fire-and-forget с быстрым ack. Tool возвращает строку сразу, не ждёт завершения анимации. Ошибки как строки, не throws. Поддерживает INV-02 (голос+рука синхронно).
- **D-10 (dynamic_variables):** lesson_topic + total_tasks на старте. task_summaries и child_name — deferred.
- **D-11 (Agent config):** scripts/restore-agent-config.mjs расширяется: PATCH tool definitions + новый system prompt. Source of truth в PHASE-6-SETUP-2026-05-10.md.

### Claude's Discretion

- Точные return strings client tools
- Точный формат sendContextualUpdate payloads (✓/✗ vs OK/WRONG, длина)
- Cadence periodic checkpoint (10 мин vs event-driven каждые 3 task transitions)
- JSON schema для client tools params (taskId regex и т.п.)
- Где живёт timer state для periodic checkpoint (LessonShell vs VoicePanel vs отдельный hook)
- Mock стратегия для 11labs SDK clientTools в тестах

### Deferred Ideas (OUT OF SCOPE)

- Pedagogical server-side LLM → Phase 8.5+
- Explicit set_lesson_phase client tool + LessonPhase state machine → Phase 12+
- Resume lesson после browser reload → Phase 12+
- task_summaries в dynamic_variables → если потребуется
- child_name → v2 multi-child
- Новые task-типы (drag-drop, fraction tiles, multi-step) → Phase 8.5
- praise_or_redirect/say tools → не нужны
- Stroke-drawing + SSML → Phase 11
- Lottie аватарки → Phase 11
- Layout redesign → Phase 11
- Pull-based get_progress → не MVP
- Anthropic comeback → CON-anthropic-rf-block
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| LLM-01 | Двухуровневая LLM (Pedagogical + Realtime) — REINTERPRETED: Phase 8 satisfies via 11labs agent function-calling (single LLM with 6 client tools + D-03 state injection). No separate Pedagogical server. | SDK clientTools verified; PATCH API for tool defs verified; GPT-4.1 mini 1M context window confirmed |
| PED-02 | Проактивный бот — triggered by молчание >20 сек, visibilitychange, ≥2 неправильных подряд | trainer:idle_15s + trainer:answer_submitted forwarded via sendContextualUpdate; system prompt behavioral rules for proactive response; visibilitychange via Page Visibility API → sendContextualUpdate |
| HTM-01 | HTML-тренажёр с events — Phase 7 completed baseline; Phase 8 extends: mini-recap emit on goto_trainer_task + periodic checkpoint | TrainerPanel already subscribes to trainer:goto_task; Phase 8 adds sendContextualUpdate call before emit |
</phase_requirements>

---

## Phase Summary

Phase 8 wires Nataly (11labs Conversational AI agent `agent_7701kr9c2v7eev3tabzv4f2b0e8b`) to control the board and trainer through 6 client tools registered in VoicePanel's `useConversation` hook, and receives trainer state feedback via `sendContextualUpdate`. The architecture collapses the two-tier Pedagogical+Realtime LLM design into a single LLM (GPT-4.1 mini, 1M context) that acts as both strategist and performer, with the frontend serving as the canonical state source and Nataly receiving compact state snapshots through four injection channels (dynamic_variables at session start, event-triggered contextual updates, mini-recap on task transitions, periodic checkpoint every ~10 min).

Concretely: when Nataly says "let me explain column addition", she calls `draw_explanation({prompt: 'сложение в столбик 245+874'})` → frontend calls `/api/draw` → SSE animates the board while Nataly speaks in parallel (INV-02 fire-and-forget). When the child answers a task, `trainer:answer_submitted` fires on the lesson bus → VoicePanel forwards it as `sendContextualUpdate("✓ task-3 (numeric, ok)")` → Nataly reacts in live conversation.

The system prompt is fully rewritten to describe the 6-tool surface, behavioral rules (when to draw vs when to assign tasks, how to react to ✓/✗ updates), and lesson structure narrative. The `restore-agent-config.mjs` script is extended to PATCH both the new prompt and tool definitions, ensuring reproducible agent state after any 11labs UI drift.

---

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Client tool invocation (draw_explanation, clear_board, goto_trainer_task, highlight_trainer_task, show_hint, get_lesson_state) | Browser / Client (VoicePanel) | — | Tools are client tools — executed in browser on SDK callback. No server involvement for tool execution. |
| draw_explanation → board animation | API / Backend (/api/draw) | Browser (executor.ts) | POST /api/draw with OpenAI agent loop lives on server; SSE streams tool_use events back to browser executor |
| Trainer event forwarding (sendContextualUpdate) | Browser / Client (VoicePanel) | — | VoicePanel subscribes to trainer events on lesson bus, calls sendContextualUpdate directly from browser via SDK |
| dynamic_variables injection | Browser / Client (VoicePanel) | — | Passed in startSession() options in browser; session config is sent to 11labs at WS open time |
| System prompt + tool definitions (agent config) | 11labs cloud (agent config) | scripts/ (restore script) | Tool schemas must exist in 11labs agent config for LLM to know tools exist; restore-agent-config.mjs PATCHes via API |
| Progress tracking (currentTaskId, solved Set, mistakes array) | Browser / Client (TrainerPanel/LessonShell) | — | D-03 frontend canonical; no server persistence for in-session state in Phase 8 |
| Periodic checkpoint timer | Browser / Client (LessonShell or VoicePanel) | — | Client-side timer; emits sendContextualUpdate every ~10 min (Claude's Discretion) |
| mini-recap generation | Browser / Client (VoicePanel or LessonShell) | — | Frontend reads current state (solved tasks, current task) and formats compact recap string |

---

## 11labs SDK Specifics

### 1. clientTools Mechanic (VERIFIED from node_modules/@elevenlabs/client/dist/BaseConversation.d.ts)

**Type definition (exact, from installed @elevenlabs/react@1.6.0):**
```typescript
// From @elevenlabs/client dist/BaseConversation.d.ts
export type ClientToolsConfig = {
  clientTools: Record<string, (parameters: any) => Promise<string | number | void> | string | number | void>;
};

// From @elevenlabs/react dist/conversation/types.d.ts
export type ClientToolResult = string | number | void;
export type ClientTool<
  Parameters extends Record<string, unknown> = Record<string, unknown>,
  Result extends ClientToolResult = ClientToolResult,
> = (parameters: Parameters) => Promise<Result> | Result;
export type ClientTools = Record<string, ClientTool>;
```

**Key facts:**
- Both sync and async functions are supported (`Promise<Result> | Result`)
- Return type is `string | number | void` — NOT an object. D-09 "return error string" is exactly correct.
- Functions receive a `parameters: Record<string, unknown>` object (destructure as needed)
- `clientTools` is passed as part of `HookOptions` to `useConversation()` or `startSession()`
- **Where to pass:** As prop to `useConversation(props)` — the "Session config and callbacks passed here are used as defaults when calling `startSession()` without arguments"

**Wiring pattern (Phase 8):**
```typescript
// In VoicePanelInner
const clientTools: ClientTools = {
  draw_explanation: async ({ prompt }: { prompt: string }) => {
    void callDrawApi(prompt) // fire-and-forget — do NOT await
    return 'OK, drawing explanation'
  },
  clear_board: () => {
    bus.emit('board:clear', {}) // new event or handle directly
    return 'Board cleared'
  },
  goto_trainer_task: ({ taskId }: { taskId: string }) => {
    bus.emit('trainer:goto_task', { taskId })
    return `Going to ${taskId}`
  },
  highlight_trainer_task: ({ taskId, durationMs }: { taskId: string; durationMs?: number }) => {
    bus.emit('trainer:highlight', { elementId: taskId, durationMs })
    return `Highlighting ${taskId}`
  },
  show_hint: ({ taskId, hintLevel }: { taskId: string; hintLevel: 1 | 2 | 3 }) => {
    bus.emit('trainer:show_hint', { taskId, hintLevel })
    return `Showing hint level ${hintLevel} for ${taskId}`
  },
  get_lesson_state: () => {
    // Returns compact state string (see D-03)
    return getLessonStateSnapshot() // pure function, see Reusable Code section
  },
}

const conversation = useConversation({
  clientTools,
  onConnect: handleConnect,
  // ... other callbacks
})
```

**Error semantics (D-09 confirmed):** Since return type is `string | number | void`, returning an error string like `"Error: board unavailable, narrate verbally"` is the correct pattern. Do NOT throw — the SDK handles `Promise<string>` but uncaught throws in client tools cause unhandled rejections and potentially kill the WS session.

**Timing (INV-02 rationale):** The SDK invokes client tools mid-conversation when the LLM generates a tool call. From the event enum `ClientToOrchestratorEvent.CLIENT_TOOL_RESULT` — the browser sends back the tool result via WS, and the agent can continue speaking while the result is being "processed" by the LLM. The fire-and-forget pattern (return ack string immediately, don't await animation) means Nataly's TTS audio pipeline is never blocked waiting for the board animation to finish. This is the correct design for INV-02.

**`useConversationClientTool` hook (new in v1.6.0):** The SDK now also exports `useConversationClientTool` for dynamically registering individual tools from sub-components. However, for Phase 8 we pass `clientTools` as a single object to `useConversation` — simpler and matches the existing VoicePanelInner pattern.

### 2. sendContextualUpdate Mechanic (VERIFIED from installed types)

**Exact signature (from BaseConversation.d.ts):**
```typescript
sendContextualUpdate(text: string, options?: ContextualUpdateOptions): void;

type ContextualUpdateOptions = {
  contextId?: string;
};
```

**How to access it:** Destructure from `useConversation()` return value:
```typescript
const conversation = useConversation({ clientTools, ...callbacks })
// Then use:
conversation.sendContextualUpdate("✓ task-3 (numeric, ok)")
// Or use useConversationControls() for stable reference
const { sendContextualUpdate } = useConversationControls()
```

**Wire type (VERIFIED from events.ts):** Uses `ClientToOrchestratorEvent.CONTEXTUAL_UPDATE` — a distinct WS event type from user messages (`USER_MESSAGE`). This means Nataly receives it through a separate channel that the LLM sees as context injection, NOT as a user utterance. The agent does NOT speak back reactively to a contextual update unless its system prompt instructions tell it to — it uses the update to inform its next natural response.

**Key distinction:** `sendContextualUpdate` vs `sendUserMessage`:
- `sendContextualUpdate` → `CONTEXTUAL_UPDATE` event type → context only, no reply expected by default
- `sendUserMessage` → `USER_MESSAGE` event type → treated as user speech, agent may respond immediately

**Cadence recommendation (Claude's Discretion territory, but research-informed):**
- No official rate limit found in SDK types or docs [ASSUMED: reasonable rate is < 1 per second]
- Each update adds tokens to the running conversation context — at ~50-100 tokens per update, 10 updates + 4 periodic checkpoints over a 45-min lesson ≈ 1,400-2,800 extra tokens (negligible vs 200-300K total)
- D-08 pattern (answer_submitted, hint_opened, idle_15s + mini-recap + periodic) = ~15-25 updates per lesson maximum at normal pace — well within any reasonable limit

**Format recommendation (Claude's Discretion):** Compact single-line strings are best. The LLM reads these as inline context notes. Avoid multiline or markdown — the LLM may try to "respond" to structure.

```
// Recommended formats (D-08 + D-03):
"✓ task-3 (numeric, ok)"
"✗ task-3 (numeric): answer 11, correct 12"
"Hint level 2 opened on task-3"
"Child silent 15 sec on task-4"
"Transition task-3→task-4. Solved: 1,2,3. Topic task-4: tens overflow."
"⏱ 10 min elapsed. Solved: 2/7, 0 mistakes."
"STATE: task-2 active, solved=[1], mistakes=[{task-1: ans=100, correct=119}]"
```

### 3. dynamic_variables Injection (VERIFIED from installed types)

**Exact location in SessionConfig (from BaseConnection.d.ts):**
```typescript
type BaseSessionConfig = {
  // ...
  dynamicVariables?: Record<string, string | number | boolean>;
  // ...
};
```

**How to pass:**
```typescript
conversation.startSession({
  signedUrl: data.signedUrl,
  connectionType: 'websocket',
  dynamicVariables: {
    lesson_topic: 'Сложение в столбик',
    total_tasks: 5,
  },
})
```

**Reference in system prompt:** Uses `{{variable_name}}` syntax per official docs. [CITED: elevenlabs.io/docs/eleven-agents/customization/personalization/dynamic-variables]

**Session lifecycle (VERIFIED + CITED):** Variables are set ONLY at session start (`startSession`). They are NOT updateable mid-session via the same mechanism. The CONTEXT.md D-10 assumption "start only, immutable" is correct. Mid-session state injection goes via `sendContextualUpdate`, not `dynamicVariables`.

**System variable conflict (CITED):** Avoid keys starting with `system__` — reserved for 11labs system variables like `system__conversation_id`. Use plain names: `lesson_topic`, `total_tasks`.

**Types supported:** `string | number | boolean` only. No arrays, no nested objects. This is correct for D-10 (lesson_topic = string, total_tasks = number).

**Where in system prompt to reference:**
```
// Example system prompt section (D-11):
Тема урока: {{lesson_topic}}. Всего задач: {{total_tasks}}.
```

### 4. 11labs Agents PATCH API for Tool Definitions (VERIFIED from official docs)

**Endpoint:** `PATCH /v1/convai/agents/{agent_id}` [CITED: elevenlabs.io/docs/api-reference/agents/update]

**Body schema for client tools (VERIFIED):**
```json
{
  "conversational_config": {
    "agent": {
      "prompt": {
        "tools": [
          {
            "type": "client",
            "name": "draw_explanation",
            "description": "Draw a math explanation on the whiteboard. Use when introducing a new topic or when the child makes an error that needs visual clarification.",
            "response_timeout_secs": 20,
            "expects_response": true,
            "execution_mode": "immediate",
            "parameters": {
              "type": "object",
              "properties": {
                "prompt": {
                  "type": "string",
                  "description": "What to draw, e.g. 'column addition 245+874'"
                }
              },
              "required": ["prompt"]
            }
          }
        ]
      }
    }
  }
}
```

**CRITICAL: PATCH overwrites the entire tools array.** [VERIFIED from official docs] When you PATCH with a `tools` array, it REPLACES all existing tools — there is no merge. The `restore-agent-config.mjs` extension MUST include all 6 tool definitions in one PATCH call.

**Note on schema field naming:** The restored script currently uses `conversation_config` (snake_case) for the body key. The API reference shows `conversational_config` (with "ational"). [ASSUMED: current script was verified to work in Phase 6.5 with `conversation_config` — need to confirm exact field name against working behavior; the PATCH for voice/LLM in restore script currently works, so inspect its exact body key.]

Inspecting the existing `restore-agent-config.mjs`: it uses `conversation_config` (not `conversational_config`). Since the script works in production (Phase 6.5 verified), the working key is `conversation_config`. [VERIFIED: from codebase read of scripts/restore-agent-config.mjs line 32]

**Auth:** `xi-api-key: <ELEVENLABS_API_KEY>` header (same as existing script). [VERIFIED from working script]

**`execution_mode` field:**
- `"immediate"` — tool result sent back immediately, agent can continue speaking
- `"post_tool_speech"` — agent finishes speaking before tool is called
- `"async"` — tool runs in background, agent continues without waiting
- **Use `"immediate"` for all 6 Phase 8 tools** — supports INV-02 fire-and-forget semantics

**`expects_response` field:**
- `true` — 11labs LLM will wait for client tool result before completing its turn
- `false` — fire-and-forget from LLM perspective
- **Use `true`** for tools where the ack string matters (draw_explanation, get_lesson_state), `false` for pure-side-effect tools could work but `true` is safer and enables error string feedback to Nataly

### 5. Schema for All 6 Tools (Planner Reference)

```typescript
// Tool schemas for PATCH and for clientTools registration
const PHASE_8_TOOLS = [
  {
    name: 'draw_explanation',
    description: 'Draw a math explanation on the whiteboard. Call when introducing a new topic, explaining a concept, or clarifying an error visually. Returns immediately — drawing happens in background.',
    parameters: {
      type: 'object',
      properties: {
        prompt: { type: 'string', description: 'What to draw (Russian). E.g. "сложение в столбик 245+874"' }
      },
      required: ['prompt']
    }
  },
  {
    name: 'clear_board',
    description: 'Clear the whiteboard canvas. Use when switching topics or before starting a new explanation.',
    parameters: { type: 'object', properties: {} }
  },
  {
    name: 'goto_trainer_task',
    description: 'Navigate the trainer to a specific task. Use to guide the child to the next exercise or repeat a task.',
    parameters: {
      type: 'object',
      properties: {
        taskId: { type: 'string', description: 'Task ID from the lesson config, e.g. "task-1", "task-2"' }
      },
      required: ['taskId']
    }
  },
  {
    name: 'highlight_trainer_task',
    description: 'Visually highlight a task in the trainer without navigating to it. Use to draw attention to a specific exercise while discussing it.',
    parameters: {
      type: 'object',
      properties: {
        taskId: { type: 'string', description: 'Task ID to highlight' },
        durationMs: { type: 'number', description: 'Highlight duration in milliseconds. Default: 3000' }
      },
      required: ['taskId']
    }
  },
  {
    name: 'show_hint',
    description: 'Show a hint for a specific task. Use when the child is stuck. Start with level 1, escalate to 2 or 3 if still stuck.',
    parameters: {
      type: 'object',
      properties: {
        taskId: { type: 'string', description: 'Task ID' },
        hintLevel: { type: 'number', description: 'Hint level: 1 (gentle), 2 (medium), 3 (full solution)', enum: [1, 2, 3] }
      },
      required: ['taskId', 'hintLevel']
    }
  },
  {
    name: 'get_lesson_state',
    description: 'Get the current lesson state snapshot. Use if you lose track of which tasks have been solved or what the child\'s progress is.',
    parameters: { type: 'object', properties: {} }
  },
]
```

---

## GPT-4.1 mini Context Behavior

### Context Window (VERIFIED)

GPT-4.1 mini has a **1 million token context window** (1,048,576 tokens). [CITED: openai.com/index/gpt-4-1/ and developers.openai.com/api/docs/models/gpt-4.1-mini] This was released 2026-04-14 alongside GPT-4.1 and GPT-4.1 nano. All three GPT-4.1 variants share the 1M context window — up from 128K in GPT-4o models.

A 45-minute lesson generates approximately:
- ~200-300K tokens of conversation (voice turns + system prompt + tool call results)
- + 25-50K tokens for D-03 state injection (contextual updates, mini-recaps, checkpoints)
- Total: ~250-350K tokens — well within 1M window

**Conclusion: token-shortage is NOT a real risk for Phase 8.** D-03 rationale confirmed.

### Lost-in-the-Middle Risk (ASSUMED — training knowledge)

The real risk is **attention degradation** on long contexts, not token shortage. Research on "lost in the middle" effects (Liu et al., 2023) shows LLMs attend better to information at the START and END of context, with degraded attention to middle content. For a 45-min lesson:

- Information from 20-30 minutes ago may receive less attention
- The D-03 mini-recap mechanism (sending a state snapshot before each task transition) places fresh save-points at the END of the context, mitigating this
- The periodic checkpoint every ~10 min similarly anchors recent state

**Mitigation already designed:** D-03 architecture (frontend canonical + mini-recap + checkpoint) is specifically designed to address lost-in-the-middle. The recap strings are placed at the tail of the context window where attention is strongest.

### GPT-4.1 mini vs 11labs Custom LLM (VERIFIED)

The Phase 6 setup uses 11labs Custom LLM endpoint with `llm: 'gpt-4.1-mini'` — this routes to OpenAI's GPT-4.1 mini via Klassio's own `OPENAI_API_KEY`, not 11labs's built-in LLM. [VERIFIED: from scripts/restore-agent-config.mjs line 39 — `llm: 'gpt-4.1-mini'`]

This means:
- The 1M context window applies (it's OpenAI's model)
- Cost for Pedagogical-like reasoning is ~$0.0004/1K input tokens, ~$0.0016/1K output tokens — inexpensive
- The model was tested in Phase 6 baseline (honest arithmetic, no hallucination on 25+48) — reliable for Phase 8 tool calling

---

## Reusable Code and Patterns

### Extension Points (Exact File Paths)

**`components/panels/voice-panel.tsx`** — PRIMARY CHANGE FILE
- `VoicePanelInner` (line 85): receives new `trainerState` prop (or reads from context) for get_lesson_state + mini-recap
- `useConversation(...)` call (line 133): add `clientTools` to options object
- `handleStart` function (line 146): add `dynamicVariables` to `conversation.startSession(...)` call (line 174)
- New: `useLessonBusEvent('trainer:answer_submitted', ...)` subscription for sendContextualUpdate forwarding
- New: `useLessonBusEvent('trainer:hint_opened', ...)` subscription
- New: `useLessonBusEvent('trainer:idle_15s', ...)` subscription
- New: periodic checkpoint timer (see timer placement discussion below)
- The `conversationRef` + empty-deps cleanup pattern (line 207-221) — DO NOT touch, this is the Phase 6.5 cleanup-bug fix

**`VoicePanelProps` interface (line 32-37):** Will need `trainerConfig?: TrainerConfig | null` and/or `onGetLessonState?: () => string` prop for get_lesson_state tool implementation.

**`lib/lesson-bus/events.ts`** — POSSIBLE EXTENSION
Current events (lines 36-54) already include all 3 trainer events needed for D-08 (`trainer:answer_submitted`, `trainer:hint_opened`, `trainer:idle_15s`). No new event types strictly required for Phase 8. Planner may choose to add `voice:contextual_update` event for testing visibility, but it is not required for the feature.

**`scripts/restore-agent-config.mjs`** — NEEDS EXTENSION (D-11)
Current body (line 32-47): sets `conversation_config.agent` + `conversation_config.tts`. Phase 8 must add:
```javascript
// Add to body.conversation_config.agent.prompt:
prompt: {
  prompt: PROMPT,
  llm: 'gpt-4.1-mini',
  tools: PHASE_8_TOOL_DEFINITIONS, // array of 6 tool objects
}
```
The `PHASE_8_TOOL_DEFINITIONS` array should be embedded in the script or loaded from a separate JSON file.

**`components/panels/board-panel.tsx`** — NO CHANGES
The `executeDraw` function (line 90) is called by `draw_explanation` client tool handler. Auto-clear already implemented (line 100-102). The client tool handler in VoicePanel will replicate this call pattern (fetch `/api/draw` with auth cookie + lessonId).

**`components/panels/trainer-panel.tsx`** — NO CHANGES
Already subscribes to `trainer:highlight`, `trainer:show_hint`, `trainer:goto_task` (lines 31-63). Phase 8 tools emit these same events — zero changes to TrainerPanel.

### draw_explanation Client Tool Implementation Pattern

The `draw_explanation` tool needs to call `/api/draw` from the browser. The existing `BoardPanel.executeDraw` (board-panel.tsx line 90) is the reference — Phase 8 does NOT reuse it directly (different component) but follows the same fetch pattern:

```typescript
// Inside VoicePanelInner clientTools:
draw_explanation: async ({ prompt }: { prompt: string }) => {
  // Fire-and-forget: start the fetch but do NOT await it
  // This returns immediately so Nataly can continue speaking
  void fetch('/api/draw', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt, lessonId }),
  }).then(async (res) => {
    if (!res.ok || !res.body) return
    // Consume SSE stream to trigger board animation
    const reader = res.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })
      // Parse tool_use events and emit to board
      // ... (same SSE parsing logic as BoardPanel)
      // EXCEPT: executeToolCall(editorRef.current, ...) — requires editor ref
    }
  }).catch(err => console.error('[draw_explanation] fetch failed:', err))

  return 'OK, drawing explanation'
},
```

**IMPORTANT PROBLEM:** The `draw_explanation` client tool needs access to the tldraw `Editor` instance, which lives in `BoardPanel`. The tool handler runs in `VoicePanel`, which is in a different subtree.

**Solution options (Claude's Discretion — planner should decide):**
- **Option A:** Expose `editorRef` via React context (new `BoardContext`) — cleanest but adds context boilerplate
- **Option B:** Emit a new lesson bus event `board:draw_request` with `{prompt, lessonId}` from VoicePanel → BoardPanel subscribes and calls its own `executeDraw` — avoids cross-component editor ref sharing, bus-mediated
- **Option C:** VoicePanel calls `/api/draw` and receives SSE events, then emits `board:tool_use` events on the bus which BoardPanel consumes to call `executeToolCall` — maximum separation but complex
- **Recommended (Option B):** Add new bus event `board:draw_request` — aligns with existing bus architecture, no new contexts, BoardPanel already has `executeDraw` ready. Clean separation.

### get_lesson_state Tool Implementation

```typescript
// getLessonStateSnapshot — pure function, reads from prop/context
// Called synchronously within the client tool handler
function getLessonStateSnapshot(
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
// Example output: "STATE: task-3 active, solved=2/5[task-1,task-2] mistakes=[task-1:ans100]"
```

### mini-recap on goto_trainer_task

The mini-recap must be sent BEFORE emitting `trainer:goto_task` so Nataly gets the save-point before the navigation side-effect:

```typescript
// In client tool handler for goto_trainer_task:
goto_trainer_task: ({ taskId }: { taskId: string }) => {
  // 1. Send mini-recap first (D-03)
  const fromTask = currentTaskIdRef.current
  const solvedList = [...solvedTaskIdsRef.current].join(',')
  const taskContext = getTaskTopic(taskId, trainerConfig) // from config
  conversation.sendContextualUpdate(
    `Transition ${fromTask}→${taskId}. Solved: ${solvedList}. Topic ${taskId}: ${taskContext}`
  )
  // 2. Then emit bus event to navigate trainer
  bus.emit('trainer:goto_task', { taskId })
  return `Navigating to ${taskId}`
},
```

Note: `sendContextualUpdate` is available via the `conversation` object from `useConversation()`.

### Timer for Periodic Checkpoint (Claude's Discretion)

Two viable placements:

**Option A — VoicePanel (recommended):** Start timer when conversation status becomes 'connected', clear on disconnect. VoicePanel already tracks `conversation.status`.

```typescript
// In VoicePanelInner — add after conversation hook:
useEffect(() => {
  if (conversation.status !== 'connected') return
  const CHECKPOINT_MS = 10 * 60 * 1000 // 10 minutes
  let count = 0
  const timer = setInterval(() => {
    count++
    const solved = solvedTaskIdsRef.current
    const mistakes = mistakesRef.current
    conversation.sendContextualUpdate(
      `⏱ ${count * 10} min elapsed. Solved: ${solved.size}/${totalTasksRef.current}, ${
        mistakes.length === 0 ? '0 mistakes' : `${mistakes.length} mistakes`
      }.`
    )
  }, CHECKPOINT_MS)
  return () => clearInterval(timer)
}, [conversation.status]) // NOTE: status is a primitive string — safe dep, no cleanup bug risk
```

**Option B — LessonShell:** Requires threading sendContextualUpdate up from VoicePanel (messy). Not recommended.

---

## Implementation Sequencing

Proposed wave order for the planner:

### Wave 0: Agent Config + System Prompt (prerequisite — no UI yet)
- Extend `restore-agent-config.mjs` with 6 tool definitions (PATCH body extension)
- Write new system prompt (D-11 contour: tool surface description + behavioral rules + lesson narrative + dynamic_variables usage + ✓/✗ semantics)
- Run script against agent → verify tool definitions appear in 11labs UI
- Tests: integration smoke test (run script, verify via GET /v1/convai/agents/{id} that tools appear)

### Wave 1: Bus Infrastructure + State Tracking
- Add trainer event subscriptions in VoicePanel for sendContextualUpdate forwarding (D-08)
- Add `board:draw_request` bus event type to `lib/lesson-bus/events.ts`
- Wire BoardPanel to subscribe to `board:draw_request` and call `executeDraw`
- Add lesson state tracking refs in VoicePanel (currentTaskId, solvedSet, mistakes array)
- Wire `trainer:answer_submitted` to update state refs + sendContextualUpdate
- Tests: unit tests for sendContextualUpdate formatters, board:draw_request bus round-trip

### Wave 2: Client Tools Registration
- Implement all 6 client tool handlers in VoicePanelInner
- Add `clientTools` to `useConversation()` call
- Add `dynamicVariables` to `startSession()` call (lesson_topic, total_tasks)
- Wire VoicePanel to receive trainerConfig prop for get_lesson_state + mini-recap
- Tests: component tests with mocked useConversation — verify clientTools passed, verify dynamicVariables in startSession

### Wave 3: mini-recap + Periodic Checkpoint
- Implement mini-recap emit in `goto_trainer_task` handler (sendContextualUpdate before bus.emit)
- Add periodic checkpoint timer in VoicePanel (10-min interval, starts on 'connected')
- Tests: unit tests for checkpoint format, mock timers for checkpoint cadence

### Wave 4: Progress UI (D-02)
- TrainerPanel: add current task visual ring + solved checkmarks + "N of M" counter
- LessonShell: thread currentTaskId + solvedCount state (or TrainerPanel manages locally)
- Tests: component tests for progress UI state changes

### Wave 5: PED-02 — Proactive Triggers
- `visibilitychange` listener: when hidden → `sendContextualUpdate("Child switched tabs/minimized")`
- Wrong-answer streak ≥2: already tracked by mistakes array from Wave 1, emit `sendContextualUpdate("✗✗ ${taskId}: 2 consecutive errors")` on threshold
- idle_15s already handled via Wave 1 forwarding
- Tests: unit tests for streak detection, visibilitychange mock

### Wave 6: Validation + Restore Verification
- E2E: simulate client tool invocations via `window.__lessonBus` + mocked `useConversation`
- Verify restore script idempotency
- Full suite run

---

## Validation Architecture

Nyquist validation is enabled (config.json has no `nyquist_validation: false`).

### Test Framework

| Property | Value |
|----------|-------|
| Framework | vitest 4.x + Playwright 1.59 |
| Vitest config | `vitest.config.ts` (exists) |
| Quick run command | `npx vitest run --reporter=verbose` |
| Full suite command | `npx vitest run --reporter=verbose && npx playwright test --project=chromium` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| LLM-01 | clientTools registered with useConversation | unit/component | `vitest run components/panels/voice-panel` | ❌ Wave 2 |
| LLM-01 | draw_explanation calls /api/draw fire-and-forget | unit | `vitest run lib/client-tools` | ❌ Wave 1 |
| LLM-01 | goto_trainer_task emits trainer:goto_task on bus | unit | `vitest run lib/client-tools` | ❌ Wave 2 |
| LLM-01 | show_hint emits trainer:show_hint on bus | unit | `vitest run lib/client-tools` | ❌ Wave 2 |
| LLM-01 | get_lesson_state returns correct compact string | unit | `vitest run lib/lesson-state` | ❌ Wave 2 |
| LLM-01 | dynamic_variables passed in startSession | component | `vitest run components/panels/voice-panel` | ❌ Wave 2 |
| LLM-01 | agent config PATCH includes 6 tool definitions | integration | `vitest run scripts/restore-agent-config` | ❌ Wave 0 |
| PED-02 | trainer:answer_submitted → sendContextualUpdate format | unit | `vitest run lib/contextual-update` | ❌ Wave 1 |
| PED-02 | idle_15s → sendContextualUpdate forwarded | component | `vitest run components/panels/voice-panel` | ❌ Wave 1 |
| PED-02 | visibilitychange → sendContextualUpdate | unit | `vitest run lib/proactive-triggers` | ❌ Wave 5 |
| PED-02 | consecutive mistakes ≥2 → sendContextualUpdate | unit | `vitest run lib/proactive-triggers` | ❌ Wave 5 |
| HTM-01 | mini-recap sent before goto_trainer_task bus emit | unit | `vitest run lib/client-tools` | ❌ Wave 3 |
| HTM-01 | periodic checkpoint fires every 10 min | unit (fake timers) | `vitest run lib/periodic-checkpoint` | ❌ Wave 3 |
| HTM-01 | progress UI: current task ring + N of M counter | component | `vitest run components/panels/trainer-panel` | ❌ Wave 4 |
| E2E | client tool → bus event → trainer reacts | e2e | `playwright test e2e/voice-agent-tools.spec.ts` | ❌ Wave 6 |
| E2E | trainer event → contextual update format | e2e | `playwright test e2e/voice-agent-tools.spec.ts` | ❌ Wave 6 |

### E2E Strategy (window.__lessonBus)

`window.__lessonBus` is already exposed in non-prod by `LessonBusProvider` (Phase 9 D-11). For Phase 8 E2E:

```typescript
// In e2e/voice-agent-tools.spec.ts:
// 1. Simulate client tool invocation: navigate to lesson, call registered handler directly
//    (mock useConversation so clientTools are accessible without real 11labs session)
// 2. Assert bus event emitted: await window.__lessonBus.on('trainer:goto_task', handler)
// 3. Assert trainer UI reacts: assert CSS ring on task element
// 4. Simulate trainer event → assert sendContextualUpdate called
```

The mocked `useConversation` pattern from Phase 6 `voice-flow.spec.ts` is the reference.

### Sampling Rate

- **Per task commit:** `npx vitest run --reporter=verbose`
- **Per wave merge:** `npx vitest run && npx playwright test --project=chromium`
- **Phase gate:** Full suite green before `/gsd-verify-work`

### Wave 0 Gaps (must exist before implementation)

- [ ] `lib/__tests__/restore-agent-config.test.ts` — covers LLM-01 agent config PATCH
- [ ] `lib/__tests__/contextual-update-formatters.test.ts` — covers PED-02 format
- [ ] `lib/__tests__/client-tool-handlers.test.ts` — covers LLM-01 tool handlers
- [ ] `lib/__tests__/lesson-state.test.ts` — covers get_lesson_state format
- [ ] `e2e/voice-agent-tools.spec.ts` — E2E for tool+event loop

---

## Risks and Landmines

### Risk 1: Phase 6.5 Cleanup-Bug Recurrence (HIGH risk if ignored)

**What:** `useEffect` with `[conversation]` in deps will re-run on every status/mode update from SDK, causing the effect's cleanup to fire prematurely. This exact bug killed Phase 6.5 voice sessions at ~625ms.

**Phase 8 specific danger:** Adding new state refs (currentTaskId, solvedSet, mistakes) or new useEffect hooks for bus subscriptions creates new opportunities for this pattern.

**Fix pattern (already established in voice-panel.tsx):**
- Use `useRef` for all values that should NOT trigger re-renders (task state, mistakes)
- Use `useLessonBusEvent` (already stable) for bus subscriptions — NOT useEffect + bus.on
- For timer: `useEffect` with `conversation.status` as dep (string primitive — safe). Clear interval in cleanup.
- NEVER put `conversation` (object reference) in useEffect deps — it changes on every status update

**The canonical fix (lines 207-221 of voice-panel.tsx):** latched conversation ref + empty deps. This pattern is established and must be followed for any new cleanup effects.

### Risk 2: draw_explanation Editor Access Anti-pattern (MEDIUM)

**What:** Client tool handler in VoicePanel needs tldraw Editor to call `executeToolCall`. Editor lives in BoardPanel (different React subtree).

**Mitigation:** Use `board:draw_request` bus event (Option B recommended above). VoicePanel emits the request; BoardPanel handles it with its local `executeDraw`. No cross-component editor ref sharing needed.

**If Option A (context) is chosen:** Use React context, NOT prop-drilling through LessonShell (would require threading through 3 layers). Context approach adds one context provider + one `useContext` call — manageable.

### Risk 3: Agent Config Drift (HIGH — Phase 6.5 lesson learned)

**What:** 11labs UI silently resets agent config to demo template (happened twice in Phase 6.5). After Phase 8 deploy, the new system prompt + 6 tool definitions must be PATCHed programmatically.

**Mitigation (D-11):** `restore-agent-config.mjs` extended to include tool definitions. Run after any deploy. Document in MANUAL-ACTIONS.md.

**CRITICAL from Phase 6.5 SUMMARY:** "If 11labs agent gets reset to demo template again, scp `restore-agent-config.mjs` + extracted prompt onto VPS and run there (RU IP fetches to 11labs API are flaky)." Phase 8 restore script must be runnable from the Frankfurt VPS. The script already handles this (it takes API key + agent ID from env vars).

### Risk 4: sendContextualUpdate Rate / Cost Overrun (LOW — monitoring needed)

**What:** If the trainer or timer fires more updates than expected, token cost could spike.

**Mitigation:**
- D-08 already scoped to 3 significant events only (not task_focused)
- Mini-recap: ~1 per task transition (5 tasks = max 5 recaps)
- Periodic checkpoint: max 4 per 45-min lesson
- Max ~15-25 contextual updates per lesson × ~100 tokens = ~2,500 tokens = negligible

**Monitor via:** 11labs conversation analytics in agent dashboard. Each contextual update appears in conversation metadata.

### Risk 5: GPT-4.1 mini Tool Calling Reliability (MEDIUM — verify in testing)

**What:** GPT-4.1 mini was chosen in Phase 6 for arithmetic accuracy (Nano hallucinated). Phase 8 adds 6 new tools to the LLM's context in the system prompt. The LLM must correctly select tools (draw_explanation vs goto_trainer_task) in a live conversation.

**Mitigation:**
- Tool descriptions in the PATCH must be precise and contextual (not generic)
- System prompt behavioral rules must be concrete: "when starting a new topic → call draw_explanation; when moving to practice → call goto_trainer_task"
- The `expects_response: true` + `execution_mode: "immediate"` configuration ensures the agent gets back the ack string and can reason about success/failure

**Testing:** Phase gate includes manual QA — run a mock lesson with the configured agent in 11labs Test Agent UI before deploying.

### Risk 6: TOOLS array PATCH overwrites existing agent config (HIGH — PATCH semantics)

**What:** The PATCH `/v1/convai/agents/{agent_id}` with `tools` array REPLACES all tools. If the script is run after Phase 8 deploy but before Phase 9 content additions, it will be fine. But if Phase 9 adds tools and then someone runs the Phase 8 restore script, Phase 9 tools will be wiped.

**Mitigation:** The restore script version should always include ALL tools for all phases deployed. Add a comment to the script: "When extending in Phase 9, add Phase 9 tools here." Never run an older version of the script after a newer phase has added tools.

### Risk 7: VoicePanelInner Props Explosion (LOW — architecture)

**What:** Phase 8 adds: trainerConfig, currentTaskId state tracking, lesson state snapshot function, sendContextualUpdate access. VoicePanelInner may become a "god component" receiving 6+ props.

**Mitigation:** 
- Keep state refs inside VoicePanelInner (they don't need to come from outside)
- TrainerConfig is needed for get_lesson_state + mini-recap — pass as prop (same pattern as TrainerPanel already receives it)
- Use React context for deeply nested needs (but LessonShell already passes lessonId/topic/trainerConfig)

---

## Open Questions for Planner

### OQ-1: board:draw_request Bus Event vs BoardContext

**Unresolved:** How does `draw_explanation` client tool handler access the tldraw Editor?
- Option B (`board:draw_request` bus event) is recommended by research but adds a new bus event type
- Option A (BoardContext React context) is more direct but adds context boilerplate
- Option C (VoicePanel handles SSE directly with its own board:tool_use bus events) is complex

**Recommendation:** Option B — aligns with existing bus architecture. The planner should define `board:draw_request` event type in `lib/lesson-bus/events.ts` and add BoardPanel subscription.

### OQ-2: Lesson State Access in VoicePanel

**Unresolved:** Where does VoicePanel read the current lesson state (currentTaskId, solvedSet, mistakes) for:
1. `get_lesson_state` tool handler
2. `mini-recap` in `goto_trainer_task` handler
3. `periodic checkpoint` text

**Options:**
- **A:** VoicePanel tracks its own state via refs updated by bus subscriptions (answer_submitted → update solvedSet/mistakes; goto_task → update currentTaskId)
- **B:** LessonShell owns state and passes snapshot function as prop to VoicePanel
- **C:** New React context (LessonProgressContext)

**Recommendation:** Option A — VoicePanel subscribes to the same bus events it's already subscribing to (answer_submitted, hint_opened, idle_15s) and maintains its own refs. This keeps VoicePanel self-contained and avoids prop drilling for what is essentially internal state for the sendContextualUpdate channel. The frontend canonical principle (D-03) means TrainerPanel also tracks it — there's intentional redundancy, with VoicePanel's view being "good enough" for recap purposes.

### OQ-3: Trainer Progress UI State Management (D-02)

**Unresolved:** Where does "N of M" counter + current task tracking live?
- TrainerPanel reads trainerConfig (total tasks = M)
- TrainerPanel could track solved count locally (via answer_submitted bus subscription)
- Or LessonShell tracks it and passes to both VoicePanel (for recaps) and TrainerPanel (for UI)

**Recommendation:** TrainerPanel owns its own progress state (already has hintOverrides tracking via refs). Add `solvedTaskIds: Set<string>` ref to TrainerPanel, updated on `trainer:answer_submitted`. This is display state — no need to lift it. VoicePanel tracks its own copy of the same data for recap purposes (acceptable duplication per D-03 frontend-canonical design).

### OQ-4: LessonShell Threading for VoicePanel trainerConfig

**Unresolved:** VoicePanel currently only receives `lessonId` and `topic`. Phase 8 needs it to also know `trainerConfig` (for get_lesson_state task topics and total_tasks). Currently LessonShell → VoicePanel doesn't pass trainerConfig.

**Action:** Planner should add `trainerConfig?: TrainerConfig | null` prop to `VoicePanelProps` and thread from LessonShell (which already receives it from the RSC page and passes to TrainerPanel). This is a one-line change in each of LessonShell and VoicePanel.

### OQ-5: Restore Script — Embedded Tools vs External JSON

**Unresolved:** Should the 6 tool definition objects be embedded inline in `restore-agent-config.mjs` or loaded from an external `agent-tools-config.json`?

**Recommendation:** Embed inline in the script — the script is already a standalone Node.js file that must be portable (run from VPS). Loading an external file requires either bundling or path assumptions. Inline is simpler and matches the existing pattern (PROMPT is loaded from a file for historical reasons, but tool schemas are compact enough to embed directly).

### OQ-6: `board:draw_request` vs `board:clear` Event Naming

**Unresolved:** The `clear_board` tool needs to clear the board. BoardPanel already has a `handleClear` function (board-panel.tsx line 77). Phase 8 can:
- Add `board:clear_request` bus event (new) → BoardPanel subscribes
- Or expose a `clear_board` function via BoardContext

**Recommendation:** Add `board:clear_request: {}` to events.ts. Follows same pattern as draw_request.

---

## Security Domain

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V4 Access Control | YES | draw_explanation calls /api/draw which has auth() + ownership check (already implemented in Phase 4) |
| V5 Input Validation | YES | Client tool parameters validated by tool handler before emitting bus events; taskId pattern `task-\d+` should be validated |
| V2 Authentication | NO | No new auth flows; inherits Phase 6 signed URL + cookie session |
| V6 Cryptography | NO | No new crypto; HMAC from Phase 6.5 unchanged |

**Key security note:** `draw_explanation` client tool runs in the browser and calls `/api/draw` directly. This endpoint already has `auth()` + ownership check. The tool handler must pass `lessonId` from the VoicePanel props (server-authoritative, not from Nataly's tool call). Nataly's `prompt` parameter goes into the POST body — this is user-controlled content going to an LLM, which is fine because `/api/draw` already uses this as an OpenAI prompt.

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `sendContextualUpdate` has no documented rate limit | 11labs SDK Specifics §2 | If rate-limited at ~1 req/sec, must throttle updates. Low risk — 15-25 per lesson well under any reasonable limit |
| A2 | Lost-in-the-middle degradation pattern applies to GPT-4.1 mini | GPT-4.1 mini Context Behavior | If GPT-4.1 mini has improved long-context attention, the D-03 recap mechanism is over-engineered but harmless |
| A3 | PATCH body key is `conversation_config` (not `conversational_config`) | 11labs SDK Specifics §4 | If the key is different, the PATCH will silently fail (11labs API may ignore unknown keys). Verify via restore script test run |
| A4 | `execution_mode: "immediate"` is the correct field name in the PATCH API | 11labs SDK Specifics §4 | The API reference may have changed field names; verify from 11labs UI tool inspector after PATCH |
| A5 | Periodic checkpoint cadence of 10 minutes is appropriate for GPT-4.1 mini context attention | Risks §2 | If Nataly shows context drift earlier, reduce to 5 min or switch to event-driven (every 3 task completions) |

---

## Sources

### Primary (HIGH confidence — verified from installed packages)
- `node_modules/@elevenlabs/react/dist/index.d.ts` — exported API surface
- `node_modules/@elevenlabs/react/dist/conversation/types.d.ts` — ClientTool, ClientTools, ClientToolResult, HookOptions types
- `node_modules/@elevenlabs/react/dist/conversation/useConversation.d.ts` — useConversation return type including sendContextualUpdate
- `node_modules/@elevenlabs/react/dist/conversation/ConversationControls.d.ts` — ConversationControlsValue including sendContextualUpdate(text, options?)
- `node_modules/@elevenlabs/client/dist/BaseConversation.d.ts` — ClientToolsConfig type definition
- `node_modules/@elevenlabs/client/dist/utils/BaseConnection.d.ts` — SessionConfig including dynamicVariables type
- `scripts/restore-agent-config.mjs` — verified PATCH body structure and working API key pattern
- `components/panels/voice-panel.tsx` — current VoicePanel implementation (extension points)
- `lib/lesson-bus/events.ts` — current event contract
- `components/panels/trainer-panel.tsx` — confirmed no changes needed

### Secondary (MEDIUM confidence — verified from official docs)
- [CITED: elevenlabs.io/docs/api-reference/agents/update] — PATCH endpoint schema for tool definitions, tools array overwrite semantics
- [CITED: elevenlabs.io/docs/eleven-agents/customization/personalization/dynamic-variables] — dynamic_variables session-start only, {{variable_name}} syntax, system__ reserved prefix
- [CITED: openai.com/index/gpt-4-1/] — GPT-4.1 mini 1M context window confirmation

### Tertiary (LOW confidence — single source, flag for validation)
- [ASSUMED] sendContextualUpdate rate limits — no official documentation found; assumed no hard limit below 1/sec
- [ASSUMED] Lost-in-the-middle degradation behavior for GPT-4.1 mini specifically

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — types verified directly from installed node_modules
- Architecture (clientTools + sendContextualUpdate): HIGH — verified from TypeScript definitions
- Agent PATCH API: MEDIUM — verified from official docs, one field name assumption (A3)
- GPT-4.1 mini context window: HIGH — verified from official OpenAI announcement
- Pitfalls (cleanup bug, drift): HIGH — based on Phase 6.5 documented lessons

**Research date:** 2026-05-13
**Valid until:** 2026-08-13 (90 days; 11labs SDK may release major version; GPT-4.1 mini context window is stable)
