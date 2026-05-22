// SSE agent-loop endpoint for board drawing.
// Port of tldraw-test/app/api/draw/route.ts with auth() guard + lessonId ownership check.
//
// Auth guard (D-08): auth() called first — 401 before any body parsing if no session.
// Ownership check (D-07, D-08): validates lessonId belongs to session.user.id.
// Agent loop: tool_choice:'required' + finish tool exit signal + JSON.parse fallback (D-12, D-13).
// SSE contract: data: {JSON}\n\n per event; last event is { type:'done', ... }.
//
// Phase 5: Scene interception (D-02) — when LLM calls explain_* scene, server expands it
// to primitives server-side and emits them as individual tool_use events.
// Client never receives raw scene names — only primitive tool_use events.

import { NextRequest } from 'next/server'
import OpenAI from 'openai'
import type {
  ChatCompletionTool,
  ChatCompletionMessageParam,
} from 'openai/resources/chat/completions'
import { auth } from '@/auth'
import { db } from '@/lib/db'
import { lessons } from '@/lib/db/schema'
import { eq, and } from 'drizzle-orm'
import { allBoardTools, isSceneName, getScene } from '@/lib/board'
import type { SceneName } from '@/lib/board/scenes/types'

// Phase 5 Wave 1: Side-effect imports to register scenes in the registry.
import '@/lib/board/scenes/explain-column-addition'
import '@/lib/board/scenes/explain-column-subtraction'
import '@/lib/board/scenes/explain-fraction-addition'
import '@/lib/board/scenes/explain-fraction-subtraction'
import '@/lib/board/scenes/explain-fraction-comparison'
import '@/lib/board/scenes/explain-fraction-simplification'
import '@/lib/board/scenes/explain-decimal-addition'
import '@/lib/board/scenes/explain-percent-calculation'

