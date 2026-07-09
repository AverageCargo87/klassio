# Хендофф 2026-07-08 — Демо-платформа Klassio ЖИВЁТ на проде, докручиваем голосовой урок

> Читать после [[klassio-vtb-karta-demo]] (RESUME наверху заметки). Здесь — раннбук,
> карта файлов и детали фиксов, чтобы новая сессия (после /clear) продолжила без раскопок.

## Что это и где живёт
**Демо для Владимира (чт 09.07):** полный путь родителя на образовательной платформе.
**Прод: https://klassio-one.vercel.app** — Vercel production, проект `klassio`, team `kratov-s-team`.
Деплой ТОЛЬКО вручную: `vercel deploy --prod --yes` (у проекта нет git-связи, push НЕ деплоит).
Ветка `edu-platform-test`. Коммитим локально свободно, деплой = отдельный шаг.

Путь: лендинг `/` → «Попробовать бесплатно» → `/register` (email+имя ребёнка+класс, БЕЗ письма)
→ `/cabinet` (тёмный, синий ВТБ-блок) → урок `/tutor/fin-gramotnost/detskaya-karta` (голос Sber)
→ запись `/cabinet/lessons/[id]` (тёмный таймлайн). Тема тёмная (v3 из Claude Design, класс `dk`).

## Регистрация без письма (осознанно)
Resend без верифицированного домена → письма чужим не доходят. Поэтому `app/register/actions.ts`
и `app/login/actions.ts` создают юзера и МИНТЯТ Auth.js-JWT напрямую (`lib/auth/demo-session.ts`,
salt=имя куки, secret=AUTH_SECRET, maxAge 365д). Вход = по знанию email. Для ≤10 доверенных ок.
Вернуть magic-link: верифицировать домен в Resend + вернуть старый /login (git history).

## Голосовой стек (Sber) — как устроено
- **Один оркестратор** на VPS (systemd `klassio-sber-tutor`, порт 3002): SaluteSpeech STT+TTS +
  GigaChat-Pro (tool-loop, стриминг по предложениям). Фолбэк на base GigaChat при HTTP 402.
- **Промпт выбирается ПО УРОКУ** (`getLessonPrompt(slug)` → `tutor-prompt-<slug>.md`, фолбэк на
  дефолт `tutor-prompt.md`). Кэш по slug → после правки файла ОБЯЗАТЕЛЕН рестарт.
- Браузер (`components/tutor/use-sber-conversation.ts`) ↔ WSS `wss://87.120.93.151.nip.io/sber-tutor`
  (HMAC-подпись в `/api/tutor/sber-url`, env VOICE_PROXY_HOST/VOICE_PROXY_HMAC_SECRET на Vercel).
- Урок-обвязка (доски/задания/трекинг/запись) — `components/tutor/tutor-lesson-ru.tsx` (Sber).

### Карта промптов (УЖЕ раздельные — правки одного не трогают другой)
| Урок | slug | Репо-источник | Файл на VPS |
|---|---|---|---|
| Карта | detskaya-karta | `scripts/tutor-agent-prompt-detskaya-karta.md` | `tutor-prompt-detskaya-karta.md` |
| Астроном | astronom | `scripts/tutor-agent-prompt.md` | `tutor-prompt.md` (=дефолт/фолбэк) |
| Инвестиции | investicii | `scripts/tutor-agent-prompt-invest.md` | `tutor-prompt-investicii.md` |

Кратову ПРЕДЛОЖЕНО (ждёт «давай»): дать астроному явный `tutor-prompt-astronom.md`, чтобы у
каждого урока был файл строго по имени. Сейчас астроном = «дефолтный» — функционально отдельный,
но имя неявное. Сделать: `cp` на VPS + `git mv scripts/tutor-agent-prompt.md → ...-astronom.md` + рестарт.

## РАБОЧИЙ ЦИКЛ отладки голоса (повторять)
1. **Логи сессии:**
   `ssh -i ~/.ssh/klassio_hetzner root@87.120.93.151 "journalctl -u klassio-sber-tutor --no-pager --since '20 min ago' --output=cat | grep -iE 'open sid|stt|turn' | tail -40"`
   - `[stt] sid=… «текст»` — что STT услышал (пустое `«»` = тишина/шум).
   - `[turn] llm=Xms/Nx · 1е-предл=Yms · 1й-звук=Zms` — N шагов LLM; `1е-предл=—` = МОЛЧАЛА (баг).
   - Имена инструментов (next_slide/show_trainer) НЕ логируются — сверяй с визуалом на скрине.
   - SSH иногда «Connection reset» — просто повтори через пару секунд.
2. **Правка:** промпт `scripts/tutor-agent-prompt-detskaya-karta.md` (ведение Ани) / канвас
   `public/tutor/vtb-karta.html` (визуал, `__klassioEngine`, `#hint`/`updateHint`, `HL_RULES`) /
   оркестратор (repo `infra/h2nexus/sber-tutor/index.mjs`, живой = VPS `/opt/.../index.mjs`).
