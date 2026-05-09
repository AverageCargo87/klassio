# Context Intel

> Supporting context, session notes, history of decisions, and operational gotchas
> extracted from ingested DOCs.
> Synthesized by `gsd-doc-synthesizer` on 2026-05-09.
> Source DOCs: BOARD-STATUS.md (manifest_override: DOC).

---

## Topic: Project identity & current state (2026-05-09 snapshot)

- source: BOARD-STATUS.md
- Дата снимка: 2026-05-09. Юзер: kratov.gr@gmail.com (Россия, Москва).
- Проект: прототип AI-учителя математики для 5 класса. Юзер пишет «объясни 245+345 в столбик», LLM возвращает поток tool calls (`draw_text`, `wait`, `highlight_region` и т.п.), фронт исполняет их через tldraw editor — на канвасе анимированно появляется объяснение.
- Видение продакшна: задеплоить на Vercel, встроить в существующий сайт юзера, школьники в РФ заходят без VPN, всё работает.

---

## Topic: Файловая структура проекта (что делает каждый файл)

- source: BOARD-STATUS.md

```
app/
  layout.tsx                # html/body, lang="ru", метаданные
  page.tsx                  # 'use client'. Tldraw 70% (через next/dynamic ssr:false) + панель 30%.
                            # Читает SSE из /api/draw, по каждому tool_use вызывает executeToolCall.
                            # editor через ref, setCamera({x:0,y:0,z:1}) при монтировании.
  globals.css               # Tailwind v4 imports
  api/draw/route.ts         # POST /api/draw. Использует client.chat.completions.stream().
                            # Слушает 'tool_calls.function.arguments.done' → шлёт SSE event {type:'tool_use',name,input}.
                            # Fallback JSON.parse(e.arguments) если parsed_arguments=null
                            # (это норма для chat.completions.stream без zod схемы).

lib/
  tools.ts                  # tool схемы — provider-agnostic JSON Schema, без типов SDK.
                            # Адаптация под OpenAI делается в route.ts:
                            #   { type:'function', function: { name, description, parameters } }
  executor.ts               # 'use client'. executeToolCall(editor, name, params).
                            # Маппинг на tldraw v3 API (см. constraints.md → CON-tldraw-shape-quirks).

instrumentation.ts          # Next.js hook, выполняется один раз при старте.
                            # Через createRequire(import.meta.url) грузит undici (минуя webpack)
                            # и вешает ProxyAgent на globalDispatcher если задан HTTPS_PROXY.
                            # БЕЗ HTTPS_PROXY — пишет в лог "fetch идёт напрямую" и ничего не делает.
                            # Это правильное поведение для VPN-туннеля и для продакшна.

next.config.ts              # outputFileTracingRoot: лочит workspace root.
                            # serverExternalPackages: ['undici']
                            # webpack: маркирует все node:foo как 'commonjs node:foo' externals.

.env.local                  # OPENAI_API_KEY=sk-proj-... (реальный ключ юзера)
                            # Закомментирован старый ANTHROPIC_API_KEY на случай возврата.

.env.local.example          # OPENAI_API_KEY=sk-... (плейсхолдер)
README.md                   # Обновлён под OpenAI.
```

> Note: BOARD-STATUS говорит про "7 tool схем" в `lib/tools.ts` — это устаревший снимок. Актуально 9 tools (см. constraints.md → CON-tools-spec и conflict report для деталей).

---

## Topic: История крупных решений (почему мы сейчас на OpenAI, а не Anthropic)

- source: BOARD-STATUS.md

1. **Изначально** проект собран под Anthropic claude-sonnet-4-5-20250929 — провалился из-за TLS-фингерпринт фильтра в Cloudflare для РФ.
2. **Переехали** на OpenAI gpt-4o (`api.openai.com` не за Cloudflare, фильтрует только по IP).
3. **OpenAI тоже не работал** напрямую — оказалось, что у юзера VPN был в режиме «прокси» (через `HTTPS_PROXY`), и Node его не использовал. Curl работал, Node — нет.
4. **Добавили** `instrumentation.ts` с `setGlobalDispatcher(new ProxyAgent(...))`, чтобы Node-fetch уважал `HTTPS_PROXY`.
5. **Юзер переключил** VPN с «прокси» на «туннель» → теперь весь трафик идёт через TUN, env vars не нужны, instrumentation корректно no-op'ит.

---

## Topic: Сетевая ситуация юзера (САГА — не повторяй диагностику с нуля)

- source: BOARD-STATUS.md

