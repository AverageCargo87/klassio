# Klassio v1 Requirements

> Отфильтровано под v1 scope (платформа урока, без воронки клиентов).
> Полный список 18 requirements с источниками — `.planning/intel/requirements.md`.
> v2/long-tail requirements перечислены в нижнем разделе для прозрачности.
>
> Дата: 2026-05-09. Источник: `.planning/intel/requirements.md` + v1 scope lock.

---

## Категории v1

| Категория | Префикс | # Requirements |
|---|---|---|
| Account & Lifecycle | ACC | 4 |
| Lesson Page (page shell + sync) | LES | 2 |
| Board (interactive whiteboard) | BRD | 3 |
| Voice (11labs Conversational AI) | VOI | 2 |
| HTML Trainer | HTM | 1 |
| Avatar (2D Lottie) | AVT | 1 |
| LLM Architecture | LLM | 1 |
| Pedagogical Behavior | PED | 2 |
| Recording & Safety | REC | 2 |
| Production Deploy | DEP | 1 |
| Product Invariants (cross-cutting) | INV | 2 |
| **Total v1** | | **21** |

---

## ACC — Account & Lifecycle

### ACC-01 — Авторизация родителя через email magic link, ребёнок использует родительскую сессию
- **Source**: revised 2026-05-09 в /gsd-discuss-phase 1 (CONTEXT.md D-01..D-08). Прошлая модель «personal token-in-URL для ребёнка» отменена.
- **Description**: **Родитель** регистрируется на общем URL платформы через email magic link (passwordless). Email родителя должен быть в whitelist в БД (анти-рандом для MVP). Ребёнок не регистрируется и не логинится сам — он использует устройство родителя, на котором уже стоит сессия в cookie (INV-01 сохраняется: ребёнок ничего не устанавливает и не регистрирует).
- **Acceptance criteria**:
  - На `/login` есть форма с одним полем email + кнопка «отправить ссылку для входа».
  - При отправке: если email в whitelist — письмо с magic link уходит через Resend; если не в whitelist — redirect на `/no-access` без отправки письма (security: не давать info attacker'у о существующих email'ах).
  - Magic link в письме валиден 24 часа (NextAuth default), используется один раз.
  - При клике в email сервер валидирует token → ставит httpOnly secure cookie expiry 1 год → redirect на `/lessons`.
  - Cookie работает на любом устройстве, где она установлена (multi-device permissive).
  - Просроченный/использованный/невалидный magic link → `/no-access` (единая нейтральная страница «Доступ не предоставлен. Обратитесь к репетитору»).
  - Никаких форм пароль/повторный пароль/captcha. Никаких регистрационных форм с дополнительными полями (имя, возраст, и т.д. — только email).
  - **OAuth провайдеры (TG / Google / VK) → v2.** NextAuth архитектурно их поддержит, но в v1 не настраиваются.
  - Один родитель = один ребёнок (в v1 жёсткое 1:1; multi-child → v2).
  - Анти-рандом: whitelist в БД (таблица `allowed_emails` или поле `users.allowed`); admin вручную добавляет email через seed-скрипт / прямой SQL (полноценный admin UI — Phase 2).

### ACC-02 — Список запланированных уроков в ЛК
- **Source**: derived from v1 scope lock.
- **Description**: В ЛК ребёнок видит список своих запланированных уроков с датами, темами и кнопкой «Начать урок» (активна за N минут до старта).
- **Acceptance criteria**:
  - Для каждого урока видны: дата + время, тема, длительность (45–60 мин).
  - Кнопка «Начать урок» становится активной за 5 минут до начала и остаётся активной N минут после.
  - Список упорядочен: ближайший урок сверху.
  - Прошедшие уроки видны в отдельной секции (или вкладке).
  - Если уроков нет — понятная пустая state с пояснением.

### ACC-03 — Расписание (календарь / список будущих уроков)
- **Source**: derived from v1 scope lock.
- **Description**: Ребёнок видит расписание на ближайшие N недель в удобном виде (минимум — список, можно — простой календарь).
- **Acceptance criteria**:
  - Видны минимум следующие 4 недели запланированных уроков.
  - Каждая запись = клик → переход на детальный экран урока.
  - В v1 ребёнок НЕ может менять расписание — это привилегия admin/репетитора (вне scope для UI ребёнка).

