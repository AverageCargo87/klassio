---
created: 2026-05-10
purpose: Pending user actions accumulated during autonomous run starting at Phase 1 Wave 6 Task 3
last_updated: 2026-05-10
---

# Manual Actions — pending user

> Список того, что нужно сделать вручную (account creation, deploy, manual testing, $-significant decisions) — Claude не может это автоматизировать и пропустил с пометкой.
>
> Каждый item: phase + task + что нужно сделать + как Claude закроет это после твоего действия.

---

## Phase 1, Wave 6, Task 3 — Production deploy + RU email deliverability

**Status:** PENDING (added 2026-05-10 during autonomous run)

**Что нужно сделать:**

1. **Vercel CLI deploy** (~10 мин):
   ```bash
   cd C:/Users/krato/ClaudeVibecoding/ClaudeDesktop/Klassio
   npm install -g vercel    # если ещё не стоит
   vercel login             # Continue with Google → kratov.gr@gmail.com
   vercel link              # project name: klassio, scope: personal
   vercel --prod
   ```
   Запиши production URL (вида `https://klassio-XXX.vercel.app`).

2. **Production env vars** (~5 мин):
   ```bash
   vercel env add DATABASE_URL production       # вставь pooled URL из .env.local (с -pooler в host)
   vercel env add DATABASE_URL_DIRECT production # direct URL (без -pooler)
   vercel env add AUTH_SECRET production         # 64 hex chars
   vercel env add AUTH_RESEND_KEY production     # re_... ключ
   # НЕ ставь AUTH_URL — Vercel инжектит VERCEL_URL
   vercel env ls    # подтверждение что 4 переменные в production scope
   vercel --prod    # redeploy чтобы env vars применились
   ```

3. **Smoke test production URL** в incognito (~5 мин):
   - `/` → redirect на `/login` ✓
   - `/no-access` → "Доступ не предоставлен" ✓
   - `/lessons` → redirect на `/login` ✓ (middleware)

4. **Gmail magic link round-trip** (~5 мин): submit `kratov.gr@gmail.com` → проверить inbox + spam → click ссылку → должен попасть на `/lessons` с одним уроком.

5. **RU email deliverability A2** (~10 мин): добавить mail.ru или yandex.ru в whitelist (см. команду в `01-06-PLAN.md` Task 3 Шаг 7), submit, записать **inbox / spam / не дошло** для каждого провайдера. Spam — не блокер, фиксится в Phase 2 verified domain.

6. **RU user access A3** (опционально): если есть контакт в РФ — пусть откроет production URL без VPN и пройдёт flow. Если нет — оставляй как "deferred to Phase 4".

**Что Claude сделает после твоего "approved + URL":**
- Запишет findings в `01-06-SUMMARY.md` (заменит секцию `## Production Deploy: PENDING USER ACTION` на actual results)
- Обновит `01-VALIDATION.md` с А2/А3 actual values
- Обновит `COSTS.md` с фактическим production URL
- Обновит `STATE.md` removing deploy from Active todos
- Re-run Phase 1 verification → `passed`
- Mark Phase 1 fully complete в ROADMAP

---

<!-- New manual actions appended below this line as autonomous run continues -->

## Phase 4 — Production deploy + Cloudflare CDN

**Status:** PENDING (added 2026-05-10 during autonomous run, after board port)

**Что нужно сделать:**

После того как закроешь Phase 1 deploy (см. выше — у Phase 4 deploy будет проще, т.к. Vercel CLI уже залогинен и проект linked):

1. **Add OPENAI_API_KEY env to Vercel production** (в `.env.local` он уже из прототипа — скопируй):
   ```bash
   cd C:/Users/krato/ClaudeVibecoding/ClaudeDesktop/Klassio
   vercel env add OPENAI_API_KEY production
   # paste sk-... ключ
   vercel env ls
   ```

2. **Redeploy** с новой переменной:
   ```bash
   vercel --prod
   ```

