// lib/board/scenes/explain-simple-equation.ts
// Объясняет решение простого линейного уравнения: c·x = v (тип 'multiply') или x + c = v (тип 'add').
import { registerScene } from './index'
import type { PrimitiveCall } from './types'

export function* explainSimpleEquation(args: unknown): Generator<PrimitiveCall> {
  const { coefficient, value, type } = args as { coefficient: number; value: number; type: string }

  if (!isFinite(coefficient) || !isFinite(value)) {
    throw new TypeError('explain_simple_equation: нужны конечные числа')
  }
  if (type !== 'multiply' && type !== 'add') {
    throw new TypeError('explain_simple_equation: type должен быть «multiply» или «add»')
  }
  if (type === 'multiply' && coefficient === 0) {
    throw new TypeError('explain_simple_equation: коэффициент не может быть 0 для умножения')
  }

  const X = 200
  const Y = 150

  if (type === 'multiply') {
    const result = value / coefficient

    yield {
      name: 'say',
      input: { text: `Решаем уравнение: ${coefficient} · x = ${value}.` },
    }
    yield {
      name: 'draw_text',
      input: { x: X, y: Y, text: `${coefficient} · x = ${value}`, fontSize: 36 },
    }
    yield { name: 'wait', input: { ms: 700 } }

    yield {
      name: 'say',
      input: { text: `Чтобы найти x, делим обе части на ${coefficient}.` },
    }
    yield {
      name: 'draw_text',
      input: { x: X, y: Y + 70, text: `x = ${value} ÷ ${coefficient}`, fontSize: 32, color: 'blue' },
    }
    yield { name: 'wait', input: { ms: 700 } }

    yield {
      name: 'draw_text',
      input: { x: X, y: Y + 130, text: `x = ${result}`, fontSize: 36 },
    }
    yield { name: 'wait', input: { ms: 700 } }

    yield {
      name: 'say',
      input: { text: `Проверка: ${coefficient} · ${result} = ${coefficient * result}.` },
    }
    yield {
      name: 'draw_text',
      input: {
        x: X,
        y: Y + 200,
        text: `Проверка: ${coefficient} · ${result} = ${coefficient * result} ✓`,
        fontSize: 22,
        color: 'green',
      },
    }
    yield { name: 'wait', input: { ms: 600 } }
    yield {
      name: 'highlight_region',
      input: { x: X - 10, y: Y + 122, w: 200, h: 48, color: '#a5f3fc', duration_ms: 3500 },
    }
  } else {
    // type === 'add': x + coefficient = value  →  x = value - coefficient
    const result = value - coefficient

    yield {
      name: 'say',
      input: { text: `Решаем уравнение: x + ${coefficient} = ${value}.` },
    }
    yield {
      name: 'draw_text',
      input: { x: X, y: Y, text: `x + ${coefficient} = ${value}`, fontSize: 36 },
    }
    yield { name: 'wait', input: { ms: 700 } }

    yield {
      name: 'say',
      input: { text: `Чтобы найти x, вычитаем ${coefficient} из обеих частей.` },
    }
    yield {
      name: 'draw_text',
      input: { x: X, y: Y + 70, text: `x = ${value} − ${coefficient}`, fontSize: 32, color: 'blue' },
    }
    yield { name: 'wait', input: { ms: 700 } }

    yield {
      name: 'draw_text',
      input: { x: X, y: Y + 130, text: `x = ${result}`, fontSize: 36 },
    }
    yield { name: 'wait', input: { ms: 700 } }

    yield {
      name: 'say',
      input: { text: `Проверка: ${result} + ${coefficient} = ${result + coefficient}.` },
    }
    yield {
      name: 'draw_text',
      input: {
        x: X,
        y: Y + 200,
        text: `Проверка: ${result} + ${coefficient} = ${result + coefficient} ✓`,
        fontSize: 22,
        color: 'green',
      },
    }
    yield { name: 'wait', input: { ms: 600 } }
    yield {
      name: 'highlight_region',
      input: { x: X - 10, y: Y + 122, w: 180, h: 48, color: '#a5f3fc', duration_ms: 3500 },
    }
  }
}

registerScene('explain_simple_equation', explainSimpleEquation as (args: unknown) => Generator<PrimitiveCall>)
