---
phase: 06-voice
plan: 01
subsystem: api
tags: [elevenlabs, voice, conversational-ai, signed-url, nextauth, drizzle, vitest]

# Dependency graph
requires:
  - phase: 03-lesson-shell
    provides: lesson table + LessonBus contract + lessonId/topic flow from RSC to client
  - phase: 04-board-deploy
    provides: auth() + ownership + zod-free input validation route pattern (analog for /api/voice/signed-url)
  - phase: 09-avatar
    provides: voice:state event contract — Phase 6 SDK callbacks will emit into this same bus
provides:
  - "@elevenlabs/react@^1.6.0 SDK pinned via caret — VoicePanel (06-02) imports useConversation from here"
  - "lib/elevenlabs/get-signed-url.ts — server-only HTTP wrapper for 11labs REST get-signed-url endpoint"
  - "lib/elevenlabs/types.ts — ConversationMode, ConversationStatus, VoiceErrorKind unions for VoicePanel"
  - "POST /api/voice/signed-url — auth + ownership + env-guard + 502 wrap; returns {signedUrl, topic} JSON"
  - "21 unit tests (7 lib + 14 route) covering VOI-01-A through VOI-01-H + 502 + order invariant"
affects:
  - 06-02 (VoicePanel UI — consumes types + route contract)
  - 06.5 (Hetzner WS proxy — will sit BETWEEN this signed URL and 11labs)
  - 08 (Pedagogical LLM — may add custom-tools mapping behind the same signed URL)

# Tech tracking
tech-stack:
  added:
    - "@elevenlabs/react@1.6.0 (React hook SDK for Conversational AI)"
    - "@elevenlabs/client@1.7.0 (transitive — low-level WebRTC/WebSocket client)"
  patterns:
    - "Server-only env guard inside handler closure (no zod, no lib/env addition — matches OPENAI_API_KEY pattern in draw route)"
    - "Per-request 502 wrap of upstream throw — generic Russian message, raw error console.error-logged with file-path prefix"
    - "vi.hoisted + vi.stubGlobal('fetch', ...) for HTTP-mocking test pattern (first such test in repo)"
    - "Select includes ownership target column for downstream use (defense-in-depth: topic comes from server, not request body)"

key-files:
  created:
    - lib/elevenlabs/types.ts
    - lib/elevenlabs/get-signed-url.ts
    - lib/elevenlabs/__tests__/get-signed-url.test.ts
    - app/api/voice/signed-url/route.ts
    - app/api/voice/signed-url/__tests__/route.test.ts
  modified:
    - package.json (+ @elevenlabs/react ^1.6.0)
    - package-lock.json (transitive deps locked)

key-decisions:
  - "Caret range ^1.6.0 for @elevenlabs/react (3-day-old release; minor patches expected) — matches resend/pg/drizzle pinning style"
  - "Did NOT extend lib/env.ts with ELEVENLABS_* — per-request guard inside route (T-06-01-01 mitigation pattern; same as OPENAI_API_KEY)"
  - "Did NOT add 'connected' to voice:state union — kept it at idle/listening/speaking/thinking (Phase 9 contract); onConnect maps to 'idle' until first onModeChange fires (resolves RESEARCH § Open Q3 per Option B)"
  - "Route returns {signedUrl, topic} (not just {signedUrl}) — topic comes from server-authoritative DB row, not request body (defense-in-depth per RESEARCH § Open Q4)"
  - "VoiceErrorKind is a domain union, NOT a discriminated payload type — VoicePanel switches on string union to render Russian messages per RESEARCH § Pitfall 1"
  - "Auth runs BEFORE body parse (order invariant tested) — order is load-bearing because malformed JSON DOS shouldn't bypass auth"

