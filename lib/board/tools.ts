// Provider-agnostic tool схемы для LLM.
// Координаты — пиксели tldraw-канваса. (0,0) — левый верх.
// Видимая область канваса ~ 800x600. Центр ~ (400, 300).
//
// Поле parameters — это стандартный JSON Schema. И Anthropic (через input_schema),
// и OpenAI (через parameters), и любой другой LLM с function calling использует одну и ту же
// форму. Адаптация под конкретного провайдера — в route.ts.

export type DrawToolName =
  | 'draw_text'
  | 'draw_rectangle'
  | 'draw_line'
  | 'draw_circle'
  | 'draw_arrow'
  | 'highlight_region'
  | 'wait'
  | 'say'
  | 'finish'

export interface JSONSchemaProperty {
  type: 'string' | 'number' | 'boolean' | 'object' | 'array'
  description?: string
}

export interface DrawToolSchema {
  name: DrawToolName
  description: string
  parameters: {
    type: 'object'
    properties: Record<string, JSONSchemaProperty>
    required: string[]
    additionalProperties?: boolean
  }
}

export const drawTools: DrawToolSchema[] = [
  {
    name: 'draw_text',
    description:
      'Нарисовать текст. Используй для подписей, цифр, объяснений. Для цифр в столбик предпочитай monospace и выравнивай разряды по координатам (один символ ~ 14px при fontSize 24).',
    parameters: {
      type: 'object',
      properties: {
        x: { type: 'number', description: 'X левого верхнего угла текста' },
        y: { type: 'number', description: 'Y левого верхнего угла текста' },
        text: { type: 'string', description: 'Что написать' },
        fontSize: {
          type: 'number',
          description: 'Размер шрифта в пикселях. 12=мелко, 24=стандарт, 36=крупно, 48=очень крупно. По умолчанию 24.',
        },
        color: {
          type: 'string',
          description:
            'Один из: black, grey, red, light-red, orange, yellow, green, light-green, blue, light-blue, violet, light-violet. Или hex (#rrggbb) — будет приближено к ближайшему из них.',
        },
        bold: { type: 'boolean', description: 'Жирный текст' },
      },
      required: ['x', 'y', 'text'],
      additionalProperties: false,
    },
  },
  {
    name: 'draw_rectangle',
    description: 'Нарисовать прямоугольник по левому верхнему углу и размерам.',
    parameters: {
      type: 'object',
      properties: {
        x: { type: 'number', description: 'X левого верхнего угла' },
        y: { type: 'number', description: 'Y левого верхнего угла' },
        w: { type: 'number', description: 'Ширина в пикселях' },
        h: { type: 'number', description: 'Высота в пикселях' },
        fill: {
          type: 'string',
          description: 'Имя цвета заливки или "none". Если задано — прямоугольник будет залит полупрозрачно тем же цветом, что и обводка.',
        },
        stroke: { type: 'string', description: 'Цвет обводки (имя или #hex).' },
      },
      required: ['x', 'y', 'w', 'h'],
      additionalProperties: false,
    },
  },
  {
    name: 'draw_line',
    description: 'Нарисовать прямую линию между двумя точками.',
    parameters: {
      type: 'object',
      properties: {
        x1: { type: 'number' },
        y1: { type: 'number' },
        x2: { type: 'number' },
        y2: { type: 'number' },
        stroke: { type: 'string', description: 'Цвет линии.' },
        strokeWidth: {
          type: 'number',
          description: 'Толщина: <=2 тонкая, 3-4 средняя, 5-8 толстая, >8 очень толстая.',
        },
      },
      required: ['x1', 'y1', 'x2', 'y2'],
      additionalProperties: false,
    },
  },
  {
    name: 'draw_circle',
    description: 'Нарисовать круг по центру и радиусу.',
    parameters: {
      type: 'object',
      properties: {
        x: { type: 'number', description: 'X центра' },
        y: { type: 'number', description: 'Y центра' },
        radius: { type: 'number', description: 'Радиус в пикселях' },
        fill: { type: 'string', description: 'Имя цвета заливки или "none".' },
        stroke: { type: 'string', description: 'Цвет обводки.' },
      },
      required: ['x', 'y', 'radius'],
      additionalProperties: false,
    },
  },
  {
    name: 'draw_arrow',
    description: 'Нарисовать стрелку с опциональной текстовой меткой.',
    parameters: {
      type: 'object',
      properties: {
        x1: { type: 'number', description: 'X начала' },
        y1: { type: 'number', description: 'Y начала' },
        x2: { type: 'number', description: 'X острия' },
        y2: { type: 'number', description: 'Y острия' },
        label: { type: 'string', description: 'Подпись возле стрелки (опционально).' },
      },
      required: ['x1', 'y1', 'x2', 'y2'],
      additionalProperties: false,
    },
  },
  {
    name: 'highlight_region',
    description:
      'Временная цветная подсветка прямоугольной области. Через duration_ms подсветка сама исчезнет. Используй чтобы привлечь внимание к текущему шагу объяснения.',
    parameters: {
      type: 'object',
      properties: {
        x: { type: 'number' },
        y: { type: 'number' },
        w: { type: 'number' },
        h: { type: 'number' },
        color: { type: 'string', description: 'Hex-цвет вида #ffff00 или имя цвета.' },
        duration_ms: { type: 'number', description: 'Через сколько мс убрать подсветку.' },
      },
      required: ['x', 'y', 'w', 'h', 'color', 'duration_ms'],
      additionalProperties: false,
    },
  },
  {
    name: 'wait',
    description:
      'Пауза перед следующим шагом для эффекта анимации. Обязательно использовать ПОСЛЕ каждого draw_* / highlight_region, кроме когда два действия логически неделимы (например, цифра + сразу её рамка). Типичное значение 700-1200мс — ребёнок должен успеть понять что появилось.',
    parameters: {
      type: 'object',
      properties: {
        ms: { type: 'number', description: 'Сколько миллисекунд ждать.' },
      },
      required: ['ms'],
      additionalProperties: false,
    },
  },
  {
    name: 'say',
    description:
      'Произнести короткую фразу-объяснение текущего шага. Не рисует на канвасе. Показывается в правой панели как реплика учителя и (в будущем) озвучивается голосом синхронно с рисованием. Используй ПЕРЕД каждым визуальным шагом — сначала скажи что сейчас будешь делать и зачем, потом нарисуй. После say обычно идёт серия draw_* + wait.',
    parameters: {
      type: 'object',
      properties: {
        text: {
          type: 'string',
          description: 'Короткая фраза 5-20 слов на русском, разговорным тоном.',
        },
      },
      required: ['text'],
      additionalProperties: false,
    },
  },
  {
    name: 'finish',
    description:
      'Сигнал что объяснение ПОЛНОСТЬЮ завершено. Вызывай ТОЛЬКО ОДИН РАЗ в самом конце, когда все цифры на доске, ответ выписан, всё подсвечено. До тех пор не вызывай — иначе обрыв на полуслове. После finish ничего больше не вызывай.',
    parameters: {
      type: 'object',
      properties: {},
      required: [],
      additionalProperties: false,
    },
  },
]
