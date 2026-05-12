---
created: 2026-05-12
purpose: Resume guide for the next session after /clear. Read this first.
status: Phase 6.5 COMPLETE (voice works in browser with VPN); without-VPN UAT pending
prior_session: SESSION-2026-05-11-WRAPUP.md
---

# 🎯 Resume guide — end of 2026-05-12 session

> Phase 6.5 deployed end-to-end in one session. Voice works in browser through
> the proxy. Project moved from "blocked on infrastructure" to "blocked on
> next-phase planning".

---

## 📦 What shipped today

### Phase 6.5 — EU WS-proxy (NOT Hetzner — h2.nexus)

**Hosting story:**
- Hetzner — account verification REJECTED (fake name on virtual card not matching billing name)
- DigitalOcean — card declined (same root cause)
- **h2.nexus** — accepted, SBP payment, Frankfurt RED datacenter. Tier we got: RED-16 ($24/mo, oversized but only available SBP tier). VPS: `87.120.93.35`, Debian 11.

**Architecture deployed:**
```
Browser (RU)  →  wss://87.120.93.35.nip.io/?u=base64&t=ms&s=HMAC
                  ↓
                nginx (TLS termination, Let's Encrypt cert via nip.io)
                  ↓
                Node WS-proxy (HMAC verify, systemd auto-restart, 127.0.0.1:3001)
                  ↓
              wss://api.elevenlabs.io/v1/convai/conversation?... (server-to-server)
                  ↓
                ElevenLabs
```

**Files added (in repo, reproducible):**
- `infra/h2nexus/voice-proxy/{index.mjs, package.json}`
- `infra/h2nexus/nginx/voice-proxy.conf`
- `infra/h2nexus/systemd/klassio-voice-proxy.service`
- `lib/elevenlabs/proxy-url.ts` (+ 7 unit tests)
- `components/panels/transcript-panel.tsx` (chat UI between Voice and Trainer)
- `scripts/{ssh-run, test-ws-from-ru, test-proxy-end-to-end, restore-agent-config, seed-evergreen-lesson}.mjs/.ts`

**Vercel prod env vars added today:**
- `VOICE_PROXY_HOST=87.120.93.35.nip.io`
- `VOICE_PROXY_HMAC_SECRET=<64 hex chars; same value in /opt/klassio-voice-proxy/.env on VPS>`
- `SEED_ADMIN_EMAIL=kratov.gr@gmail.com` (admin `?test=1` bypass needed this)

### Three bugs found and fixed along the way

1. **VoicePanel cleanup-effect bug** (`c261fb0`) — `useEffect([conversation])` re-ran on every status update, calling `endSession()` ~625ms after SDK fired `onConnect`. Existed since Phase 6 but was masked by CF cutting the WS at 1.6s before `onConnect` ever fired. Fix: latch conversation in ref, `useEffect([])`.

2. **11labs agent reset to demo template** — `klassio_agent` had its voice/language/prompt/LLM/TTS all reset to the "Professor Echo" sample. Manual UI restore is fragile (this is twice now). Fixed via `scripts/restore-agent-config.mjs` which PATCHes the agent back to the spec in `PHASE-6-SETUP-2026-05-10.md`. Reproducible — script in repo.

3. **Board "double-draw" bug** (`1bb23e3`) — LLM was emitting both `explain_column_addition` scene AND manual template draw_text calls in the same /api/draw request, layering two diagrams on top of each other. Root cause: SYSTEM_PROMPT recommended scenes AND included a full manual template; LLM did both to hit the "8-15 tool calls" rule. Fix: rewrote SYSTEM_PROMPT to "scene OR primitives, never both", with explicit ⛔ markers.

### New feature: TranscriptPanel

User requested after first successful voice UAT: "хотелось бы чтобы у меня в интерфейсе был чат". Added right-column block between Voice and Trainer. Subscribes to new `voice:transcript` event on the lesson bus (emitted by VoicePanel on each SDK `onMessage`). Chat-style bubbles, teacher left / user right, auto-scroll, resets on lesson change.

### Pacing fixes for the board (column-addition felt rushed)

`lib/board/executor.ts`: FADE_IN_MS 900→1500ms, DIGIT_STAGGER 280→450ms, highlight `duration_ms` default 1500→4000ms, **active-highlight dedup** via shape `meta.kind='highlight'` so two adjacent dashed frames never co-exist on canvas.
`lib/board/scenes/explain-column-addition.ts`: all `wait` values bumped (700→3000ms, 400→4500ms after highlight, etc).
`app/api/draw/route.ts` SYSTEM_PROMPT: removed the duplicate manual template (was conflicting with scenes), enforced minimum waits, fixed highlight width guidance (40→30) so adjacent columns don't overlap.

