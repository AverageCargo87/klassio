# AI-учитель математики — технический стек

> Документ для интеграции в более широкую систему (голос + сайт + БД + остальное).
> Описывает один компонент — анимированную AI-доску, которая отрисовывает математические объяснения в ответ на текстовый промпт.

---

## Что это

Юзер даёт текстовый запрос («объясни сложение 245 + 874 в столбик») → бэкенд через function calling LLM получает **серию команд рисования** → клиент анимированно рендерит их на tldraw-канвасе с синхронными репликами учителя в боковой панели.

Не текст с картинками. Не предзаписанные анимации. Каждый разбор генерится моделью с нуля под конкретные числа/формулу.

```
[ Браузер ]                       [ Backend ]                  [ LLM ]
Next.js + React + tldraw        /api/draw (Node)            gpt-4o-mini
       ▲                              ▲
       │  text/event-stream           │  HTTPS
       └──────────  SSE  ◄────────────┘  function calling
                  ┌──────────┐
   Каждое событие │ tool_use │  →  клиент исполняет: editor.createShape(...)
                  │ text     │  →  показывает в панели
                  │ done     │  →  закрытие стрима
                  │ error    │  →  показывает ошибку
                  └──────────┘
```

---

## Стек (строго фиксированные версии)

### Runtime
| Что | Версия | Почему |
|---|---|---|
| Node.js | ≥ 20 (тестировано на 24.13.0) | `node:` URI imports, нативный fetch (Undici) |
| Next.js | ^15.5.18 (App Router) | НЕ Pages router. App Router нужен для streaming response из route handlers |
| React | ^18.3.1 | НЕ 19. tldraw v3 рассчитан на React 18 |
| TypeScript | ^5 | strict mode |
| Tailwind | ^4 | новый CSS-only синтаксис `@import "tailwindcss"` |

### Frontend
- `tldraw@^3.15.6` (последняя 3.x; в 4.x ломается API) — программируемый канвас через `editor.createShape({...})`
- Грузится через `next/dynamic({ ssr: false })` — иначе валится на `window`/`document` в SSR

### Backend / LLM
- `openai@^6.37.0` — Chat Completions streaming + function calling
- Текущая модель: **`gpt-4o-mini`** (одна строка `const MODEL = ...` в `app/api/draw/route.ts`)
- Архитектура совместима с любой OpenAI-совместимой моделью: gpt-4o, gpt-4.1, gpt-5, DeepSeek-V3, Llama (через Groq/Together), Mistral. Достаточно поменять `baseURL` в `new OpenAI({...})` и `MODEL`. Требование одно — поддержка function calling.

### Опционально (для dev в регионах с ограниченным доступом к OpenAI/Anthropic)
- `undici@^8.x` — для `ProxyAgent` через `instrumentation.ts`. **В проде на Vercel/AWS не нужен.**

### Полный package.json (dependencies)
```json
{
  "@anthropic-ai/sdk": null,         // удалён, оставлен в истории git как fallback
  "next": "^15.5.18",
  "openai": "^6.37.0",
  "react": "^18.3.1",
  "react-dom": "^18.3.1",
  "tldraw": "^3.15.6",
  "undici": "^8.2.0"
}
```

---

## Структура проекта

```
app/
  layout.tsx                # html/body, lang="ru"
  page.tsx                  # UI прототипа: канвас 70% + панель промпта 30%
                            #   — можно полностью заменить своим UI
  globals.css               # Tailwind v4
  api/draw/route.ts         # ОСНОВНОЙ API endpoint, читай его если интегрируешь

lib/
  tools.ts                  # 9 tool-схем (provider-agnostic JSON Schema)
  executor.ts               # client-side: tool_call → editor.createShape(...)
                            #   — реиспользуется для своего UI

instrumentation.ts          # Hook Next.js, ставит ProxyAgent для fetch если задан
                            # HTTPS_PROXY (для dev в РФ за прокси-VPN)
                            # В проде на Vercel переменная не задана → no-op

next.config.ts              # outputFileTracingRoot, serverExternalPackages: ['undici'],
                            # webpack externals для node:* URIs

.env.local                  # OPENAI_API_KEY=sk-proj-...
```

