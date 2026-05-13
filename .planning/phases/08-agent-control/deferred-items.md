# Phase 8 — Deferred Items

## Pre-existing STATE.md corruption (logged 2026-05-13 during plan 08-05 execution)

`.planning/STATE.md` contains 13+ duplicated `## Current Position` sections with each `gsd-sdk query state.*` call appending ~1856 more lines of stale content. The corruption predates plan 08-05 — visible in the initial git diff snapshot at the start of this session.

Effect on plan 08-05:
- `state.advance-plan` correctly updated frontmatter (Plan: 5 → 6, percent: 93 → 97)
- `state.update-progress` correctly recalculated bar
- `state.add-decision` returned `added: false` ×3 — likely because the handler couldn't locate the canonical Decisions section among the duplicates
- `state.record-session` returned `recorded: false` — same root cause
- `roadmap.update-plan-progress` returned `no matching checkbox found` — ROADMAP.md may have a similar structural issue or a different phase-row format

Recommendation for a future cleanup pass:
- Truncate STATE.md back to its single canonical body (the first `## Current Position` block) and re-write with the current frontmatter values
- Add a regression test inside gsd-sdk that detects "more than one `## Current Position` heading" in STATE.md before running the state.* mutation handlers

Plan 08-05 explicitly OUT-OF-SCOPE for fixing this — the rule from the executor playbook: "Only auto-fix issues DIRECTLY caused by the current task's changes."

