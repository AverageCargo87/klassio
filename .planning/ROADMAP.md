# Klassio v1 Roadmap

> Источники:
> - `PROJECT.md` — core value, locked decisions, anti-scope, invariants.
> - `REQUIREMENTS.md` — 21 v1 requirements с ID и acceptance criteria.
> - `COSTS.md` — unit-экономика, fixed/variable rollout по фазам, tracking фактов.
> - `.planning/intel/SYNTHESIS.md` — synthesis обзор от ingest pipeline.
>
> v1 success metric — один полный 45-минутный урок проходит end-to-end без вмешательства разработчика (ребёнок открывает ссылку → ЛК → урок → запись в ЛК).
>
> Granularity: **fine** (8–12 фаз). Текущий план: **12 фаз**.
> Дата: 2026-05-09.

---

## Cost rollout по фазам (краткая шкала; полные оценки и tracking — в [COSTS.md](COSTS.md))

| Phase | Δ Fixed/мес | Δ Variable/lesson | Кумулятив fixed/мес | Кумулятив variable/lesson |
|---|---|---|---|---|
| 1 | +1 850 ₽ (Vercel Pro + домен + Supabase Free) | 0 | 1 850 ₽ | 0 ₽ |
| 2 | 0 | 0 | 1 850 ₽ | 0 ₽ |
| 3 | 0 | 0 | 1 850 ₽ | 0 ₽ |
| 4 | +800 ₽ (Hetzner) | +3 ₽ (gpt-4o-mini) | 2 650 ₽ | 3 ₽ |
| 5 | 0 | +2 ₽ (сцены, чуть больше токенов) | 2 650 ₽ | 5 ₽ |
| 6 | **+8 900 ₽ (11labs Pro)** ⚠️ | **+135 ₽ (TTS)** | 11 550 ₽ | 140 ₽ |
| 7 | 0 | 0 | 11 550 ₽ | 140 ₽ |
| 8 | 0 | +40–80 ₽ (gpt-4o Pedagogical) | 11 550 ₽ | 180–220 ₽ |
| 9 | 0 (one-time дизайн ~5–15k ₽) | 0 | 11 550 ₽ | 180–220 ₽ |
| 10 | +450 ₽ (R2) | +25 ₽ (Whisper если нужен) | 12 000 ₽ | 205–245 ₽ |
| 11 | 0 | 0 | 12 000 ₽ | 205–245 ₽ |
| 12 | 0 | 0 | **12 000 ₽** | **205–245 ₽** |

**Цели VISION:** fixed < 15 000 ₽/мес, variable < 200 ₽/lesson. Phase 6 — главный watermark; Phase 8 опасно близко к верхней границе variable. Перед Phase 6 верифицировать тариф 11labs (Pro vs Business).

---

## Phases

- [ ] **Phase 1: ЛК — оболочка, авторизация по ссылке, список уроков** — Ребёнок попадает в свой ЛК по личной ссылке и видит список своих уроков.
- [ ] **Phase 2: Расписание уроков + admin путь для заведения** — Ребёнок видит расписание; разработчик может вручную завести тестового ребёнка и тестовый урок.
- [ ] **Phase 3: Lesson page shell — три-панельный layout + event bus** — Существует страница урока с пустыми панелями (доска / голос / тренажёр) и общая event-шина между ними.
- [ ] **Phase 4: Production deploy + порт прототипа доски в Klassio** — Доска tldraw + OpenAI работает в Klassio в проде на Vercel + Cloudflare; РФ-юзер открывает без VPN.
- [ ] **Phase 5: Сцены — методические `explain_*` tools** — Бот объясняет темы 5 класса через 12–15 высокоуровневых сцен, не только примитивы.
- [ ] **Phase 6: Голос — 11labs Conversational AI через Hetzner WS-прокси** — Голосовой учитель говорит по-русски в браузере ребёнка без VPN.
- [ ] **Phase 7: HTML-тренажёр — контракт data-атрибутов + event bus** — Ребёнок решает задания, бот видит ввод и подсвечивает элементы.
- [ ] **Phase 8: Двухуровневая LLM (Pedagogical + Realtime) + проактивные триггеры** — Slow planner следит за стратегией урока, fast actor исполняет; бот сам подключается на молчании/уходе.
- [ ] **Phase 9: 2D Lottie аватар учителя** — На странице урока виден живой аватар, переключающий состояния по событиям голосового агента.
- [ ] **Phase 10: Запись урока + транскрипт + контент-модерация + 152-ФЗ** — Каждый урок записан и доступен в ЛК; контент модерируется; согласие собрано.
- [ ] **Phase 11: Stroke-drawing анимация + SSML-синхронизация (голос+рука+текст)** — Линии вытягиваются, текст бота произносится точно в момент появления соответствующего шейпа на доске и подсветки в тренажёре.
- [ ] **Phase 12: End-to-end QA + first complete 45-минутный урок dry-run** — v1 success metric выполнен: тестовый ребёнок проходит полный урок без вмешательства разработчика.

