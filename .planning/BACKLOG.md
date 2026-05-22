# Backlog

Парковка идей, которые поняли что нужны, но ещё не решили **когда** и **как** делать. Когда идея созреет до плана — выносим в `ROADMAP.md` как отдельную фазу.

Каждый item имеет:
- **Trigger** — откуда пришла идея (фокус-группа, UAT, размышление автора)
- **Что нужно** — короткое описание
- **Что под капотом** — технические компоненты, чтобы оценить scope
- **Открытые вопросы** — что нужно решить до планирования

---

## #001 — Распознавание решения на доске + альтернативные способы ввода (фокус-группа 2026-05-14, расширено 2026-05-21)

### Trigger

Фокус-группа 2026-05-14 (2 пятиклассника). Замечание #6: «дайте возможность писать решение на доске мышкой и чтобы ИИ это распознал — в школе всегда спрашивают как решал, а у вас только финальный ответ».

Педагогически правильное замечание — финальный ответ в numeric-input не отражает процесс. В столбике важно показать перенос, в дробях — приведение к общему знаменателю, в уравнении — пошаговое преобразование. Без распознавания решения тренажёр учит «угадай ответ», а не математике.

### Что нужно

Ребёнок должен иметь способы **показать процесс решения** (не только финальный ответ). Несколько каналов ввода:

1. **Рисование на доске мышкой/тачпадом** — pen tool в tldraw, ребёнок пишет столбик / приведение к общему знаменателю / преобразование уравнения. AI (Надя) проверяет рисунок через Vision LLM или handwriting recognition. Главный кандидат, наибольшая работа.
2. **Фото решения через Telegram-бот** *(добавлено 2026-05-21)* — ребёнок решил на бумаге, фотографирует, отправляет в TG-бот Klassio. Бот извлекает текст и подаёт обратно в lesson session через webhook. Плюсы: знакомый паттерн для родителей/детей, photo quality лучше canvas drawing. Минусы: требует TG-бот инфраструктуру + ребёнку нужно переключаться с платформы.
3. **Drag-and-drop фото в платформу** *(добавлено 2026-05-21)* — ребёнок решил на бумаге, фотографирует, перетаскивает изображение в платформу (или через file picker). Полностью in-browser, проще TG. Vision LLM на загруженной картинке.
4. **Voice-described решение** — ребёнок голосом рассказывает Наде «я сложил 5 и 4, получилось 9...», Надя слушает через ASR и оценивает по тексту. Это работает **уже сейчас** через Phase 8 архитектуру (Надя слышит, реагирует) — самый дешёвый канал, нулевой extra cost.
5. **Step-picker** *(идея)* — решение разбито на pre-made шаги, ребёнок выбирает что он делал в каком порядке (drag-and-drop / клик). Нет handwriting recognition, но проверяет понимание процесса. Подходит для младших классов.

Возможно **несколько каналов одновременно** — ребёнок сам выбирает что удобно (доска / фото / голос). Это снижает риск одного flaky-канала (если Vision не справляется на каракулях — fallback на voice).

Опционально: в тренажёре у задачи флаг `requireProcess: true` (вариант `requireBoardSolution`) → задача требует не только ответ в input, но и process через любой из каналов выше.

### Что под капотом

5-6 компонентов:

1. **BoardPanel — user-draw mode**
   - Сейчас доска в режиме «только AI рисует» (через `/api/draw` SSE)
   - Нужен toggle «AI режим / Я пишу решение»
   - Защита AI-shapes от случайного стирания (lock в один слой)
   - Tool panel сверху (pencil + eraser + цвета)

2. **API endpoint `/api/check-solution`**
   - Принимает: `{taskId, expectedAnswer, boardSnapshot}` (PNG base64 или tldraw shape JSON)
   - Вызывает Vision LLM с промптом-проверщиком
   - Возвращает: `{isCorrect, childAnswer, errorStep?, suggestion}`