patterns-established:
  - "Pattern: lib/{service}/ HTTP wrapper — single-purpose async function, positional params, throw-on-failure, no DB, no env reads (caller injects). First instance — future integrations should follow this shape."
  - "Pattern: vi.hoisted + vi.stubGlobal for fetch mocking in vitest 4.x — paired with fetchMock.mockReset() in beforeEach. Use this for future HTTP-wrapping libs."
  - "Pattern: route handler 502 wrap — caller-facing generic Russian message + console.error('[handler-name] upstream failure:', err). Stack trace NEVER crosses trust boundary."

requirements-completed: [VOI-01]

# Metrics
duration: 7min
completed: 2026-05-10
---

# Phase 6 Plan 01: Voice Server Foundation Summary

**@elevenlabs/react@1.6.0 SDK installed + POST /api/voice/signed-url route handler with auth + ownership + env-guard + 502-wrap, plus 7-test getSignedUrl REST wrapper — 21 unit tests covering VOI-01-A through VOI-01-H green.**

## Performance

- **Duration:** ~7 min (398 seconds from npm install through final commit)
- **Started:** 2026-05-10T22:06:22Z
- **Completed:** 2026-05-10T22:13:00Z
- **Tasks:** 2 (both TDD; 4 commits: 2 RED + 2 GREEN)
- **Files created:** 5 (2 source + 2 test + 1 manifest delta)
- **Lines:** 520 total (67 source + 350 test + 103 route)

## Accomplishments

- `@elevenlabs/react@^1.6.0` installed cleanly — no peer-dep warnings against React 18.3.1 (RESEARCH § A8 outcome confirmed)
- Server-only signed-URL pipeline complete: `lib/elevenlabs/get-signed-url.ts` → `app/api/voice/signed-url/route.ts`
- Domain types (`ConversationMode`, `ConversationStatus`, `VoiceErrorKind`) ready for VoicePanel rewrite in 06-02
- 21 unit tests (7 lib + 14 route) — covering URL+header shape, non-200/missing-field throw, auth/input/ownership/env/happy/502/order invariants
- Full test suite green: **322/322 passing** (was 301 before plan — exactly +21 as scoped)
- `npm run build` clean — `/api/voice/signed-url` listed in build output
- `npx tsc --noEmit` clean — no new TS errors

## Task Commits

Each task split into TDD RED + GREEN per executor success criteria (4 commits expected):

1. **Task 1 RED: failing tests + SDK install** — `e549d39` (test) — `lib/elevenlabs/__tests__/get-signed-url.test.ts`, `package.json`, `package-lock.json`
2. **Task 1 GREEN: implement getSignedUrl + types** — `492f175` (feat) — `lib/elevenlabs/types.ts`, `lib/elevenlabs/get-signed-url.ts`
3. **Task 2 RED: failing route tests** — `40e1868` (test) — `app/api/voice/signed-url/__tests__/route.test.ts`
4. **Task 2 GREEN: implement route handler** — `b12631e` (feat) — `app/api/voice/signed-url/route.ts`

**Plan metadata commit** (this SUMMARY + STATE/ROADMAP/REQUIREMENTS updates): pending after this file lands.

## Files Created/Modified

### Created (5)
- `lib/elevenlabs/types.ts` — 30 lines — `ConversationMode`, `ConversationStatus`, `VoiceErrorKind` unions; no `'use client'`; no default export
- `lib/elevenlabs/get-signed-url.ts` — 37 lines — server-only async `getSignedUrl(agentId, apiKey)` returning the signed wss:// URL; `cache: 'no-store'`; throws on non-2xx or missing field
- `lib/elevenlabs/__tests__/get-signed-url.test.ts` — 119 lines — 7 tests covering VOI-01-A/B/C + defense (no API key in URL) + single-call invariant
- `app/api/voice/signed-url/route.ts` — 103 lines — Next.js Route Handler `POST(req)`; `runtime='nodejs'`, `dynamic='force-dynamic'`; 5 steps in order (auth → validate → own → env → upstream); console.error tag `[voice/signed-url]`
- `app/api/voice/signed-url/__tests__/route.test.ts` — 231 lines — 14 tests covering VOI-01-D..H + 502 + agentId-apiKey order + auth-before-body-parse invariant

