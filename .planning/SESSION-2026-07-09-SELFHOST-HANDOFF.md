# HANDOFF: Self-host Klassio на Nexus VPS (резюме после /clear)

**Дата:** 2026-07-09. **Задача одобрена Кратовым:** перенести фронт+API Klassio с Vercel
на арендованный им VPS Nexus, чтобы сайт открывался из РФ **без VPN** (РКН режет `*.vercel.app`).
Это P0.1 из `.planning/AVITO-LAUNCH-PLAN-2026-07-09.md` — главный блокер теста на людях.

> **ПЕРВЫМ ДЕЛОМ новой сессии:** прочитать этот файл + `.planning/AVITO-LAUNCH-PLAN-2026-07-09.md`.
> Кратов сказал «го» — можно сразу исполнять миграцию (не переспрашивать разрешение на сам перенос).
> Спросить у Кратова только: (1) **актуальный root-пароль VPS** (он собирался его сменить — см. ниже);
> (2) **решение по домену** (`.ru` или пока nip.io).

---

## ЦЕЛЬ И АРХИТЕКТУРА «ПОСЛЕ»

- **Сейчас:** фронт+API на Vercel (`klassio-one.vercel.app`, США, режется РКН); голос Ани (Sber-оркестратор) уже на VPS.
- **После:** ВСЁ на VPS Nexus. Родитель заходит на `https://87.120.93.151.nip.io/` (или `.ru`-домен) → сайт+голос с одной RU-доступной машины.
- **База Neon Postgres остаётся в облаке** (НЕ переносим — reachable с VPS, РКН её не трогает, это server→server).
- **Vercel НЕ выключаем** — остаётся бэкапом/откатом.

## VPS — факты (проверено 2026-07-09)