3. **Cloudflare setup** (для DEP-01 acceptance — РФ-юзеры без VPN):
   - Зарегаться на cloudflare.com если ещё нет
   - Add Site → ввести домен (если уже куплен), либо использовать `klassio-XXX.vercel.app` без CDN пока (fallback)
   - Configure DNS → CNAME `@` → `cname.vercel-dns.com` (proxied — orange cloud ON)
   - SSL/TLS → Full (strict)
   - Caching → Browser TTL: respect existing headers; Edge TTL: 4h default
   - Network → Brotli ON, "Auto Minify" OFF (Next.js handles), Early Hints ON
   - Speed → Cloudflare Workers (Phase 11 maybe)

4. **Smoke test board with РФ context** (через VPN-on-Russia или контакт в РФ):
   - Open production URL
   - Login через magic link
   - Start a lesson → board panel renders
   - Submit prompt: «объясни 245+874 в столбик»
   - Wait for SSE stream → shapes должны появиться на canvas
   - Acceptance: разные prompts → разные разборы (PED-01)

5. **DEP-01 acceptance criteria #4-#6 verification**:
   - #4 Live, не заготовленные: submit 2 different prompts, verify different output
   - #5 critical constraints: проверить что в production logs нет «outputFileTracingRoot» errors, что undici работает
   - #6 env vars: `vercel env ls` показывает только OPENAI_API_KEY и Phase 1 переменные (нет HTTPS_PROXY)

**Что Claude сделает после твоего "approved":**
- Запишет findings в `04-XX-SUMMARY.md`
- Обновит DEP-01 + BRD-01 + PED-01 traceability в REQUIREMENTS.md
- Mark Phase 4 fully complete в ROADMAP.md
- Run phase verification


## Phase 6 — 11labs voice + Hetzner WS proxy (FULLY BLOCKED for autonomous run)

**Status:** PENDING (added 2026-05-10 — Phase 6 contains $-significant decisions Claude cannot make)

**Why Claude skipped:**
- $99/мо 11labs Pro = significant fixed cost (~7800 ₽/мо). Главный watermark по COSTS.md.
- Custom LLM endpoint: Pro vs Business $1320 — нужно verify ДО подписки (per project pointer)
- 11labs payments для нерезидента РФ требуют personal financial decision (нерезидентская карта или посредник)
- Hetzner server provisioning требует SSH keys + cloud console access
- Voice selection требует subjective listening + child testing

**Что нужно сделать (примерный порядок 1-2 дня):**

### Step 1 — Verify 11labs Custom LLM endpoint в Pro
1. Open https://elevenlabs.io/pricing
2. Compare Pro ($99/mo) vs Business ($1320/mo) capabilities
3. Specifically: search for "Custom LLM" availability in Pro tier
4. If unclear → contact 11labs sales OR sign up trial (Free) to verify Pro features in dashboard
5. **DO NOT subscribe Pro until verified Custom LLM available — иначе apparently придётся апгрейдиться на Business что сразу blower budget**

### Step 2 — 11labs аккаунт + Pro подписка
1. Sign up на https://elevenlabs.io/sign-up через email
2. Setup payment method:
   - **Option A**: нерезидентская карта (если есть)
   - **Option B**: посредник типа Wise USD, Payoneer (если карта не работает напрямую)
   - **Option C**: friend's foreign card (last resort)
3. Subscribe to Pro tier — $99/mo recurring
4. Verify Custom LLM endpoint feature available в dashboard

### Step 3 — API key + voice ID
1. 11labs Dashboard → Profile → API Keys → Create
2. Copy key → save в `.env.local`:
   ```
   ELEVENLABS_API_KEY=el_...
   ```
3. Browse https://elevenlabs.io/voice-library — найти RU voices (filter: Russian)
4. Прослушать 3-5 sample клипов on each candidate (особенно «Sergey», «Anna», и любые «multilingual v2»)
5. Pick top 2 candidates → record IDs
6. **Future child approval**: показать sample двум 9-11-летним детям (можно знакомым/родственникам) — пусть выберут «приятнее»

### Step 4 — Hetzner server
1. Sign up https://www.hetzner.com/cloud (если ещё нет аккаунта)
2. Create new project «klassio»
3. Provision server:
   - Image: Ubuntu 22.04 LTS
   - Type: **CCX13** (€10/мес, 2 vCPU AMD EPYC, 8 GB RAM)
   - Location: **Falkenstein** или **Helsinki** (closer Frankfurt = Frankfurt-fsn1) — Falkenstein OK, или Frankfurt fsn1
   - SSH keys: upload ваш public key
   - Firewall: allow inbound 22 (SSH) + 443 (HTTPS) + 80 (HTTP for ACME)
