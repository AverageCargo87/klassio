// scripts/restore-agent-config-body.mjs
//
// Pure body builders for the Phase 8 agent restore script. Factored out of
// scripts/restore-agent-config.mjs so the PATCH payload shape is unit-testable
// without invoking fetch.
//
// API migration note (2026-05-13 live PATCH attempt revealed):
// ─────────────────────────────────────────────────────────────
// 11labs deprecated inline `agent.prompt.tools[]` for custom client tools.
// New model:
//   1. POST /v1/convai/tools  — create each tool as a workspace resource,
//      get back a tool_id.
//   2. PATCH /v1/convai/agents/{id} with `agent.prompt.tool_ids[]` —
//      attach the workspace tools to this agent.
//
// `agent.prompt.tools[]` is now read-only and contains only built-in tools
// (end_call, language_detection). PATCHing custom client definitions there
// silently fails: HTTP 200 but tools are dropped.
//
// This matches RESEARCH § Risk 6: "11labs API may change before phase ships".
// It did. We adapt.

// ─── Phase 6 baseline (constant across phases) ──────────────────────────────
// CRITICAL: 11labs PATCH does REPLACE-on-object, not merge. Any field NOT
// explicitly passed gets reset to default. See 2026-05-13 live test where
// missing `turn.turn_timeout` reverted to 7 (default) instead of 10 (Phase 6).
// Therefore buildAgentPatchBody passes ALL Phase 6 baseline fields every call.
export const NATALY_VOICE_ID = 'NhY0kyTmsKuEpHvDMngm'
export const TTS_MODEL_ID = 'eleven_multilingual_v2'
export const LLM_MODEL = 'gpt-4.1-mini'
export const LANGUAGE = 'ru'

// Phase 6 baseline TTS voice tuning, evolved through UAT cycles.
// Phase 8.6 focus-group fix (2026-05-14): voice felt "too robotic" to fifth-graders.
// stability ↓ (0.30 → 0.20) = more emotional variation, less monotone.
//
// Things we TRIED that 11labs Convai TTS object does NOT actually accept on
// Eleven Multilingual v2 (verified by GET-after-PATCH — values silently
// reverted or stayed at default):
//   - style: 0.60          → field doesn't exist on Convai TTS object
//   - expressive_mode: true → field exists but only effective on model v3/Turbo
// Stuck with stability/similarity_boost/speed/voice_id. For more livеness we
// either need to switch model (v3 is unstable on Russian per Phase 6 notes)
// or change voice_id. Both are Phase 8.6 follow-up items if 0.20 isn't enough.
export const TTS_STABILITY = 0.20           // more emotional / less monotone
export const TTS_SIMILARITY_BOOST = 0.75    // clear pronunciation (unchanged)
export const TTS_SPEED = 0.95               // slower than default for child listening (Phase 8 UAT)

// Phase 6 baseline conversation timing (PHASE-6-SETUP § 6)
export const MAX_CONVERSATION_DURATION_SEC = 3600  // 60 min — 45-min lesson + buffer
export const TURN_TIMEOUT_SEC = 25                 // 25s of silence before agent re-engages
                                                    // (was 10 in Phase 6 baseline; bumped per
                                                    // user feedback during Phase 8 UAT — Nataly
                                                    // was interrupting child too early during
                                                    // problem-solving thought process)
export const TURN_EAGERNESS = 'normal'             // 'high' would cut child off

// Phase 6 baseline ASR keywords for math vocabulary (PHASE-6-SETUP § 6 ASR)
export const ASR_KEYWORDS = [
  'дробь', 'дроби', 'числитель', 'знаменатель',
  'десятичная', 'столбиком', 'уравнение',
  'периметр', 'площадь', 'прямоугольник',
  'процент', 'проценты', 'среднее', 'арифметическое',
  'умножение', 'деление', 'сложение', 'вычитание',
]

/**
 * Six client tool definitions per Phase 8 D-07. These are the tool_config
 * payloads passed to POST /v1/convai/tools to create the tools as workspace
 * resources. The returned tool_ids are then attached to the agent.
 *
 * - `type: 'client'` — handler lives in browser, invoked via SDK callback.
 * - `execution_mode: 'immediate'` — agent continues speaking while result returns
 *   (supports INV-02 fire-and-forget per D-09).
 * - `expects_response: true` — Nataly receives the ack/error string back.
 * - `response_timeout_secs: 20` — generous; handlers return in < 50ms.
 *
 * Schema notes from live PATCH testing:
 * - `enum` on `type: 'number'` is REJECTED by 11labs validator (HTTP 400 —
 *   "Input should be a valid string"). Constraint moved from schema to handler
 *   (see lib/client-tools/handlers.ts:143). LLM is steered via description.
 */