---

## API контракт `/api/draw`

### Request
```http
POST /api/draw
Content-Type: application/json

{
  "prompt": "объясни сложение 245 + 874 в столбик"
}
```

### Response: `Content-Type: text/event-stream`

Server-sent events, каждое событие — одна строка `data: {JSON}\n\n`. Типы payload'а:

```typescript
type DrawEvent =
  // 1. Команда рисования / реплика — клиент должен исполнить через executor
  | {
      type: 'tool_use'
      id: string                   // уникальный 't{turn}_{index}', напр. 't3_2'
      name:
        | 'draw_text'
        | 'draw_rectangle'
        | 'draw_line'
        | 'draw_circle'
        | 'draw_arrow'
        | 'highlight_region'
        | 'wait'
        | 'say'
      input: Record<string, unknown>   // shape зависит от name, см. ниже
    }

  // 2. Свободный текст модели (редко, обычно вместо этого приходит say)
  | { type: 'text'; text: string }

  // 3. Ошибка от провайдера или сервера
  | { type: 'error'; error: string }

  // 4. Конец стрима — обязательно последнее событие
  | {
      type: 'done'
      finish_reason: 'finished' | 'max_turns' | 'stop' | 'length' | string
      usage: {
        prompt_tokens: number
        completion_tokens: number
        total_tokens: number
      }
    }
```

`finish` (служебный tool, см. ниже) клиенту НЕ присылается — он только сигнал на бэкенде.

### Пример клиентского чтения SSE

```typescript
const res = await fetch('/api/draw', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ prompt }),
})
const reader = res.body!.getReader()
const decoder = new TextDecoder()
let buffer = ''

while (true) {
  const { done, value } = await reader.read()
  if (done) break
  buffer += decoder.decode(value, { stream: true })
  let sep
  while ((sep = buffer.indexOf('\n\n')) !== -1) {
    const chunk = buffer.slice(0, sep)
    buffer = buffer.slice(sep + 2)
    const dataLine = chunk.split('\n').find((l) => l.startsWith('data: '))
    if (!dataLine) continue
    const evt = JSON.parse(dataLine.slice(6))
    handleEvent(evt)   // твоя логика
  }
}
```

---

## 9 tools, которые получает LLM

Полные JSON Schema'ы — в `lib/tools.ts`. Кратко:

| Tool | Параметры | Что делает |
|---|---|---|
| `draw_text` | `x, y, text, fontSize?, color?, bold?` | Рисует текст. Цифры в `text` появляются по одной (stagger) если строка чисто числовая |
| `draw_rectangle` | `x, y, w, h, fill?, stroke?` | Прямоугольник |
| `draw_line` | `x1, y1, x2, y2, stroke?, strokeWidth?` | Линия |
| `draw_circle` | `x, y, radius, fill?, stroke?` | Круг (эллипс) |
| `draw_arrow` | `x1, y1, x2, y2, label?` | Стрелка с опциональной меткой |
| `highlight_region` | `x, y, w, h, color, duration_ms` | Временная пунктирная рамка с auto-удалением через duration_ms |
| `wait` | `ms` | Пауза между шагами для эффекта анимации (используется реально на клиенте) |
| `say` | `text` | Реплика учителя — НЕ рисует, шлётся в панель «Объяснение учителя». Под TTS-озвучку в будущем |
| `finish` | — | Служебный — сигнал «объяснение завершено». На клиент не уходит |

Координаты — пиксели tldraw-канваса. (0,0) = левый верх. Видимая область ~800×600. Центр ~ (400, 300).

---

## Что делает executor (client-side)

`lib/executor.ts` экспортирует одну функцию:

```typescript
async function executeToolCall(
  editor: Editor,           // tldraw Editor instance, полученный из <Tldraw onMount={editor => ...} />
  name: string,             // имя tool из SSE
  input: Record<string, unknown>
): Promise<{ ok: boolean; note?: string }>
```