### ACC-04 — Завести урок и расписание (admin путь, минимальный)
- **Source**: derived from v1 scope lock + REQ-customer-journey acceptance criteria § «MVP-вариант».
- **Description**: В v1 уроки и расписание заводятся **вручную** — либо через минимальный admin UI, либо напрямую в БД через скрипт. Никакого диалогового AI-сбора программы (это v2).
- **Acceptance criteria**:
  - Существует механизм (admin endpoint / CLI / прямой SQL) для:
    - создания нового пользователя-ребёнка с уникальной ссылкой,
    - создания запланированного урока с датой/временем/темой/HTML-тренажёром,
    - привязки урока к пользователю.
  - НЕ требуется красивый UI для админа — функциональность важнее формы.
  - Документация (README или admin guide), как зарезервировать тестового ребёнка и тестовый урок для проверки success metric.

---

## LES — Lesson Page

### LES-01 — Архитектура страницы урока: три кита параллельно
- **Source**: REQ-three-pillars (`.planning/intel/requirements.md`).
- **Description**: Урок = одно веб-приложение с тремя компонентами, работающими параллельно и обменивающимися состоянием через общую event-шину.
- **Acceptance criteria**:
  - На странице урока одновременно видны: голосовой агент (с аватаром), интерактивная доска, HTML-тренажёр.
  - Layout: ребёнок видит все три компонента без переключения вкладок (single-page lesson view).
  - Общая event-шина (in-memory pub/sub или React context) для синхронизации состояния между компонентами.
  - Любой компонент может слушать события других (бот → подсветить элемент в тренажёре, тренажёр → бот видит ввод, доска → say tool появляется в панели).
  - Layout адаптивен под десктоп и планшет (телефон не приоритет MVP).

### LES-02 — Голос + рука + текст синхронно
- **Source**: REQ-voice-hand-text-sync (`.planning/intel/requirements.md`).
- **Description**: Инвариант продукта: в каждый момент урока работают три канала параллельно — голос, рисунок на доске, подсветка элемента в HTML-тренажёре. См. INV-sync ниже как cross-cutting product invariant.
- **Acceptance criteria**:
  - При проигрывании реплики `say` от бота — доска одновременно рисует соответствующий шейп (через SSML-маркер `<mark>` или event с timestamp).
  - При указании бота на элемент тренажёра — этот элемент подсвечивается в HTML-тренажёре в момент произнесения слова.
  - Любая разрывающая триаду имплементация (например, «бот сначала всё нарисовал, потом озвучил») отвергается на ревью.

---

## BRD — Board (Interactive Whiteboard)

### BRD-01 — Программируемый канвас tldraw + LLM
- **Source**: REQ-board-component (`.planning/intel/requirements.md`) + DEC-board-canvas-stack + DEC-board-llm-provider.
- **Description**: Интерактивная доска, на которой бот **в реальном времени** генерирует серию tool calls под конкретный пример (не заготовка). Базируется на текущем прототипе из `tldraw-test/`.
- **Acceptance criteria**:
  - Стек: tldraw v3.15.6 + Next.js 15 App Router + React 18 + OpenAI gpt-4o-mini + function calling + agent-loop.
  - Endpoint `/api/draw` принимает `{prompt}` и стримит SSE с `tool_use` событиями (см. CON-api-draw-contract).
  - Клиент исполняет каждое `tool_use` через `executeToolCall(editor, name, input)` (см. CON-executor-contract).
  - Fade-in анимация шейпов, stagger цифр, fixed tldraw color palette — всё как в текущем прототипе.
  - На каждом разборе модель генерит план с нуля под конкретные числа/формулу.

### BRD-02 — Структура tools: переход к Сценам
- **Source**: REQ-scenes-macros-primitives (`.planning/intel/requirements.md`).
- **Description**: Вместо 9 примитивов — методические сцены `explain_*`. Бот предпочитает сцены, макросы — для гибкости, примитивы — fallback.
- **Acceptance criteria**:
  - 12–15 сцен на программу 5 класса: `explain_column_addition(a,b)`, `explain_column_subtraction(a,b)`, `explain_multiplication_grid(a,b)`, `explain_long_division(a,b)`, `explain_fraction_addition(a,b,c,d)`, `explain_fraction_comparison(a,b,c,d)` и т.д. (точный список — определяется в фазе сцен на основе программы 5 класса).
  - Каждая сцена = composable серия низкоуровневых tool calls с правильным timing'ом.
  - Текущие 9 примитивов остаются как fallback — бот может комбинировать примитивы, если не хватает сцены.
  - Стоимость одного разбора через сцену остаётся в разумных пределах (watermark — `CON-board-cost`, ~22 копейки на gpt-4o-mini).

