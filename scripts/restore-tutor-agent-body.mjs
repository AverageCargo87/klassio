// scripts/restore-tutor-agent-body.mjs
//
// Pure body builders for the AI-репетитор agent (June 2026 pivot). Mirrors
// restore-agent-config-body.mjs (the math agent) but defines the TUTOR role's
// client tools and astronomy ASR vocabulary.
//
// ⚠ TOOL NAMES ARE DISJOINT from the math agent's PHASE_8_TOOL_NAMES
// (draw_explanation / clear_board / goto_trainer_task / highlight_trainer_task
// / show_hint / get_lesson_state). 11labs workspace tools are global and the
// math restore script deletes-by-name — so the tutor must NOT reuse those names
// or running either restore script could delete the other agent's tools. The
// two colliding concepts are renamed: draw_explanation→draw_board,
// get_lesson_state→lesson_state.
//
// Reuses the math agent's tuned RU TTS/voice/timing baseline (shared module) so
// both teachers sound consistent and well-pronounced for kids. Override later
// if the tutor persona needs a different voice.

import {
  TEACHER_VOICE_ID,
  TTS_MODEL_ID,
  LLM_MODEL,
  LANGUAGE,
  TTS_STABILITY,
  TTS_SIMILARITY_BOOST,
  TTS_SPEED,
  TTS_TEXT_NORMALISATION,
  MAX_CONVERSATION_DURATION_SEC,
  TURN_TIMEOUT_SEC,
  TURN_EAGERNESS,
  buildToolCreateBody,
} from './restore-agent-config-body.mjs'

export { buildToolCreateBody }

// First message greets the child by name via a dynamic variable (provided by
// /api/tutor/session at startSession). Greeting by name is a core pivot feature.
export const TUTOR_FIRST_MESSAGE =
  'Привет! Меня зовут Аня, сегодня мы вместе изучаем окружающий мир. А тебя как зовут?'

// ASR keyword bias for astronomy vocabulary (lesson 1 «Мир глазами астронома»).
export const TUTOR_ASR_KEYWORDS = [
  'астрономия', 'астроном', 'вселенная', 'галактика',
  'солнечная система', 'солнце', 'звезда', 'звёзды', 'планета', 'планеты',
  'орбита', 'спутник', 'телескоп', 'созвездие', 'комета', 'метеор',
  'меркурий', 'венера', 'земля', 'марс', 'юпитер', 'сатурн', 'уран', 'нептун',
]