3. **7-й client tool для Наташи**: `check_board_solution(taskId?)`
   - Она зовёт когда ребёнок сказал «я написал» или auto-trigger после N сек тишины
   - Handler в `lib/client-tools/handlers.ts` зовёт `/api/check-solution`, формирует ack строку

4. **Bus event `board:user_solution`**
   - Эмиттится из BoardPanel когда user закончил рисовать (debounce 3 сек после последнего stroke)
   - VoicePanel подписан → формирует контекстный update → Наташа реагирует

5. **TrainerTask schema extension**
   - Добавить optional поле `requireBoardSolution: boolean` (default false)
   - В UI numeric-input: маленький badge «нужно решение на доске», disable Submit пока strokes < N

6. **UI feedback**
   - После AI-check: зелёная подсветка на правильных шагах, красный кружок на ошибке + голос объясняет

### Открытые вопросы (до spec-сессии)

**OQ-1. Подход к распознаванию.** Два кандидата:
  - **A. Vision LLM** — snapshot canvas → PNG → GPT-4o Vision / Claude 3.5 Sonnet Vision
    - Плюсы: понимает всё (цифры, перенос, стрелки), один LLM provider который уже подключён, гибкий промпт
    - Минусы: 2-5 сек latency, ~1-2 ₽ за check, хуже на мелких деталях если запись неаккуратная
  - **B. Stroke-based handwriting recognition** — tldraw stroke data → внешняя API (MyScript, Mathpix)
    - Плюсы: быстрее (~500ms), точнее по чистым цифрам
    - Минусы: новая платная API, хуже понимает столбик/стрелки/2D layout, может потребовать ручную сегментацию
  - **Решить в /gsd-discuss-phase когда будем планировать фазу**

**OQ-2. Когда триггерится проверка?**
  - Автоматически после debounce (3 сек тишины после последнего stroke)?
  - По кнопке «Проверь» снизу доски?
  - Только когда ребёнок говорит «посмотри» / Наташа сама зовёт инструмент?
  - Или всё сразу с разными priorities?

**OQ-3. Что делать с ошибочным решением?**
  - Просто комментарий голосом «вот тут ошибка»?
  - Зачёркивать ошибочный шаг на доске?
  - Подсвечивать красным проблемное место (с координатами из Vision response)?
  - Предлагать «давай разберём вместе» и AI сам рисует правильный шаг рядом?

**OQ-4. Стоимость per урок.**
  - Если 5 задач × 2 попытки = 10 vision checks per урок
  - GPT-4o vision ~$0.01 per high-res image = 10 × $0.01 × ~80₽/$ = ~8₽/lesson
  - Текущий variable cap 200₽/lesson, фактически ~180₽ → запас 20₽ → впишемся, но **впритык**
  - Альтернатива: только финальный check на «нажми Submit», а не auto-debounce → 5 checks вместо 10
  - Решить какой UX-flow допустим бюджетом

**OQ-5. Tldraw user-tools UI.**
  - Сейчас tldraw в нашем BoardPanel настроен на read-mostly (только AI пишет)
  - Какие user tools открываем: только pen+eraser? Pen+eraser+text? Полный tldraw toolbar?
  - Где toggle режима «AI/Я» — в header BoardPanel? Floating button? Хоткей?
  - Должна ли user-запись жить в отдельном слое от AI-shapes (чтобы AI clear не стирал пользовательское)?

**OQ-6. Когда задача требует решения на доске?**
  - Все numeric-input задачи?
  - Только те у которых `requireBoardSolution: true` в JSON config?
  - В первой версии тренажёра — какие задачи реально требуют решения, а какие можно решить устно?

**OQ-7. Конфликт с AI-режимом рисования.**
  - Если Наташа в середине объяснения говорит «нарисую тебе» — а в этот момент ребёнок в режиме «я пишу» — что приоритетнее?
  - Auto-switch на AI-режим когда `draw_explanation` зовётся?
  - Pause + промпт пользователю «учительница хочет нарисовать, продолжать?»