Внутри — `switch` по name, с маппингом на `editor.createShape({...})`. Можно полностью реиспользовать в любом своём UI: импортируй, держи editor через ref, передай каждое `tool_use` сюда.

Особенности:
- **Fade-in анимация** — все шейпы создаются с `opacity: 0` и плавно проявляются за 900мс (ease-out cubic) через `requestAnimationFrame`. Fire-and-forget, не блокирует.
- **Stagger цифр** — для `draw_text` с чисто числовыми строками (`"2 4 5"`, `"245"`, `"1 1 1 9"`) каждая цифра рендерится отдельным шейпом с задержкой 280мс. Слова и операторы (`"+"`, `"5 + 4 = 9"`, `"Сложение"`) — одним шейпом.
- **Highlight без заливки** — пунктирная рамка с opacity 0.65, чтобы не перекрывать содержимое.
- **Цвета** — tldraw v3 поддерживает фиксированную палитру (`black, grey, light-violet, violet, blue, light-blue, yellow, orange, green, light-green, light-red, red`). Hex-цвета от модели маппятся на ближайший по евклидову расстоянию RGB.
- **Wait** — реально `await new Promise(r => setTimeout(r, ms))`, тормозит цикл обработки SSE. Поэтому шейпы появляются с паузами как в анимации.

---

## Архитектурные решения (важно для интеграции)

### 1. Function calling вместо текстовых JSON-протоколов

Модель НЕ пишет «нарисуй число 245» текстом, который мы потом парсим. Она формально вызывает tool с типизированной схемой. Преимущества: SDK сам валидирует, парсит, стримит deltas → нам приходит готовый JSON-объект.

### 2. Агентский цикл

OpenAI Chat Completions после пачки tool_calls **останавливается** — ждёт `role: 'tool'` ответа. У нас tools fire-and-forget (рисуем на канвасе, ничего полезного не возвращаем) → подсовываем модели фейковое `"ok"` и просим продолжать. Цикл крутится 5–15 раундов пока модель не вызовет `finish`.

```typescript
// упрощённо, см. app/api/draw/route.ts
const messages = [system, user]
for (let turn = 0; turn < 30; turn++) {
  const stream = openai.chat.completions.stream({
    model, messages, tools,
    tool_choice: 'required',
    stream_options: { include_usage: true },
  })
  stream.on('tool_calls.function.arguments.done', (e) => {
    if (e.name === 'finish') { finishedExplicitly = true; return }
    sendSSE({ type: 'tool_use', name: e.name, input: e.parsed_arguments ?? JSON.parse(e.arguments) })
  })
  const final = await stream.finalChatCompletion()
  if (finishedExplicitly) break
  messages.push(final.choices[0].message)
  for (const tc of final.choices[0].message.tool_calls ?? []) {
    messages.push({ role: 'tool', tool_call_id: tc.id, content: 'ok' })
  }
}
```

**Важно про другие SDK:** Anthropic умеет в одном ответе выдать всю серию tool_use без round-trips (3-5к токенов вместо 75к на OpenAI gpt-4o, или 14к на gpt-4o-mini). Если переезжаешь на Anthropic — агент-цикл не нужен, переписывается под `messages.stream()` + `messageStream.on('contentBlock')`.

### 3. `tool_choice: 'required'` + tool `finish`

Без этого модель в середине объяснения вместо tool_calls могла ответить обычным текстом «Теперь сложим десятки» и зависнуть ждать юзера, что обрывало agent-loop. С `tool_choice: 'required'` модели физически запрещено отвечать текстом — она обязана вызывать tools. Чтобы сообщить «всё готово», есть отдельный служебный tool `finish` с пустыми params.

### 4. SSE стрим, не JSON-ответ

Каждый завершённый tool call идёт клиенту немедленно — пользователь видит как разбор «появляется» в реальном времени. Без SSE пришлось бы ждать всё объяснение (~30-60 сек) до первого пикселя на доске.

### 5. tldraw v3 как программный канвас