- **Хост:** `87.120.93.151` (h2.nexus, домен `s297348.love-is.nexus`, Debian 11). SSH `root`.
- **Пароль:** был `55arYOK5aMU4` из письма h2.nexus «Активация Виртуального сервера» (поле Пароль). ⚠️ **Кратову советовано сменить root-пароль** (светился в чате) — БРАТЬ АКТУАЛЬНЫЙ У НЕГО в начале сессии, не хардкодить.
- **Ресурсы:** 8 ядер, 15 ГБ RAM (13 свободно), диск 222 ГБ свободно, **Node v20.20.2, npm 10.8.2**. Порт 3000 свободен. **git НЕ установлен** (ставить не надо — заливаем tar'ом).
- **Крутится:** systemd `klassio-sber-tutor` (голос, :3002 — НЕ ТРОГАТЬ), `klassio-voice-proxy` (:3001, 11labs, фактически не нужен), `nginx`. Всё ест копейки.
- **Доступ из кода:** `scripts/ssh-run.mjs` (env `SSH_HOST/SSH_USER/SSH_PASS`, только exec). npm-пакет `ssh2` уже установлен (`node_modules/ssh2`, ставил `npm i ssh2 --no-save`). Для ЗАЛИВКИ ФАЙЛОВ ssh-run не годится (только команды) → **написать `scripts/sftp-put.mjs`** на ssh2 SFTP (`conn.sftp()`→`sftp.fastPut(local, remote)`), ~25 строк.

## NGINX на VPS — текущее состояние (важно!)

- Конфиг: `/etc/nginx/sites-available/voice-proxy` (симлинк в sites-enabled). Сервер `87.120.93.151.nip.io`, cert `/etc/letsencrypt/live/87.120.93.151.nip.io/`.
- **Я в этой сессии УЖЕ поменял `location /`** → реверс-прокси на `https://klassio-one.vercel.app` (Host+SNI rewrite). НО это упёрлось в **Vercel Security Checkpoint** (bot-challenge 403) — ИМЕННО ПОЭТОМУ делаем self-host, а не прокси. Сейчас `nip.io/` отдаёт щит Vercel = сломан.
- **Бэкап оригинала:** `/etc/nginx/sites-available/voice-proxy.bak.presite` (там было `location / → 127.0.0.1:3001`).
- `location /sber-tutor` → `127.0.0.1:3002` (голос) — **НЕ ТРОГАТЬ**.
- ⚠️ **ГРАБЛИ:** глобальный `/etc/nginx/nginx.conf:61` имеет кривой `proxy_busy_buffers_size` — он вылезает ТОЛЬКО если в location поставить `proxy_buffering on` или `proxy_buffer_size`. Для `location / → 3000` **НЕ ставить эти директивы** (наследуется server-level `proxy_buffering off` — ок), иначе `nginx -t` падает.

---

## ПЛАН МИГРАЦИИ (шаги)

1. **Спросить у Кратова:** актуальный SSH-пароль + решение по домену.
2. **Написать `scripts/sftp-put.mjs`** (ssh2 SFTP upload).
3. **Собрать исходники локально в tar** (из корня репо): исключить `node_modules`, `.next`, `.git`, `.vercel`, `.tmp`, `materials`, `test-results`. Размер ~несколько МБ.
   `tar czf /tmp/klassio-web.tgz --exclude=node_modules --exclude=.next --exclude=.git --exclude=.vercel --exclude=.tmp --exclude=materials --exclude=test-results .`
4. **Залить на VPS** через sftp-put → `/opt/klassio-web/klassio-web.tgz`; распаковать: `mkdir -p /opt/klassio-web && tar xzf ... -C /opt/klassio-web`.
5. **Env на VPS:** создать `/opt/klassio-web/.env.local` (Next читает .env.local автоматически). Скопировать значения из локального `.env.local`, НО с критичными правками:
   - 🔴 **`SBER_TUTOR_WSS_HOST=87.120.93.151.nip.io/sber-tutor`** — в локальном .env.local стоит `127.0.0.1:3002/sber-tutor` (dev-переключатель), на VPS ДОЛЖЕН быть ПУБЛИЧНЫЙ, иначе браузер родителя не подключит голос!
   - `VOICE_PROXY_HOST=87.120.93.151.nip.io`, `VOICE_PROXY_HMAC_SECRET=<как в .env.local>`.
   - `DATABASE_URL`, `DATABASE_URL_DIRECT` (Neon — как есть).
   - `AUTH_SECRET` (как в .env.local — им демо-сессия минтит JWT; должен совпасть).
   - `AUTH_URL=https://87.120.93.151.nip.io` (или домен) — явно, чтобы вход был стабилен (trustHost:true и так есть, но явно надёжнее).
   - `NODE_ENV=production` (для `__Secure-`/secure cookie).
   - `OPENAI_API_KEY` (нужен для `/api/draw`), `ELEVENLABS_API_KEY`, `ELEVENLABS_INVEST_AGENT_ID`, `AUTH_RESEND_KEY` (вход письмом не шлёт, но пусть будет).
   - `ELEVENLABS_TUTOR_AGENT_ID` — ⚠️ в Vercel его НЕТ (аудит), если 11labs как fallback нужен — взять id астроном-агента `agent_7701kr9c2v7eev3tabzv4f2b0e8b` (из памяти/STATE.md), иначе не критично (основной стек Sber).
   - SALUTESPEECH/GIGACHAT-ключи Next-приложению НЕ нужны (их использует ОРКЕСТРАТОР, у него свой env) — можно не класть.
6. **Сборка на VPS:** `cd /opt/klassio-web && npm ci && npm run build` (15 ГБ RAM — без проблем; ~2-5 мин). `next.config.ts` вне Vercel корректен (`outputFileTracingRoot` условен по `process.env.VERCEL`).
7. **systemd `klassio-web`:** unit `/etc/systemd/system/klassio-web.service` → `ExecStart=/usr/bin/npm run start` (или `npx next start -p 3000`), `WorkingDirectory=/opt/klassio-web`, `Environment=PORT=3000`, `Restart=always`, `User=root`. `systemctl daemon-reload && enable --now klassio-web`. Проверить `curl 127.0.0.1:3000` (ждём Next-редирект/страницу).
8. **nginx:** в `/etc/nginx/sites-available/voice-proxy` заменить `location /` (сейчас → Vercel) на:
   ```
   location / {
       proxy_pass http://127.0.0.1:3000;
       proxy_http_version 1.1;
       proxy_set_header Host $host;
       proxy_set_header X-Real-IP $remote_addr;
       proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
       proxy_set_header X-Forwarded-Proto $scheme;
       proxy_set_header Upgrade $http_upgrade;
       proxy_set_header Connection "";
   }
   ```
   (БЕЗ `proxy_buffering`/`proxy_buffer_size` — см. грабли выше). `/sber-tutor` не трогать. Затем `nginx -t && systemctl reload nginx`.
9. **Проверка без VPN** (с машины Кратова, curl или браузер): `https://87.120.93.151.nip.io/` → лендинг/login; вход любой почтой → `/cabinet`; открыть урок астроном → голос Ани отвечает. Проверить `/api/tutor/sber-url` не 500-ит (значит VOICE_PROXY_HOST/SBER_TUTOR_WSS_HOST верные).
10. **Домен (если Кратов даст `.ru`):** A-запись на `87.120.93.151` → `certbot --nginx -d домен` → добавить server_name/поменять AUTH_URL → reload. Можно после nip.io-прогона.

## ЧЕГО НЕ ЛОМАТЬ
- Оркестратор `klassio-sber-tutor` (:3002) и `location /sber-tutor` — живой голос.
- Vercel — оставить как бэкап (не удалять проект/деплой).
- `/etc/nginx/...voice-proxy.bak.presite` — не удалять (откат).

## СВЯЗАННЫЕ ХВОСТЫ (НЕ часть миграции, но в очереди — см. AVITO-LAUNCH-PLAN §1)
- Промпты на VPS не залиты: `scripts/tutor-agent-prompt-detskaya-karta.md` → `/opt/klassio-sber-tutor/tutor-prompt-detskaya-karta.md` + `systemctl restart klassio-sber-tutor` (промпт кэшируется — [[klassio-deploy-mechanism]]).
- 152-ФЗ: чекбокс согласия в `app/login/login-form.tsx` (в /register есть, в /login нет) + `/privacy` + РКН.
- Завершение урока: give_reward 13/13 (tutor-lesson-ru.tsx:336) + таймбокс resume (sessions.ts:46).

## GIT
Ветка `edu-platform-test`. Незапушенные коммиты: `3a75b0b` (демо-фиксы), `c887550` (уборка).
Пуш и деплой — только с ОК Кратова ([[never-push-without-permission]]).

---

## ✅ EXECUTED 2026-07-10 (self-host выполнен)

Миграция сделана и проверена автоматикой. Боевой адрес: **`https://87.120.93.151.nip.io/`** (домен = nip.io, вариант A; `.ru` можно навесить позже).

**Что развёрнуто на VPS `87.120.93.151`:**
- `/opt/klassio-web` — исходники (залиты tar'ом через новый `scripts/sftp-put.mjs`), `npm install` (717 пакетов, patch-package OK), `npm run build` (BUILD_ID есть).
- `/opt/klassio-web/.env.local` — боевой env. 🔴 БЕЗ `KLASSIO_DEV_USER_ID` (иначе байпас логина для всех на не-Vercel хосте); `SBER_TUTOR_WSS_HOST=87.120.93.151.nip.io/sber-tutor` (публичный); NODE_ENV задаёт systemd.
- systemd **`klassio-web`** (`/etc/systemd/system/klassio-web.service`) — `next start -H 127.0.0.1 -p 3000`, Restart=always, enabled. `Ready in ~830ms`.
- nginx `location / → 127.0.0.1:3000` (бэкап Vercel-версии: `voice-proxy.bak.prevps`). `/sber-tutor` не тронут.

**Проверено (автоматика):** `/`→200, `/login`→200 (отдаёт «Вход в кабинет», не Vercel-щит), `/cabinet`→307→/login (middleware + правильный публичный redirect-URL), `/`≠редирект-в-урок (байпас ВЫКЛ), `/sber-tutor/healthz`→200 (голос жив), Neon TCP :5432 достижим с VPS, все сервисы enabled+active. Публично из РФ-машины `/login`→200.

**Отклонения от плана:** `npm ci` не прошёл (лок рассинхронён с package.json) → сделал `npm install`. undici@8 хочет node≥22 (warning) — не проблема, undici грузится только при HTTPS_PROXY (на VPS нет). Грабли `sftp-put`: bare `/opt/...` аргумент Git Bash конвертит в виндовый путь → заливать через PowerShell.

**⏳ ОСТАЛОСЬ — живой браузер-тест с микрофоном (headless нельзя):**
1. Открыть `https://87.120.93.151.nip.io/login` (лучше без VPN — проверить РКН-доступность).
2. Войти любой почтой + имя ребёнка → должно кинуть в `/cabinet`.
3. Открыть урок «Астроном» (`/tutor/okr-mir-4/astronom`) → дать доступ к микрофону → **Аня должна заговорить** (wss к `/sber-tutor`). Если голос молчит — смотреть Network на `/api/tutor/sber-url` (должен вернуть `wss://…nip.io/sber-tutor?…`, не 500) и консоль на ошибку WS.
4. (Опц.) урок «Инвестиции» `/tutor/fin-gramotnost/investicii`.

**Если что-то сломалось — откат nginx на Vercel:** `cp /etc/nginx/sites-available/voice-proxy.bak.prevps /etc/nginx/sites-available/voice-proxy && nginx -t && systemctl reload nginx`.
