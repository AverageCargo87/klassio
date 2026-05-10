# Phase 11: Stroke-drawing + SSML synchronization — Context

**Status:** SKELETON (PARTIAL BLOCK on Phase 6 voice for SSML markers)
**Mode:** `--auto` (autonomous run)

<domain>
Реализован INV-02: голос + рука + текст синхронны. Stroke-drawing анимация для линий/стрелок; SSML маркеры в 11labs TTS триггерят появление shapes; подсветка в trainer синхронизирована с репликой.
</domain>

<why_partial>
Blocking:
1. **SSML markers требуют 11labs voice** (Phase 6).
2. **Stroke animation** на доске — частично реализуемо без voice. Можно build overlay layer + SVG stroke-dashoffset animation для линий/стрелок BEFORE voice integration. Voice marks wires later.

**Что МОЖНО сейчас (skip полное Phase 11 execution):** Stroke animation overlay для board (partial). Defer — лучше сосредоточить tokens на skeleton + final report.
</why_partial>

<draft_decisions>
- **D-01 — Stroke-drawing technique:** SVG overlay layer above tldraw canvas. Each line/arrow rendered first as `<svg><path stroke-dasharray=L stroke-dashoffset=L>` → animate `stroke-dashoffset` to 0 over ~600-1200ms (depending on line length) → on animation end, remove overlay shape, persist to tldraw canvas.
- **D-02 — Text and complex shapes (text labels, rectangles): fade-in.** Stroke-drawing only для линий/стрелок per ROADMAP success criterion #1.
- **D-03 — SSML marks:** 11labs supports `<mark name="show_X"/>` in voice script. Server constructs voice script with embedded marks; client receives mark events via 11labs SDK websocket; mark name maps to action queue (e.g., `show_carry_1` → reveal shape with id `carry_1`).
- **D-04 — Trainer highlight sync:** when voice says «теперь решим вторую задачу», SSML mark fires → bus emits `trainer:highlight {elementId: 'task-2'}` → TrainerPanel highlights (Phase 7 already has highlight command).
- **D-05 — `wait` tool в scenes (Phase 5)** — preserved, works as natural pause.
- **D-06 — Hand-drawn rough.js style — DEFERRED** to v2 per ROADMAP success criterion #6.
</draft_decisions>

<canonical_refs>
- `.planning/REQUIREMENTS.md` § BRD-03, LES-02, INV-02
- `.planning/ROADMAP.md` § Phase 11 (6 success criteria)
- `.planning/phases/05-scenes/05-CONTEXT.md` (scenes already yield `wait` between steps)
- `.planning/phases/07-trainer/07-CONTEXT.md` (highlight command exists)
- `.planning/phases/04-board-deploy/04-CONTEXT.md` (board layer to extend)
</canonical_refs>