Не пишем SVG руками. `editor.createShape({type: 'text', x, y, props: {richText: toRichText(text), color, size, font, ...}})` — типизированный API. Главные quirks tldraw v3, которые нужно знать:
- **Text shape**: `richText: TLRichText` (не `text: string`). Используй helper `toRichText('hello')`.
- **Arrow shape**: НАОБОРОТ — `text: string` (plain), а не richText.
- **Line shape**: `points` — это `Record<string, {id, index: IndexKey, x, y}>`. Используй индексы `'a1' as IndexKey`, `'a2' as IndexKey` (валидные fractional indexes).
- **Geo shape**: тип `'geo'` с `props.geo: 'rectangle' | 'ellipse' | ...` определяет форму.
- **Цвета** — фиксированный enum (см. выше). Произвольный hex не поддерживается. Маппинг — в `lib/executor.ts`.

---

## Окружение и переменные

```bash
OPENAI_API_KEY=sk-proj-...              # обязательно
HTTPS_PROXY=http://127.0.0.1:10801      # опционально (только dev в РФ)
HTTP_PROXY=http://127.0.0.1:10801       # опционально (только dev в РФ)
```

**Подводный камень с .env.local в Next.js**: переменные ОС-окружения **перекрывают** `.env.local`. Если в шелле уже задан `OPENAI_API_KEY=` (пусто), `.env.local` игнорируется. Перед `npm run dev` проверяй `echo "[$env:OPENAI_API_KEY]"` (PowerShell) или `echo "[$OPENAI_API_KEY]"` (bash).

---

## Сетевые особенности (важно для дев-окружения в РФ)

### OpenAI API

`api.openai.com` блокирует запросы с российских IP с ошибкой `403 unsupported_country_region_territory`. Решается:
- **VPN на уровне TUN/системного туннеля** — все исходящие пакеты системы уходят через VPN. Работает прозрачно для Node.js.
- **Локальный HTTP-прокси (Clash/V2Ray/sing-box) с `HTTPS_PROXY`** — Node.js по умолчанию НЕ читает HTTPS_PROXY env vars. Поэтому в `instrumentation.ts` есть hook, который через `createRequire('undici').setGlobalDispatcher(new ProxyAgent(...))` направляет global fetch через прокси. На Vercel переменная не задана → hook no-op'ит.

### Anthropic API (если решишь использовать)

`api.anthropic.com` за Cloudflare режет по **TLS-фингерпринту JA3/JA4** для российских IP. Curl/Schannel пропускает (системный TLS), Node/OpenSSL блокируется с `403 forbidden / Request not allowed`. Это **не лечится** простой сменой IP — нужен или TUN-VPN с US-выходом, или CF Worker proxy между бэкендом и Anthropic, или российский Anthropic-reseller. На прод-сервере вне РФ проблемы нет.

### Webpack + node: URIs

`undici` (нужен для ProxyAgent) импортит `node:console`/`node:crypto`/`node:module`. Webpack по умолчанию не пропускает `node:` scheme. В `next.config.ts` маркируем все `node:*` как commonjs externals и `serverExternalPackages: ['undici']`. Плюс в `instrumentation.ts` грузим undici через `createRequire(import.meta.url)` чтобы webpack его статически не анализировал.

---

## Production deployment (Vercel)

```bash
# Vercel env vars:
OPENAI_API_KEY=sk-proj-...
# HTTPS_PROXY НЕ ставить — instrumentation.ts сам отключится
```

После деплоя:
- Сервер на Vercel → IP США/Европы → OpenAI пропускает
- РФ-юзер открывает сайт → его IP виден только до Vercel → дальше Vercel сам ходит к OpenAI с американского IP
- Юзеру **VPN не нужен**. Это и есть архитектурное решение для российской аудитории без танцев на стороне клиента.

Аналогично — Railway, AWS, Fly.io, любой нероссийский хостинг.

---

## Стоимость на текущей конфигурации

`gpt-4o-mini`, разбор столбикового сложения трёхзначных чисел:
- prompt_tokens: ~14k (агент-цикл re-отправляет историю каждый раунд)
- completion_tokens: ~1k
- **~$0.0027 = 0.27¢ ≈ 22 копейки за разбор**

| Объём | Цена |
|---|---|
| 1 000 разборов / день | ~660 ₽/мес |
| 10 000 разборов / день | ~6 600 ₽/мес |