export const PHASE_8_TOOLS = [
  {
    type: 'client',
    name: 'draw_explanation',
    description:
      'Нарисовать математическое объяснение на доске. Функция возвращает ack мгновенно — голос идёт ПАРАЛЛЕЛЬНО с рисованием. Замедли темп голосового объяснения (более длинные паузы между шагами) чтобы анимация доски успевала за словами. Зови когда вводишь новую тему или нужно визуально пояснить ошибку.',
    response_timeout_secs: 20,
    expects_response: true,
    execution_mode: 'immediate',
    parameters: {
      type: 'object',
      properties: {
        prompt: {
          type: 'string',
          description:
            'Что нарисовать на русском, например "сложение в столбик 245+874" или "разбор дроби 3/8".',
        },
      },
      required: ['prompt'],
    },
  },
  {
    type: 'client',
    name: 'clear_board',
    description:
      'Очистить доску. Зови перед переходом к новой теме или к практике в тренажёре.',
    response_timeout_secs: 5,
    expects_response: false,
    execution_mode: 'immediate',
    parameters: { type: 'object', properties: {} },
  },
  {
    type: 'client',
    name: 'goto_trainer_task',
    description:
      'Переместить ребёнка к конкретной задаче в тренажёре. Зови когда хочешь дать конкретное задание или вернуться к предыдущему.',
    response_timeout_secs: 20,
    expects_response: true,
    execution_mode: 'immediate',
    parameters: {
      type: 'object',
      properties: {
        taskId: {
          type: 'string',
          description: 'ID задачи формата "task-1", "task-2" и т.д.',
        },
      },
      required: ['taskId'],
    },
  },
  {
    type: 'client',
    name: 'highlight_trainer_task',
    description:
      'Визуально подсветить задачу в тренажёре без переключения текущей. Используй когда обсуждаешь задачу с ребёнком.',
    response_timeout_secs: 20,
    expects_response: true,
    execution_mode: 'immediate',
    parameters: {
      type: 'object',
      properties: {
        taskId: { type: 'string', description: 'ID задачи для подсветки.' },
        durationMs: {
          type: 'number',
          description: 'Длительность подсветки в миллисекундах. По умолчанию 3000.',
        },
      },
      required: ['taskId'],
    },
  },
  {
    type: 'client',
    name: 'show_hint',
    description:
      'Показать подсказку для задачи. Используй если ребёнок застрял. Начинай с уровня 1, повышай до 2 или 3 если всё ещё не понимает.',
    response_timeout_secs: 20,
    expects_response: true,
    execution_mode: 'immediate',
    parameters: {
      type: 'object',
      properties: {
        taskId: { type: 'string', description: 'ID задачи.' },
        hintLevel: {
          type: 'number',
          description:
            'Уровень подсказки. Допустимые значения: 1 (мягкая наводящая), 2 (средняя), 3 (полное решение). Передавай только 1, 2 или 3 — другие числа handler отклонит.',
        },
      },
      required: ['taskId', 'hintLevel'],
    },
  },
  {
    type: 'client',
    name: 'get_lesson_state',
    description:
      'Получить текущее состояние урока — какая задача активна, сколько решено, какие были ошибки. Зови если потеряла нить (за 45 минут урока контекст может «протухнуть»).',
    response_timeout_secs: 20,
    expects_response: true,
    execution_mode: 'immediate',
    parameters: { type: 'object', properties: {} },
  },
]

/**
 * Names of tools owned by Phase 8. Used to (a) match existing workspace tools
 * for cleanup before re-creation, (b) verify the agent has all 6 attached after
 * PATCH. Webhook/MCP tools in the workspace (e.g. send_to_makeAI, n8n-*) are
 * NOT in this set and must NOT be touched by the restore script.
 */
export const PHASE_8_TOOL_NAMES = PHASE_8_TOOLS.map((t) => t.name)

/**
 * Build the per-tool create body for POST /v1/convai/tools. Returns
 *   { tool_config: <PHASE_8_TOOLS entry> }
 *
 * The 11labs API wraps the tool definition inside a `tool_config` envelope.
 */
export function buildToolCreateBody(toolDef) {
  if (!toolDef || typeof toolDef !== 'object' || typeof toolDef.name !== 'string') {
    throw new Error('buildToolCreateBody: toolDef must be an object with a name')
  }
  return { tool_config: toolDef }
}

/**
 * Build the PATCH body for /v1/convai/agents/{id} — the agent-side update that
 * sets prompt, first message, voice, LLM, and attaches workspace tools by ID.
 *
 * @param {object} args
 * @param {string} args.prompt        — full system prompt text
 * @param {string} args.firstMessage  — first message Nataly speaks
 * @param {string} [args.voiceId]     — defaults to Nataly voice ID
 * @param {string[]} args.toolIds     — workspace tool IDs from POST /v1/convai/tools
 * @returns {object}
 */
export function buildAgentPatchBody({ prompt, firstMessage, voiceId, toolIds }) {
  if (typeof prompt !== 'string' || prompt.length === 0) {
    throw new Error('buildAgentPatchBody: prompt is required (non-empty string)')
  }
  if (typeof firstMessage !== 'string') {
    throw new Error('buildAgentPatchBody: firstMessage is required (string)')
  }
  if (!Array.isArray(toolIds)) {
    throw new Error('buildAgentPatchBody: toolIds must be an array')
  }
  // FULL Phase 6 baseline — REPLACE semantics in 11labs PATCH means every field
  // not passed here will silently reset to 11labs default. This object holds the
  // full known-good config; any future Phase that needs to add a field MUST add
  // it both here AND to the test assertions.
  return {
    conversation_config: {
      agent: {
        language: LANGUAGE,
        first_message: firstMessage,
        prompt: {
          prompt,
          llm: LLM_MODEL,
          tool_ids: toolIds,
        },
      },
      tts: {
        voice_id: voiceId || NATALY_VOICE_ID,
        model_id: TTS_MODEL_ID,
        stability: TTS_STABILITY,
        similarity_boost: TTS_SIMILARITY_BOOST,
        speed: TTS_SPEED,
      },
      conversation: {
        max_duration_seconds: MAX_CONVERSATION_DURATION_SEC,
      },
      turn: {
        turn_timeout: TURN_TIMEOUT_SEC,
        turn_eagerness: TURN_EAGERNESS,
      },
      asr: {
        quality: 'high',
        keywords: ASR_KEYWORDS,
      },
    },
  }
}
