---
phase: 04-board-deploy
plan: 02
subsystem: api
tags: [openai, sse, auth, drizzle, agent-loop, board, security]

# Dependency graph
requires:
  - phase: 04-board-deploy
    plan: 01
    provides: lib/board/tools.ts (drawTools schema) + lib/board/index.ts exports
  - auth.ts — auth() guard
  - lib/db/ — drizzle ownership query
provides:
  - app/api/draw/route.ts — POST SSE agent-loop endpoint with auth + ownership check
  - app/api/draw/__tests__/route.test.ts — 8 Vitest tests (401/400/403/200 SSE)
affects:
  - 04-03 (BoardPanel UI will POST to this endpoint)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - auth() guard first in POST handler before any body parsing (T-04-02-01)
    - drizzle WHERE id=$lessonId AND userId=$session.user.id → 403 IDOR mitigation (T-04-02-02)
    - OpenAI agent loop: tool_choice:'required' + finish tool intercept + MAX_AGENT_TURNS=30 (T-04-02-03)
    - SSE ReadableStream with data: {JSON}\n\n format; done event with usage
    - parsed_arguments ?? JSON.parse(e.arguments) fallback (D-13, CON-openai-sdk-quirks)
    - Vitest mock of OpenAI with function constructor (not arrow) for new OpenAI() compatibility

key-files:
  created:
    - app/api/draw/route.ts
    - app/api/draw/__tests__/route.test.ts

key-decisions:
  - "OpenAI mock uses function constructor (not arrow function) — arrow functions are not constructable; vi.fn().mockImplementation(()=>({...})) fails with 'not a constructor' when route does new OpenAI()"
  - "process.env.OPENAI_API_KEY set inline in happy-path tests — route checks for missing key after ownership verification; simpler than mocking lib/env"
  - "Error messages 401/403/400 in Russian per constraint — server logs remain English"
  - "finish tool intercepted and NOT forwarded to client — only sets finishedExplicitly=true flag; done event sent after loop exits"

# Metrics
duration: 4min
completed: 2026-05-10
---

# Phase 04 Plan 02: SSE Draw Endpoint Summary

**POST /api/draw SSE agent-loop endpoint ported from tldraw-test with auth() guard, drizzle lessonId ownership check, and 8 Vitest tests covering all error paths**

## Performance

- **Duration:** 4 min
- **Started:** 2026-05-10T02:26:49Z
- **Completed:** 2026-05-10T02:31:14Z
- **Tasks:** 2 (TDD RED + GREEN)
- **Files created:** 2

## Accomplishments

- Created `app/api/draw/route.ts`: 330-line port of tldraw-test prototype with security additions
  - auth() guard → 401 "Войдите в систему" before body parsing
  - Zod-free input validation (typeof checks + trim) → 400 for empty prompt/lessonId
  - Drizzle ownership check WHERE id=lessonId AND userId=session.user.id → 403 "Этот урок не ваш"
  - OpenAI agent loop: tool_choice:'required', MAX_AGENT_TURNS=30, finish tool intercept, parsed_arguments fallback
  - SSE ReadableStream with proper headers (text/event-stream, no-cache, keep-alive, X-Accel-Buffering:no)
  - done event with cumulative usage stats; generic Russian error message for 500s
- Created `app/api/draw/__tests__/route.test.ts`: 8 Vitest tests, all passing
  - 401 (null session), 401 (session without user.id), 400 (empty prompt), 400 (missing lessonId), 400 (whitespace-only prompt), 403 (empty db result), 200 SSE Content-Type, 200 Cache-Control
  - Zero real API calls: auth(), db.select(), and OpenAI all mocked

## Task Commits

1. **RED phase: failing tests** — `f938ae9` (test)
2. **GREEN phase: route implementation + finalized tests** — `c96668b` (feat)

## Files Created/Modified

- `app/api/draw/route.ts` — POST handler with auth + ownership + SSE agent loop (created)
- `app/api/draw/__tests__/route.test.ts` — 8 Vitest tests, no real API calls (created)

## Decisions Made