Юзер в Москве. У него есть **VPN-приложение типа Hiddify/sing-box client** (XRAY · VLESS · SINGBOX), сервер USA 32 в Майами. У клиента есть переключатель **Прокси / Туннель**:

- **Прокси-режим**: клиент слушает на 127.0.0.1:10801, приложения должны сами туда лезть. Curl читает `HTTPS_PROXY` env vars автоматически — Node нет (это сознательное поведение Node.js, не баг).
- **Туннель-режим**: TUN/TAP интерфейс, **весь** исходящий трафик системы идёт через VPN на сетевом уровне. Никаких env vars не надо.

**Сейчас юзер на ТУННЕЛЕ** → всё работает «из коробки», `instrumentation.ts` корректно ничего не делает.

**Не поднимай тему IP-блока Anthropic снова**, мы это разобрали:
- `api.anthropic.com` за Cloudflare фильтрует по **TLS-фингерпринту JA3/JA4**, не по IP. Curl/Schannel пропускает (системный TLS Windows), Node/OpenSSL — режет с `403 forbidden / "Request not allowed"`. Cf-ray POP `DME` (Москва) даже когда VPN включён — Cloudflare anycast роутит по сетевой топологии.
- `api.openai.com` режет по **IP жёстко** через `unsupported_country_region_territory`. Никаких финт ушами нет — нужен IP не в стоп-листе. Туннель + американский VPN-сервер = решение.

Поэтому переехали с Anthropic на OpenAI: с туннелем достаточно одного IP-фикса, без TLS-возни.

---

## Topic: Что подтверждено работающим (end-to-end проверено)

- source: BOARD-STATUS.md

```
✓ npm run dev стартует на :3000
✓ tsc --noEmit проходит чисто
✓ instrumentation.ts грузится без webpack-ошибок
✓ exit IP при туннеле = 104.167.198.211 (Miami, US)
✓ POST /api/draw → 200, SSE стрим с tool_use
✓ OpenAI gpt-4o возвращает корректные tool calls с правильным JSON
✓ Page рендерится, Tldraw mount'ится, executor готов

Пример SSE ответа на "объясни 25+17 в столбик":
  data: {"type":"tool_use","id":"call_0","name":"draw_text",
         "input":{"x":300,"y":120,"text":"Сложение 25 + 17 в столбик:","fontSize":24}}
  data: {"type":"done","finish_reason":"tool_calls",
         "usage":{"prompt_tokens":847,"completion_tokens":39,...}}
```

> Note: «OpenAI gpt-4o возвращает» — это исторический снимок до переключения модели; сейчас актуальная модель gpt-4o-mini (см. constraints.md → CON-backend-libs).

---

## Topic: Что НЕ нужно делать (ловушки прошлых сессий)

- source: BOARD-STATUS.md

- ❌ **Не убирай `outputFileTracingRoot`** в next.config.ts — Next.js найдёт `~/package-lock.json` и сломается.
- ❌ **Не пытайся deep-import undici** из `'undici/lib/dispatcher/proxy-agent.js'` — путь валидный, но без `.d.ts` падает tsc, а добавлять `declare module` костыльно. Используем `createRequire`.
- ❌ **Не забывай fallback на `JSON.parse(e.arguments)`** в route.ts — `e.parsed_arguments` обычно null.
- ❌ **Не используй `richText` для arrow-шейпа** — там plain `text: string`. Тестировал, валится с runtime-ошибкой при `editor.createShape`.
- ❌ **Не предлагай юзеру курить логи Anthropic снова** — мы это уже разобрали, у него нет резидентского IP, и кроме CF Worker / российского proxy-reseller вариантов нет (а он не хочет с этим возиться). На OpenAI с туннелем всё работает.

---

## Topic: Потенциальные TODO (из BOARD-STATUS history)

- source: BOARD-STATUS.md