---

## Phase Details

### Phase 1: ЛК — оболочка, авторизация по ссылке, список уроков
**Goal**: Ребёнок попадает в свой личный кабинет по уникальной ссылке и видит список своих запланированных уроков.
**Depends on**: Nothing (first phase).
**Requirements**: ACC-01, ACC-02, INV-01.
**Success Criteria** (что должно быть TRUE):
  1. Ребёнок переходит по личной ссылке (token-based) → попадает в ЛК без какой-либо публичной формы регистрации.
  2. Сессия сохраняется (cookie/localStorage) — при повторном открытии того же URL ребёнок снова в своём ЛК без переавторизации.
  3. В ЛК виден список запланированных уроков с датой/временем/темой; ближайший урок сверху; пустая state — если уроков нет.
  4. Истёкший/невалидный токен → понятная страница «ссылка недействительна».
  5. От ребёнка не требуется ничего, кроме перехода по ссылке (zero-install, INV-01 закладывается здесь как фундамент).
**Plans**: 6 plans
Plans:
- [ ] 01-01-PLAN.md — Project scaffold (Next.js 15 + pinned deps), test infra (vitest + Playwright), env scaffolding with zod
- [ ] 01-02-PLAN.md — [HUMAN] Provision Supabase + Resend + Vercel; resolve A1 (silent-drop UX) + Vercel plan decision
- [ ] 01-03-PLAN.md — Drizzle schema (6 tables) + [BLOCKING] schema push + idempotent seed
- [ ] 01-04-PLAN.md — NextAuth v5 split config + Resend provider + whitelist callback + middleware
- [ ] 01-05-PLAN.md — UI pages (/, /login, /lessons, /no-access, /lesson/[id] placeholder) + shadcn + Tailwind v4
- [ ] 01-06-PLAN.md — E2E suite (Playwright) + production deploy + RU email deliverability check
**UI hint**: yes

---

### Phase 2: Расписание уроков + admin путь для заведения
**Goal**: Ребёнок видит расписание на ближайшие недели; разработчик может вручную завести тестового ребёнка и тестовый урок (без AI-сбора программы).
**Depends on**: Phase 1.
**Requirements**: ACC-03, ACC-04.
**Success Criteria**:
  1. В ЛК ребёнка есть экран «Расписание» — минимум список запланированных уроков на 4 недели вперёд (можно простой календарь, но не обязательно).
  2. Разработчик может через admin endpoint / CLI / SQL создать нового тестового ребёнка с уникальной ссылкой и привязать к нему тестовый урок (дата, время, тема, ссылка на HTML-тренажёр).
  3. Существует README/admin guide, описывающий, как зарезервировать тестового ребёнка и тестовый урок для проверки v1 success metric.
  4. Прошедшие уроки видны в отдельной секции/вкладке (готовится крючок для записей из Phase 10).
**Plans**: TBD
**UI hint**: yes

---