3. **Деплой синхронно:**
   - Канвас/React/curriculum → `npm run build` (проверить) → `git commit` → `vercel deploy --prod --yes`.
   - Промпт → `scp scripts/tutor-agent-prompt-detskaya-karta.md root@87.120.93.151:/opt/klassio-sber-tutor/tutor-prompt-detskaya-karta.md`.
   - Оркестратор → `node --check` → бэкап на VPS → scp → рестарт.
   - Рестарт: `ssh … "systemctl restart klassio-sber-tutor && sleep 3 && systemctl is-active … && curl -s http://127.0.0.1:3002/healthz"`.
4. **Локальный прогон** (если надо): в `.env.local` временно закомменть `KLASSIO_DEV_USER_ID` и
   `SBER_TUTOR_WSS_HOST` (`(gc .env.local -raw) -replace '(?m)^KLASSIO_DEV_USER_ID=','#E2E_RESTORE#KLASSIO_DEV_USER_ID='…`),
   после — верни (`-replace '#E2E_RESTORE#',''`). Иначе `/` уходит в дев-урок, а голос идёт на локальный Sber.
   Скриншот превью виснет на Google Fonts (артефакт песочницы) — проверяй через `preview_eval`/`preview_inspect`.

## ФИКСЫ 08.07 (все живые)
Хронология мик-тестов Кратова и что чинили (детали — в блоках заметки [[klassio-vtb-karta-demo]]):
1. **Немой первый ход** (STT услышал имя, GigaChat ответил одними инструментами, `1е-предл=—`):
   оркестратор — наказ-ретрай `if(firstSentenceAt===null){push('[СИСТЕМА] ты промолчала, ответь вслух')…}`
   (repo `infra/…/index.mjs` ~стр.383 + живой VPS); промпт — «⚠️ каждый ход с голосом, даже при set_child_name».
2. **Зависание «думает»** (сокет РФ↔Франкфурт полу-мёртв): клиент `use-sber-conversation.ts` — сторож
   `THINK_TIMEOUT_MS=22с` в `emitMode` (ставится на thinking, снимается на speaking/listening; нет ответа
   22с → cleanup + onError «нажми Начать урок»).
3. **Пропуск доски `what`** (Аня рассказывала про карту, экран на обложке, прыжок на тест): обложка
   предпоказана со старта, а первый next_slide повторно её «показывал». Фикс: `LessonCanvas.coverPreShown?:boolean`
   (`lib/curriculum/okr-mir-4.ts` тип + `index.ts` detskaya-karta=true) → в `tutor-lesson-ru.tsx` `boardIndexRef`
   стартует с 1, cover сразу в shownBoardsRef → первый next_slide=`what` (теперь theory-board, 25с-гейт работает).
   Промпт: «обложка уже на экране, первый next_slide=what; каждую доску сначала ПОКАЖИ, потом рассказывай».
   ⚠️ 11labs `tutor-lesson.tsx` НЕ трогали (уроков с coverPreShown на 11labs нет).
4. **Повторы + «молодец×5» + пейсинг:** промпт — раздел «НЕ ПОВТОРЯЙСЯ, НЕ ХВАЛИ ЗАРЯ, НЕ СПЕШИ»
   (не повторять фразы; хвалить редко/разными словами; менять доску ТОЛЬКО когда разобрали+посмотрели;
   показать все 6 досок; на тишину — один заход). В логах было много пустых STT `«»` = переспрашивала.
5. **Вопрос Ани у микрофона:** канвас `vtb-karta.html` — `lastAsk` (последний «…?» из pushBubble('tutor'),
   регекс `[^.!?]*\?`), в `updateHint` при listening без задания показывается вместо «Твоя очередь — говори»;
   сброс в renderBoard/renderTask. Проверено через движок в браузере.

## Запись урока (данные настоящие)
- Единый упорядоченный поток «реплики+события» (миграция 0006: `kind`/`meta` в `lesson_transcript`).
  Захват в `tutor-lesson-ru.tsx` (доски/ошибки/solve/reward/name) → лента `app/cabinet/lessons/[sessionId]/timeline.tsx`
  (тёмная rec-*, фильтры, чипы событий). Навыки — `getSessionSkills`/`getSessionCorrectCount` (lib/tutor/cabinet.ts).
- Сид-запись «Инвестиции» для демо: `npx tsx scripts/seed-demo-record.ts` (юзер Кратова, фикс id `…0d01`,
  13 attempt + лента). БД Neon рвёт TCP между запросами → паттерн withClient (свежий Client на операцию).

## Открытые вопросы / решить с Кратовым
- Подтвердить след. мик-тестом: пейсинг, отсутствие повторов, вопрос у мика, прохождение всех досок.
- Явное имя астроном-промпта (ждёт «давай»).
- repo≠VPS `index.mjs` (VPS 31КБ старее repo 33КБ, оба с фиксом наказ-ретрая) — свести при след. большом деплое.
- Латентность РФ: функции Vercel в iad1 (США). Опц. `fra1` (Франкфурт) — но учесть регион Neon.
- SaluteSpeech: продажи физлицам с 15.07 закрываются; для продакшена — ИП/юрлицо. Для теста Freemium хватит.
- На карте надпись «ВТБ» (раньше решение «банк не называем») — Кратов в курсе, оставили.