4. После provisioning — note public IP
5. SSH connectivity test:
   ```bash
   ssh root@<PUBLIC_IP>
   ```
6. Записать в новый файл `.env.production` (gitignored): `HETZNER_HOST=<PUBLIC_IP>`

### Step 5 — DNS + TLS для Hetzner
1. Pick subdomain (e.g., `voice.klassio.app` если домен есть, или `voice.klassio-XXX.vercel.app` нет)
2. Cloudflare DNS → A record `voice` → Hetzner public IP, **OFF cloud (grey, не проксируем — WebSocket требует прямой connection с TLS)**
3. SSH к Hetzner → install certbot + nginx → request Let's Encrypt cert for `voice.<domain>`:
   ```bash
   apt update && apt install -y certbot nginx
   certbot --nginx -d voice.<domain>
   ```
4. Test HTTPS: `curl https://voice.<domain>` → 200 (nginx welcome page)

### Step 6 — Generate HMAC secret для Vercel ↔ Hetzner trust
1. На local машине: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`
2. Save в `.env.local`:
   ```
   VOICE_PROXY_HMAC_SECRET=<generated_64_chars>
   ```
3. Same key должен быть на Hetzner server. Поставим через `vercel env add` + `ssh hetzner "echo VOICE_PROXY_HMAC_SECRET=... >> /etc/klassio-voice/env"`

### Step 7 — Подтвердить unblock
Когда выполнил Steps 1-6 — сообщи Claude в чате:
> «Phase 6 unblocked: 11labs Pro active, voice ID = `xyz`, Hetzner host = `<IP>`, HMAC done»

Claude после этого:
- Re-run discuss-phase 6 (refines CONTEXT.md с actual values)
- Generates 3 plans:
  - Plan 06-01: WS proxy code on Hetzner (Node + ws)
  - Plan 06-02: Klassio voice panel integration (11labs Conversational AI client SDK)
  - Plan 06-03: E2E voice flow + bus events wiring
- Executes autonomously
- Total ~3-4 hours work

**ОЦЕНОЧНЫЕ COSTS Phase 6 monthly:**
- 11labs Pro: $99/mo (~7800 ₽/мес at 80 ₽/$)
- Hetzner CCX13: €10/mo (~900 ₽/мес at 90 ₽/€)
- **Total +8700 ₽/мо** to fixed cost — главный financial milestone проекта


## Phase 8 — Two-tier LLM (PARTIAL BLOCK on Phase 6)

**Status:** PARTIAL skeleton (added 2026-05-10)

CONTEXT.md draft в `.planning/phases/08-llm/08-CONTEXT.md` capturing 7 design decisions для Pedagogical (GPT-4o slow) + Realtime (gpt-4o-mini fast through 11labs Custom LLM endpoint) architecture.

**Что blocks полное Phase 8:**
1. Phase 6 voice subsystem must be live (Custom LLM endpoint = 11labs feature, silence detection = VAD)
2. Hetzner server (deciding D-07 location: Vercel vs Hetzner)
3. Pedagogical LLM cost commitment (~$1.50-3 per lesson, 15 lessons/мес = $22-45/мо variable)

**После unblock Phase 6 — что Claude сделает:**
- Re-run discuss-phase 8 (refine с реальными values от Phase 6)
- Plans:
  - 08-01: Pedagogical LLM service (server-side state watcher) + trigger detection
  - 08-02: 11labs Custom LLM endpoint integration (Realtime tier)
  - 08-03: E2E test for proactive triggers (silence, tab switch, wrong-answer streak)
- Cost monitoring: real measurement per lesson

**Можно сделать раньше unblocked Phase 6** (если хочется):
- Pedagogical decision schema + types (typed JSON contract)
- Trigger detector that uses ONLY trainer events (no VAD) — covers 3 of 5 triggers
- Polling loop scaffold



## Update 2026-05-10 (deploy session)

После production deploy session **Phase 1 + Phase 4 deploy items частично закрыты**:

### ✅ Phase 1 deploy — DONE с одной ремаркой

- Vercel project linked, env vars (DATABASE_URL × 2, AUTH_SECRET, AUTH_RESEND_KEY, OPENAI_API_KEY) добавлены
- `vercel --prod` успешно (после серии fixes)
- Production URL: https://klassio-one.vercel.app
- Auth flow end-to-end ✓: form → magic link Gmail → click → /lessons
- **Известный UX баг**: client-side exception на form submit (письмо приходит, но клиент видит "Application error"). Не блокирует функциональность. Подробнее в `.planning/DEPLOY-SESSION-2026-05-10.md`

### ⚠️ Phase 4 deploy — DONE минус rendering bug

- Board API `/api/draw` ✓: SSE stream, agent loop, scenes server-side expansion
- BoardPanel UI ✓: prompt textarea, suggestion chips, narration log
- **Активный баг**: `editor.createShape()` вызывается, но shapes не видны на canvas. Скорее всего layout/CSS issue. Под диагностикой через DevTools. Полный trail + next steps в DEPLOY-SESSION-2026-05-10.md § 1.

### Что осталось из этого списка

- **Cloudflare CDN setup** (Phase 4) — pending. Нужно для DEP-01 acceptance #2-3 (РФ-юзеры без VPN). Делать когда купишь домен или решишь использовать `klassio-one.vercel.app` напрямую.
- **РФ smoke test (DEP-01 #3)** — нужен контакт в РФ или VPN-on-Russia. Pending.
- **Pro upgrade перед beta-юзерами** (Phase 1 Wave 2 D-decision) — пока в Hobby. Перед первым реальным юзером — `vercel switch` на Pro.

### При возврате — что прочитать

1. `.planning/DEPLOY-SESSION-2026-05-10.md` — главный resume файл
2. Этот файл (MANUAL-ACTIONS.md) — оставшиеся ручные шаги
3. `.planning/STATE.md` — общая картина



## Update 2026-05-10 #2 (Phase 6 agent setup session)

### Phase 6 progress — PARTIALLY UNBLOCKED ✅

User progressed Phase 6 substantially:

1. ✅ **11labs Creator subscription** — $11 first month / $22 ongoing. **DOWNGRADE from Pro** saved $77/мо (~6 160 ₽/мо)
2. ✅ **Custom LLM endpoint в Creator** — verified available. Не нужен Pro upgrade для voice (был watermark — снят)
3. ✅ **Voice ID** — picked by user (нужно записать какой именно когда вернёмся)
4. ✅ **LLM Model: GPT-4.1 Nano** — 563ms latency (best для voice), $0.0016/мин = ~39 ₽/мес для 6 уроков

### Что осталось (resume guide для следующей сессии)

**Главный файл для resume**: `.planning/PHASE-6-SETUP-2026-05-10.md` (обновлён — финальная конфигурация)

В нём готовые copy-paste:
- ✅ System Prompt (Russian, age-adapted для 5 класса, безопасный, проактивный)
- ✅ First Message (greeting)
- ✅ Agent Settings (voice stability/speed/conversation timeouts/recording)
- ✅ Test checklist для browser-tester
- ✅ Открытые вопросы для verify (Custom LLM работает? Voice ID какой?)

**Действия пользователя в 11labs**:
1. Paste System Prompt → Agent settings → System Prompt field
2. Paste First Message → Agent settings → First Message field
3. Apply Voice/Conversation/Recording settings per PHASE-6-SETUP-2026-05-10.md § 3
4. Click "Test Agent" / "Talk to Agent" — поговорить голосом
5. Verify checklist (russian voice ✓, понимает речь ✓, переходит к теме ✓, etc.)
6. Capture: **Agent ID**, **Voice ID**, **11labs API key**

**Когда готов** — открыть новую сессию (после `/clear`) и написать Claude:
> Phase 6 baseline готов в 11labs:
> - Agent ID: ...
> - Voice ID: ...
> - 11labs API key: el_... (положу в .env.local)
>
> Готов к integration в Klassio frontend.

**Claude после этого**:
- Plan 06-01 — Klassio frontend integration (11labs Conversational AI SDK в VoicePanel)
- ELEVENLABS_AGENT_ID + ELEVENLABS_VOICE_ID env vars в Vercel
- Wire `voice:state` + `avatar:emotion` bus events
- Удалить Phase 6 placeholder в VoicePanel
- E2E test для voice flow
- Estimated ~2-3 hours work

### Hetzner WS proxy — STILL deferred

Не нужен пока не testing с реального РФ-IP без VPN. Для твоего dev-теста (через VPN) — integration работает напрямую. Setup в PHASE-6-SETUP-2026-05-10.md § Hetzner.

Поставим:
- Перед РФ smoke test
- ИЛИ перед первым beta-юзером


## Update 2026-05-10 #3 (Phase 6 baseline COMPLETE)

### Phase 6 baseline в 11labs полностью настроен ✅

User довёл agent до working state в 11labs Test Agent — арифметика честная (GPT-4.1 mini), голос живой (Nataly + Multilingual v2), gender-neutral для ребёнка, говорит про себя в женском роде. Финальная конфигурация целиком в `.planning/PHASE-6-SETUP-2026-05-10.md`.

### Получены identifiers
```
Agent ID:  agent_7701kr9c2v7eev3tabzv4f2b0e8b
API Key:   sk_... (показывать не буду — сейчас в чат-логах, ротация ниже)
Voice ID:  не нужен (голос привязан к Agent ID)
```

### ⚠️ Phase 6, Step 1 — Положить env vars (USER ACTION)

**Local dev (`.env.local`)** — ✅ DONE 2026-05-11:

```
# 11labs Conversational AI (Phase 6)
ELEVENLABS_API_KEY=sk_<REDACTED-OLD-KEY>
ELEVENLABS_AGENT_ID=agent_7701kr9c2v7eev3tabzv4f2b0e8b
```

**Vercel production** — ✅ DONE 2026-05-11:

Обе переменные **server-only** (без `NEXT_PUBLIC_` префикса) — Agent ID используется только server-side в `/api/voice/signed-url` route. Клиент его никогда не видит. С Authentication=ON на agent это единственный валидный path.

```bash
# Подтверждение:
cd C:/Users/krato/ClaudeVibecoding/ClaudeDesktop/Klassio
vercel env ls
# должны быть: ELEVENLABS_API_KEY (Production), ELEVENLABS_AGENT_ID (Production)
```

**НЕ делать `vercel --prod` сейчас** — деплой произойдёт автоматически когда plan 06-01 закоммитит код, который реально использует эти переменные.

### ⚠️ Phase 6, Step 2 — Ротация API Key (USER ACTION, ПОСЛЕ deploy)

API key `sk_ec83844ed07112fbe33c55...` попал в чат-логи Claude (dev session 2026-05-10). После того как Phase 6 интеграция задеплоится и заработает в проде:

1. На 11labs → Settings → API Keys → **Create API Key** новый (те же permissions: ElevenAgents=Write, Voices=Read, History=Read)
2. Положить новый ключ в `.env.local` + `vercel env add ELEVENLABS_API_KEY production` (можно `vercel env rm` старый сначала или `vercel env pull` для diff)
3. `vercel --prod` чтобы новая переменная применилась
4. На 11labs → удалить старый ключ
5. Smoke test что voice всё ещё работает на проде

1 минута работы.

### Что Claude сделает после "положил env vars"

- Запустит `/gsd-plan-phase 06-voice` → создаст PLAN.md для plan 06-01 (frontend integration)
- В plan: signed URL endpoint, VoicePanel rewrite, bus event wiring, E2E
- Execute plan → коммиты с конкретными деривациями
- Build + tsc + tests green → готово к Vercel auto-deploy


## Update 2026-05-11 #4 (Phase 6 implementation COMPLETE — overnight autonomous run)

### Что было сделано автономно (2026-05-11 night session)

User ушёл спать после baseline complete. Claude отработал:

1. **`/gsd-plan-phase 06-voice`** — research (HIGH confidence), pattern mapping (10/10), planner (2 PLAN.md в 2 wave'ах), plan-checker (VERIFICATION PASSED первой итерацией, 12/12 dimensions)
2. **`/gsd-execute-phase 06-voice`** — Wave 1 (06-01 server foundation, ~7 мин, 21 unit tests) → Wave 2 (06-02 VoicePanel + E2E, ~12 мин, 17 unit + 11 E2E) → goal-backward verifier (PARTIAL → human_needed, 11/13 must-haves verified)

**Total**: 9 commits, 0 regressions, 338/338 unit tests green, tsc + build clean.

```
8961a97 docs(06-voice): phase verification report (PARTIAL → human_needed)
79a5711 docs(06-02): complete VoicePanel UI integration plan
5510696 test(06-02): E2E voice flow + bundle-leak smoke (VOI-01-S/T)
ca87b0f feat(06-02): VoicePanel mic integration + topic prop (VOI-01-I..R GREEN)
8dc64de test(06-02): failing VoicePanel tests + LessonShell topic prop (VOI-01-I..R RED)
209e597 docs(06-01): complete voice server foundation plan
b12631e feat(06-01): add POST /api/voice/signed-url + tests (VOI-01-D..H)
40e1868 test(06-01): add failing tests for /api/voice/signed-url (VOI-01-D..H + 502 + order)
492f175 feat(06-01): implement getSignedUrl server util + types (VOI-01-A/B/C)
e549d39 test(06-01): add failing tests for getSignedUrl (VOI-01-A/B/C) + install @elevenlabs/react
```

### ⚠️ Phase 6 — Утренний manual UAT (USER ACTION, ~15 мин)

Implementation готова, но 6 вещей можно проверить только live микрофоном + VPN. Делается одним сеансом:

#### Шаг 1 — Поднять локально (~30 сек)
```bash
cd C:/Users/krato/ClaudeVibecoding/ClaudeDesktop/Klassio
npm run dev
# ждать "Ready in ..."
```
Открыть https://localhost:3000 (или http://localhost:3000) **с включённым VPN-туннелем** (для OpenAI + 11labs WS).

#### Шаг 2 — Логин + lesson page
1. Залогиниться через magic link на свой `kratov.gr@gmail.com`
2. Открыть тестовый урок из `/lessons` (должен быть seed test lesson «sample addition lesson»)

#### Шаг 3 — Voice UAT по D-09 чеклисту

Жми «Запустить голос» в VoicePanel (нижняя половина под Avatar). Проверь:

| # | Что проверить | Ожидание |
|---|---|---|
| **D-09 #4** | Браузер запрашивает mic permission | Native popup «Разрешить доступ к микрофону?» |
| **D-09 #5** | Скажи «Привет!» в микрофон | Учительница (Nataly) отвечает голосом по-русски в течение ~3 сек |
| **D-09 #6** | Avatar реагирует во время разговора | 👂 когда говоришь, 🗣️ когда отвечает, 🙂 в idle. Эмодзи меняются плавно. |
| **D-09 #7** | Тема урока в greeting | Услышишь фразу типа «Сегодня у нас тема: сложение в столбик. Тебя как зовут?» — тема из БД должна попасть в первую реплику |
| **D-09 #8** | Жми «Остановить» / «Стоп» | Conversation корректно завершается, mic indicator (красная точка в табе) исчезает, Avatar → 🙂 idle |
| **D-09 #9** | Reload страницы (Ctrl+R) | Можешь снова запустить голос без артефактов прошлого session |
| **Open Q1** | Allowlist + Signed URL не конфликтуют | 11labs Security tab: Allowlist (klassio-one.vercel.app + localhost:3000) + Authentication ON одновременно. Если WS handshake падает с `403 forbidden` или `policy violation` — Open Q1 ПОДТВЕРДИЛСЯ. Тогда временно: 11labs Security → Allowlist → удалить хосты → сохранить → повторить. Если работает с пустым allowlist — задокументировать в `06-02-SUMMARY.md` § Manual UAT и обновить `PHASE-6-SETUP-2026-05-10.md` § 7. |
| **Latency** | Засеки замером: click «Запустить голос» → первый звук речи | Цель <3.5s. Если >5s — отдельный issue (можем оптимизировать через Eagerness=High или TTS=Turbo v2.5). |

#### Шаг 4 — После UAT
Запиши outcome в `.planning/phases/06-voice/06-02-SUMMARY.md` § Manual UAT (там готовый шаблон), и сообщи Claude:
> «Phase 6 UAT прошёл, всё работает» — Claude обновит REQUIREMENTS.md (VOI-01 → Complete) и ROADMAP

Если что-то не работает — скажи что именно, и Claude диагностирует.

### ⚠️ Phase 6, Step 5 — Ротация API Key (USER ACTION, всё ещё PENDING)

API key `sk_ec83844...` всё ещё в чат-логах. После того как Phase 6 задеплоится в прод и UAT пройдёт:

См. **Step 2 — Ротация API Key** выше — процедура та же.

### Hetzner WS proxy (Phase 6.5) — всё ещё DEFERRED

Phase 6 implementation работает только через VPN (т.к. OpenAI блокирован в РФ). Phase 6.5 (Hetzner Frankfurt WS proxy) нужен **перед** первым РФ-без-VPN beta-юзером. Setup steps:
- См. `MANUAL-ACTIONS.md` § Phase 6 — Step 4-7 (выше в этом файле, lines 155-187)
- Estimate: 1-2 часа

Pre-flight check (можно сделать прямо сейчас, информация для plan'а 6.5): какой домен / subdomain хочешь для voice proxy? `voice.klassio-one.vercel.app` (через Cloudflare) или новый купленный домен?

### Что Claude может сделать утром после твоего ОК

- Если UAT прошёл → mark Phase 6 fully complete (REQUIREMENTS.md + ROADMAP final tick)
- Если UAT нашёл баги → /gsd-debug или /gsd-plan-phase 06-voice --gaps
- Можно сразу `/gsd-plan-phase 7` (Phase 7 trainer уже implemented, нужны UX fixes) или `/gsd-plan-phase 8` (Pedagogical LLM tier)
- Или Phase 6.5 setup для Hetzner


## Update 2026-05-11 #5 (Phase 6.5 — Hetzner setup, USER ACTION)

### Контекст

Phase 6 manual UAT 2026-05-11 показал что **из РФ-IP голос не работает даже с VPN** — 11labs API защищён Cloudflare bot-management, режет российские IP и VPN exit-ноды flaky way. Это было предусмотрено архитектурно (DEC-deploy-architecture) — нужен Hetzner-сервер во Франкфурте как WS-прокси. Активируем сейчас как Phase 6.5.

После завершения Phase 6.5 → ты сможешь открыть https://klassio-one.vercel.app **без VPN из РФ** и пройти voice UAT.

### Что Claude НЕ может сделать сам (твоя работа, ~30-40 минут)

#### Шаг 1 — Hetzner Cloud аккаунт (~10 мин)

1. Открой https://www.hetzner.com/cloud → **Sign up**
2. Email + пароль → подтверждение по email
3. Способ оплаты:
   - **Лучший вариант**: твоя нерезидентская карта (если есть)
   - **Если нет**: Wise / Payoneer / Revolut — заводят валютную карту для нерезидентов РФ
   - **Last resort**: карта знакомого за рубежом
4. После добавления карты — пройди identity verification (документ, обычно автоматически за 5-10 мин)

#### Шаг 2 — SSH ключ (~3 мин)

В PowerShell:
```powershell
ssh-keygen -t ed25519 -C "klassio-voice-proxy" -f $env:USERPROFILE\.ssh\klassio_hetzner
```
- На вопрос про passphrase → жми Enter (пустой)
- Создастся два файла: `klassio_hetzner` (приватный — НЕ показывать никому) и `klassio_hetzner.pub` (публичный — этот в Hetzner)

Покажи публичный ключ:
```powershell
type $env:USERPROFILE\.ssh\klassio_hetzner.pub
```
Скопируй вывод (одна строка `ssh-ed25519 AAAA...`).

#### Шаг 3 — Создать сервер в Hetzner (~5 мин)

1. Hetzner Console → Projects → **New project** → имя «klassio»
2. В проекте → **Servers** → **Add server**
3. Настройки:
   - **Location**: **Falkenstein** (FSN1) — дешевле и ближе к РФ
   - **Image**: **Ubuntu 24.04**
   - **Type**: **CCX13** (€10.07/мес, 2 vCPU AMD EPYC, 8 GB RAM) — раздел «Dedicated vCPU»
   - **Networking**: оставь по умолчанию (Public IPv4 + IPv6)
   - **SSH keys**: жми **+ Add SSH key** → вставь публичный ключ из Шага 2 → имя «krato-windows»
   - **Firewalls**: создай новый **klassio-voice-fw** с правилами:
     - Inbound TCP **22** (SSH) — Source: any IPv4/IPv6
     - Inbound TCP **80** (HTTP for Let's Encrypt) — Source: any
     - Inbound TCP **443** (HTTPS + WSS) — Source: any
     - Outbound: всё разрешено
   - **Name**: `klassio-voice-proxy`
4. **Create & Buy now**
5. Через ~30 сек сервер готов. Запиши **Public IPv4** (e.g., `49.12.34.56`).

#### Шаг 4 — Проверь SSH-доступ (~2 мин)

В PowerShell (замени `<IP>` на твой):
```powershell
ssh -i $env:USERPROFILE\.ssh\klassio_hetzner root@<IP>
```
- При первом подключении спросит «Are you sure you want to continue?» → пиши **yes**
- Должна открыться сессия `root@klassio-voice-proxy:~#`
- Проверь: `cat /etc/os-release` → должен показать Ubuntu 24.04
- Выходи: `exit`