### Зависимости

- ✅ Phase 4 (board) — есть
- ✅ Phase 8 (client tools) — есть, легко добавить 7-й
- ⚠️ Phase 11 (UI redesign + resize-able layout) — желательно ДО этой фазы, потому что toggle «AI/Я пишу» + space для user toolbar — это про layout. Если делать до Phase 11, потом всё равно переделывать в новый layout.

### Оценка scope (если делать сейчас, без зависимости от Phase 11)

- 3-5 дней работы
- Один новый API endpoint
- 7-й client tool в существующей системе
- Минорные изменения тренажёра (флаг + badge)
- Среднее количество E2E тестов

### Status

**В backlog** — ждёт решения когда планировать фазу. Возможные триггеры на promote в ROADMAP:
- После Phase 11 (layout готов под новый toolbar)
- Или вместе с Phase 8.5 (контент тренажёра) — там добавим `requireBoardSolution` на задачи где это критично
- Или раньше если фокус-группа продолжит просить и это блокер для UAT

---

## #003 — Text-input fallback в чате Нади (Phase 8.7 discussion, 2026-05-21)

### Trigger

При обсуждении layout редизайна (Phase 8.7) пользователь поднял вопрос — можно ли давать ребёнку **писать в чат** Наде (текстом, не только голосом).

### Что нужно

В Floating Teacher chat-panel — input снизу: «🎤 или напиши...». По умолчанию неактивен (primary UX — голос). Активируется когда:
- Нет доступа к микрофону (отказ permission)
- Микрофон не определён (нет устройства)
- Ребёнок явно переключился в text-only mode (toggle в настройках)

Текст ребёнка идёт в 11labs через `sendUserActivity` или `sendContextualUpdate` (TBD — какой API правильнее для text-as-user-input).

### Зачем не сейчас

- Primary UX — голос+рука+текст синхронно (INV-02). Text-input отвлекает.
- Усложняет UI лишним полем у Floating Teacher.
- Безопасность — детский input нужно модерировать (OpenAI Moderation API).
- Возможный abuse — ребёнок может начать текстом отвечать на математические задачи вместо тренажёра/голоса.

### Когда активировать

- Если в фокус-группе ≥2 ребёнка скажут «не хочу говорить голосом» — приоритет повышается
- Если accessibility audit покажет блокер для детей со speech impairment
- Если operator-аналитика покажет >20% сессий с отказом mic permission

### Оценка scope

- 1 день — UI input + 11labs wiring
- 0.5 дня — moderation pipeline (OpenAI API call перед отправкой)
- Тесты — обновить VoicePanel + новые E2E на text path

---

## #002 — Снизить latency голоса учителя (UAT, 2026-05-14)

### Trigger

Замечание пользователя 2026-05-14: «сейчас хочется чтобы учитель отвечал быстрее». Из-под капота сейчас Phase 6 architecture — WebSocket connection к 11labs agent. Phase 6 нотe в `PHASE-6-SETUP-2026-05-10.md` § 11 фиксировал latency ~3s в раннем тесте (приемлемо, но можно срезать).

11labs официально рекомендует **WebRTC** как «recommended, lower latency» альтернативу WebSocket — это есть в их Claude-Code-генерируемом cheat-sheet.

### Что нужно

Сменить connectionType с `"websocket"` на `"webrtc"` в VoicePanel `startSession()` вызове. Возможно дополнительно — server-side token endpoint (`/v1/convai/conversation/token`) для WebRTC handshake вместо signed-URL flow.

Также рассмотреть **`sendUserActivity()`** — сигнал «пользователь активен» который **отменяет turn_timeout** на стороне агента. Use case: ребёнок печатает в тренажёре или рисует на доске — он активен, но молчит. Без сигнала Наталия через 25 сек начинает «эй, ты тут?». С сигналом — заткнётся. Не latency как таковой, но улучшает «отзывчивость» в восприятии.

