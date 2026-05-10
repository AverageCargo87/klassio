---
phase: 04-board-deploy
plan: 01
subsystem: api
tags: [tldraw, openai, undici, board, executor, tools, instrumentation, next.js]

# Dependency graph
requires:
  - phase: 03-lesson-shell
    provides: LessonShell component, lesson page, lib/lesson-bus — board panel will integrate with these in 04-03
provides:
  - tldraw@3.15.6, openai@6.37.0, undici@8.2.0 exact-pinned in package.json
  - next.config.ts extended with undici serverExternalPackages + webpack node: externals
  - instrumentation.ts — HTTPS_PROXY conditional ProxyAgent (dev RU VPN tunnel)
  - lib/board/tools.ts — 9 DrawToolSchema entries (draw_text through finish)
  - lib/board/executor.ts — executeToolCall(editor, name, rawParams) — tldraw shape creator
  - lib/board/index.ts — barrel re-exports
  - lib/board/__tests__/tools.test.ts — 13 tests, all schema fields validated
  - lib/board/__tests__/executor.test.ts — 10 tests, richText vs text regression guard included
affects:
  - 04-02 (API endpoint: imports drawTools from lib/board/tools + executeToolCall indirectly)
  - 04-03 (BoardPanel UI: imports executeToolCall from lib/board/executor)

# Tech tracking
tech-stack:
  added:
    - tldraw@3.15.6 (exact-pinned, client canvas)
    - openai@6.37.0 (exact-pinned, LLM function calling)
    - undici@8.2.0 (exact-pinned, HTTPS proxy for dev)
  patterns:
    - Exact-pinned npm deps (no carets) for tldraw/openai/undici
    - createRequire pattern for dynamic undici import (CON-webpack-undici)
    - TextShape uses richText via toRichText(); ArrowShape uses plain text: string (CON-tldraw-shape-quirks)
    - Vitest mock of tldraw for client 'use client' module testing in Node environment

key-files:
  created:
    - instrumentation.ts
    - lib/board/tools.ts
    - lib/board/executor.ts
    - lib/board/index.ts
    - lib/board/__tests__/tools.test.ts
    - lib/board/__tests__/executor.test.ts
  modified:
    - package.json (3 new exact-pinned deps)
    - package-lock.json
    - next.config.ts (undici in serverExternalPackages + webpack externals)
    - lib/env.ts (OPENAI_API_KEY optional field added)
    - .env.example (OPENAI_API_KEY= + HTTPS_PROXY comment)

key-decisions:
  - "Exact-pinned tldraw@3.15.6, openai@6.37.0, undici@8.2.0 via npm install --save-exact (no carets)"
  - "webpack externals callback marks all node:* requests as commonjs externals — required for undici's node: imports (CON-webpack-undici)"
  - "OPENAI_API_KEY added as optional (z.string().min(10).optional()) in envSchema — app boots in CI without key set"
  - "executor.ts mocked in vitest via vi.mock('tldraw') + globalThis.requestAnimationFrame polyfill"

patterns-established:
  - "Regression guard pattern: executor test asserts richText for TextShape AND asserts NO richText for ArrowShape (both directions tested)"
  - "createRequire() for dynamic undici load — webpack skips static analysis of createRequire calls"

requirements-completed:
  - BRD-01
  - PED-01

# Metrics
duration: 5min
completed: 2026-05-10
---

# Phase 04 Plan 01: Board Library Layer Summary

**tldraw executor + OpenAI tool schemas ported to lib/board/ with 23 Vitest tests including regression guards for richText vs plain-text arrow distinction**

## Performance

- **Duration:** 5 min
- **Started:** 2026-05-10T02:17:11Z
- **Completed:** 2026-05-10T02:22:00Z
- **Tasks:** 2
- **Files modified:** 11 (5 created new files in lib/board, 6 existing files extended)

## Accomplishments

- Installed 3 exact-pinned deps (no carets): tldraw@3.15.6, openai@6.37.0, undici@8.2.0
- Extended next.config.ts with undici in serverExternalPackages + webpack node: externals function (CON-webpack-undici); preserved outputFileTracingRoot (CON-nextjs-tracing-root)
- Ported instrumentation.ts from tldraw-test — HTTPS_PROXY conditional ProxyAgent for dev, no-op in production
- Ported lib/board/tools.ts — 9 DrawToolSchema entries matching CON-tools-spec contract
- Ported lib/board/executor.ts — executeToolCall with richText for TextShape, plain text for ArrowShape (D-10/D-11)
- 23 Vitest unit tests green (13 tools schema + 10 executor), 104 total passing (81 existing + 23 new)
- npm run build passes

