# Session handoff — Miro-режим урока + голос Sber на localhost · 2026-07-03

**Точка возобновления для свежей сессии (после /clear).** Ветка `edu-platform-test`.
Связанная память: `klassio-miro-lesson-spike.md` (читай её — там сжато всё + грабли),
`klassio-display-modes-control-law`, `klassio-ru-stack-test`. Контракт канваса:
`.planning/KLASSIO-LESSON-CANVAS-CONTRACT.md`.

**НИЧЕГО не закоммичено и НЕ задеплоено на VPS/Vercel.** Всё крутится на localhost.

---

## TL;DR

Построили **Miro-режим урока** «Мир глазами астронома» (весь урок = один tldraw-холст,
7 фреймов-досок змейкой, камера на рельсах) и **подключили к нему живой голос Sber**
(SaluteSpeech + GigaChat). Чтобы итерировать без деплоя, **подняли Sber-оркестратор
локально** — браузер (localhost:3000) ходит в него (localhost:3002) по ws://. Прошли
4 круга фидбека Кратова (чат слева, счётчик слайдов, перебивание, транскрипт, утечка
id досок, частота имени, переключение досок). Осталось: живой мик-тест + решение о
деплое на VPS.

## Как ЗАПУСТИТЬ всё локально (раннбук)

Два процесса. Проверь, живы ли (могли пережить /clear как OS-процессы, а могли и нет):

```bash
# 1) Локальный Sber-оркестратор на :3002 (Git Bash, из корня репо):
curl -s http://127.0.0.1:3002/healthz   # если ok — уже работает; иначе подними:
SECRET=$(grep '^VOICE_PROXY_HMAC_SECRET=' .env.local | cut -d= -f2- | tr -d '\r') \
  && SBER_TUTOR_HMAC_SECRET="$SECRET" TUTOR_PROMPT_PATH="scripts/tutor-agent-prompt.md" \
  ENV_PATH=".env.local" PORT=3002 node infra/h2nexus/sber-tutor/index.mjs
# (запускать в фоне; на Windows esbuild.exe для сборки канваса лежит в node_modules/tsx/…)

# 2) Next dev на :3000 — через preview_start конфиг "klassio-next-dev" (.claude/launch.json)
#    или npm run dev.
```

**Открывать:** просто `http://localhost:3000` → редиректит СРАЗУ в урок (вход/регистрации
нет, дев-байпас). Формы урока:
- Miro-доска: `localhost:3000/tutor/okr-mir-4/astronom?shell=miro`  ← дефолт с корня
- Сайт (anya.html): `localhost:3000/tutor/okr-mir-4/astronom`
- `?debug=1` на Miro-канвасе → режиссёрская панель для теста без голоса.

Проверка оркестратора без мика: `node scripts/probe-sber-tutor-ws.mjs --local`.

## Архитектура подключения (ключевое)

- **Оболочка Miro** = ещё один канвас-HTML в iframe боевого роута `/tutor/[subject]/[slug]`,
  выбирается `?shell=miro`. Контракт `window.__klassioEngine` НЕ меняется → весь бэкенд
  (голос, трекинг, гейты, транскрипт) работает как есть. Site и Miro отличаются только
  htmlFile канваса.
- **Голос:** браузер → POST /api/tutor/sber-url → ws/wss URL оркестратора → WebSocket.
  Оркестратор гоняет ход целиком (STT→GigaChat tool-loop→TTS по-предложениям), релеит
  tool_call'ы в браузер, браузер исполняет их через __klassioEngine + пейсинг-гейты.
