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

export type SceneToolName =
  | 'explain_column_addition'
  | 'explain_column_subtraction'
  | 'explain_multiplication_grid'
  | 'explain_long_division'
  | 'explain_fraction_addition'
  | 'explain_fraction_subtraction'
  | 'explain_fraction_comparison'
  | 'explain_fraction_simplification'
  | 'explain_decimal_addition'
  | 'explain_decimal_multiplication'
  | 'explain_percent_calculation'
  | 'explain_rectangle_area'
  | 'explain_rectangle_perimeter'
  | 'explain_simple_equation'
  | 'explain_arithmetic_mean'

export type BoardToolName = DrawToolName | SceneToolName

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

export interface SceneToolSchema {
  name: SceneToolName
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

// ── Scene tool schemas (15 explain_* tools for Phase 5) ────────────────────────
// All descriptions in Russian to help the LLM choose the right scene.

export const sceneTools: SceneToolSchema[] = [
  {
    name: 'explain_column_addition',
    description:
      'Объясни сложение двух натуральных чисел в столбик. Используй для тем «сложение многозначных чисел», «сложение в столбик». Подходит для чисел 2–5 знаков. Показывает запись чисел, черту, суммирование по разрядам с переносом, итоговый ответ.',
    parameters: {
      type: 'object',
      properties: {
        a: { type: 'number', description: 'Первое слагаемое (натуральное число)' },
        b: { type: 'number', description: 'Второе слагаемое (натуральное число)' },
      },
      required: ['a', 'b'],
      additionalProperties: false,
    },
  },
  {
    name: 'explain_column_subtraction',
    description:
      'Объясни вычитание в столбик (a − b). Используй для тем «вычитание многозначных чисел», «вычитание в столбик». Показывает запись чисел, черту, вычитание по разрядам с заимствованием, итог.',
    parameters: {
      type: 'object',
      properties: {
        a: { type: 'number', description: 'Уменьшаемое' },
        b: { type: 'number', description: 'Вычитаемое (b ≤ a)' },
      },
      required: ['a', 'b'],
      additionalProperties: false,
    },
  },
  {
    name: 'explain_multiplication_grid',
    description:
      'Объясни умножение в столбик (a × b). Используй для тем «умножение многозначных чисел», «умножение в столбик». Показывает запись, частичные произведения по каждой цифре множителя, их сдвиг и суммирование.',
    parameters: {
      type: 'object',
      properties: {
        a: { type: 'number', description: 'Множитель 1 (до 4 знаков)' },
        b: { type: 'number', description: 'Множитель 2 (до 3 знаков)' },
      },
      required: ['a', 'b'],
      additionalProperties: false,
    },
  },
  {
    name: 'explain_long_division',
    description:
      'Объясни деление в столбик (dividend ÷ divisor). Используй для тем «деление в столбик», «деление с остатком». Показывает уголок, пошаговое деление, частное, остаток.',
    parameters: {
      type: 'object',
      properties: {
        dividend: { type: 'number', description: 'Делимое' },
        divisor: { type: 'number', description: 'Делитель (≠ 0)' },
      },
      required: ['dividend', 'divisor'],
      additionalProperties: false,
    },
  },
  {
    name: 'explain_fraction_addition',
    description:
      'Объясни сложение дробей a/b + c/d с приведением к общему знаменателю. Используй для тем «сложение дробей с разными знаменателями».',
    parameters: {
      type: 'object',
      properties: {
        a: { type: 'number', description: 'Числитель первой дроби' },
        b: { type: 'number', description: 'Знаменатель первой дроби (≠ 0)' },
        c: { type: 'number', description: 'Числитель второй дроби' },
        d: { type: 'number', description: 'Знаменатель второй дроби (≠ 0)' },
      },
      required: ['a', 'b', 'c', 'd'],
      additionalProperties: false,
    },
  },
  {
    name: 'explain_fraction_subtraction',
    description:
      'Объясни вычитание дробей a/b − c/d с приведением к общему знаменателю. Используй для тем «вычитание дробей».',
    parameters: {
      type: 'object',
      properties: {
        a: { type: 'number', description: 'Числитель уменьшаемой дроби' },
        b: { type: 'number', description: 'Знаменатель уменьшаемой дроби (≠ 0)' },
        c: { type: 'number', description: 'Числитель вычитаемой дроби' },
        d: { type: 'number', description: 'Знаменатель вычитаемой дроби (≠ 0)' },
      },
      required: ['a', 'b', 'c', 'd'],
      additionalProperties: false,
    },
  },
  {
    name: 'explain_fraction_comparison',
    description:
      'Объясни сравнение дробей a/b и c/d (через приведение к общему знаменателю). Используй для тем «сравнение дробей».',
    parameters: {
      type: 'object',
      properties: {
        a: { type: 'number', description: 'Числитель первой дроби' },
        b: { type: 'number', description: 'Знаменатель первой дроби (≠ 0)' },
        c: { type: 'number', description: 'Числитель второй дроби' },
        d: { type: 'number', description: 'Знаменатель второй дроби (≠ 0)' },
      },
      required: ['a', 'b', 'c', 'd'],
      additionalProperties: false,
    },
  },
  {
    name: 'explain_fraction_simplification',
    description:
      'Объясни сокращение дроби numerator/denominator через нахождение НОД. Используй для тем «сокращение дробей», «несократимые дроби».',
    parameters: {
      type: 'object',
      properties: {
        numerator: { type: 'number', description: 'Числитель дроби' },
        denominator: { type: 'number', description: 'Знаменатель дроби (≠ 0)' },
      },
      required: ['numerator', 'denominator'],
      additionalProperties: false,
    },
  },
  {
    name: 'explain_decimal_addition',
    description:
      'Объясни сложение десятичных дробей (a + b) с выравниванием запятых. Используй для тем «сложение десятичных дробей».',
    parameters: {
      type: 'object',
      properties: {
        a: { type: 'number', description: 'Первое слагаемое (десятичное)' },
        b: { type: 'number', description: 'Второе слагаемое (десятичное)' },
      },
      required: ['a', 'b'],
      additionalProperties: false,
    },
  },
  {
    name: 'explain_decimal_multiplication',
    description:
      'Объясни умножение десятичных дробей (a × b): умножение как целые числа, затем постановка запятой по сумме десятичных разрядов.',
    parameters: {
      type: 'object',
      properties: {
        a: { type: 'number', description: 'Первый множитель (десятичный)' },
        b: { type: 'number', description: 'Второй множитель (десятичный)' },
      },
      required: ['a', 'b'],
      additionalProperties: false,
    },
  },
  {
    name: 'explain_percent_calculation',
    description:
      'Объясни нахождение percent% от числа value. Например: «Найди 15% от 200». Показывает формулу: value × percent / 100.',
    parameters: {
      type: 'object',
      properties: {
        value: { type: 'number', description: 'Число, от которого ищем процент' },
        percent: { type: 'number', description: 'Процент (например, 15 для 15%)' },
      },
      required: ['value', 'percent'],
      additionalProperties: false,
    },
  },
  {
    name: 'explain_rectangle_area',
    description:
      'Объясни нахождение площади прямоугольника S = width × height. Рисует прямоугольник, подписывает стороны, формулу и результат.',
    parameters: {
      type: 'object',
      properties: {
        width: { type: 'number', description: 'Ширина прямоугольника' },
        height: { type: 'number', description: 'Высота прямоугольника' },
      },
      required: ['width', 'height'],
      additionalProperties: false,
    },
  },
  {
    name: 'explain_rectangle_perimeter',
    description:
      'Объясни нахождение периметра прямоугольника P = 2 × (width + height). Рисует прямоугольник, подписывает стороны, формулу, результат.',
    parameters: {
      type: 'object',
      properties: {
        width: { type: 'number', description: 'Ширина прямоугольника' },
        height: { type: 'number', description: 'Высота прямоугольника' },
      },
      required: ['width', 'height'],
      additionalProperties: false,
    },
  },
  {
    name: 'explain_simple_equation',
    description:
      'Объясни решение простого уравнения вида «coefficient × x = value» или «x + coefficient = value». Показывает уравнение, шаги нахождения x, проверку.',
    parameters: {
      type: 'object',
      properties: {
        coefficient: { type: 'number', description: 'Коэффициент (≠ 0)' },
        value: { type: 'number', description: 'Правая часть уравнения' },
        type: { type: 'string', description: '«multiply» для c·x=v, «add» для x+c=v' },
      },
      required: ['coefficient', 'value', 'type'],
      additionalProperties: false,
    },
  },
  {
    name: 'explain_arithmetic_mean',
    description:
      'Объясни нахождение среднего арифметического набора чисел: сумма всех / количество. Записывает числа, подсчёт суммы, деление, результат.',
    parameters: {
      type: 'object',
      properties: {
        numbers: { type: 'array', description: 'Массив чисел (от 2 до 8 элементов)' },
      },
      required: ['numbers'],
      additionalProperties: false,
    },
  },
]

// Combined tool list: 9 primitives + 15 scenes = 24 tools + finish (already in drawTools) = 25 total
export const allBoardTools: (DrawToolSchema | SceneToolSchema)[] = [...drawTools, ...sceneTools]