Если ssh ругается «Permission denied» → SSH ключ не подцепился, проверь Шаг 2-3.

#### Шаг 5 — Домен / поддомен (~5 мин — самый гибкий шаг)

Voice WS-прокси должен жить на HTTPS-домене (нужен TLS для WSS). Варианты:

**Вариант A — у тебя есть свой домен** (e.g., `klassio.app` через Namecheap/Reg.ru/Cloudflare DNS):
- В DNS-провайдере добавь **A-record**: `voice` → `<IP сервера Hetzner>`
- **Cloudflare proxy = OFF** (серое облако, не оранжевое) — WS требует прямое TCP, без Cloudflare WAF
- В итоге `voice.klassio.app` будет указывать на Hetzner

**Вариант B — нет своего домена, не хочешь покупать**:
- Используй **sslip.io** (бесплатный wildcard DNS) — твой URL будет вида `49-12-34-56.sslip.io`
- Никакой настройки не нужно — sslip.io сам резолвит IP из имени
- Минус: некрасивый URL, но для backend-сервиса это не страшно

**Вариант C — promo-домен**:
- Можно купить дешёвый `.app` или `.dev` домен за $10–15/год в Cloudflare Registrar или Namecheap
- Любой `klassio-voice.app` или подобный

Рекомендую **A** если есть свой домен (для будущего frontend deploy на свой домен тоже пригодится). Если нет — **B** (sslip.io), это быстро и не блокер.