### Phase 3: Lesson page shell — три-панельный layout + event bus
**Goal**: Существует страница урока с тремя панелями (доска / голос+аватар / HTML-тренажёр) и in-memory event-шиной между ними. Панели пока пустые/заглушки — это shell.
**Depends on**: Phase 2.
**Requirements**: LES-01.
**Success Criteria**:
  1. По клику «Начать урок» из ЛК ребёнок переходит на страницу `/lesson/[id]` с тремя видимыми панелями (доска, голос+аватар, HTML-тренажёр) — пока в виде placeholders.
  2. Layout адаптивен под десктоп и планшет (телефон не приоритет MVP).
  3. Существует общая event-шина (React context / pub-sub синглтон) с типизированными событиями. Каждая панель может публиковать и слушать события.
  4. Тестовое событие (например, кнопка «Тест ивента» в одной панели) триггерит видимое изменение в другой панели — доказательство, что шина работает.
  5. После урока кнопка «Завершить урок» возвращает ребёнка в ЛК.
**Plans**: TBD
**UI hint**: yes

---

### Phase 4: Production deploy + порт прототипа доски в Klassio
**Goal**: Существующий рабочий прототип доски (`tldraw-test/`) портирован в Klassio, интегрирован в lesson page как «панель доски», и всё это задеплоено на Vercel + Cloudflare. Ребёнок из РФ открывает Klassio без VPN, и доска рисует объяснения.
**Depends on**: Phase 3.
**Requirements**: BRD-01, DEP-01, PED-01.
**Success Criteria**:
  1. tldraw-канвас с executor'ом, `/api/draw` endpoint и agent-loop работают внутри Klassio (а не только в `tldraw-test/`).
  2. Сайт задеплоен на Vercel; Cloudflare стоит перед ним как CDN; настроен домен и HTTPS.
  3. РФ-юзер открывает Klassio без VPN → загружается фронт → попадает в ЛК → начинает тестовый урок → доска принимает текстовый промпт «объясни 245+874 в столбик» и анимированно рисует разбор.
  4. Каждый разбор генерится ботом с нуля под конкретные числа (не предзаписан) — PED-01 подтверждено: разные промпты дают разные разборы.
  5. Все critical constraints соблюдены: `outputFileTracingRoot` в `next.config.ts`, `serverExternalPackages: ['undici']`, `tool_choice: 'required'`, fallback `JSON.parse(arguments)`, tldraw v3 quirks (richText vs text), instrumentation.ts — корректно no-op'ит в проде.
  6. Env vars в Vercel: только `OPENAI_API_KEY` (никаких HTTPS_PROXY).
**Plans**: TBD
**UI hint**: yes

---

### Phase 5: Сцены — методические `explain_*` tools
**Goal**: Бот объясняет основные темы программы 5 класса не серией примитивов, а вызовом высокоуровневых методических сцен (`explain_column_addition(a,b)` и т.д.). Примитивы остаются как fallback.
**Depends on**: Phase 4.
**Requirements**: BRD-02.
**Success Criteria**:
  1. В `lib/tools.ts` появились 12–15 новых сцен на ключевые темы программы 5 класса (точный список — из методического разбора программы, минимум: сложение/вычитание в столбик, умножение в столбик, деление в столбик, простые дроби: сложение/вычитание/сравнение/преобразование, проценты, площадь/периметр).
  2. Каждая сцена реализована как методический шаблон, разворачивающийся в серию tool calls с правильным timing'ом (а не одноразовый текст).
  3. На QA-промптах из программы 5 класса бот предпочитает сцены над примитивами (system prompt поощряет использование сцен).
  4. Стоимость одного разбора через сцену остаётся в watermark (`CON-board-cost` ~22 копейки на gpt-4o-mini, рост допустим, но не порядка).
  5. Текущие 9 примитивов сохранены и работают как fallback для тем, на которые сцены ещё не написаны.
**Plans**: TBD

---