Если переключиться на `gpt-4o` (одной строкой): ~$0.20 за разбор. На `gpt-5-nano` или `DeepSeek-V3` — ~$0.003-0.005.

---

## Точки расширения

### Сменить модель/провайдера

В `app/api/draw/route.ts`:
```typescript
const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
  baseURL: 'https://openrouter.ai/api/v1',  // или api.deepseek.com, api.groq.com и т.п.
})
const MODEL = 'anthropic/claude-3.5-sonnet'  // или любая модель провайдера
```

Требование к модели — поддержка function calling. Без неё агент-цикл не работает.

### Добавить новый tool

1. В `lib/tools.ts` — JSON-схема с `name`, `description`, `parameters`.
2. В `lib/executor.ts` — case в switch с маппингом на действие (editor API, или просто `return { ok: true }` если tool «бесплотный» как `say`).
3. В `app/api/draw/route.ts` system prompt — упомянуть когда вызывать новый tool.

### Расширить темы (вычитание, дроби, геометрия)

Главный рычаг — **system prompt** в `app/api/draw/route.ts`. Текущий содержит детальный шаблон только для столбикового сложения. Для других тем:
- Дописать аналогичные шаблоны с конкретными координатами/шагами;
- Или дать модели свободу с общими правилами layout'а;
- Можно держать **разные system prompts** и роутить по теме промпта (parser в начале route handler).

### Голосовой ввод/вывод

Архитектурно `say` tool уже отделён под это. Минимальная имплементация:
- **Ввод**: `webkitSpeechRecognition`, кнопка-микрофон → текст в textarea
- **Вывод**: на каждый event `tool_use.name === 'say'` вызывать `speechSynthesis.speak(new SpeechSynthesisUtterance(input.text))`

Для качества голоса (продакшн) — заменить browser TTS на OpenAI TTS API (`/v1/audio/speech`) или ElevenLabs. Бэкенд получает текст, отдаёт mp3/opus, клиент проигрывает синхронно с draw'ами.

### Persistence

`<Tldraw>` без `persistenceKey` — рисунок улетает на reload. Если нужно сохранять — добавить `persistenceKey="some-key"`. Или сериализовать через `editor.store.getStoreSnapshot()` в свою БД.

Для логов разборов (input prompt, выходные SSE, цена) — простой middleware в route handler с записью в БД.

---

## Известные мелочи

- **Tldraw multi-instance warning** в dev mode — известный HMR-баг tldraw, в `next build && next start` не воспроизводится. Игнорировать.
- **ChatGPT Plus ≠ OpenAI API**. Это разные биллинги. Plus даёт chat.openai.com, а API нужно отдельно через https://platform.openai.com (положить кредит на счёт).
- **Tldraw v3 vs v4**: API заметно меняется в v4. Закрепляйся на v3.x.
- **React 19**: tldraw v3 не тестировался под React 19. Стабильнее держать React 18.

---

## Контракт интеграции (TL;DR для другого Claude)

Если другой компонент (твой сайт/голос/БД) хочет использовать эту доску:

1. **Установить deps** — `next ^15.5.18`, `react ^18.3.1`, `tldraw ^3.15.6`, `openai ^6.37.0`, `undici ^8.x` (опц.).
2. **Скопировать файлы** — `app/api/draw/route.ts`, `lib/tools.ts`, `lib/executor.ts`, `instrumentation.ts`, `next.config.ts`.
3. **Поставить env**: `OPENAI_API_KEY=sk-...`.
4. **Использовать API**: `POST /api/draw` с `{prompt}` → парсить SSE.
5. **Рендерить в свой UI**: `<Tldraw onMount={e => editorRef.current = e} />` + `executeToolCall(editor, name, input)` на каждом `tool_use` событии.
6. **Стилизовать панель «учитель говорит»** — это просто `setState((prev) => [...prev, text])` на `name === 'say'`.

Файлы `app/page.tsx`, `app/layout.tsx`, `app/globals.css` — пример UI, под свой сайт можно полностью заменить.