### BRD-03 — Stroke-drawing анимация и living-teacher feel
- **Source**: REQ-living-teacher-feel (`.planning/intel/requirements.md`) (частично — hand-drawn rough.js перенесён в v2).
- **Description**: Анимация рисования: линии «вытягиваются», а не появляются. Овелрей-слой поверх tldraw — после анимации объект переезжает в постоянный canvas. Естественные паузы между шагами через `wait` tool.
- **Acceptance criteria**:
  - Stroke-drawing: SVG `stroke-dashoffset` анимация для линий и стрелок (минимум). Длительность анимации параметризуема per-shape.
  - Текст и сложные шейпы — fade-in (как сейчас), потому что stroke-drawing для текста плох.
  - Overlay-слой: новый шейп сначала появляется в overlay с анимацией, после её завершения — `editor.createShape(...)` в постоянный canvas, overlay чистится.
  - `wait` tool используется ботом как естественная пауза между шагами.
  - hand-drawn стиль через rough.js — **НЕ v1**, отложено в v2.

---

## VOI — Voice (11labs Conversational AI)

### VOI-01 — 11labs Agents с Custom LLM endpoint через Hetzner-прокси
- **Source**: REQ-voice-agent (`.planning/intel/requirements.md`) + DEC-voice-provider-mvp + DEC-deploy-architecture.
- **Description**: Двусторонний голос с прерываниями и function calling, через 11labs Agents Custom LLM endpoint. Backend-прокси для РФ-аудитории на Hetzner Frankfurt.
- **Acceptance criteria**:
  - Платформа: 11labs Agents (Путь A — готовый Conversational AI продукт от 11labs).
  - Транспорт: фронт на Vercel + Cloudflare → backend-прокси на Hetzner Frankfurt → WebSocket к 11labs.
  - Юзер открывает сайт без VPN; Cloudflare обслуживает фронт через московские edge, аудио идёт через европейский backend.
  - API-ключи 11labs **только на сервере**, никогда в браузере.
  - Прямой клиент-к-11labs из браузера российского ребёнка работать не будет — обязателен WebSocket-прокси через Германию.
  - Голос: один из русских голосов 11labs (Multilingual v2 или Flash v2.5). Тестируется на детях 9–11 лет до релиза v1.
  - Платежи 11labs — нерезидентская карта или посредник (out of dev scope, но залок для prod-доступа).

### VOI-02 — 2D-аватар учителя (Lottie)
- **Source**: REQ-2d-avatar (`.planning/intel/requirements.md`) + DEC-avatar-style.
- **Description**: 2D-персонаж учителя через Lottie с переключением состояний по событиям от голосового агента.
- **Acceptance criteria**:
  - Технология: Lottie (НЕ 3D, НЕ видео-аватар D-ID).
  - Минимум 5 состояний: нейтрально, говорит, думает, радуется, огорчился.
  - Переключение состояний по событиям от голосового агента (state machine на клиенте слушает event bus).
  - Аватар видим на странице урока и не блокирует видимость доски и тренажёра.

---

## HTM — HTML Trainer

### HTM-01 — Персональный HTML-тренажёр с контрактом data-атрибутов
- **Source**: REQ-html-trainer (`.planning/intel/requirements.md`).
- **Description**: Заранее сгенерированная под конкретного ребёнка персональная страница с теорией, типовыми заданиями, тестами. Структура зафиксирована «контрактом» через `data-` атрибуты для унифицированного взаимодействия с ботом.
- **Acceptance criteria**:
  - Контракт data-атрибутов (минимум): `data-block`, `data-task-id`, `data-task-type`, `data-correct`, `data-hint-level`.
  - Эмиттит события на общую шину: `answer_submitted`, `hint_opened`, `task_focused`, `idle_15s`.
  - Принимает команды от бота: `highlight(element_id)`, `show_hint(task_id, level)`, `goto_task(task_id)`.
  - Типы заданий v1: `numeric-input` (ввод числа), `single-choice` (выбор варианта), `matching` (сопоставление).
  - В v1 — урок генерируется вручную (через ACC-04), не AI-сбор программы.
  - HTML-тренажёр загружается per-lesson и существует в DOM рядом с доской и аватаром (в рамках LES-01).