### Phase 6: Голос — 11labs Conversational AI через Hetzner WS-прокси
**Goal**: Голосовой учитель говорит по-русски в браузере ребёнка из РФ без VPN. WebSocket к 11labs идёт через Hetzner Frankfurt; ключи 11labs только на сервере.
**Depends on**: Phase 4.
**Requirements**: VOI-01.
**Success Criteria**:
  1. В панели «голос+аватар» страницы урока работает 11labs Conversational AI (Путь A — готовый продукт).
  2. Backend-прокси на Hetzner Frankfurt держит WebSocket к 11labs; фронт (Vercel) общается с прокси, прокси с 11labs.
  3. РФ-юзер с туннель-VPN ВЫКЛ открывает Klassio → запускает тестовый урок → жмёт «разрешить микрофон» → говорит в микрофон → бот отвечает голосом по-русски.
  4. API-ключи 11labs — только в env Hetzner-сервера, никогда в браузере (DevTools проверка).
  5. Голос бота — один из русских голосов 11labs (Multilingual v2 или Flash v2.5); тестовая выборка реплик прослушана и одобрена для возрастной категории 9–11 лет.
  6. Custom LLM endpoint 11labs указывает на наш Realtime-LLM endpoint (заглушка в этой фазе — gpt-4o-mini напрямую; полноценная двухуровневая LLM появится в Phase 8).
**Plans**: TBD

---

### Phase 7: HTML-тренажёр — контракт data-атрибутов + event bus
**Goal**: На странице урока в третьей панели появляется HTML-тренажёр с заданиями. Ребёнок решает задания, бот видит ввод (через event bus) и может подсвечивать элементы тренажёра.
**Depends on**: Phase 3 (event bus), Phase 6 (бот должен уметь говорить, чтобы реагировать на ввод).
**Requirements**: HTM-01.
**Success Criteria**:
  1. HTML-тренажёр загружается per-lesson из заранее сгенерированного шаблона (в v1 — статический HTML или JSON конфиг для тестового урока, без AI-генерации).
  2. Тренажёр следует контракту data-атрибутов: `data-block`, `data-task-id`, `data-task-type`, `data-correct`, `data-hint-level` — корректно валидируется.
  3. Тренажёр эмиттит на event bus события: `answer_submitted` (с task-id и значением), `hint_opened`, `task_focused`, `idle_15s`.
  4. Тренажёр принимает команды от бота: `highlight(element_id)`, `show_hint(task_id, level)`, `goto_task(task_id)` — каждая команда видимо меняет состояние UI.
  5. Поддерживаются 3 типа заданий: `numeric-input` (ввод числа), `single-choice` (выбор варианта), `matching` (сопоставление).
  6. Ручная QA: тестовый ребёнок вводит ответ → событие появляется в event bus → бот реагирует репликой через 11labs (даже простой заглушкой «вижу твой ответ» — полноценная реакция в Phase 8).
**Plans**: TBD
**UI hint**: yes

---

### Phase 8: Двухуровневая LLM (Pedagogical + Realtime) + проактивные триггеры
**Goal**: Реализована двухуровневая архитектура LLM. Pedagogical (медленный стратег, GPT-4o) следит за прогрессом урока и решает «что делать дальше»; Realtime (быстрый actor, gpt-4o-mini) исполняет в реальном времени. Бот сам подключается на молчание/уход.
**Depends on**: Phase 6 (голос), Phase 7 (тренажёр и event bus с ответами ребёнка).
**Requirements**: LLM-01, PED-02.
**Success Criteria**:
  1. Pedagogical LLM получает на вход состояние урока (текущая задача, последние ответы ребёнка, таймстампы триггеров) и эмиттит «pedagogical decisions» (например, «следующий шаг — задача 3, через сцену explain_X», «вмешаться сейчас, ребёнок молчит 25 секунд»).
  2. Realtime LLM (включая 11labs Custom LLM endpoint) читает pedagogical decisions и исполняет их голосом + tool calls на доску + командами в тренажёр.
  3. Триггеры PED-02 (молчание > 20 сек, `visibilitychange`, неправильные ответы подряд, быстрые потыкивания, кнопка «помощь») эмиттят события на шину; Pedagogical LLM их видит и решает реагировать.
  4. Ручная QA: тестовый ребёнок молчит 25 секунд → бот сам подключается с репликой; ребёнок уходит во вкладку → бот замечает; неправильные ответы 2 раза подряд → бот предлагает помощь.
  5. **НЕ Anthropic** для Pedagogical, если не принято отдельное decision (см. CON-anthropic-rf-block). По умолчанию обе модели — OpenAI.
  6. Стоимость одного 45-минутного урока (Pedagogical + Realtime + 11labs) измерена и зафиксирована как watermark для unit-экономики.