### Что под капотом

1. **VoicePanel — connectionType webrtc** (`components/panels/voice-panel.tsx`)
   - В `startSession({ connectionType: 'webrtc', ... })` instead of websocket
   - Возможно потребуется token-based auth (`conversationToken` вместо `signedUrl`)
   - Нужен новый server endpoint `/api/voice/conversation-token` (POST к 11labs `/v1/convai/conversation/token`)

2. **`/api/voice/conversation-token` endpoint** — server-side token fetch
   - Аналогичен текущему `/api/voice/signed-url`
   - GET token, return to client, client использует в startSession

3. **`sendUserActivity()` integration** — VoicePanel подписывается на trainer events
   - При любой активности в тренажёре (`trainer:answer_submitted`, `trainer:hint_opened`, `trainer:task_focused`) → `conversation.sendUserActivity()`
   - Аналогично для будущей user-draw активности на доске

4. **WebRTC firewall / РФ concerns**
   - WebRTC требует UDP-доступа к 11labs ICE-server-ам (LiveKit под капотом)
   - Может конфликтовать с Hetzner WS-proxy (Phase 6.5) — proxy спроектирован для WebSocket
   - Из РФ residential UDP traffic может быть блокирован/throttled
   - **Решить**: WebRTC использует свой path (без нашего Hetzner proxy) или нужен новый proxy слой?

### Открытые вопросы

- **OQ-1**: WebRTC vs WS на сегодняшнем latency baseline — сколько мс реально срежется на РФ residential network? Phase 6 notе писал «~3s», но это очень общая оценка. Нужен замер.
- **OQ-2**: Совместим ли WebRTC с Phase 6.5 Hetzner proxy? Если нет — нужно архитектурное решение (own TURN server? bypass proxy для WebRTC?).
- **OQ-3**: `sendUserActivity()` vs текущий turn_timeout=25s — нужны оба или один заменяет другой? Возможно достаточно `sendUserActivity()` и можно вернуть turn_timeout к более агрессивному 10s.
- **OQ-4**: Volume controls для родителей / accessibility — `setVolume()`, `getInputVolume()`, `getOutputVolume()` — добавлять сейчас или в Phase 11?

### Зависимости

- ✅ Phase 6 (WebSocket connection) — есть как baseline
- ⚠️ Phase 6.5 (Hetzner WS proxy) — нужно понять как WebRTC сочетается с ним
- 🟢 Phase 8.6 (нынешняя session) — turn_timeout настроен на 25s именно потому что отзывчивость низкая; с WebRTC и sendUserActivity можно вернуться к более бодрому 10-15s

### Оценка scope

- 1-2 дня работы (WebRTC migration + token endpoint + sendUserActivity wire-up)
- НО — может вылезти РФ-network проблема (Phase 6.5 type — несколько дней разбирательства)
- Тесты — обновить existing VoicePanel + новый E2E на token flow

### Status

**В backlog** — promote когда нужна реальная атака на latency (например после Phase 8.5 контента когда настоящий UAT начнёт мерить «отзывчивость» как метрику). Возможный триггер: фокус-группа продолжит говорить «медленно отвечает» — будем мерить и крутить.

---

## #004 — Block-based scene+voice synchronization (UAT 2026-05-22)

### Trigger

UAT v2-claude-design ветка 2026-05-22. User feedback: «голос и отрисовка в сильном рассинхроне. объясняет сильно дольше, чем рисует. может по блокам генерировать часть решения на доске, вместе с такой же частью голоса?»

Корень рассинхрона: scene рисуется почти мгновенно через SSE (`/api/draw`), а Надя в narration mode непрерывно озвучивает 30-40 секунд план словами. Доска уже закончена, Надя ещё рассказывает.

Быстрый workaround (A+B 2026-05-22) — сокращение narration в промпте + клиентская задержка 700ms между draw-шагами в BoardCanvasV2 — улучшает sync приблизительно, но это не настоящая синхронизация.

