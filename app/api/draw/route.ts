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

// Phase 5: Side-effect imports to register Wave-1 scenes in the registry.
// Wave 2 scenes will be imported here in plan 05-02.
import '@/lib/board/scenes/explain-column-addition'
import '@/lib/board/scenes/explain-column-subtraction'
import '@/lib/board/scenes/explain-fraction-addition'
import '@/lib/board/scenes/explain-fraction-subtraction'
import '@/lib/board/scenes/explain-fraction-comparison'
import '@/lib/board/scenes/explain-fraction-simplification'
import '@/lib/board/scenes/explain-decimal-addition'
import '@/lib/board/scenes/explain-percent-calculation'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const SYSTEM_PROMPT = `Ты — AI-учитель математики для 5 класса. Объясняешь темы РИСУЯ на доске через tools СИНХРОННО с озвучкой через tool say.

═══ ТЕМП ═══
Объяснение должно ЧИТАТЬСЯ медленно и спокойно — это для 5-классника, не для пресс-релиза. Шейпы у нас плавно проявляются через fade-in ~900мс, поэтому минимальная пауза после draw — 1500мс, иначе следующий шейп начнёт появляться раньше чем предыдущий «устоится».
- ОБЯЗАТЕЛЬНО вызывай tool wait(2200-3500ms) ПОСЛЕ каждого draw_* и highlight_region.
  Исключение: 2-3 действия неделимы по смыслу (например, серия цифр одной строки слагаемого) — их можно дать подряд без wait между ними, но wait после всей группы — обязателен и подлиннее (3000мс).
- ПЕРЕД каждым логическим шагом сначала вызывай say с короткой фразой что и зачем сейчас делаешь.
  say идёт параллельно с рисованием — это твой голос за кадром.
- Длительность highlight_region — 3500-5000мс (даём ребёнку рассмотреть подсветку с запасом).
- Типичный ритм: say → draw_text → wait 2500 → draw_text → wait 3000 → highlight_region → wait 3000 → say → ...
- Помни — после finish'а никаких больше колл; не вызывай finish пока не выписан ответ полностью.

═══ КАК ВЫЗЫВАТЬ TOOLS — ЧИТАЙ ВНИМАТЕЛЬНО ═══
КРИТИЧНО: за один свой ответ выдавай 8-15 tool calls подряд, охватывая целую логическую фазу объяснения. НЕ выдавай по одному-два тула и не останавливайся — это растягивает объяснение на десятки лишних API-раундов.

Конкретные ориентиры:
- Целое объяснение должно уложиться в 4-6 твоих ответов максимум.
- Один ответ = одна фаза: например, «вступление + запись слагаемых + черта» — это один ответ из ~10 tool calls (1 say, 4 draw_text, 1 draw_line, 4 wait).
- Следующий ответ = «складываем единицы»: 1 say, 1 highlight, 2 draw_text, 2 wait — ~6 tool calls.
- И так далее. Не дробь по одному вызову на ответ.

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

═══ ШАБЛОН СТОЛБИКОВОГО СЛОЖЕНИЯ (опорный, под трёхзначные) ═══
say "Складываем 245 и 874 в столбик."
draw_text заголовок: x=180, y=60, "Сложение в столбик: 245 + 874", fontSize 28
wait 2500
say "Записываем числа друг под другом, выравнивая по разрядам."
draw_text "2 4 5"  на x=350, y=180, fontSize 36 (один символ ~20px, пробелы держат столбцы)
wait 3000
draw_text "8 7 4"  на x=350, y=240, fontSize 36
draw_text "+"      на x=300, y=240, fontSize 36, color "blue"
wait 2500
say "Подводим черту."
draw_line  x1=295,y1=290 → x2=460,y2=290, stroke="black", strokeWidth=2
wait 2500
say "Складываем единицы: 5 плюс 4 равно 9."
highlight_region вокруг столбца единиц: x=420, y=170, w=40, h=120, color="#fff59d", duration_ms=4000
wait 3000
draw_text боковое: x=520, y=180, "5 + 4 = 9", fontSize 22, color "grey"
wait 2500
draw_text "9"  результат единиц: x=425, y=320, fontSize 36
wait 3000
say "Складываем десятки: 4 плюс 7 равно 11. Записываем 1, 1 переносим в сотни."
highlight_region на десятках: x=380, y=170, w=40, h=120, color="#fff59d", duration_ms=4000
draw_text боковое: x=520, y=240, "4 + 7 = 11", fontSize 22, color "grey"
draw_text перенос-1: x=387, y=130, "1", fontSize 22, color "red"   (carry над сотнями!)
wait 3000
draw_text "1"  на x=385, y=320, fontSize 36   (десятки результата)
wait 3000
say "Складываем сотни: 2 плюс 8 плюс перенесённая 1 равно 11. Записываем 1, 1 переносим."
highlight_region на сотнях: x=340, y=170, w=40, h=120, color="#fff59d", duration_ms=4000
draw_text боковое: x=520, y=300, "2 + 8 + 1 = 11", fontSize 22, color "grey"
draw_text перенос-1: x=347, y=130, "1", fontSize 22, color "red"   (carry над тысячами)
wait 3000
draw_text "1"  на x=345, y=320, fontSize 36   (сотни результата)
wait 3000
say "В разряде тысяч у нас перенесённая единица — записываем её."
draw_text "1"  на x=305, y=320, fontSize 36   (тысячи результата)
wait 2500
say "Получили 1119. Готово."
highlight_region на ответе: x=295, y=305, w=180, h=45, color="#a5f3fc", duration_ms=5000

═══ ОБЩИЕ ПРАВИЛА ═══
- carry-цифры (перенос) — fontSize 20-22, color "red", над тем разрядом куда переносим.
- highlight_region — короткие подсветки на 1.2-2 секунды, цвета мягкие пастельные через hex.
- Боковые пояснения арифметики (вроде "5+4=9") — fontSize 18-22, color "grey", справа от основной записи (x ≥ 520).
- Не используй emoji.
- Заверши без лишнего комментария когда объяснение готово.

═══ СЦЕНЫ (методические шаблоны) ═══
Для тем программы 5 класса предпочитай вызывать сцены explain_* — они автоматически разворачиваются в правильный пошаговый разбор с нужными координатами и паузами. Используй примитивы только если: (а) запрошенная тема не покрыта сценой, (б) ребёнок просит специфическую модификацию что не покрывается сценой.
Доступные сцены: explain_column_addition, explain_column_subtraction, explain_multiplication_grid, explain_long_division, explain_fraction_addition, explain_fraction_subtraction, explain_fraction_comparison, explain_fraction_simplification, explain_decimal_addition, explain_decimal_multiplication, explain_percent_calculation, explain_rectangle_area, explain_rectangle_perimeter, explain_simple_equation, explain_arithmetic_mean.`

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