**Plans**: TBD

---

### Phase 9: 2D Lottie аватар учителя
**Goal**: На странице урока виден 2D-аватар учителя (Lottie), переключающий состояния по событиям голосового агента.
**Depends on**: Phase 6 (голос — источник событий для аватара), Phase 8 (Pedagogical LLM может явно эмитить «состояние эмоции» для аватара).
**Requirements**: VOI-02.
**Success Criteria**:
  1. В панели «голос+аватар» рендерится 2D Lottie аватар (НЕ 3D, НЕ видео-аватар D-ID).
  2. Минимум 5 состояний персонажа: нейтрально, говорит, думает, радуется, огорчился — каждое отрисовывается визуально различимо.
  3. Аватар слушает event bus (либо напрямую события голосового агента «начал говорить / закончил говорить», либо команды от Pedagogical LLM «теперь радуйся / теперь думай») и переключает состояния плавно.
  4. Аватар видим на странице урока и не блокирует видимость доски и тренажёра (layout проверен на десктопе и планшете).
  5. Аватар не вносит ощутимой нагрузки на CPU/GPU браузера (Lottie оптимизирован, fps стабильный).
**Plans**: TBD
**UI hint**: yes

---

### Phase 10: Запись урока + транскрипт + контент-модерация + 152-ФЗ
**Goal**: Каждый проведённый урок сохраняется (видеозапись + транскрипт), доступен в ЛК ребёнка для повторного просмотра. Все ответы LLM модерируются. Согласие 152-ФЗ собрано.
**Depends on**: Phase 1 (ЛК), Phase 6 (голос — источник аудио для транскрипта), Phase 4 (доска — источник видео для записи).
**Requirements**: REC-01, REC-02.
**Success Criteria**:
  1. Каждый урок при старте начинает запись composite-экрана (доска + аватар + тренажёр + голосовая стенограмма) и сохраняет его на безопасное хранилище (S3-совместимое, вне РФ — точное место выбирается в плане фазы).
  2. Транскрипт реплик (бот + ребёнок) с timestamp сохраняется параллельно (через 11labs либо собственный STT).
  3. В ЛК ребёнка в секции «Прошедшие уроки» каждая запись кликабельна: открывает плеер записи + транскрипт; можно перейти на любой timestamp в записи через клик в транскрипте.
  4. Все ответы Pedagogical и Realtime LLM пропускаются через content-модератор (OpenAI Moderation API или собственный фильтр); заблокированный контент НЕ показывается ребёнку, заменяется нейтральной репликой.
  5. Триггер тревоги (классификатор детского контента про насилие/самоповреждение/проблемы дома) эмиттит событие в БД и алёрт в админ-канал. Полноценный отчёт родителю в Telegram — отложен в v2.
  6. Возрастная адаптация лексики через системный промпт + пост-фильтр — заметно по выборке тестовых реплик.
  7. Согласие 152-ФЗ собрано до первой записи — либо при первом входе в ЛК (чек-бокс «согласие родителя»), либо предварительно через ACC-04 (admin прописывает факт согласия). Конкретный путь выбирается в плане фазы.
**Plans**: TBD
**UI hint**: yes

---

