// scripts/restore-agent-config-body.mjs
//
// Pure body builder for the Phase 8 agent restore script. Factored out of
// scripts/restore-agent-config.mjs so the PATCH payload shape (especially the
// 6 client tool definitions per D-07) is unit-testable without invoking fetch.
//
// CRITICAL: PATCH body key is `conversation_config` (snake_case, singular).
// This is VERIFIED working in production from the Phase 6.5 restore. The 11labs
// API reference confusingly shows the adjective-form key (with extra 'ational')
// in some places, but the script in production uses the noun-form snake_case
// key shown above and 11labs accepts it. Do NOT change this key without
// re-verifying via live PATCH.

/**
 * Six client tool definitions per Phase 8 D-07.
 * - `type: 'client'`     — handler lives in browser, invoked via SDK callback
 * - `execution_mode: 'immediate'` — agent continues speaking while result is returned
 *                                   (supports INV-02 fire-and-forget per D-09)
 * - `expects_response: true` — Nataly will receive the ack/error string back and
 *                              can reason about success/failure of the tool call
 * - `response_timeout_secs: 20` — generous, since handlers themselves return in
 *                                  < 50ms (the fire-and-forget animation is decoupled)
 *
 * IMPORTANT: PATCH /v1/convai/agents/{id} OVERWRITES the entire tools array
 * (RESEARCH § 4). Whenever this script ships, it must include ALL tools the
 * agent needs across all phases — there is no merge.
 */
export const PHASE_8_TOOLS = [
  {
    type: 'client',
    name: 'draw_explanation',
    description:
      'Нарисовать математическое объяснение на доске. Зови когда вводишь новую тему или нужно визуально пояснить ошибку. Возвращается мгновенно — анимация идёт в фоне, ты можешь продолжать говорить.',
    response_timeout_secs: 20,
    expects_response: true,
    execution_mode: 'immediate',
    parameters: {
      type: 'object',
      properties: {
        prompt: {
          type: 'string',
          description:
            'Что нарисовать на русском. Пример: "сложение в столбик 245+874", "разбор дроби 3/8 на доске".',
        },
      },
      required: ['prompt'],
    },
  },
  {
    type: 'client',
    name: 'clear_board',
    description:
      'Очистить доску перед началом новой темы. Используй когда заканчиваешь объяснение и переходишь к практике, чтобы доска не была загромождена.',
    response_timeout_secs: 20,
    expects_response: true,
    execution_mode: 'immediate',
    parameters: { type: 'object', properties: {} },
  },
  {
    type: 'client',
    name: 'goto_trainer_task',
    description:
      'Переместить ребёнка к конкретной задаче в тренажёре. Используй когда нужно вернуть его к предыдущей задаче, перебросить вперёд или повторить.',
    response_timeout_secs: 20,
    expects_response: true,
    execution_mode: 'immediate',
    parameters: {
      type: 'object',
      properties: {
        taskId: {
          type: 'string',
          description: 'ID задачи из конфигурации урока, например "task-1", "task-2".',
        },
      },
      required: ['taskId'],
    },
  },
  {
    type: 'client',
    name: 'highlight_trainer_task',
    description:
      'Визуально подсветить задачу в тренажёре, БЕЗ переключения «текущей». Используй чтобы обратить внимание ребёнка на конкретное задание во время объяснения.',
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
          enum: [1, 2, 3],
          description: 'Уровень подсказки: 1 (мягкая), 2 (средняя), 3 (полное решение).',
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

// Phase 6 baseline values that stay constant across phases — voice + TTS model.
export const NATALY_VOICE_ID = 'NhY0kyTmsKuEpHvDMngm'
export const TTS_MODEL_ID = 'eleven_multilingual_v2'
export const LLM_MODEL = 'gpt-4.1-mini'
export const LANGUAGE = 'ru'

/**
 * Build the full PATCH body for /v1/convai/agents/{id}.
 *
 * PATCH semantics: tools array is REPLACED, not merged (RESEARCH § 4).
 * Every call must pass ALL tools the agent should have post-PATCH.
 *
 * @param {object} args
 * @param {string} args.prompt        — full system prompt text (loaded from PROMPT_PATH)
 * @param {string} args.firstMessage  — first message Nataly speaks on session start
 * @param {string} [args.voiceId]     — defaults to Nataly voice ID
 * @param {Array}  args.tools         — typically PHASE_8_TOOLS; explicit param so future phases can extend
 * @returns {object}                  — { conversation_config: { agent: {...}, tts: {...} } }
 */
export function buildAgentPatchBody({ prompt, firstMessage, voiceId, tools }) {
  if (typeof prompt !== 'string' || prompt.length === 0) {
    throw new Error('buildAgentPatchBody: prompt is required (non-empty string)')
  }
  if (typeof firstMessage !== 'string') {
    throw new Error('buildAgentPatchBody: firstMessage is required (string)')
  }
  if (!Array.isArray(tools)) {
    throw new Error('buildAgentPatchBody: tools must be an array')
  }
  return {
    conversation_config: {
      agent: {
        language: LANGUAGE,
        first_message: firstMessage,
        prompt: {
          prompt,
          llm: LLM_MODEL,
          tools,
        },
      },
      tts: {
        voice_id: voiceId || NATALY_VOICE_ID,
        model_id: TTS_MODEL_ID,
      },
    },
  }
}
