# Constraints Intel

> Technical constraints extracted from ingested SPECs.
> Synthesized by `gsd-doc-synthesizer` on 2026-05-09.
> Source SPECs: BOARD-STACK.md (manifest_override: SPEC).

---

## CON-runtime-versions — Зафиксированные версии runtime
- source: BOARD-STACK.md
- type: nfr (technical stack pinning)
- content:
  - **Node.js**: ≥ 20 (тестировано на 24.13.0). Нужно для `node:` URI imports и нативного fetch (Undici).
  - **Next.js**: ^15.5.18 (App Router). НЕ Pages router. App Router нужен для streaming response из route handlers.
  - **React / React-DOM**: ^18.3.1. НЕ 19. tldraw v3 рассчитан на React 18.
  - **TypeScript**: ^5, strict mode.
  - **Tailwind**: ^4 (новый CSS-only синтаксис `@import "tailwindcss"`).
  - **`@tailwindcss/postcss`**: ^4 (PostCSS плагин для v4).
- rationale: Любое отклонение от этих версий ломает совместимость с tldraw v3 quirks или Webpack/instrumentation hooks. См. CON-tldraw-version и CON-webpack-undici.

---

## CON-frontend-libs — Frontend dependencies (фиксированные версии)
- source: BOARD-STACK.md
- type: nfr (dependency pinning)
- content:
  - **`tldraw@^3.15.6`** (последняя 3.x; в 4.x ломается API) — программируемый канвас через `editor.createShape({...})`.
  - **Грузится через `next/dynamic({ ssr: false })`** — иначе валится на `window`/`document` в SSR.

---

## CON-backend-libs — Backend / LLM dependencies
- source: BOARD-STACK.md
- type: nfr (dependency pinning)
- content:
  - **`openai@^6.37.0`** — Chat Completions streaming + function calling.
  - **Текущая модель**: `gpt-4o-mini` (одна строка `const MODEL = ...` в `app/api/draw/route.ts`).
  - **Архитектура совместима с любой OpenAI-совместимой моделью**: gpt-4o, gpt-4.1, gpt-5, DeepSeek-V3, Llama (через Groq/Together), Mistral. Достаточно поменять `baseURL` в `new OpenAI({...})` и `MODEL`. Требование одно — поддержка function calling.
  - **`undici@^8.x`** — для `ProxyAgent` через `instrumentation.ts`. **В проде на Vercel/AWS не нужен.** Опционально для dev в регионах с ограниченным доступом.

---

## CON-package-json — Полный pinned `dependencies` блок
- source: BOARD-STACK.md
- type: schema (package.json contract)
- content:
```json
{
  "@anthropic-ai/sdk": null,
  "next": "^15.5.18",
  "openai": "^6.37.0",
  "react": "^18.3.1",
  "react-dom": "^18.3.1",
  "tldraw": "^3.15.6",
  "undici": "^8.2.0"
}
```
- note: `@anthropic-ai/sdk` удалён из dependencies, оставлен в истории git как fallback. См. CON-anthropic-rf-block.

---

## CON-api-draw-contract — `/api/draw` SSE endpoint contract
- source: BOARD-STACK.md
- type: api-contract
- content:

**Request:**
```http
POST /api/draw
Content-Type: application/json

{
  "prompt": "объясни сложение 245 + 874 в столбик"
}
```

**Response:** `Content-Type: text/event-stream`. Server-sent events, каждое событие — одна строка `data: {JSON}\n\n`. Типы payload:

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
      input: Record<string, unknown>   // shape зависит от name
    }
  // 2. Свободный текст модели (редко)
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

- note: `finish` (служебный tool) клиенту НЕ присылается — он только сигнал на бэкенде.

---

## CON-tools-spec — 9 LLM tool схем (provider-agnostic JSON Schema)
- source: BOARD-STACK.md
- type: api-contract (LLM tool definitions)
- content:

| Tool | Параметры | Что делает |
|---|---|---|
| `draw_text` | `x, y, text, fontSize?, color?, bold?` | Рисует текст. Цифры в `text` появляются по одной (stagger) если строка чисто числовая. |
| `draw_rectangle` | `x, y, w, h, fill?, stroke?` | Прямоугольник. |
| `draw_line` | `x1, y1, x2, y2, stroke?, strokeWidth?` | Линия. |
| `draw_circle` | `x, y, radius, fill?, stroke?` | Круг (эллипс). |
| `draw_arrow` | `x1, y1, x2, y2, label?` | Стрелка с опциональной меткой. |
| `highlight_region` | `x, y, w, h, color, duration_ms` | Временная пунктирная рамка с auto-удалением через duration_ms. |
| `wait` | `ms` | Пауза между шагами для эффекта анимации. |
| `say` | `text` | Реплика учителя — НЕ рисует, шлётся в панель «Объяснение учителя». Под TTS-озвучку в будущем. |
| `finish` | — | Служебный — сигнал «объяснение завершено». На клиент не уходит. |