// Eight client tools. Per math-agent lessons learned: do NOT use JSON-schema
// `enum` (11labs validator rejects enum on number, and we keep all params
// string/number for safety) — constrain via `description` and the browser
// handler instead (lib/tutor-tools/handlers.ts).
export const TUTOR_TOOLS = [
  {
    type: 'client',
    name: 'show_board',
    description:
      'Показать на доске готовую наглядную схему урока «Мир глазами астронома». Допустимые board: ' +
      '"cover" (обложка урока), "etymology" (что такое астрономия — слово от «астрон» = звезда), ' +
      '"bodies" (небесные тела: звёзды, планеты, спутники, кометы), ' +
      '"solar" (карта Солнечной системы с планетами — крутится, можно кликать планеты), ' +
      '"facts" (карточки интересных фактов). Говори ПАРАЛЛЕЛЬНО с показом, чуть медленнее. Потом убери через hide_tool.',
    response_timeout_secs: 20,
    expects_response: true,
    execution_mode: 'immediate',
    parameters: {
      type: 'object',
      properties: {
        board: {
          type: 'string',
          description: 'ID доски: cover | etymology | bodies | solar | facts.',
        },
      },
      required: ['board'],
    },
  },
  {
    type: 'client',
    name: 'next_slide',
    description:
      'Показать СЛЕДУЮЩУЮ доску урока строго по порядку (cover → etymology → bodies → solar → facts). Используй это, чтобы вести теорию по порядку и ничего не пропустить. Самый первый вызов покажет обложку урока (cover).',
    response_timeout_secs: 20,
    expects_response: true,
    execution_mode: 'immediate',
    parameters: { type: 'object', properties: {} },
  },
  {
    type: 'client',
    name: 'show_trainer',
    description:
      'Показать ребёнку интерактивное задание для практики. Зови, когда пора потренироваться. Потом убери через hide_tool.',
    response_timeout_secs: 20,
    expects_response: true,
    execution_mode: 'immediate',
    parameters: {
      type: 'object',
      properties: {
        taskId: { type: 'string', description: 'ID задачи, например "task-1".' },
      },
      required: ['taskId'],
    },
  },
  {
    type: 'client',
    name: 'hide_tool',
    description:
      'Убрать доску/тренажёр и вернуть пустой холст. Зови после практики и перед разговорными фазами (разогрев, пауза, прощание).',
    response_timeout_secs: 5,
    expects_response: false,
    execution_mode: 'immediate',
    parameters: { type: 'object', properties: {} },
  },
  {
    type: 'client',
    name: 'set_phase',
    description:
      'Отметить переход фазы урока. Допустимые значения phase: connecting, warmup, diagnostic, bridge, cycle, pause, summary, farewell. Передавай ровно одно из них.',
    response_timeout_secs: 10,
    expects_response: false,
    execution_mode: 'immediate',
    parameters: {
      type: 'object',
      properties: {
        phase: {
          type: 'string',
          description:
            'Фаза урока: connecting | warmup | diagnostic | bridge | cycle | pause | summary | farewell.',
        },
      },
      required: ['phase'],
    },
  },
  {
    type: 'client',
    name: 'give_reward',
    description:
      'Показать звёздочку/похвалу за достижение ребёнка. Используй умеренно, за реальный прогресс.',
    response_timeout_secs: 10,
    expects_response: false,
    execution_mode: 'immediate',
    parameters: {
      type: 'object',
      properties: {
        label: {
          type: 'string',
          description: 'Короткая подпись к награде, например "Отлично!" или "Ты молодец!".',
        },
      },
      required: [],
    },
  },
  {
    type: 'client',
    name: 'take_break',
    description:
      'Включить или выключить режим отдыха (пауза при усталости). Передай active="start" чтобы начать паузу, active="stop" чтобы вернуться к уроку.',
    response_timeout_secs: 10,
    expects_response: false,
    execution_mode: 'immediate',
    parameters: {
      type: 'object',
      properties: {
        active: { type: 'string', description: 'start — начать паузу; stop — закончить паузу.' },
      },
      required: ['active'],
    },
  },
  {
    type: 'client',
    name: 'lesson_state',
    description:
      'Получить текущее состояние урока: фаза, сколько задач решено, какие были ошибки. Зови, если потеряла нить за время урока.',
    response_timeout_secs: 20,
    expects_response: true,
    execution_mode: 'immediate',
    parameters: { type: 'object', properties: {} },
  },
  {
    type: 'client',
    name: 'set_child_name',
    description:
      'Запомнить имя ребёнка, чтобы его реплики в чате были подписаны его именем. Зови ОДИН раз, сразу как ребёнок назвал, как его зовут.',
    response_timeout_secs: 5,
    expects_response: false,
    execution_mode: 'immediate',
    parameters: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Имя ребёнка, как он его назвал, например "Гриша".' },
      },
      required: ['name'],
    },
  },
]

export const TUTOR_TOOL_NAMES = TUTOR_TOOLS.map((t) => t.name)

/**
 * Build the PATCH/CREATE body for the tutor agent. Same REPLACE-on-object
 * discipline as the math agent: pass every baseline field so 11labs doesn't
 * reset omitted ones to defaults.
 */
export function buildTutorAgentPatchBody({ prompt, firstMessage, voiceId, toolIds }) {
  if (typeof prompt !== 'string' || prompt.length === 0) {
    throw new Error('buildTutorAgentPatchBody: prompt is required (non-empty string)')
  }
  if (typeof firstMessage !== 'string') {
    throw new Error('buildTutorAgentPatchBody: firstMessage is required (string)')
  }
  if (!Array.isArray(toolIds)) {
    throw new Error('buildTutorAgentPatchBody: toolIds must be an array')
  }
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
        voice_id: voiceId || TEACHER_VOICE_ID,
        model_id: TTS_MODEL_ID,
        stability: TTS_STABILITY,
        similarity_boost: TTS_SIMILARITY_BOOST,
        speed: TTS_SPEED,
        text_normalisation_type: TTS_TEXT_NORMALISATION,
        pronunciation_dictionary_locators: [],
      },
      conversation: {
        max_duration_seconds: MAX_CONVERSATION_DURATION_SEC,
      },
      turn: {
        // Tutor: 45s of silence before Аня re-engages (+20s vs the math agent —
        // a 9-year-old needs more time to think). Operator-requested.
        turn_timeout: 45,
        turn_eagerness: TURN_EAGERNESS,
      },
      asr: {
        quality: 'high',
        keywords: TUTOR_ASR_KEYWORDS,
      },
    },
  }
}

/** Strip HTML comments (the doc header in tutor-agent-prompt.md) before upload. */
export function stripPromptComments(md) {
  return String(md).replace(/<!--[\s\S]*?-->/g, '').trim()
}