### Что нужно

Сцена эмитит блоки `[draw_chunk, voice_line]`. На каждом блоке:
1. Клиент применяет draw operations блока к tldraw
2. Клиент проигрывает voice_line через 11labs TTS API (exact text, не conversation reformulation)
3. Ждёт окончания audio
4. Идёт следующий блок

Координаты шейпов остаются absolute (как сейчас) — разрезы на блоки не сдвигают позиции, не накладывают шейпы поверх.

Надя на время block playback **muted** (через `conversation.setMuted(true)`). После `scene_complete` — unmute + контекстный update «продолжай диалог».

### Что под капотом

5 компонентов:

1. **Scene generators v2** (`lib/board/scenes/v2/*`)
   - Refactor 15+ существующих generators в блочный формат: `yield { type: 'block', say: '...', draw: [tool_use_arr] }`
   - Координаты не меняются — это только новая группировка yields

2. **API endpoint `/api/draw-v2`**
   - Новый параллельно к старому (старый `/api/draw` обслуживает legacy `/lesson/[id]`)
   - Стримит блоки SSE по одному
   - Опционально: ACK-protocol между блоками (или sequential client-side pacing — проще)

3. **TTS pipeline для точной озвучки**
   - Вариант (a): новый `/api/voice/tts` proxy к 11labs TTS API (NOT conversation API) — рендерит exact text в audio stream. Cost ~$0.0003 на блок.
   - Вариант (b) — оптимизация позже: pre-gen кеш TTS audio для scene templates, runtime мгновенно.

4. **Block orchestrator в BoardCanvasV2**
   - Цикл: applyDraws(block) → playAudio(block.say) → await audioEnd → next
   - Параллельно: setMuted(true) на conversation на старте scene, setMuted(false) на завершении

5. **Промпт Нади**
   - Новое правило: «когда вызвала `draw_explanation` — ты МОЛЧИШЬ. Система сама проигрывает audio синхронно с доской. Возобновляешь диалог при marker `scene_complete`.»
   - Marker `scene_complete` emit'ится из orchestrator при последнем блоке.

### Открытые вопросы

- Mute conversation целиком на время block sync или только Надин output? Если ребёнок что-то скажет в микрофон во время block sync — игнорить или buffer и обработать после?
- Visual indicator «Надя сейчас рисует, подожди» — нужен ли pulsing animation на доске?
- Fallback если 11labs TTS API упал — пропускать voice блока или прерывать всю сцену?
- Pre-gen кеш (variant b) — где хранить audio (Vercel KV / S3 / отдельный CDN)?

### Оценка scope

**2-3 рабочих дня** (можно полдня для PoC на 1 сцене column addition):
- День 1: блочный протокол spec, 1 scene refactor, `/api/draw-v2`, client orchestrator, TTS API proxy. End-to-end один scene работает.
- День 2: refactor остальных ~14 scene generators в блоки.
- День 3: edge cases (mute/unmute transitions, child speaks during scene, abort mid-scene), промпт, fine-tune timing, UAT.

### Cost delta

| Resource | Delta per урок |
|---|---|
| 11labs TTS API (новое) | +$0.009 |
| 11labs conversation (Надя меньше говорит) | -$0.001 |
| Compute | негл. |
| Storage (pre-gen кеш — опционально) | ~$0.01/mo |

**Net: ~$0.008 на урок (меньше цента).** При 1000 уроках/мес = +$8/mo.

### Что НЕ ломается

- `/lesson/[id]` legacy route — не трогаем, использует старый `/api/draw`
- tldraw layer + `executeToolCall` — не меняется
- 11labs conversation infrastructure — добавляется только mute/unmute управление

### Status

**В backlog** — promote когда A+B (2026-05-22 quick fix) окажется недостаточным sync для UAT. Если ребёнок продолжает теряться в рассинхроне на фокус-группах — заходим в block sync, начиная с PoC на column addition.