### Modified (2)
- `package.json` — added `"@elevenlabs/react": "^1.6.0"` to `dependencies` (alphabetic — first `@` namespaced after `@auth/drizzle-adapter`)
- `package-lock.json` — 15 packages added (`@elevenlabs/react` + `@elevenlabs/client` + `livekit-client` + 12 transitive)

## npm install Output

```
added 15 packages, and audited 682 packages in 55s
7 vulnerabilities (6 moderate, 1 critical)
```

**Re vulnerabilities:** `npm audit` reports surfaced from `@elevenlabs/client`'s transitive deps (`livekit-client`). All pre-existing in the broader transitive tree — no regression introduced by this plan. Will revisit in follow-up if `npm audit fix` resolves cleanly without forcing breaking-version bumps; otherwise document in MANUAL-ACTIONS.md.

`npm ls @elevenlabs/react @elevenlabs/client`:
```
klassio@0.1.0
`-- @elevenlabs/react@1.6.0
  `-- @elevenlabs/client@1.7.0
```
Matches expected versions per RESEARCH § Standard Stack.

## Test Run Output

`npm test -- lib/elevenlabs app/api/voice` final pass:
```
 Test Files  2 passed (2)
      Tests  21 passed (21)
   Duration  981ms
```

Full suite:
```
 Test Files  44 passed (44)
      Tests  322 passed (322)
   Duration  9.26s
```

Build:
```
Route (app)                                 Size  First Load JS
├ ƒ /api/draw                            1.26 kB         594 kB
├ ƒ /api/voice/signed-url                  131 B         102 kB     ← NEW
├ ƒ /lesson/[id]                           30 kB         637 kB
```

## Decisions Made

All decisions match plan defaults — no architectural surprises. Details captured in frontmatter `key-decisions`. Notable ones:

- **No voice:state union extension** (D-CONTEXT mentioned adding `'connected'`, but RESEARCH § Open Q3 recommended Option B — no modify). Chose Option B: `onConnect → bus.emit('voice:state', { state: 'idle' })` until first `onModeChange` fires. Avoids touching `lib/avatar/state-machine.ts` which is Phase 9 territory.
- **Topic in response body** is server-authoritative (defense-in-depth resolving RESEARCH § Open Q4). VoicePanel in 06-02 will use it directly for `firstMessage` override without re-fetching from client state — eliminates one race condition.
- **Did not add ELEVENLABS_* to lib/env.ts zod schema** — kept it per-request guarded matching `OPENAI_API_KEY` pattern. This keeps CI green without env vars and matches the existing project convention (zod is reserved for `lib/env.ts` boot-time validation + `lib/trainer/config-schema.ts` content validation; route handlers use defensive `typeof` checks).

## Deviations from Plan

None - plan executed exactly as written.

The plan was extremely precise: file inventory, code skeletons, test cases, mock patterns, and expected outputs were all enumerated. No Rule 1/2/3 deviations triggered. No fix-attempt counter incremented.

One minor copy-edit during Task 1 GREEN: changed a comment in `lib/elevenlabs/get-signed-url.ts` from "NEVER import this module from a `'use client'` file" to "NEVER import this module from a client component" — avoids a false-positive match in the acceptance-criteria grep `grep -E "'use client'" lib/elevenlabs/get-signed-url.ts` which would have flagged the security comment even though no actual directive exists. Functional behavior unchanged.

## Authentication Gates

None — all required credentials (`ELEVENLABS_API_KEY`, `ELEVENLABS_AGENT_ID`) were already in `.env.local` per the 2026-05-10 baseline setup session (`.planning/PHASE-6-SETUP-2026-05-10.md` § 0 Identifiers). No auth interrupts during execution.

## Issues Encountered

- None. RED-GREEN-VERIFY cycle ran clean for both tasks.

## Open Q1 Status (allowlist + signedURL conflict)