### Phase 11: Stroke-drawing анимация + SSML-синхронизация (голос + рука + текст)
**Goal**: Реализован инвариант продукта — голос + рука + текст работают синхронно. Линии на доске «вытягиваются» (stroke-drawing); текст бота произносится точно в момент появления соответствующего шейпа; элемент в HTML-тренажёре подсвечивается одновременно.
**Depends on**: Phase 4 (доска), Phase 6 (голос/SSML), Phase 7 (тренажёр), Phase 9 (аватар можно тоже синхронизировать с речью).
**Requirements**: BRD-03, LES-02, INV-02.
**Success Criteria**:
  1. Stroke-drawing для линий и стрелок: SVG `stroke-dashoffset` анимация в overlay-слое поверх tldraw; после анимации шейп переезжает в постоянный canvas. Текст и сложные шейпы остаются с fade-in.
  2. SSML-маркеры в TTS реплик 11labs: `<mark name="show_X"/>` — в момент произнесения слова на доске появляется (или анимируется) соответствующий шейп. 11labs шлёт события маркеров на клиент, клиент триггерит анимацию.
  3. Подсветка в HTML-тренажёре синхронизирована с репликой голоса — например, бот говорит «теперь решим вторую задачу» → одновременно тренажёр подсвечивает блок задачи 2.
  4. Естественные паузы между шагами через `wait` tool (уже есть в прототипе доски) — сохранены и работают в production layout.
  5. Ручной QA-проход: разбор сложения в столбик. Видео-запись урока (REC-01) воспроизводится → видно, что голос, рисование на доске и подсветка в тренажёре идут синхронно, а не последовательно. INV-02 подтверждён.
  6. **Hand-drawn стиль через rough.js — НЕ в этой фазе.** Отложен в v2.
**Plans**: TBD
**UI hint**: yes

---

### Phase 12: End-to-end QA + first complete 45-минутный урок dry-run
**Goal**: v1 success metric выполнен — один полный 45-минутный урок проходит end-to-end без вмешательства разработчика.
**Depends on**: Phases 1–11.
**Requirements**: (no new requirements — финальная QA-фаза, валидирующая все предыдущие).
**Success Criteria**:
  1. Подготовлен реальный (не игрушечный) урок на 45–60 минут на тему программы 5 класса с участием минимум 3 сцен из BRD-02 и минимум 5 заданий в HTML-тренажёре. Урок и ребёнок-аккаунт заведены через ACC-04 admin путь.
  2. Тестовый ребёнок (можно сам разработчик играющий за ребёнка, либо реальный 5-классник в максимально честных условиях) открывает личную ссылку из РФ без VPN → попадает в ЛК → видит урок в расписании → жмёт «Начать урок».
  3. Урок проходит от начала до конца:
     - голос бота ведёт ребёнка по программе (русский, возрастно-адаптированный);
     - бот рисует объяснения на доске live, под конкретные ошибки/ответы ребёнка;
     - ребёнок взаимодействует с тренажёром (вводит ответы, открывает подсказки);
     - голос + рука + текст синхронны;
     - проактивные триггеры срабатывают в естественных ситуациях (молчание, неправильные ответы);
     - аватар реагирует эмоциями;
     - всё это записывается.
  4. После завершения урока ребёнок возвращён в ЛК; в секции «Прошедшие уроки» виден свежий урок; запись и транскрипт доступны для повторного просмотра.
  5. Никакого вмешательства разработчика в течение урока: нет ручных перезапусков, hardcoded fallback ответов, ручных «толкни бота на следующий шаг».
  6. Стоимость урока зафиксирована (Pedagogical + Realtime + 11labs + storage) и проверена против watermark unit-экономики из Phase 8.
  7. Ретроспектива: список найденных багов и UX-шероховатостей записан в backlog для v1.1 / v2.
**Plans**: TBD

---

## Coverage validation