- **Снижение цены**: переключить `MODEL` в `route.ts` с `'gpt-4o'` на `'gpt-4o-mini'`. В 17× дешевле. (Note: вероятно уже сделано — BOARD-STACK.md актуально показывает `gpt-4o-mini` как текущую модель.)
- **TTS озвучка**: tool `say` сейчас просто пишет текст в правую панель. Дальше подключить Web Speech API (`speechSynthesis`) для бесплатной браузерной озвучки или OpenAI TTS endpoint для качественной. Логика — в `page.tsx`, при появлении нового narration выдавать `speechSynthesis.speak(new SpeechSynthesisUtterance(text))`.
- **Качество разметки**: System prompt в route.ts содержит детальный шаблон координат для столбикового сложения. Для других тем (вычитание, умножение, деление, дроби) надо дописывать аналогичные шаблоны или давать модели свободу.
- **Persistence**: `<Tldraw>` без `persistenceKey` — рисунок улетает на reload. Если надо сохранять — добавить `persistenceKey="ai-tutor-canvas"`.
- **Production deploy на Vercel**:
  - В env переменных Vercel прописать только `OPENAI_API_KEY` (без HTTPS_PROXY).
  - `instrumentation.ts` сам выключится (нет proxy var → no-op).
  - IP сервера Vercel в США/Европе → OpenAI пропускает.
  - Юзер из РФ открывает сайт без VPN → его IP виден только до Vercel, дальше Vercel сам делает запрос с американского IP.
- **Очистка**: проверить что `page.tsx` корректно убирает все шейпы по «Очистить доску» (включая отложенные `highlight_region` таймауты).
- **Anthropic comeback?**: с туннелем VPN, может, TLS-фингерпринт фильтр и не сработает (трафик идёт через US TUN, может быть там другой Cloudflare POP). Проверка одним curl-запросом из Node без прокси через api.anthropic.com. Если ответ 200 — можно вернуться, и тогда агент-цикл вообще не нужен (Anthropic делает всё в одном ответе → дешевле в 20×).

---

## Topic: Команды быстрого старта

- source: BOARD-STATUS.md

```powershell
# в твоей PowerShell
cd C:\Users\krato\ClaudeVibecoding\ClaudeDesktop\tldraw-test
npm run dev
# открой http://localhost:3000
```

```bash
# из Claude Code
PORT=3001 npm run dev   # чтобы не конфликтовать с юзерским процессом на 3000
```

---

## Topic: Контракт работы Claude Code в этом проекте

- source: VISION.md (§ Контракт работы с Claude Code)

При обсуждении любой новой задачи в проекте — **отталкивайся от VISION.md**, не от «стандартных» решений из тренинговых данных:

- Это **российский** рынок: учитывай ограничения с API, тестируй промпты на русском, проверяй чтобы LLM не сваливалась в английский в tool calls.
- Это **детская** аудитория: возрастная адаптация, безопасность, проактивность не опциональны.
- Это **продукт на продажу**, не open-source pet-project: смотри на unit-экономику, цену запроса, latency. Каждое архитектурное решение проходит проверку «выдержит ли это 100 одновременных уроков».
- **Голос + рисунок + текст одновременно** — главная фича. Любое решение, которое разрывает эту триаду — против духа продукта.
- При сомнениях — **спрашивай**, не предполагай. Кратов в курсе всех контекстов и решит быстрее.
- Прежде чем вкатывать большую переделку — читай BOARD-STATUS.md, там описаны граблищи прошлых сессий (особенно по сетке и tldraw v3 quirks).

---

## Topic: Глоссарий проекта

- source: VISION.md

- **Сцена** — высокоуровневый tool, объясняющий конкретный математический концепт через серию низкоуровневых вызовов с правильным timing'ом. Например, `explain_column_addition(358, 467)` — это ~30 шагов рисования + реплик.
- **Pedagogical LLM** — медленная стратегическая модель, следит за прогрессом урока и решает «что делать дальше» (Sonnet 4.6 / GPT-4o).
- **Realtime LLM** — быстрая модель в реальном времени голоса, исполняет решения Pedagogical (gpt-4o-mini / Haiku 4.5).
- **HTML-урок** — заранее сгенерированная персональная страница со структурой `data-` атрибутов и заданиями.
- **Доска** — интерактивный tldraw-канвас, на котором бот рисует live-объяснения.
- **Сцена > Макрос > Примитив** — три уровня абстракции tools у LLM. Бот предпочитает сцены, макросы — на гибкость, примитивы — fallback.

---

## Topic: Конкуренты и позиционирование

- source: VISION.md

- **Живые репетиторы**: 700–1500 ₽/час по 5 классу математики — основной анти-конкурент по цене и опыту.
- **Учи.ру, Алгоритмика**: текстово-заданийный edtech без голоса и live-объяснений.
- **Khanmigo**: бесплатный, англоязычный, без голоса, без своей доски — НЕ являемся клоном.
- **РЭШ, Я-класс**: предзаписанные видеоуроки — не могут адаптироваться под конкретную ошибку ребёнка.
- **Прямых конкурентов** в формате «голосовой AI с доской» в РФ на момент написания нет.
