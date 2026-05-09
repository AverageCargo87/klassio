# Контекст сессии — AI-учитель песочница

> Этот файл — снимок состояния проекта на конец сессии. Если ты — следующий Claude, открывший проект после `/clear`: прочти, и сразу будешь в курсе всего, что мы поняли и решили. **Не повторяй заново диагностику сетевых проблем — она ниже разобрана детально.**

Дата: 2026-05-09. Юзер: kratov.gr@gmail.com (Россия, Москва).

---

## Что это за проект

Прототип AI-учителя математики для 5 класса. Юзер пишет «объясни 245+345 в столбик», LLM возвращает поток tool calls (`draw_text`, `wait`, `highlight_region` и т.п.), фронт исполняет их через tldraw editor — на канвасе анимированно появляется объяснение. Видение продакшна: задеплоить на Vercel, встроить в существующий сайт юзера, школьники в РФ заходят без VPN, всё работает.

## Текущий стек (зафиксированные версии)

| Пакет | Версия | Зачем |
|---|---|---|
| `next` | ^15.5.18 | App Router, route handlers, instrumentation hook |
| `react` / `react-dom` | ^18.3.1 | Совместим с tldraw v3 |
| `tldraw` | ^3.15.6 (latest 3.x) | Канвас + Editor API |
| `openai` | ^6.37.0 | Chat completions streaming с tool calling |
| `undici` | ^8.x | ProxyAgent для HTTPS_PROXY (только в dev) |
| `tailwindcss` | ^4 | Стили (новый CSS-only синтаксис: `@import "tailwindcss"`) |
| `@tailwindcss/postcss` | ^4 | PostCSS плагин для v4 |
| `typescript` | ^5 | strict |

## Структура файлов (что делает каждый)

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
  tools.ts                  # 7 tool схем — provider-agnostic JSON Schema, без типов SDK.
                            # Адаптация под OpenAI делается в route.ts:
                            #   { type:'function', function: { name, description, parameters } }
  executor.ts               # 'use client'. executeToolCall(editor, name, params).
                            # Маппинг на tldraw v3 API. ВАЖНО (см. ниже):
                            #   - text shape: richText: toRichText(text)  (не plain text!)
                            #   - arrow shape: text: label  (plain string, НЕ richText!)
                            #   - line shape: points record с {id, index: 'a1' as IndexKey, x, y}
                            #   - geo для прямоугольника: geo:'rectangle', для круга: geo:'ellipse'
                            #   - highlight_region: fill:'semi', dash:'dashed', через setTimeout deleteShape
                            #   - wait: await new Promise(r => setTimeout(r, ms))
                            # Hex цвет из Claude/LLM маппится на ближайший из 12 tldraw цветов
                            # по евклидову расстоянию RGB.

instrumentation.ts          # Next.js hook, выполняется один раз при старте.
                            # Через createRequire(import.meta.url) грузит undici (минуя webpack)
                            # и вешает ProxyAgent на globalDispatcher если задан HTTPS_PROXY.
                            # БЕЗ HTTPS_PROXY — пишет в лог "fetch идёт напрямую" и ничего не делает.
                            # Это правильное поведение для VPN-туннеля и для продакшна.

next.config.ts              # outputFileTracingRoot: лочит workspace root (иначе Next.js находит
                            # ~/package-lock.json и считает рутом домашку юзера).
                            # serverExternalPackages: ['undici']
                            # webpack: маркирует все node:foo как 'commonjs node:foo' externals,
                            # иначе webpack не умеет читать node:console/node:crypto/node:module
                            # которые тянет undici, и валит компиляцию instrumentation.ts.

.env.local                  # OPENAI_API_KEY=sk-proj-... (реальный ключ юзера)
                            # Закомментирован старый ANTHROPIC_API_KEY на случай возврата.