- **Локальный стенд:** `.env.local` содержит `SBER_TUTOR_WSS_HOST=127.0.0.1:3002/sber-tutor`
  → браузер идёт в локальный оркестратор (ws://, схему даёт lib/tutor/sber-url.ts).
  **УБЕРИ эту строку → вернёшься на живой VPS** (87.120.93.151.nip.io).

## Что изменено в этой сессии (все файлы, НЕ закоммичено)

**Новый канвас Miro (боевой):**
- `lesson-canvases/miro-astronom/entry.jsx` — ИСХОДНИК канваса (React+tldraw). Правь тут.
- `public/tutor/miro/` — `index.html`, `bundle.js` (сборка), `tldraw.css`, `planets/*.png`.
  Пересборка после правок entry.jsx:
  `cmd //c "node_modules\tsx\node_modules\@esbuild\win32-x64\esbuild.exe lesson-canvases\miro-astronom\entry.jsx --bundle --outfile=public\tutor\miro\bundle.js --jsx=automatic --define:process.env.NODE_ENV=\"production\" --minify"`

**Врезка формы в роут:**
- `lib/curriculum/okr-mir-4.ts` — `ASTRONOM_MIRO_CANVAS` (htmlFile /tutor/miro/index.html).
- `lib/curriculum/index.ts` — реэкспорт.
- `app/tutor/[subject]/[slug]/page.tsx` — `resolveShellCanvas(?shell)` → miro-канвас.

**Голос — barge-in (перебивание):**
- `components/tutor/use-sber-conversation.ts` — клиентский barge-in (VAD живёт при
  playback, порог BARGE_THRESHOLD=0.045/BARGE_MIN_MS=280, глушит аудио + шлёт interrupt).
- `infra/h2nexus/sber-tutor/index.mjs` — обработка {type:'interrupt'} (session.interrupted
  рвёт TTS/tool-loop) + **spokenParts**: транскрипт = ВЕСЬ произнесённый за ход текст
  (фикс «сказала фразу, не написала»).

**Дев-стенд без деплоя:**
- `lib/tutor/sber-url.ts` — ws:// для localhost (иначе wss://).
- `.env.local` — добавлены `VOICE_PROXY_HOST`, `KLASSIO_DEV_USER_ID` (дев-байпас юзера =
  50de6dd8…, юзер Кратова), `SBER_TUTOR_WSS_HOST=127.0.0.1:3002/sber-tutor`.
- `app/page.tsx`, `app/login/page.tsx` — при KLASSIO_DEV_USER_ID редирект СРАЗУ в урок
  (вход/регистрации нет). Прод не тронут (там переменной нет).

**Правки по фидбеку:**
- Чат ВЛЕВО, счётчик «Слайд N/6», якорь чата к низу (новый пузырь не режется) — entry.jsx.
- Кнопка «Выйти» Miro-канваса → `/` (а не /cabinet под middleware→login) — entry.jsx.
- Раскладка etymology (слово «АСТРОНОМИЯ» не перекрыто стикером) — entry.jsx.
- id доски убран из ответов тулзов show_board/next_slide — `components/tutor/tutor-lesson-ru.tsx`.
- `BOARD_MIN_MS` 60000 → **25000** (гейт отклонял ранний next_slide → рассинхрон) —
  tutor-lesson-ru.tsx.
- Промпт `scripts/tutor-agent-prompt.md`: (а) «сначала доска, потом слова» + «в ТОМ ЖЕ
  ходе, не жди „давай“»; (б) «id досок вслух не произносить»; (в) «имя ОЧЕНЬ редко,
  по умолчанию без имени». **Локальный оркестратор читает промпт из репо** — на VPS
  промпт другой (`/opt/klassio-sber-tutor/tutor-prompt.md`), туда правки НЕ уехали.
- `.claude/launch.json` — конфиги превью klassio-miro-lesson (:8777), klassio-next-dev (:3000).

## Открытые хвосты / что дальше

1. **Живой мик-тест Кратова** — акустический barge-in (ложные срабатывания от эха?
   крутить BARGE_THRESHOLD, лучше в наушниках), стало ли реже имя, чётче ли переключение
   досок после снижения гейта.
2. **Решение о деплое на VPS** (только с OK Кратова, живой тест-сайт klassio-test-…
   .vercel.app): два готовых серверных изменения — interrupt-патч (index.mjs) + новый
   промпт (tutor-prompt.md). Деплой = scp обоих на VPS + `systemctl restart klassio-sber-tutor`.
   Пока НЕ едут — локально и так всё работает.
3. **Если доска всё ещё отстаёт** после снижения гейта — копать саму дисциплину вызова
   тулза (GigaChat нарративит без next_slide), не гейт.
4. **Частота имени** — soft-constraint промпта, GigaChat может игнорить. Если всё ещё
   часто — вариант: программно вырезать имя из первого слова реплики (не трогая TTS).
5. **Другие визуальные формы** (3D-класс, 2D-стол) — стоят отдельными спайками в
   `.tmp/spikes/` БЕЗ голоса. Врезать в /tutor (`?shell=roblox`/`?shell=desk`) по образцу
   Miro — если Кратов захочет тестить их с голосом.
6. **Потоковый транскрипт** (текст набирается по ходу речи, а не целиком в конце) —
   опционально, требует протокол + деплой оркестратора.

## Грабли (НЕ наступать снова)

- Sber-хук: hook-order Fast-Refresh warning при правке use-sber-conversation.ts с открытой
  страницей — лечится рестартом Next-сервера (не reload).
- tldraw: isReadonly глушит и ПРОГРАММНЫЕ createShape (замок = hand tool + keydown);
  createShape без parentId авто-парентится к фрейму и клипается (для page → parentId:page);
  hit-test планет на pointer_up; после setCameraOptions нужен setCamera(getCamera()).
- Локальный оркестратор: секрет он читает как `SBER_TUTOR_HMAC_SECRET` (в .env.local лежит
  как VOICE_PROXY_HMAC_SECRET — передаём инлайном при запуске). Промпт — из TUTOR_PROMPT_PATH.
- `probe-sber-tutor-ws.mjs` имеет СВОЙ мок гейта (60с) — не отражает клиентский BOARD_MIN_MS.
- preview_screenshot иногда таймаутит на tldraw-канвасе — мерить DOM-боксами через preview_eval.
