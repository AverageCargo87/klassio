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