- **OpenAI mock as function constructor:** Arrow functions cannot be used with `new`. The route does `new OpenAI({ apiKey })`, so the mock must use `function MockOpenAI() { return {...} }` rather than `vi.fn().mockImplementation(() => ({...}))`. Discovered during GREEN phase; fixed in same commit.
- **Inline OPENAI_API_KEY for happy-path tests:** The route checks `process.env.OPENAI_API_KEY` after the ownership check. Setting it inline in happy-path test cases (`process.env.OPENAI_API_KEY = 'sk-test-...'` + cleanup) is simpler than mocking `lib/env` and avoids changing the route's key-check logic.
- **Russian error messages for user-facing 4xx:** Per constraint #10 — "Войдите в систему" (401), "Промпт обязателен" (400), "lessonId обязателен" (400), "Этот урок не ваш" (403), "Ошибка сервера. Попробуйте позже." (500). Server logs remain English.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] OpenAI mock not constructable**
- **Found during:** Task 2 GREEN phase (first test run)
- **Issue:** Plan's template used `vi.fn().mockImplementation(() => ({...}))` — arrow functions cannot be used as constructors, causing `TypeError: ... is not a constructor` when route calls `new OpenAI()`
- **Fix:** Changed mock to `function MockOpenAI() { return {...} }` (plain function, constructable)
- **Files modified:** `app/api/draw/__tests__/route.test.ts`
- **Commit:** c96668b

**2. [Rule 2 - Missing critical functionality] OPENAI_API_KEY check needed in tests**
- **Found during:** Task 2 GREEN phase (first test run after fixing constructor)
- **Issue:** Route checks `process.env.OPENAI_API_KEY` and returns 500 if not set. Happy-path tests were getting 500 instead of 200 because CI environment has no API key.
- **Fix:** Added `process.env.OPENAI_API_KEY = 'sk-test-...'` before happy-path tests + cleanup after
- **Files modified:** `app/api/draw/__tests__/route.test.ts`
- **Commit:** c96668b

## Issues Encountered

None beyond the two auto-fixed deviations above. TypeScript check, build, and all 112 tests passed cleanly after fixes.

## Known Stubs

None. The route is a complete implementation. No UI integration yet (that is Plan 04-03 per constraint #12).

## Threat Flags

None. All threats in the plan's `<threat_model>` are mitigated:
- T-04-02-01: auth() called first, before body parsing — 401 on null session
- T-04-02-02: drizzle WHERE id AND userId — 403 if no matching row (IDOR mitigated)
- T-04-02-03: MAX_AGENT_TURNS=30 + finishedExplicitly exit — DoS/runaway loop mitigated
- T-04-02-04: accepted — generic error string sent to client, not stack trace
- T-04-02-05: lessonId DB-verified, prompt passed as user content with tool_choice:'required'

## Next Phase Readiness

- `app/api/draw/route.ts` ready for Plan 04-03 (BoardPanel UI will POST to this endpoint)
- SSE contract: `data: ${JSON.stringify({ type, payload })}\n\n`, last event `{ type:'done', finish_reason, usage }`
- Tool events: `{ type:'tool_use', id, name, input }` for all non-finish tool calls

---
*Phase: 04-board-deploy*
*Completed: 2026-05-10*

## Self-Check: PASSED

Files verified:
- FOUND: app/api/draw/route.ts
- FOUND: app/api/draw/__tests__/route.test.ts

Commits verified:
- FOUND: f938ae9 test(04-02): add failing Vitest tests for POST /api/draw route
- FOUND: c96668b feat(04-02): implement POST /api/draw SSE endpoint with auth + ownership + agent loop

Tests: 112 passed (104 existing + 8 new)
Build: npm run build passes (8 routes including /api/draw dynamic)
TypeScript: tsc --noEmit exits 0

Critical patterns in route.ts confirmed:
- auth() called at top of POST handler (line 129)
- tool_choice: 'required' in every stream call (line 222)
- e.parsed_arguments ?? JSON.parse(e.arguments) fallback (line 237)
- lessonId ownership check via drizzle (line 168)
- finishedExplicitly flag + finish tool NOT forwarded to client (line 229)
- text/event-stream in response headers (line 322)
- done event sent after agent loop (line 294)