.env.local.example          # OPENAI_API_KEY=sk-... (плейсхолдер)
README.md                   # Обновлён под OpenAI. ВАЖНОЕ: ChatGPT Plus ≠ API подписка.
```

## Архитектура агентского цикла + tool_choice (важное обновление!)

OpenAI Chat Completions при tool use **останавливается** после каждой пачки tool_calls и ждёт `role: 'tool'` результаты от клиента. Это не как у Anthropic, где модель может выдать 30 tool_use блоков в одном ответе. Поэтому в `route.ts` крутится агентский цикл:

```
for turn in 0..MAX_AGENT_TURNS (30):
  stream = chat.completions.stream({ messages, tools, tool_choice: 'required' })
  на каждый tool_calls.function.arguments.done — шлём SSE клиенту
  если tool.name === 'finish' — выходим из цикла
  иначе: messages.push(assistant_message); messages.push(...tool_results 'ok')
  следующая итерация
```

Ключевые элементы (НЕ удаляй):

- **`tool_choice: 'required'`** в запросе. Модель не имеет права отвечать обычным текстом — только tool calls. Без этого модель посреди объяснения говорит «Теперь сложим десятки» текстом и выходит на `finish_reason: 'stop'`, обрывая агент-цикл.
- **Tool `finish`** в `lib/tools.ts` — единственный легитимный способ для модели сказать «всё, готово». В route.ts при его вызове ставим `finishedExplicitly = true` и выходим. Не шлём `finish` клиенту как видимый шаг (его UI не должен отображать).
- **Tool `say`** — синхронная с рисованием реплика учителя. Не рисует на канвасе, попадает в narration log в `page.tsx`. Подготовка под будущую TTS озвучку.
- **`MAX_AGENT_TURNS = 30`** — если модель не вызвала `finish` за 30 раундов, обрываем. Этот лимит подобран эмпирически: модель часто батчит по ~1-2 тулов на ответ и для нормального объяснения столбикового сложения нужно ~20 раундов.

## Цена request

Один прогон «объясни 245+874» по полной программе (на gpt-4o):
- ~76k токенов input (агент-цикл re-отправляет растущую историю каждый раунд)
- ~1.2k токенов output
- **~$0.20 за один разбор** на gpt-4o.

Для продакшна:
- **Переключить модель на `gpt-4o-mini`** ($0.15/$0.60 за 1M) → ~$0.011 = в 17× дешевле. Меняется одной строкой `MODEL = 'gpt-4o-mini'` в `route.ts`.
- Альтернатива — попытаться вернуться на Anthropic с tunnel-режимом VPN. У Anthropic модель в одном ответе выдаёт все 25 tool_use, без round-trips → 3.5k токенов вместо 76k → ~$0.01. Но сначала надо подтвердить что TLS-фингерпринт фильтр в Cloudflare не сработает на трафике через TUN.

## Что подтверждено работающим (end-to-end)

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

## Сетевая ситуация юзера (САГА — не делай вид что не знаешь)

Юзер в Москве. У него есть **VPN-приложение типа Hiddify/sing-box client** (XRAY · VLESS · SINGBOX), сервер USA 32 в Майами. У клиента есть переключатель **Прокси / Туннель**:

- **Прокси-режим**: клиент слушает на 127.0.0.1:10801, приложения должны сами туда лезть. Curl читает `HTTPS_PROXY` env vars автоматически — Node нет (это сознательное поведение Node.js, не баг).
- **Туннель-режим**: TUN/TAP интерфейс, **весь** исходящий трафик системы идёт через VPN на сетевом уровне. Никаких env vars не надо.

Сейчас юзер переключился на **Туннель** → всё работает «из коробки», `instrumentation.ts` корректно ничего не делает.

**Не поднимай тему IP-блока Anthropic снова**, мы это разобрали:
- `api.anthropic.com` за Cloudflare фильтрует по **TLS-фингерпринту JA3/JA4**, не по IP. Curl/Schannel пропускает (системный TLS Windows), Node/OpenSSL — режет с `403 forbidden / "Request not allowed"`. Cf-ray POP `DME` (Москва) даже когда VPN включён — Cloudflare anycast роутит по сетевой топологии. Это **не лечится сменой VPN**, нужен прокси-слой (CF Worker / российский Anthropic-reseller).
- `api.openai.com` режет по **IP жёстко** через `unsupported_country_region_territory`. Никаких финт ушами нет — нужен IP не в стоп-листе. Туннель + американский VPN-сервер = решение.

Поэтому мы переехали с Anthropic на OpenAI: с туннелем достаточно одного IP-фикса, без TLS-возни.

## Tldraw v3 API quirks (выстраданное)

- `tldraw` барреля **не экспортирует `toRichText` в .d.ts** статически — но в рантайме он есть (через `export * from '@tldraw/editor'` → `@tldraw/tlschema`). Tsc и Node-import работают.
- **TextShape** требует `richText: TLRichText` (не `text: string`). Используем `toRichText(text)`.
- **ArrowShape** наоборот — `text: string` (plain), не `richText`! Структура `start: {x,y}`, `end: {x,y}`. У него ещё есть `kind: 'arc'|'elbow'` (новое в 3.15), но createShape с TLShapePartial его дефолтит сам.
- **LineShape**: `points: Record<string, TLLineShapePoint>` где каждая точка `{id, index: IndexKey, x, y}`. Используем `'a1' as IndexKey`, `'a2' as IndexKey` — валидные fractional indexes.
- Цвета — фиксированный enum: `black, grey, light-violet, violet, blue, light-blue, yellow, orange, green, light-green, light-red, red`. Никакого 'white' (точно нет в `TLDRAW_COLORS` константе executor.ts).
- Fill: `'none' | 'semi' | 'solid' | 'pattern'`. Для highlight используем `semi + dashed`.

## OpenAI v6 SDK quirks

- `client.chat.completions.stream(...)` возвращает `ChatCompletionStream extends EventEmitter`.
- Событие `'tool_calls.function.arguments.done'` шлёт `{name, index, arguments: string, parsed_arguments: unknown}`.
- **`parsed_arguments` обычно `null`** — оно заполняется только если SDK дали zod-схему через `parse:` опцию. Без схемы — fallback на `JSON.parse(arguments)` (что мы и делаем в route.ts).
- `stream_options: { include_usage: true }` — иначе в `final.usage` будет undefined.
- Tool format: `{ type: 'function', function: { name, description, parameters: <JSON Schema> } }`.

## Webpack / instrumentation gotcha

`undici` барреля (`from 'undici'`) импортит `node:console`, `node:crypto`, `node:module` и т.п. Webpack по умолчанию НЕ умеет читать `node:` URI scheme. Мы решили двумя путями одновременно (без одного из них валится):

1. В `instrumentation.ts` импортим undici через `createRequire(import.meta.url)('undici')` — webpack не статически анализирует createRequire, так что ничего не бандлится.
2. В `next.config.ts` всё равно ставим `serverExternalPackages: ['undici']` + кастомный webpack externals function, маркирующий все `node:*` как commonjs externals — на случай если что-то ещё попробует импортить undici или другие node:-зависимости.

**Не убирай эти конфиги** — они хрупкие, проверены, работают. Если решишь их «упростить» — сначала проверь что `instrumentation` компилируется без ошибок `UnhandledSchemeError`.

## История крупных решений (что и почему)

1. **Изначально** проект собран под Anthropic claude-sonnet-4-5-20250929 — провалился из-за TLS-фингерпринт фильтра в Cloudflare для РФ.
2. **Переехали** на OpenAI gpt-4o (`api.openai.com` не за Cloudflare, фильтрует только по IP).
3. **OpenAI тоже не работал** напрямую — оказалось, что у юзера VPN был в режиме «прокси» (через `HTTPS_PROXY`), и Node его не использовал. Curl работал, Node — нет.
4. **Добавили** `instrumentation.ts` с `setGlobalDispatcher(new ProxyAgent(...))`, чтобы Node-fetch уважал `HTTPS_PROXY`.
5. **Юзер переключил** VPN с «прокси» на «туннель» → теперь весь трафик идёт через TUN, env vars не нужны, instrumentation корректно no-op'ит.

## Что ещё может прийти в голову (потенциальные TODO)

- **Снижение цены**: переключить `MODEL` в `route.ts` с `'gpt-4o'` на `'gpt-4o-mini'`. В 17× дешевле. См. секцию «Цена request» выше.
- **TTS озвучка**: tool `say` сейчас просто пишет текст в правую панель. Дальше подключить Web Speech API (`speechSynthesis`) для бесплатной браузерной озвучки или OpenAI TTS endpoint для качественной. Логика — в `page.tsx`, при появлении нового narration выдавать `speechSynthesis.speak(new SpeechSynthesisUtterance(text))`.
- **Качество разметки**: System prompt в route.ts содержит детальный шаблон координат для столбикового сложения. Для других тем (вычитание, умножение, деление, дроби) надо дописывать аналогичные шаблоны или давать модели свободу.
- **Persistence**: `<Tldraw>` без `persistenceKey` — рисунок улетает на reload. Если надо сохранять — добавить `persistenceKey="ai-tutor-canvas"`.
- **Production deploy на Vercel**:
  - В env переменных Vercel прописать только `OPENAI_API_KEY` (без HTTPS_PROXY).
  - `instrumentation.ts` сам выключится (нет proxy var → no-op).
  - IP сервера Vercel в США/Европе → OpenAI пропускает.
  - Юзер из РФ открывает сайт без VPN → его IP виден только до Vercel, дальше Vercel сам делает запрос с американского IP.
- **Tldraw multi-instance warning** в dev — известный HMR баг tldraw, в production-build (`next build && next start`) пропадает. Игнорировать.
- **Очистка**: проверить что `page.tsx` корректно убирает все шейпы по «Очистить доску» (включая отложенные highlight_region таймауты).
- **Anthropic comeback?**: с туннелем VPN, может, TLS-фингерпринт фильтр и не сработает (трафик идёт через US TUN, может быть там другой Cloudflare POP). Проверка одним curl-запросом из Node без прокси через api.anthropic.com. Если ответ 200 — можно вернуться, и тогда агент-цикл вообще не нужен (Anthropic делает всё в одном ответе → дешевле в 20×).

## Что НЕ нужно делать (ловушки прошлой сессии)

- ❌ **Не убирай `outputFileTracingRoot`** в next.config.ts — Next.js найдёт `~/package-lock.json` и сломается.
- ❌ **Не пытайся deep-import undici** из `'undici/lib/dispatcher/proxy-agent.js'` — тот путь валидный, но без `.d.ts` падает tsc, а добавлять `declare module` костыльно. Используем `createRequire`.
- ❌ **Не забывай fallback на `JSON.parse(e.arguments)`** в route.ts — `e.parsed_arguments` обычно null.
- ❌ **Не используй `richText` для arrow-шейпа** — там plain `text: string`. Тестировал, валится с runtime-ошибкой при `editor.createShape`.
- ❌ **Не предлагай юзеру курить логи Anthropic снова** — мы это уже разобрали, у него нет резидентского IP, и кроме CF Worker / российского proxy-reseller вариантов нет (а он не хочет с этим возиться). На OpenAI с туннелем всё работает.

## Команды на быстрый старт

```powershell
# в твоей PowerShell
cd C:\Users\krato\ClaudeVibecoding\ClaudeDesktop\tldraw-test
npm run dev
# открой http://localhost:3000
```

```bash
# из Claude Code (как я запускал)
PORT=3001 npm run dev   # чтобы не конфликтовать с юзерским процессом на 3000
```

## Текущее состояние процессов на момент написания

- **Background task `brd4w0cpi`** — мой `npm run dev` на :3000 (этот тот, что юзер тестирует). Запущен после переключения VPN на туннель. Если нужно — `TaskStop brd4w0cpi`.
- Юзер в браузере, готов тестить кнопкой «Нарисовать».
