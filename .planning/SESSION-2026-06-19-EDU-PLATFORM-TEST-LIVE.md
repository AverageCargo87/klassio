---
session_date: 2026-06-19
topic: Единый тестовый сайт (кабинет + пикер + переключатель Сбер/11labs + персист) ЖИВ; VPS пересоздан и развёрнут заново
branch: edu-platform-test (запушена на origin)
read_first: this → memory klassio-edu-platform-epic + klassio-sber-tutor-port
status: LIVE и проверено (Кратов подтвердил: ссылка открывается, голоса работают на обоих стеках). Остался полный мик-тест + доработки ниже.
---

# Klassio — единый тестовый сайт LIVE (handoff 2026-06-19)

## TL;DR
Собран и задеплоен ОДИН тестовый сайт со всем: кабинет родителя (по предметам), меню выбора урока с переключателем **Сбер/11labs**, провайдеро-зависимый урок, запоминание (транскрипт+резюме+стек). Кратов подтвердил: открывается, **оба голоса работают** (Сбер и 11labs, голоса разные → проводка верна).

**Тестовый URL:** **https://klassio-test-kratov-s-team.vercel.app** (Vercel preview, за SSO — входить почтой).

## Что где (всё на ветке `edu-platform-test`, запушена)
- **Кабинет (субъект-центричный, бренд-токены Klassio):** `app/cabinet/cabinet.css` (Onest, тёплая палитра, скругл.30px — токены вытащены из Claude Design экспорта). Экраны: `app/cabinet/page.tsx` (предметы+чипы), `app/cabinet/[subject]/page.tsx` (отчёт по предмету), `app/cabinet/lessons/[sessionId]/page.tsx` (запись урока). Данные: `lib/tutor/cabinet.ts` (getCabinetHome / getSubjectReport).
- **Пикер:** `app/learn/[subject]/page.tsx` — выбор урока + сегмент Сбер/11labs через `?stack=`, запускает `/tutor/[subject]/[slug]?stack=`.
- **Провайдеро-зависимый урок:** `app/tutor/[subject]/[slug]/page.tsx` читает `?stack=` → рендерит TutorLesson(11labs) или TutorLessonRu(Сбер), пишет `voiceProvider`. Транскрипт (`use-transcript-logger`) вплетён в ОБА.
- **Curriculum:** `lib/curriculum/index.ts` — 3 предмета (matematika-5, okr-mir-4, fin-gramotnost). Играбелен только `okr-mir-4/astronom` (остальные coming-soon).
- **Дизайн-экспорты Claude Design:** `.tmp/sketches/cabinet/cabinet.html` + `picker.html` (référence, не в git). Бриф: `.planning/KLASSIO-CABINET-DESIGN-BRIEF.md`. Контракт уроков: `.planning/KLASSIO-LESSON-CANVAS-CONTRACT.md`.

## Инфраструктура (LIVE)
- **VPS НОВЫЙ: `87.120.93.151`** (Debian 11, h2.nexus RED-16 #297348, автопродление ВКЛ). Старый `.35` хостер удалил за неоплату. Наш ключ `~/.ssh/klassio_hetzner` добавлен (root). `/opt/klassio-voice-proxy` (:3001, 11labs) + `/opt/klassio-sber-tutor` (:3002, Сбер) + nginx + TLS `87.120.93.151.nip.io`. Healthz: `https://87.120.93.151.nip.io/healthz` и `/sber-tutor/healthz`. Оба active, GigaChat-Pro, токены ок.
- **Vercel `VOICE_PROXY_HOST` = `87.120.93.151.nip.io`** (Production env обновлён; тестовый деплой получает через `vercel deploy -e VOICE_PROXY_HOST=...` — проект НЕ подключён к git, branch-scoped preview-var не ставится, обёртка vercel зацикливается). Покрывает оба стека (Sber-url фолбэк на VOICE_PROXY_HOST+/sber-tutor).
- **Прод-Neon:** миграция применена (lesson_transcript, homework_assignment, tutor_session.summary+voice_provider). ⚠️ `db:push` на Neon ТИХО не применяет DDL (рвёт TCP, verify проверяет лишь старые таблицы) — применять напрямую через neon-http драйвер (по HTTP, не рвётся).

## Раннбук (важные грабли этой сессии)
- **scp на этот VPS:** дефолтный SFTP ВИСНЕТ → всегда `scp -O` (legacy протокол).
- **ssh из PowerShell:** с пайпом stdin виснет → флаг `-n`. Пароль-логин неинтерактивно: `SSH_ASKPASS`=cmd-скрипт с `echo <pass>` + `SSH_ASKPASS_REQUIRE=force` + `DISPLAY=:0`.
- **Передеплой фронта:** `vercel deploy -e VOICE_PROXY_HOST=87.120.93.151.nip.io --scope team_ailBxSPE1o4wI6sBhsV1VGI3 --yes` → затем `vercel alias set <new> klassio-test-kratov-s-team.vercel.app`.
- **Передеплой оркестратора:** scp `infra/h2nexus/sber-tutor/index.mjs` → `:/opt/klassio-sber-tutor/` → `ssh ... systemctl restart klassio-sber-tutor`.
- **Смоук голоса без микрофона:** `node scripts/probe-sber-tutor-ws.mjs` (хост в скрипте `.35` — заменить на `.151`).
- **Логи Сбера:** `ssh root@87.120.93.151 journalctl -u klassio-sber-tutor -f` (пишет [stt]/[turn] тайминги).

## ОСТАЛОСЬ / на потом
1. **Полный голосовой мик-тест** Кратова (чек-лист в финальном сообщении сессии): оба стека, распознавание детской речи, доски, запись урока в кабинете.
2. **Аня НЕ генерит домашку** — API+UI готовы, генерации нет. План: клиент собирает домашку из заваленных задач при завершении (без правки промпта).
3. **Урок «Мои первые инвестиции»** — ждёт HTML-канваса из Claude Design (контракт готов); fin-gramotnost пока coming-soon.
4. **Латентность Сбера** — ходы с инструментами ~5с (Pro, без стрим-STT). Рычаги: промпт-трим 18.5k→8k, VAD 700→500мс, gRPC STT. См. [[klassio-sber-tutor-port]].
5. `git stash` на ветке edu-platform-cabinet: `trimmed-prompt-wip-keep` (урезанный 11labs-промпт) — не потерян.
6. master/прод (klassio-one) НЕ трогали; прод-сайт 11labs-голос тоже зависит от этого VPS (VOICE_PROXY_HOST уже на .151, оживёт при следующем прод-деплое).