---

## 🎬 Current state

- **Production**: https://klassio-one.vercel.app (latest: `klassio-c1ok6ikog`)
- **Admin permanent test lesson**: `https://klassio-one.vercel.app/lesson/eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee` (status: `in_progress` — accidentally completed earlier, `scripts/seed-evergreen-lesson.ts` is idempotent and resets it)
- **Voice with VPN**: ✓ working (Nataly, Russian, 40+ sec stable)
- **Voice without VPN**: ⏳ pending user re-test (technically expected to work — direct WS test from RU residential without VPN also succeeded earlier, just the actual browser+chrome path wasn't tried natively yet)
- **Board "explain" demo**: ✓ working, no double-draw, pace appropriate

---

## 🔜 What to do next session

User said end-of-session: "сохрани текущий статус. какой следующий этап?"

### Option A — Final without-VPN UAT (15 min)
Closes Phase 6.5 history fully. User toggles VPN off, opens admin URL, clicks "Запустить голос", confirms voice still flows (it should — we proved h2.nexus IP isn't on CF blacklist via curl test from the same RU desktop with VPN off way earlier in the session).

If for any reason CF starts cutting the proxy domain too, contingency: buy a real $10/year domain on Cloudflare Registrar, A-record to 87.120.93.35 (proxy=OFF), re-issue Let's Encrypt cert for that domain, change `VOICE_PROXY_HOST` env in Vercel. ~30 min.

### Option B — Phase 8: Two-tier LLM (Pedagogical + Realtime) ★ recommended
Largest value-unlock remaining. Architecture:
- **Slow/smart**: GPT-4o server-side watcher that observes lesson state (board events, trainer answers, voice transcript, silence) and emits high-level pedagogical decisions
- **Fast/realtime**: existing 11labs Conversational AI as the in-the-moment actor; receives contextual updates from the slow tier

Scope per ROADMAP Phase 8:
- Pedagogical decision schema
- Trigger detector (silence, off-task, wrong-answer streak, tab switch)
- Contextual update pipe to 11labs Conversational AI agent (`sendContextualUpdate` SDK method)
- Cost: +$22-45/mo variable (4o tokens, depends on lesson length and verbosity)

**Estimated**: 8-12 hours of work. Spans 3-4 plans.

Pre-flight checks before starting:
- Phase 6.5 is done (voice unblocked) ✓
- 11labs `sendContextualUpdate` exists in SDK ✓ (saw it in BaseConversation.d.ts today)
- Lesson bus already carries trainer events + voice:transcript ✓ — Pedagogical can subscribe to all of them

### Option C — Phase 10: Recording + transcript persistence + content moderation
Now that transcript flows through the bus, persisting it is "easy". Bigger lift is 152-ФЗ content moderation + storage decisions (R2 vs S3 vs DB blob). User originally flagged this as needing a legal decision.

### Option D — Phase 11: Stroke-drawing animation + SSML sync
Polish. Makes the "magic" feel of synchronized voice+drawing+text more visceral. Lower business value than Phase 8 but more impressive.

**Recommendation: A → B**. Confirm without-VPN UAT (10-15 min including pinging the user to retest), then start Phase 8 planning via `/gsd-discuss-phase 8`.

---

## 📂 What to read after /clear

1. **This file** — short snapshot of state
2. `.planning/STATE.md` — full project memory
3. `.planning/ROADMAP.md` § Phase 8 — goal + criteria for the next major
4. `.planning/phases/06.5-hetzner-proxy/06.5-SUMMARY.md` — full Phase 6.5 reference
5. `.planning/PHASE-6-SETUP-2026-05-10.md` — 11labs agent spec (still authoritative; restore-agent-config.mjs reads from it)
6. `.planning/phases/08-llm/08-CONTEXT.md` — Phase 8 draft (predates today, may need refresh after Phase 6 is fully shipped)

---

## 📈 Numbers

- **Commits today**: `43f81eb` (evergreen seed) → `bc75fdc` (lesson status fix) → `2124003` (board auto-clear) → `21ded10` (board pacing) → `1bb23e3` (kill duplicate scene path) → main proxy commit → `c261fb0` (cleanup bug fix) → `6401cf5` (agent restore script) → `d7bf545` (transcript feature)
- **VPS**: h2.nexus RED-16, 8 vCPU / 16 GB / 240 GB, $24/mo via SBP
- **Tests**: ~338 unit total, +7 new (proxy-url), 2 pre-existing failing (firstMessage override, tracked since Phase 6)
- **Cost rollout**: fixed +$24/mo (~2160 ₽). COSTS.md envelope: still under 15 000 ₽/mo target.

---

*Created 2026-05-12 at end of voice-unblock session. Phase 6.5 ✓.*