---

## AVT — Avatar

(см. VOI-02 — 2D-аватар учителя организационно сгруппирован с голосом, потому что управляется голосовым агентом.)

---

## LLM — LLM Architecture

### LLM-01 — Двухуровневая LLM (Pedagogical + Realtime)
- **Source**: REQ-pedagogical-realtime-llm (`.planning/intel/requirements.md`) + DEC-llm-architecture-tier.
- **Description**: Slow planner следит за стратегией урока, fast actor отвечает в реалтайме. Стандартный паттерн voice-agents.
- **Acceptance criteria**:
  - Pedagogical LLM (slow): GPT-4o (или эквивалент в OpenAI-семействе). Следит за прогрессом урока, решает «что делать дальше». **НЕ Anthropic**, если не принято отдельное decision (см. CON-anthropic-rf-block).
  - Realtime LLM (fast): gpt-4o-mini. Исполняет решения Pedagogical в реальном времени голоса.
  - Контракт между Pedagogical и Realtime: Pedagogical эмиттит «pedagogical decisions» (например, «следующий шаг — задача 3, через сцену explain_X»), Realtime читает их и исполняет голосом+доской+тренажёром.
  - Стоимость одного 45-минутного урока (Pedagogical + Realtime + 11labs) укладывается в разумный бюджет для unit-экономики (точный watermark определяется в фазе LLM-архитектуры).

---

## PED — Pedagogical Behavior

### PED-01 — Live, не заготовленные объяснения
- **Source**: REQ-live-explanations (`.planning/intel/requirements.md`).
- **Description**: Бот разбирает именно эту ошибку именно этого ребёнка. Не «вот видео про сложение в столбик» — а «ты ввёл 11 в 3×4, давай нарисуем».
- **Acceptance criteria**:
  - Бот реагирует на конкретную ошибку конкретного ребёнка (через ввод в HTML-тренажёре или голос).
  - Никаких предзаписанных видеоуроков.
  - Никаких заготовленных «решений» — каждый разбор генерируется LLM с нуля под конкретные числа.
  - На QA-сессии (success metric) можно ввести разные неправильные ответы — бот реагирует разными разборами.

### PED-02 — Проактивный, не реактивный бот
- **Source**: REQ-proactive-bot (`.planning/intel/requirements.md`).
- **Description**: Бот реагирует не только на голос ребёнка, но и на triggers пассивности.
- **Acceptance criteria**:
  - Триггеры реакции бота:
    - молчание > 20 секунд,
    - закрытие/уход в другую вкладку (`visibilitychange`),
    - неправильные ответы подряд (≥ 2),
    - быстрые «потыкивания» без размышления (< 2 секунд между ответами при неправильных),
    - нажатие кнопки «помощь».
  - Триггеры эмиттят события на шину, Pedagogical LLM их видит и решает «вмешаться или нет».
  - Бот сам инициирует подключение к ребёнку при срабатывании любого из триггеров.

---

## REC — Recording & Safety

### REC-01 — Запись урока + транскрипт + доступ из ЛК
- **Source**: derived from v1 scope lock + REQ-child-safety acceptance criteria § «запись урока».
- **Description**: Каждый проведённый урок сохраняется (видео + транскрипт), и эти артефакты доступны в ЛК ребёнка для повторного просмотра.
- **Acceptance criteria**:
  - Видеозапись урока: минимум — запись composite экрана урока (доска + аватар + тренажёр, картинка). Может быть только аудио + screencast — точное содержимое определяется в фазе записи.
  - Транскрипт: текстовая стенограмма реплик (бот + ребёнок) с timestamp.
  - Хранение: на безопасном хранилище (S3-совместимое, в Hetzner или отдельном облаке вне РФ — определяется в фазе deploy).
  - Доступ из ЛК ребёнка: в списке прошедших уроков можно открыть запись и перейти по timestamp на любой момент.
  - Согласие 152-ФЗ собрано до старта записи (либо при онбординге родителя, либо при первом входе в ЛК — определяется в фазе ЛК).