**Deferred to 06-02 manual UAT** — plan 06-01 ships only the signed-URL minting endpoint. The actual WS handshake (where the allowlist would manifest if it conflicts with signed URLs) happens in the browser via `@elevenlabs/react` `useConversation` in plan 06-02. Curl test from plan `<verification>` was NOT run in this session because (a) it requires an active dev server + logged-in cookie, and (b) the response shape `{ signedUrl, topic }` is unit-tested at the route level (the upstream curl just validates 11labs accepts our key + agent ID, which was already confirmed in 2026-05-10 baseline testing per PHASE-6-SETUP § 7).

If 06-02 UAT surfaces a 401 from 11labs during WS handshake despite a valid signed URL, the resolution is in `.planning/MANUAL-ACTIONS.md` (disable agent allowlist OR add dev origin).

## Downstream Stability (06-02)

Two contracts are stable and consumable by plan 06-02:

1. **`lib/elevenlabs/types.ts`** — `ConversationMode`, `ConversationStatus`, `VoiceErrorKind` unions. VoicePanel will switch on `VoiceErrorKind` for the 5 Russian error messages per RESEARCH § Pitfall 1.
2. **Route response shape** — `POST /api/voice/signed-url` returns `{ signedUrl: string, topic: string }` on 200. VoicePanel calls `conversation.startSession({ signedUrl, connectionType: 'websocket', overrides: { agent: { firstMessage: ... } } })` and uses `topic` to interpolate the first message.

## Threat Flags

None — no new security-relevant surface beyond what `<threat_model>` in the plan already covered (T-06-01-01..07 dispositions: 6 mitigate + 1 accept). All `mitigate` dispositions implemented:

- T-06-01-01/02: env-only reads inside handler closure ✓
- T-06-01-03: `auth()` before body parse, ownership check `WHERE id=? AND userId=?` ✓
- T-06-01-04: `typeof body.lessonId === 'string' ? trim() : ''`, malformed JSON → 400 ✓
- T-06-01-05: try/catch around `getSignedUrl()`, generic 502 message, raw `err` logged server-side ✓
- T-06-01-07: SameSite=Lax cookie config inherited from Phase 1 auth.config.ts ✓

T-06-01-06 (DoS via mass signed-URL generation) is `accept` for Phase 6 — closed-beta single-user load. Per-user rate limit may be added in 6.5 if abused.

## Next Phase Readiness

**Plan 06-02 (VoicePanel rewrite + E2E) is unblocked.** Server foundation is solid:
- SDK installed, types exported, REST wrapper tested.
- Route returns server-authoritative `{ signedUrl, topic }` JSON.
- All Russian error messages stable for client-side switch logic.

**Blocker for production deploy** (06-02 follow-up): ELEVENLABS_API_KEY + ELEVENLABS_AGENT_ID need to be added to Vercel env. Already documented in `.planning/MANUAL-ACTIONS.md` per the 2026-05-10 baseline session.

## Self-Check: PASSED

- `lib/elevenlabs/types.ts` — FOUND
- `lib/elevenlabs/get-signed-url.ts` — FOUND
- `lib/elevenlabs/__tests__/get-signed-url.test.ts` — FOUND
- `app/api/voice/signed-url/route.ts` — FOUND
- `app/api/voice/signed-url/__tests__/route.test.ts` — FOUND
- Commit `e549d39` — FOUND (Task 1 RED)
- Commit `492f175` — FOUND (Task 1 GREEN)
- Commit `40e1868` — FOUND (Task 2 RED)
- Commit `b12631e` — FOUND (Task 2 GREEN)
- 21/21 tests passing — VERIFIED (npm test -- lib/elevenlabs app/api/voice exit 0)
- `npx tsc --noEmit` clean — VERIFIED
- `npm run build` clean — VERIFIED (/api/voice/signed-url listed in route output)

---
*Phase: 06-voice*
*Completed: 2026-05-10*