#### Шаг 6 — Подтвердить готовность

Когда Шаги 1-5 выполнены — сообщи мне в чате:

```
Hetzner готов:
- Server IP: <IP>
- SSH key path: ~/.ssh/klassio_hetzner
- Domain: voice.<твой-домен>.app  (или 49-12-34-56.sslip.io)
- Hetzner project: klassio
```

После этого:
- Я запущу `/gsd-plan-phase 6.5` → research (Hetzner WS-proxy patterns, nginx config, PM2 setup) + planner создаст PLAN.md
- Я выполню deploy WS-proxy кода на сервер через SSH (через Bash в моём worker'е)
- Я обновлю Klassio frontend чтобы использовал `voice.<domain>` вместо api.elevenlabs.io напрямую
- Я подниму nginx + Let's Encrypt + PM2 на Hetzner
- В итоге ты сможешь открыть Vercel сайт **без VPN** и протестить голос

Estimate моей работы — 1.5-2 часа после твоих 30 мин.

### Что я СДЕЛАЮ автоматом (готовлю прямо сейчас, без твоего участия)

Сегодня вечером пока ты спишь:
- Зафиксирую Phase 6.5 в ROADMAP ✅ (уже сделано)
- Откачу мой UAT-debugging hack (verbose `console.log` в VoicePanel) чтобы prod-код был чистый
- `?test=1` dev-bypass для admin **оставлю** — полезно
- Закоммичу всё чисто

Утром (если ты ещё не сделал Hetzner) я могу:
- Запустить researcher агента который изучит best practices Hetzner-deploy для Node WS-прокси
- Подготовить шаблоны кода (PM2, nginx, Let's Encrypt automation)

Так что когда ты вернёшься с Hetzner-готовым — execution будет быстрая.