- note: Координаты — пиксели tldraw-канваса. (0,0) = левый верх. Видимая область ~800×600. Центр ~ (400, 300). Полные JSON Schema'ы — в `lib/tools.ts`.

---

## CON-executor-contract — Client-side `executeToolCall` interface
- source: BOARD-STACK.md
- type: api-contract (client-side library interface)
- content:

```typescript
async function executeToolCall(
  editor: Editor,           // tldraw Editor instance
  name: string,             // имя tool из SSE
  input: Record<string, unknown>
): Promise<{ ok: boolean; note?: string }>
```

Особенности executor'а:
- **Fade-in анимация** — все шейпы создаются с `opacity: 0` и плавно проявляются за 900мс (ease-out cubic) через `requestAnimationFrame`.
- **Stagger цифр** — для `draw_text` с чисто числовыми строками (`"2 4 5"`, `"245"`, `"1 1 1 9"`) каждая цифра рендерится отдельным шейпом с задержкой 280мс. Слова и операторы — одним шейпом.
- **Highlight без заливки** — пунктирная рамка с opacity 0.65.
- **Цвета** — tldraw v3 поддерживает фиксированную палитру. Hex-цвета от модели маппятся на ближайший по евклидову расстоянию RGB. См. CON-tldraw-colors.
- **Wait** — реально `await new Promise(r => setTimeout(r, ms))`, тормозит цикл обработки SSE.

---

## CON-tldraw-colors — tldraw v3 фиксированная палитра цветов
- source: BOARD-STACK.md, BOARD-STATUS.md
- type: schema (color enum)
- content:
  - Допустимые значения: `black, grey, light-violet, violet, blue, light-blue, yellow, orange, green, light-green, light-red, red`.
  - Произвольный hex не поддерживается — маппинг на ближайший по RGB евклидову расстоянию в `lib/executor.ts`.
  - **Никакого `'white'`** в `TLDRAW_COLORS` константе.
  - Fill: `'none' | 'semi' | 'solid' | 'pattern'`. Для highlight используем `semi + dashed`.

---

## CON-tldraw-shape-quirks — Tldraw v3 createShape API quirks
- source: BOARD-STACK.md, BOARD-STATUS.md
- type: api-contract (tldraw v3 shape props)
- content:
  - **TextShape**: `richText: TLRichText` (НЕ `text: string`). Используй helper `toRichText(text)` из tldraw barrel (есть в рантайме, в .d.ts не экспортирован — но tsc и Node-import работают).
  - **ArrowShape**: НАОБОРОТ — `text: string` (plain), а не richText. Структура `start: {x,y}`, `end: {x,y}`. Есть поле `kind: 'arc'|'elbow'` (новое в 3.15), createShape с TLShapePartial его дефолтит сам.
  - **LineShape**: `points: Record<string, TLLineShapePoint>` где каждая точка `{id, index: IndexKey, x, y}`. Используй `'a1' as IndexKey`, `'a2' as IndexKey` — валидные fractional indexes.
  - **GeoShape**: тип `'geo'` с `props.geo: 'rectangle' | 'ellipse' | ...` определяет форму.
  - **Highlight_region**: `fill:'semi', dash:'dashed'`, через setTimeout deleteShape.
- note: Эти detail точно проверены, при отступлении валится с runtime-ошибкой при `editor.createShape`.

---

## CON-agent-loop — Агентский цикл и `tool_choice: 'required'`
- source: BOARD-STACK.md, BOARD-STATUS.md
- type: protocol (LLM interaction loop)
- content:

OpenAI Chat Completions при tool use **останавливается** после каждой пачки tool_calls и ждёт `role: 'tool'` результаты. Поэтому в `route.ts` крутится агентский цикл:

```typescript
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

Ключевые элементы (НЕ удаляй):
- **`tool_choice: 'required'`** — модель не имеет права отвечать обычным текстом, только tool calls. Без этого модель в середине объяснения отвечает текстом «Теперь сложим десятки» и обрывает agent-loop.
- **Tool `finish`** — единственный легитимный способ для модели сказать «всё готово». При его вызове `finishedExplicitly = true` и выходим. Не шлём `finish` клиенту.
- **`MAX_AGENT_TURNS = 30`** — если модель не вызвала `finish` за 30 раундов, обрываем. Подобран эмпирически: модель часто батчит ~1-2 тулов на ответ, для столбикового сложения нужно ~20 раундов.

---

## CON-openai-sdk-quirks — OpenAI v6 SDK особенности
- source: BOARD-STATUS.md
- type: api-contract (SDK behavior)
- content:
  - `client.chat.completions.stream(...)` возвращает `ChatCompletionStream extends EventEmitter`.
  - Событие `'tool_calls.function.arguments.done'` шлёт `{name, index, arguments: string, parsed_arguments: unknown}`.
  - **`parsed_arguments` обычно `null`** — оно заполняется только если SDK дали zod-схему через `parse:` опцию. Без схемы — обязательный fallback на `JSON.parse(arguments)` (это и делается в route.ts).
  - `stream_options: { include_usage: true }` — иначе в `final.usage` будет undefined.
  - Tool format для OpenAI: `{ type: 'function', function: { name, description, parameters: <JSON Schema> } }`.

---

## CON-openai-rf-block — OpenAI API IP-блокировка из РФ
- source: BOARD-STACK.md, BOARD-STATUS.md
- type: nfr (network/geo constraint)
- content:
  - `api.openai.com` блокирует запросы с российских IP с ошибкой `403 unsupported_country_region_territory`. Режет по **IP жёстко**.
  - Решения:
    - **Dev**: VPN на уровне TUN/системного туннеля — все исходящие пакеты системы уходят через VPN. Работает прозрачно для Node.js.
    - **Dev (альтернатива)**: локальный HTTP-прокси (Clash/V2Ray/sing-box) с `HTTPS_PROXY`. Node.js по умолчанию НЕ читает HTTPS_PROXY env vars — нужен `instrumentation.ts` с `setGlobalDispatcher(new ProxyAgent(...))`.
    - **Prod**: backend на нероссийском хостинге (Vercel/Railway/AWS/Fly.io). Юзер открывает сайт без VPN — его IP виден только до Vercel, дальше Vercel сам ходит к OpenAI с американского IP.
  - **Подводный камень с .env.local в Next.js**: переменные ОС-окружения **перекрывают** `.env.local`. Если в шелле уже задан `OPENAI_API_KEY=` (пусто), `.env.local` игнорируется. Перед `npm run dev` проверяй `echo "[$env:OPENAI_API_KEY]"` (PowerShell).

---

## CON-anthropic-rf-block — Anthropic API TLS-фингерпринт блокировка из РФ
- source: BOARD-STACK.md, BOARD-STATUS.md
- type: nfr (network/geo constraint)
- content:
  - `api.anthropic.com` за Cloudflare режет по **TLS-фингерпринту JA3/JA4** для российских IP, не по IP.
  - Curl/Schannel пропускает (системный TLS Windows), Node/OpenSSL блокируется с `403 forbidden / "Request not allowed"`.
  - **Это НЕ лечится простой сменой IP** — Cloudflare anycast роутит по сетевой топологии, cf-ray POP `DME` (Москва) даже когда VPN включён.
  - Возможные решения:
    - TUN-VPN с US-выходом (может сработать — нужна проверка curl-запросом из Node без прокси).
    - CF Worker proxy между бэкендом и Anthropic.
    - Российский Anthropic-reseller.
  - На прод-сервере **вне РФ** проблемы нет.
  - **Текущее решение**: Anthropic избегаем, остаёмся на OpenAI. Anthropic SDK удалён из dependencies, оставлен в истории git как fallback.

---

## CON-webpack-undici — Webpack + node: URI scheme + undici
- source: BOARD-STACK.md, BOARD-STATUS.md
- type: nfr (build-tool constraint)
- content:
  - `undici` импортит `node:console`, `node:crypto`, `node:module`. Webpack по умолчанию НЕ умеет читать `node:` URI scheme.
  - Решение в **двух местах одновременно** (без любого из них валится):
    1. В `instrumentation.ts` грузим undici через `createRequire(import.meta.url)('undici')` — webpack не статически анализирует createRequire, ничего не бандлится.
    2. В `next.config.ts`: `serverExternalPackages: ['undici']` + кастомный webpack externals function, маркирующий все `node:*` как commonjs externals.
  - **НЕ убирай эти конфиги** — они хрупкие, проверены, работают. При «упрощении» сначала проверь что `instrumentation` компилируется без `UnhandledSchemeError`.

---

## CON-nextjs-tracing-root — `outputFileTracingRoot` обязателен
- source: BOARD-STATUS.md
- type: nfr (Next.js config)
- content:
  - В `next.config.ts` обязательно установлен `outputFileTracingRoot: <workspace root>` — иначе Next.js находит `~/package-lock.json` и считает рутом домашку юзера (это выбивает build).
  - **НЕ убирай `outputFileTracingRoot`** — Next.js найдёт `~/package-lock.json` и сломается.

---

## CON-environment-vars — Обязательные и опциональные env vars
- source: BOARD-STACK.md
- type: schema (environment configuration)
- content:
```bash
OPENAI_API_KEY=sk-proj-...              # обязательно
HTTPS_PROXY=http://127.0.0.1:10801      # опционально (только dev в РФ через прокси-режим VPN)
HTTP_PROXY=http://127.0.0.1:10801       # опционально (только dev в РФ)
```
- note: На Vercel прод — задаётся ТОЛЬКО `OPENAI_API_KEY`. `HTTPS_PROXY` НЕ ставить — `instrumentation.ts` сам отключится (нет proxy var → no-op).

---

## CON-prod-deploy-vercel — Production deployment контракт
- source: BOARD-STACK.md
- type: protocol (deployment topology)
- content:
  - Сервер на Vercel → IP США/Европы → OpenAI пропускает.
  - РФ-юзер открывает сайт → его IP виден только до Vercel → дальше Vercel сам ходит к OpenAI с американского IP.
  - Юзеру **VPN не нужен** — это и есть архитектурное решение для российской аудитории без танцев на стороне клиента.
  - Аналогично работает на Railway, AWS, Fly.io, любом нероссийском хостинге.

---

## CON-board-cost — Cost-per-explanation на текущей конфигурации
- source: BOARD-STACK.md
- type: nfr (unit economics)
- content:
  - Конфигурация: `gpt-4o-mini`, разбор столбикового сложения трёхзначных чисел.
  - prompt_tokens: ~14k (агент-цикл re-отправляет историю каждый раунд).
  - completion_tokens: ~1k.
  - **~$0.0027 = 0.27¢ ≈ 22 копейки за разбор.**
  - Объёмы:
    - 1 000 разборов / день → ~660 ₽/мес.
    - 10 000 разборов / день → ~6 600 ₽/мес.
  - На `gpt-4o`: ~$0.20 за разбор (в 17× дороже).
  - На `gpt-5-nano` или `DeepSeek-V3`: ~$0.003-0.005.

---

## CON-known-quirks — Известные мелочи / гочи
- source: BOARD-STACK.md, BOARD-STATUS.md
- type: nfr (operational gotchas)
- content:
  - **Tldraw multi-instance warning** в dev mode — известный HMR-баг tldraw, в `next build && next start` не воспроизводится. Игнорировать.
  - **ChatGPT Plus ≠ OpenAI API** — это разные биллинги. Plus даёт chat.openai.com, API нужно отдельно через https://platform.openai.com.
  - **Tldraw v3 vs v4**: API заметно меняется в v4. Закрепляйся на v3.x.
  - **React 19**: tldraw v3 не тестировался под React 19. Стабильнее держать React 18.
  - **`tldraw` барреля не экспортирует `toRichText` в .d.ts** статически — но в рантайме он есть (через `export * from '@tldraw/editor'` → `@tldraw/tlschema`). Tsc и Node-import работают.

---

## CON-integration-checklist — Контракт интеграции (TL;DR для другого Claude/системы)
- source: BOARD-STACK.md
- type: protocol (integration contract)
- content:

Если другой компонент (сайт/голос/БД) хочет использовать эту доску:

1. **Установить deps** — `next ^15.5.18`, `react ^18.3.1`, `tldraw ^3.15.6`, `openai ^6.37.0`, `undici ^8.x` (опц.).
2. **Скопировать файлы** — `app/api/draw/route.ts`, `lib/tools.ts`, `lib/executor.ts`, `instrumentation.ts`, `next.config.ts`.
3. **Поставить env**: `OPENAI_API_KEY=sk-...`.
4. **Использовать API**: `POST /api/draw` с `{prompt}` → парсить SSE.
5. **Рендерить в свой UI**: `<Tldraw onMount={e => editorRef.current = e} />` + `executeToolCall(editor, name, input)` на каждом `tool_use` событии.
6. **Стилизовать панель «учитель говорит»** — это просто `setState((prev) => [...prev, text])` на `name === 'say'`.

Файлы `app/page.tsx`, `app/layout.tsx`, `app/globals.css` — пример UI, под свой сайт можно полностью заменить.