// Phase 5 Wave 2 (Plan 05-02): 7 remaining scenes — all 15 now registered.
import '@/lib/board/scenes/explain-multiplication-grid'
import '@/lib/board/scenes/explain-long-division'
import '@/lib/board/scenes/explain-decimal-multiplication'
import '@/lib/board/scenes/explain-rectangle-area'
import '@/lib/board/scenes/explain-rectangle-perimeter'
import '@/lib/board/scenes/explain-simple-equation'
import '@/lib/board/scenes/explain-arithmetic-mean'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const SYSTEM_PROMPT = `Ты — AI-учитель математики для 5 класса. Объясняешь темы РИСУЯ на доске через tools СИНХРОННО с озвучкой через tool say.

═══ ТЕМП ═══
Объяснение должно ЧИТАТЬСЯ медленно и спокойно — это для 5-классника, не для пресс-релиза. Шейпы у нас плавно проявляются через fade-in ~1500мс, поэтому минимальная пауза после draw — 2500мс, иначе следующий шейп начнёт появляться раньше чем предыдущий «устоится».
- ОБЯЗАТЕЛЬНО вызывай tool wait(3500-5000ms) ПОСЛЕ каждого draw_* и highlight_region.
  Исключение: 2-3 действия неделимы по смыслу (например, серия цифр одной строки слагаемого) — их можно дать подряд без wait между ними, но wait после всей группы — обязателен и подлиннее (4500мс).
- ПЕРЕД каждым логическим шагом сначала вызывай say с короткой фразой что и зачем сейчас делаешь.
  say идёт параллельно с рисованием — это твой голос за кадром.
- Длительность highlight_region — 4000-5000мс (даём ребёнку рассмотреть подсветку с запасом).
- ⚠️ КРИТИЧНО про highlight_region: на канвасе может быть только ОДНА активная подсветка. Перед следующим highlight_region обязателен wait ≥ duration_ms предыдущего (т.е. если duration_ms=4000, то wait после него ≥ 4500мс) — иначе подсветки наложатся и ребёнок не успеет прочитать первую.
- Типичный ритм: say → draw_text → wait 3500 → draw_text → wait 4000 → highlight_region(4000ms) → wait 4500 → say → ...
- Помни — после finish'а никаких больше колл; не вызывай finish пока не выписан ответ полностью.

═══ КАК ВЫЗЫВАТЬ TOOLS — ЧИТАЙ ВНИМАТЕЛЬНО ═══
КРИТИЧНО: количество tool calls за ответ зависит от выбранного пути (см. блок СЦЕНЫ vs ПРИМИТИВЫ ниже):
- **Путь A (есть подходящая explain_* сцена)**: ВСЕГО два tool calls за весь твой ответ — [explain_NAME({...args}), finish()]. Один ответ, два вызова, конец. Сцена сама генерирует десятки внутренних команд — НЕ дополняй её.
- **Путь B (ручные примитивы — только когда сцены нет)**: за один ответ 8-15 tool calls подряд, охватывая логическую фазу. Целое объяснение в 4-6 ответов максимум, последний ответ заканчивается finish.

⛔ Типичная ошибка: вызвал сцену → во втором ответе начал draw_text-ить «дополнительно». Так делать НЕЛЬЗЯ — поверх готового рисунка ляжет дубль и всё испортит.

═══ КАК ЗАВЕРШАТЬ ═══
Ты НЕ имеешь права отвечать обычным текстом — каждый твой ответ ОБЯЗАН быть набором tool calls. Это enforce'ится на уровне API (tool_choice: required).

Чтобы сообщить «всё, объяснение готово» — вызови tool finish (один раз, в самом конце последнего ответа, после всех say/draw/wait). НЕ вызывай finish раньше времени — пока есть что объяснять, не вызывай его.

Бюджет: 30 ответов max. После принудительный обрыв. Не доводи.

═══ КАНВАС И КООРДИНАТЫ ═══
- Видимая область канваса 800x600. (0,0) — левый верх. Центр ~ (400, 300).
- fontSize: 28-36 для основных цифр, 18-22 для подписей, 32-40 для заголовка.
- Один символ при fontSize 32 занимает ~18px по горизонтали и ~32px по вертикали.
- Между строками цифр — минимум 60px по y. Между разрядами — минимум 30px по x.
- НЕ нагромождай шейпы. Если новая запись попадает в зону уже нарисованного — сдвигай её или используй другую часть канваса.

═══ СЦЕНЫ vs ПРИМИТИВЫ — ПРОЧТИ ВНИМАТЕЛЬНО ═══
У тебя ДВА пути объяснить тему. Выбери ОДИН — не комбинируй!

**Путь A (предпочтительный): explain_* сцена.**
Если тема покрыта одной из сцен — вызови ЕЁ. Сцена сама разворачивается в полный пошаговый разбор с координатами, паузами, подсветками и финальным ответом. Это полноценное объяснение от и до.
- Доступные сцены: explain_column_addition, explain_column_subtraction, explain_multiplication_grid, explain_long_division, explain_fraction_addition, explain_fraction_subtraction, explain_fraction_comparison, explain_fraction_simplification, explain_decimal_addition, explain_decimal_multiplication, explain_percent_calculation, explain_rectangle_area, explain_rectangle_perimeter, explain_simple_equation, explain_arithmetic_mean.
- ⛔ КРИТИЧНО: после вызова сцены explain_* НЕМЕДЛЕННО вызывай finish. НЕ рисуй ничего вручную поверх — сцена уже всё нарисовала и объяснила. Любой draw_text/highlight_region после сцены ляжет ПОВЕРХ уже готового объяснения и испортит его.
- ⛔ НЕ вызывай две сцены подряд для одной темы — это тоже наложение.
- Типичный полный ответ для темы под сцену: [explain_column_addition({a:245,b:874}), finish()]. Всё. Два tool calls.

**Путь B: ручной набор примитивов.**
Используй ТОЛЬКО если: (а) тема не покрыта ни одной сценой, (б) ребёнок просит специфическую модификацию что сцена не делает (например, «объясни на пальцах» или «нарисуй яблоки вместо цифр»).
- Здесь ты сам отвечаешь за координаты, ритм и подсветки.
- Минимум wait после каждого draw_/highlight: 3500ms. После highlight_region — wait ≥ duration_ms + 500.
- highlight_region для одного столбца цифр — w=30. Для итогового ответа — w=160-180.
- carry (перенос) — fontSize 20-22, color "red", над разрядом.
- Боковые пояснения арифметики (например, "5+4=9") — fontSize 18-22, color "grey", справа (x ≥ 520).
- Цвета highlight: разряды — "#fff59d" (мягкий жёлтый), итог — "#a5f3fc" (мягкий голубой). Не насыщенные.
- Без emoji.

═══ ЗАВЕРШЕНИЕ ═══
Финальный tool call всегда finish. Один раз. После него — ничего.
- Если использовал Путь A (сцена): [scene_call, finish]. Два tool calls.
- Если использовал Путь B (примитивы): много примитивов + finish в самом конце.`