| Requirement | Phase | Notes |
|---|---|---|
| ACC-01 (auth via personal link) | Phase 1 | foundation |
| ACC-02 (lesson list) | Phase 1 | with auth |
| ACC-03 (schedule) | Phase 2 | builds on lesson list |
| ACC-04 (admin path) | Phase 2 | unblocks testing for all subsequent phases |
| LES-01 (3-pillar layout + event bus) | Phase 3 | shell before content |
| LES-02 (voice+hand+text sync at runtime) | Phase 11 | implementable only after all 3 channels exist |
| BRD-01 (board prototype) | Phase 4 | port to Klassio + production deploy together |
| BRD-02 (scenes) | Phase 5 | requires working board first |
| BRD-03 (stroke-drawing animation) | Phase 11 | grouped with sync |
| VOI-01 (11labs voice) | Phase 6 | requires production deploy from Phase 4 |
| VOI-02 (Lottie avatar) | Phase 9 | requires voice events to drive states |
| HTM-01 (HTML trainer) | Phase 7 | requires event bus (Ph3) and voice (Ph6) |
| LLM-01 (two-tier LLM) | Phase 8 | requires voice + trainer to have inputs to plan over |
| PED-01 (live explanations) | Phase 4 | already true once board works |
| PED-02 (proactive bot) | Phase 8 | grouped with two-tier LLM (Pedagogical owns triggers) |
| REC-01 (recording + transcript + ЛК playback) | Phase 10 | needs all media channels live |
| REC-02 (content moderation + safety) | Phase 10 | grouped with recording |
| DEP-01 (Vercel + Hetzner + Cloudflare) | Phase 4 | first phase that ships to prod |
| INV-01 (zero-install) | Phase 1 | foundational guardrail |
| INV-02 (sync invariant) | Phase 11 | observable only after all 3 channels live |

**Total**: 21 / 21 v1 requirements mapped → 1 phase each. **No orphans, no duplicates.**

Cross-cutting invariants (INV-01, INV-02) attached to the phase where their first observable behavior must hold; они также применяются как guardrails во всех последующих фазах при ревью кода и архитектурных решений.

---

## Progress

| Phase | Plans Complete | Status | Completed |
|---|---|---|---|
| 1. ЛК — оболочка, авторизация по ссылке, список уроков | 0/6 | Plans created | - |
| 2. Расписание уроков + admin путь для заведения | 0/0 | Not started | - |
| 3. Lesson page shell — три-панельный layout + event bus | 0/0 | Not started | - |
| 4. Production deploy + порт прототипа доски в Klassio | 0/0 | Not started | - |
| 5. Сцены — методические `explain_*` tools | 0/0 | Not started | - |
| 6. Голос — 11labs Conversational AI через Hetzner WS-прокси | 0/0 | Not started | - |
| 7. HTML-тренажёр — контракт data-атрибутов + event bus | 0/0 | Not started | - |
| 8. Двухуровневая LLM + проактивные триггеры | 0/0 | Not started | - |
| 9. 2D Lottie аватар учителя | 0/0 | Not started | - |
| 10. Запись урока + транскрипт + модерация + 152-ФЗ | 0/0 | Not started | - |
| 11. Stroke-drawing анимация + SSML-синхронизация | 0/0 | Not started | - |
| 12. End-to-end QA + first 45-минутный урок dry-run | 0/0 | Not started | - |

---

## Notes

- **Phase numbering**: integer phases планового милстона. При необходимости срочной вставки — десятичные (например, 4.1) через `/gsd-insert-phase`.
- **Granularity is fine** (12 фаз) — натуральные delivery-границы стоят отдельно, без агрессивной компрессии. Если в процессе работы окажется, что какая-то фаза слишком тонкая (например, Phase 5 «Сцены» сводится к написанию 12 шаблонов и тестированию) — её можно уплотнить с соседней при `/gsd-replan`.
- **Локед-решения из PROJECT.md** влияют на все фазы — особенно DEC-deploy-architecture (Phase 4, Phase 6), DEC-board-canvas-stack (Phase 4), DEC-board-tool-choice-required (Phase 4–5), DEC-llm-architecture-tier (Phase 8), DEC-voice-provider-mvp (Phase 6), DEC-avatar-style (Phase 9). Любая попытка отклониться требует нового decision.
- **Anti-Anthropic**: ни одна фаза не использует Anthropic. Если экономика Pedagogical LLM на Claude окажется существенно лучше — нужен отдельный decision + CF Worker proxy для обхода TLS-фингерпринт-блокировки (CON-anthropic-rf-block).
- **Cost watermark**: ~22 копейки на разбор столбикового сложения на gpt-4o-mini (CON-board-cost). При переходе на сцены (Phase 5) и на два уровня LLM (Phase 8) цена урока растёт; точный watermark unit-экономики фиксируется в Phase 8 и проверяется в Phase 12.
