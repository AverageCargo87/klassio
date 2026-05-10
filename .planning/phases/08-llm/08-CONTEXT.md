# Phase 8: Двухуровневая LLM + проактивные триггеры — Context

**Status:** PARTIAL — DEFERRED to Phase 6 unblock
**Mode:** `--auto` skeleton (autonomous run; full execution requires Phase 6 voice subsystem)

<domain>
## Phase Boundary

Двухуровневая LLM architecture (Pedagogical SLOW GPT-4o + Realtime FAST gpt-4o-mini) + proactive triggers (silence detection, tab switch, wrong answer streak, etc.).

</domain>

<why_blocked>
Phase 8 requires Phase 6 voice subsystem because:
1. **Realtime LLM via 11labs Custom LLM endpoint** (success criterion #2) — endpoint provided by 11labs Agents (Phase 6).
2. **Silence detection trigger** (success criterion #3) — uses VAD from voice subsystem (Phase 6).
3. **Voice acts as Realtime LLM output channel** — without voice, Realtime tier has no audio path.

**Что МОЖНО build autonomously сейчас (defer Phase 8 execution к unblock):**
- Pedagogical LLM service (server-side state watcher)
- Trigger detection from existing bus events (`trainer:idle_15s`, `trainer:answer_submitted` wrong streak, `lesson:end` early)
- Pedagogical decision schema (typed JSON output from GPT-4o)

Решено: skip implementation в этом autonomous run. Когда Phase 6 unblocks, Phase 8 picks up с CONTEXT.md уже написан.
</why_blocked>

<draft_decisions>
- **D-01 — Pedagogical LLM = GPT-4o.** Slow strategist, реагирует на bus snapshots (every 5-10 sec OR on key events). Output = structured JSON (pedagogical decision).
- **D-02 — Realtime LLM = gpt-4o-mini через 11labs Custom LLM endpoint.** Fast actor, реализует pedagogical decisions голосом + board scenes + trainer commands.
- **D-03 — Triggers (5+):**
  - silence > 20s (from voice VAD — Phase 6)
  - `visibilitychange` (browser tab away)
  - 2 consecutive wrong answers (from `trainer:answer_submitted` events)
  - rapid clicking без фокуса (анти-«потыкивание»)
  - explicit help button click
- **D-04 — Decision schema** (Pedagogical → Realtime):
  ```typescript
  type PedagogicalDecision = {
    intent: 'explain' | 'check_in' | 'praise' | 'redirect' | 'wait'
    target?: { taskId?: string; sceneName?: string }
    saySnippet?: string  // optional voice line
    boardActions?: PrimitiveCall[]
    rationale: string  // for logs/debugging
  }
  ```
- **D-05 — NOT Anthropic** (CON-anthropic-rf-block). Both LLMs OpenAI by default.
- **D-06 — Cost watermark target:** $1.50-3.00 per 45-min lesson (Pedagogical + Realtime + 11labs combined). Hard cap requires Phase 6 actuals.
- **D-07 — Pedagogical lives where?** Either:
  - (A) Vercel serverless function (cold-start risk; needs to maintain state per session)
  - (B) Hetzner Frankfurt (same server as voice WS proxy from Phase 6)
  - **Default: B** — keep state server-side, low latency to 11labs.

</draft_decisions>

<canonical_refs>
- `.planning/REQUIREMENTS.md` § LLM-01, PED-02
- `.planning/ROADMAP.md` § Phase 8 (6 success criteria)
- `.planning/phases/06-voice/06-CONTEXT.md` (voice subsystem prerequisites)
- `.planning/phases/07-trainer/07-CONTEXT.md` (trainer event contract — input to Pedagogical)
- `.planning/phases/05-scenes/05-CONTEXT.md` (board scenes — Realtime output channel)
</canonical_refs>