## Task Commits

1. **Task 1: Add exact-pinned deps + extend next.config.ts + port instrumentation.ts** - `b3fd25a` (feat)
2. **Task 2: Port lib/board/ — tools + executor + index + Vitest tests** - `6772555` (feat)

## Files Created/Modified

- `package.json` — tldraw@3.15.6, openai@6.37.0, undici@8.2.0 exact-pinned (no carets)
- `next.config.ts` — undici added to serverExternalPackages; webpack externals for node: URI scheme
- `instrumentation.ts` — Next.js instrumentation hook: HTTPS_PROXY conditional undici ProxyAgent
- `lib/env.ts` — OPENAI_API_KEY optional field added to envSchema
- `.env.example` — OPENAI_API_KEY= line + HTTPS_PROXY comment
- `lib/board/tools.ts` — 9 provider-agnostic DrawToolSchema entries (draw_text through finish)
- `lib/board/executor.ts` — executeToolCall async function; TextShape richText; ArrowShape text
- `lib/board/index.ts` — barrel: re-exports drawTools, executeToolCall, and types
- `lib/board/__tests__/tools.test.ts` — 13 tests: tool count, names, required field assertions
- `lib/board/__tests__/executor.test.ts` — 10 tests: mock editor + richText vs plain text regression guard

## Decisions Made

- **OPENAI_API_KEY as optional in envSchema**: app must boot in CI/dev without key set (it's required only at runtime for /api/draw). Used `z.string().min(10).optional()` — permissive enough for both sk- and sk-proj- prefixed keys.
- **requestAnimationFrame polyfill in test**: executor.ts uses rAF for fade animations. happy-dom provides a stub but needed globalThis assignment for the test file scope.
- **vi.mock('tldraw') before import**: tldraw is a 'use client' package with DOM dependencies — mocking must precede import for vitest to hoist correctly.

## Deviations from Plan

None — plan executed exactly as written. All files ported verbatim from tldraw-test with the Phase 6 TODO comment added per D-09. The only addition beyond the verbatim port: more comprehensive executor tests (10 tests vs the 6 in the plan's action block) to cover draw_rectangle and draw_circle shape types.

## Issues Encountered

None. Build, TypeScript check, and all 104 tests passed first attempt.

## Known Stubs

None. lib/board/tools.ts and lib/board/executor.ts are complete implementations (not placeholders). No UI rendered yet (that is Plan 04-03).

## Threat Flags

None. The new surface (lib/board/ exports) is client-side library code with no network endpoints introduced in this plan. T-04-01-01 through T-04-01-03 from the threat model are all handled: ProxyAgent URI from process.env only (server-side), .env.example OPENAI_API_KEY= is a placeholder (no real secret committed), undici ProxyAgent failure is caught and logged.

## Next Phase Readiness

- lib/board/tools.ts + executor.ts ready for import by Plan 04-02 (API endpoint: /api/draw SSE agent-loop)
- lib/board/ ready for import by Plan 04-03 (BoardPanel UI component using executeToolCall)
- instrumentation.ts will activate HTTPS_PROXY tunnel when user runs dev with HTTPS_PROXY set in .env.local

---
*Phase: 04-board-deploy*
*Completed: 2026-05-10*

## Self-Check: PASSED

Files verified:
- FOUND: package.json (tldraw: 3.15.6, openai: 6.37.0, undici: 8.2.0)
- FOUND: next.config.ts (undici in serverExternalPackages, outputFileTracingRoot preserved)
- FOUND: instrumentation.ts
- FOUND: lib/board/tools.ts
- FOUND: lib/board/executor.ts
- FOUND: lib/board/index.ts
- FOUND: lib/board/__tests__/tools.test.ts
- FOUND: lib/board/__tests__/executor.test.ts
- FOUND: .env.example (OPENAI_API_KEY= line present)
- FOUND: lib/env.ts (OPENAI_API_KEY field present)

Commits verified:
- FOUND: b3fd25a feat(04-01): add exact-pinned deps + extend next.config.ts + port instrumentation.ts
- FOUND: 6772555 feat(04-01): port lib/board/ — tools.ts + executor.ts + index.ts with Vitest tests

Tests: 104 passed (81 existing + 23 new)
Build: npm run build passes (7 static + dynamic routes)
TypeScript: tsc --noEmit exits 0
