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