### REC-02 — Контент-модерация и тревожные триггеры
- **Source**: REQ-child-safety (`.planning/intel/requirements.md`) (частично — отчёт родителю в Telegram отложен в v2).
- **Description**: Контент-модерация всех ответов LLM, тревожные триггеры на детский контент о насилии/самоповреждении/проблемах дома, возрастная адаптация.
- **Acceptance criteria**:
  - Все ответы LLM пропускаются через content-модератор: OpenAI Moderation API или собственный фильтр. Заблокированный контент — НЕ показывается ребёнку, заменяется нейтральной репликой бота.
  - Триггеры тревоги: отдельный classifier на стенограмме речи ребёнка. Если детектит насилие/самоповреждение/проблемы дома — событие записывается в БД для последующего разбора (в v2 — отчёт родителю в Telegram, в v1 достаточно записи в БД и алёрта в админ-канал).
  - Возрастная адаптация лексики через системный промпт + пост-фильтр (бот не использует слова, неуместные для 9–11 лет).
  - Согласие родителей по 152-ФЗ — собирается до первой записи (см. REC-01).

---

## DEP — Production Deploy

### DEP-01 — Vercel + Hetzner Frankfurt + Cloudflare
- **Source**: derived from v1 scope lock + DEC-deploy-architecture + REQ-roadmap-priorities (priority «высокий — production deploy»).
- **Description**: Production deploy так, чтобы российский ребёнок открывал сайт **без VPN**.
- **Acceptance criteria**:
  - Фронт (Next.js приложение) задеплоен на Vercel.
  - Cloudflare стоит перед Vercel как CDN — обслуживает РФ-юзеров через московские edge-точки.
  - Backend-прокси для 11labs WebSocket — на Hetzner Frankfurt (Germany).
  - Vercel ходит к OpenAI напрямую с американского IP (instrumentation.ts корректно no-op'ит без HTTPS_PROXY).
  - Тест: открытие сайта с РФ IP без VPN → загружается фронт → запускается урок → голос работает (WS через Hetzner) → доска работает (OpenAI через Vercel).
  - Env vars в Vercel: только `OPENAI_API_KEY` + ключи 11labs/Hetzner (никаких HTTPS_PROXY).
  - HTTPS, домен (поддомен Klassio), сертификаты — настроены через Cloudflare/Vercel.
  - `outputFileTracingRoot` и прочие Next.js quirks (см. CON-nextjs-tracing-root, CON-webpack-undici) сохранены в production build.

---

## INV — Product Invariants (cross-cutting)

> Эти инварианты применяются ко всем фазам как guardrails. Они не привязаны к одному компоненту — это критерии приёмки для системы целиком.

### INV-01 — Zero-install для ребёнка
- **Source**: REQ-zero-install-invariant (`.planning/intel/requirements.md`). Уточнено 2026-05-09 в /gsd-discuss-phase 1 — auth model изменилась (родитель логинится, ребёнок использует родительскую сессию), но invariant для ребёнка сохраняется.
- **Description**: **Ребёнок** открыл сайт (на устройстве родителя где стоит сессия) → разрешил микрофон → начал урок. Никаких VPN, расширений, плагинов, регистраций со стороны ребёнка. **Родитель** в v1 проходит email magic link login один раз — это его (взрослого) трение, не ребёнка.
- **Acceptance criteria**:
  - **Со стороны ребёнка:** никаких клиентских VPN, расширений браузера, плагинов, дополнительных программ, регистраций, форм. Открыл вкладку → уже в ЛК (если родительская сессия в cookie) → клик «Начать урок» → разрешение микрофона → урок идёт.
  - **Со стороны родителя:** один раз вводит email на `/login` → клик в письме Resend → залогинен на год. Это разовое трение взрослого пользователя (приемлемо).
  - Любое решение в любой фазе, требующее от ребёнка дополнительного действия в потоке урока (кроме «разрешить микрофон» при первом запуске), отвергается.
  - Применимо к: фазе ЛК (Phase 1), фазе lesson page (Phase 3), фазе deploy (Phase 4).

### INV-02 — Голос + рука + текст синхронно (cross-cutting)
- **Source**: REQ-voice-hand-text-sync (`.planning/intel/requirements.md`).
- **Description**: Инвариант продукта: три канала работают параллельно во всех сценариях урока. Дублируется в LES-02 как acceptance, но также применяется к BRD, VOI, HTM как guardrail.
- **Acceptance criteria**:
  - Каждое решение по интеграции (event bus, sync mechanism, SSML-маркеры) проверяется на «не разрывает ли это триаду».
  - Применимо к: фазе scenes, фазе stroke-drawing+SSML, фазе voice integration.

---

## v2 / Long-tail backlog (НЕ v1)

> Эти requirements извлечены из ingest set, но deferred до v2 по решению юзера в v1 scope lock.

| ID (intel) | Категория | Что | Почему НЕ v1 |
|---|---|---|---|
| REQ-product-positioning | sales | Авито канал привлечения, позиционирование «обычного репетитора» | Воронка клиентов вне v1 |
| REQ-customer-journey | onboarding | 8-шаговый поток Авито → TG → программа → ссылка → урок → отчёт | TG-бот, диалоговый сбор и автоотчёт — v2 |
| REQ-out-of-scope | scope | Anti-requirements (не Khanmigo, не AI-чат, не видеоуроки и т.д.) | Информационное — отражено в PROJECT.md § «Anti-scope» |
| REQ-roadmap-priorities | informational | Приоритизированный backlog из VISION.md | Информационное — основа для текущего ROADMAP.md |
| REQ-long-term-vision | informational | 6–12 месяцев: расширение на 3–4 класс, другие предметы, групповые уроки, адаптивная программа, отчёты | Информационное — long-tail после v1 |

Также частично deferred:
- **REQ-living-teacher-feel** acceptance criterion «hand-drawn стиль через rough.js» — отложен в v2 (после MVP). Stroke-drawing анимация остаётся в v1 как BRD-03.
- **REQ-child-safety** acceptance criterion «отчёт родителю в Telegram» — отложен в v2. В v1 достаточно записи в БД и алёрта в админ-канал (REC-02).
- **Vision LLM для чтения детских рисунков** — REQ-roadmap-priorities § «низкий V2».

---

## Traceability

> Заполняется после создания ROADMAP.md. Mapping requirement → phase.

| Requirement | Phase | Status |
|---|---|---|
| ACC-01 | Phase 1 | Pending |
| ACC-02 | Phase 1 | Pending |
| ACC-03 | Phase 2 | Pending |
| ACC-04 | Phase 2 | Complete (02-01) |
| LES-01 | Phase 3 | In Progress (03-01 schema, 03-02 event bus — 03-03 pending) |
| LES-02 | Phase 11 | Pending |
| BRD-01 | Phase 4 | Pending |
| BRD-02 | Phase 5 | Complete (05-01, 2026-05-10) |
| BRD-03 | Phase 11 | Pending |
| VOI-01 | Phase 6 | Complete — Implementation (06-01: SDK + lib/elevenlabs + signed-url route, 21 tests; 06-02: VoicePanel + LessonShell + 17 component tests + 11 E2E tests, 2026-05-10). Manual UAT (real-voice + Open Q1 allowlist) DEFERRED to developer per plan critical_implementation_rules. Phase 6.5 (Hetzner WS proxy for РФ-без-VPN) tracked separately. |
| VOI-02 | Phase 9 | Pending |
| HTM-01 | Phase 7 | Complete (07-01: bus contract + components, 07-02: TrainerPanel + config-loader + E2E, 2026-05-10) |
| LLM-01 | Phase 8 | Pending |
| PED-01 | Phase 4 | Pending |
| PED-02 | Phase 8 | Pending |
| REC-01 | Phase 10 | Pending |
| REC-02 | Phase 10 | Pending |
| DEP-01 | Phase 4 | Pending |
| INV-01 | Phase 1 | Pending (cross-cutting guardrail) |
| INV-02 | Phase 11 | Pending (cross-cutting guardrail) |

**Coverage**: 21/21 v1 requirements mapped → 1 phase each (no orphans, no duplicates). Cross-cutting invariants (INV-01, INV-02) attached to the phase where their first observable behavior must hold; они также применяются как guardrails во всех последующих фазах.

Полный roadmap — `ROADMAP.md`.