// gpt-4o-mini — ~17x cheaper than gpt-4o ($0.15/$0.60 vs $2.50/$10 per 1M tokens).
// Tool calling quality is sufficient for our coordinate + rhythm task.
// Switch to gpt-4o if complex topics start producing poor results.
const MODEL = 'gpt-4o-mini'

// Maximum rounds of model → tool_calls → fake tool_result → model.
// After this limit we hard-stop and send a done event with finish_reason 'max_turns'.
const MAX_AGENT_TURNS = 30

// Adapt our provider-agnostic tool schemas to OpenAI function calling format.
// Phase 5: uses allBoardTools (24 tools = 9 primitives + 15 scenes) instead of drawTools (9).
const openaiTools: ChatCompletionTool[] = allBoardTools.map((t) => ({
  type: 'function',
  function: {
    name: t.name,
    description: t.description,
    parameters: t.parameters as unknown as Record<string, unknown>,
  },
}))

// Round 18 UAT — bypass OpenAI for unambiguous scene prompts.
// Returns { name, args } if the prompt matches a known canonical form,
// or null to fall through to the OpenAI router. Keep patterns CONSERVATIVE
// — only match phrasings the agent prompt explicitly produces.
function matchFastScene(
  prompt: string,
): { name: SceneName; args: Record<string, unknown> } | null {
  const p = prompt.trim().toLowerCase()

  // Column addition: "сложение в столбик A+B" (+ variants with spaces).
  // Matches both "сложение в столбик 25+34" and "сложение в столбик 25 + 34".
  let m = p.match(/сложен[ие]+\s+в\s+столбик[еа]?\s+(\d+)\s*\+\s*(\d+)/)
  if (m) {
    const a = Number(m[1])
    const b = Number(m[2])
    if (a > 0 && b > 0) {
      return { name: 'explain_column_addition', args: { a, b } }
    }
  }

  // Column subtraction: "вычитание в столбик A-B".
  m = p.match(/вычитани[ея]+\s+в\s+столбик[еа]?\s+(\d+)\s*[-−]\s*(\d+)/)
  if (m) {
    const a = Number(m[1])
    const b = Number(m[2])
    if (a > 0 && b > 0 && a >= b) {
      return { name: 'explain_column_subtraction', args: { a, b } }
    }
  }

  return null
}

export async function POST(req: NextRequest) {
  console.log('[draw] Request received')

  // ── T-04-02-01: Auth guard — must be first, before any body parsing ─────
  const session = await auth()
  if (!session?.user?.id) {
    return new Response(
      JSON.stringify({ error: 'Войдите в систему' }),
      { status: 401, headers: { 'Content-Type': 'application/json' } },
    )
  }

  // ── Input validation ────────────────────────────────────────────────────
  let prompt = ''
  let lessonId = ''
  try {
    const body = (await req.json()) as { prompt?: unknown; lessonId?: unknown }
    prompt = typeof body.prompt === 'string' ? body.prompt.trim() : ''
    lessonId = typeof body.lessonId === 'string' ? body.lessonId.trim() : ''
  } catch {
    return new Response(
      JSON.stringify({ error: 'Неверный формат запроса' }),
      { status: 400, headers: { 'Content-Type': 'application/json' } },
    )
  }

  if (!prompt) {
    return new Response(
      JSON.stringify({ error: 'Промпт обязателен' }),
      { status: 400, headers: { 'Content-Type': 'application/json' } },
    )
  }
  if (!lessonId) {
    return new Response(
      JSON.stringify({ error: 'lessonId обязателен' }),
      { status: 400, headers: { 'Content-Type': 'application/json' } },
    )
  }

  // ── T-04-02-02: Ownership check — lessonId must belong to session.user.id ─
  const lessonRow = await db
    .select({ id: lessons.id })
    .from(lessons)
    .where(and(eq(lessons.id, lessonId), eq(lessons.userId, session.user.id)))
    .limit(1)

  if (lessonRow.length === 0) {
    return new Response(
      JSON.stringify({ error: 'Этот урок не ваш' }),
      { status: 403, headers: { 'Content-Type': 'application/json' } },
    )
  }

  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) {
    return new Response(
      JSON.stringify({ error: 'Ошибка сервера. Попробуйте позже.' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } },
    )
  }

  const client = new OpenAI({ apiKey })
  const encoder = new TextEncoder()

  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: unknown) => {
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`))
        } catch {
          // Stream already closed by client (abort / navigation)
        }
      }

      // First-byte flush — force Vercel/Cloudflare to start streaming
      // the response immediately. Without this, intermediate proxies may
      // buffer the response body until LLM completes (~2-4s), delaying
      // time-to-first-shape on the client.
      // SSE comment lines (starting with `:`) are ignored by EventSource
      // parsers but force HTTP body bytes to flow.
      try {
        controller.enqueue(encoder.encode(`: connected\n\n`))
      } catch {
        // ignore
      }

      // Notify client that we've started — gives instant feedback even
      // before the LLM responds. Client can show "Бот думает..." indicator.
      send({ type: 'started' })

      // Round 18 UAT — fast-path scene routing. User feedback: «доска
      // открылась, пошло объяснение голосом, а первая цифра только секунд
      // через 10 появилась». Корень — OpenAI тратит 5-10s на reasoning
      // перед выбором сцены, даже если prompt буквально совпадает с её
      // формой. Для известных паттернов диспатчим scene generator
      // напрямую — first shape падает на клиент через ~100ms вместо
      // ~5-10s.
      const fastScene = matchFastScene(prompt)
      if (fastScene) {
        const sceneFn = getScene(fastScene.name)
        if (sceneFn) {
          let fastToolCalls = 0
          try {
            for (const primitive of sceneFn(fastScene.args)) {
              fastToolCalls++
              send({
                type: 'tool_use',
                id: `fast_${fastToolCalls}`,
                name: primitive.name,
                input: primitive.input,
              })
            }
            console.log(`[draw] FAST PATH ${fastScene.name} — ${fastToolCalls} tool_use events, no OpenAI call`)
            send({
              type: 'done',
              prompt_tokens: 0,
              completion_tokens: 0,
              finish_reason: 'fast_path',
              tool_calls_total: fastToolCalls,
              scene_used: fastScene.name,
              fast_path: true,
            })
            controller.close()
            return
          } catch (sceneErr) {
            // Scene threw → fall through to OpenAI loop (it might rescue
            // by picking a different scene or going primitive-only).
            const msg = sceneErr instanceof Error ? sceneErr.message : String(sceneErr)
            console.error(`[draw] Fast-path ${fastScene.name} failed, falling back to OpenAI:`, msg)
          }
        }
      }

      // Agent loop.
      // OpenAI ChatCompletion stops after tool_calls and waits for tool_result.
      // Our tools are "fire and forget" (drawing on canvas, no useful return value),
      // so we feed a fake "ok" back and ask the model to continue until it calls finish.
      const messages: ChatCompletionMessageParam[] = [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: prompt },
      ]

      let totalPromptTokens = 0
      let totalCompletionTokens = 0
      let lastFinishReason: string | null | undefined = undefined
      let finishedExplicitly = false
      let totalToolCalls = 0

      // Phase 5 (D-17): Track which scene was used in this request.
      // Phase 5: track first scene used; Phase 8 may extend to multi-scene tracking.
      let sceneUsed: string | null = null

      try {
        for (let turn = 0; turn < MAX_AGENT_TURNS; turn++) {
          // T-04-02-03: tool_choice:'required' — model MUST call tools; cannot reply with plain text.
          // The only valid exit is calling the finish tool.
          const completion = client.chat.completions.stream({
            model: MODEL,
            messages,
            tools: openaiTools,
            tool_choice: 'required',
            stream_options: { include_usage: true },
          })

          completion.on('tool_calls.function.arguments.done', (e) => {
            // finish is an internal exit signal — intercept it, do NOT forward to client.
            if (e.name === 'finish') {
              finishedExplicitly = true
              return
            }

            // D-13 / CON-openai-sdk-quirks: structured output may arrive as parsed object
            // or as a JSON string — guard both forms.
            let input: unknown = e.parsed_arguments
            if (input == null) {
              try {
                input = JSON.parse(e.arguments)
              } catch {
                input = {}
              }
            }

            // Phase 5 — Scene interception (D-02):
            // When LLM calls an explain_* scene, expand it server-side into primitive tool_use events.
            // Client never receives the raw scene name — only the individual primitive calls.
            if (isSceneName(e.name)) {
              // Track first scene used for cost monitoring (D-17)
              if (sceneUsed === null) {
                sceneUsed = e.name
              }

              const sceneFn = getScene(e.name)
              if (sceneFn) {
                try {
                  for (const primitive of sceneFn(input)) {
                    totalToolCalls++
                    send({
                      type: 'tool_use',
                      id: `t${turn}_${e.index}_s${totalToolCalls}`,
                      name: primitive.name,
                      input: primitive.input,
                    })
                  }
                } catch (sceneErr) {
                  const msg = sceneErr instanceof Error ? sceneErr.message : String(sceneErr)
                  console.error(`[draw] Scene ${e.name} error:`, msg)
                  // Fall through — OpenAI still gets 'ok' back, can retry with different args
                }
              }
              // scene call consumed; do NOT forward raw explain_* name to client
              return
            }

            // Primitive pass-through (unchanged from Phase 4)
            totalToolCalls++
            send({
              type: 'tool_use',
              id: `t${turn}_${e.index}`,
              name: e.name,
              input,
            })
          })

          // Forward any unexpected text content (should not happen with tool_choice:'required',
          // but keep for defensive completeness)
          completion.on('content.done', (e) => {
            if (e.content) send({ type: 'text', text: e.content })
          })

          const final = await completion.finalChatCompletion()
          const choice = final.choices[0]
          const message = choice?.message
          lastFinishReason = choice?.finish_reason

          if (final.usage) {
            totalPromptTokens += final.usage.prompt_tokens ?? 0
            totalCompletionTokens += final.usage.completion_tokens ?? 0
          }

          console.log(`[draw] Turn ${turn + 1} complete — tools called so far: ${totalToolCalls}`)

          // Model called finish → clean exit
          if (finishedExplicitly) break

          // No tool_calls → defensive exit (should not occur with tool_choice:'required')
          if (!message?.tool_calls || message.tool_calls.length === 0) break

          // Append assistant message + fake tool_result for each tool call, then loop
          messages.push(message)
          for (const tc of message.tool_calls) {
            if (tc.type === 'function') {
              messages.push({
                role: 'tool',
                tool_call_id: tc.id,
                content: 'ok',
              })
            }
          }
        }

        console.log(`[draw] Agent loop complete — ${totalToolCalls} tools called, finishedExplicitly=${finishedExplicitly}, sceneUsed=${sceneUsed}`)

        send({
          type: 'done',
          finish_reason: finishedExplicitly
            ? 'finished'
            : lastFinishReason === 'tool_calls'
              ? 'max_turns'
              : lastFinishReason,
          scene_used: sceneUsed,  // Phase 5 (D-17): which scene was used (null if none)
          usage: {
            prompt_tokens: totalPromptTokens,
            completion_tokens: totalCompletionTokens,
            total_tokens: totalPromptTokens + totalCompletionTokens,
          },
        })
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        console.error('[draw] Agent loop error:', msg)
        send({ type: 'error', error: 'Ошибка сервера. Попробуйте позже.' })
      } finally {
        try {
          controller.close()
        } catch {
          // Already closed
        }
      }
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  })
}
