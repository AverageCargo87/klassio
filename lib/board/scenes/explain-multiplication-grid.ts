// lib/board/scenes/explain-multiplication-grid.ts
// Объясняет умножение двух натуральных чисел в столбик (метод частичных произведений).
import { registerScene } from './index'
import type { PrimitiveCall } from './types'

export function* explainMultiplicationGrid(args: unknown): Generator<PrimitiveCall> {
  const { a, b } = args as { a: number; b: number }

  // Validation (T-05-02)
  if (!Number.isInteger(a) || !Number.isInteger(b) || a <= 0 || b <= 0) {
    throw new TypeError('explain_multiplication_grid: a и b должны быть натуральными числами')
  }

  const result = a * b
  const strA = String(a)
  const strB = String(b)
  const strResult = String(result)

  // Canvas layout: right-aligned column, adapted to number length
  const maxLen = Math.max(strA.length, strB.length, strResult.length)
  const DIGIT_W = Math.max(20, Math.min(32, Math.floor(400 / (maxLen + 2))))
  const RIGHT_X = Math.min(520, 180 + maxLen * DIGIT_W)
  const Y_TOP = 100

  yield { name: 'say', input: { text: `Умножаем ${a} на ${b} в столбик.` } }

  // Write first number (right-aligned)
  yield {
    name: 'draw_text',
    input: { x: RIGHT_X - strA.length * DIGIT_W, y: Y_TOP, text: strA, fontSize: 32 },
  }
  yield { name: 'wait', input: { ms: 600 } }

  // Write × sign and second number (right-aligned)
  yield {
    name: 'draw_text',
    input: {
      x: Math.max(10, RIGHT_X - strB.length * DIGIT_W - DIGIT_W - 4),
      y: Y_TOP + 45,
      text: '×',
      fontSize: 32,
      color: 'blue',
    },
  }
  yield {
    name: 'draw_text',
    input: { x: RIGHT_X - strB.length * DIGIT_W, y: Y_TOP + 45, text: strB, fontSize: 32 },
  }
  yield { name: 'wait', input: { ms: 500 } }

  // First horizontal line
  const lineLeft = Math.max(10, RIGHT_X - (maxLen + 2) * DIGIT_W)
  const lineRight = Math.min(790, RIGHT_X + 10)
  yield {
    name: 'draw_line',
    input: { x1: lineLeft, y1: Y_TOP + 88, x2: lineRight, y2: Y_TOP + 88, stroke: 'black', strokeWidth: 2 },
  }
  yield { name: 'wait', input: { ms: 400 } }

  // Compute partial products: each digit of b, right to left
  // e.g. for b=23: digit at index 1 = 3 (units), digit at index 0 = 2 (tens)
  const partials: { value: number; shift: number; digitOfB: number }[] = []
  for (let i = strB.length - 1; i >= 0; i--) {
    const digit = Number(strB[i])
    const shift = strB.length - 1 - i
    partials.push({ value: a * digit, shift, digitOfB: digit })
  }

  let partialY = Y_TOP + 110

  for (let idx = 0; idx < partials.length; idx++) {
    const { value, shift, digitOfB } = partials[idx]
    const partialStr = String(value)
    const trailingZeros = '0'.repeat(shift)
    const displayStr = partialStr + trailingZeros

    yield {
      name: 'say',
      input: {
        text: `Умножаем ${a} на ${digitOfB}: ${value}.${shift > 0 ? ` Записываем со сдвигом на ${shift} позицию.` : ''}`,
      },
    }
    yield {
      name: 'draw_text',
      input: {
        x: Math.max(10, RIGHT_X - displayStr.length * DIGIT_W),
        y: partialY,
        text: displayStr,
        fontSize: 28,
      },
    }
    yield { name: 'wait', input: { ms: 700 } }
    partialY += 45
  }

  // Second horizontal line
  yield {
    name: 'draw_line',
    input: { x1: lineLeft, y1: partialY, x2: lineRight, y2: partialY, stroke: 'black', strokeWidth: 2 },
  }
  yield { name: 'wait', input: { ms: 400 } }

  // Final result
  yield {
    name: 'say',
    input: { text: `Складываем частичные произведения: получаем ${result}.` },
  }
  yield {
    name: 'draw_text',
    input: {
      x: Math.max(10, RIGHT_X - strResult.length * DIGIT_W),
      y: partialY + 15,
      text: strResult,
      fontSize: 32,
    },
  }
  yield { name: 'wait', input: { ms: 700 } }
  yield {
    name: 'highlight_region',
    input: {
      x: Math.max(0, RIGHT_X - strResult.length * DIGIT_W - 10),
      y: partialY + 8,
      w: strResult.length * DIGIT_W + 20,
      h: 44,
      color: '#a5f3fc',
      duration_ms: 3500,
    },
  }
  yield { name: 'say', input: { text: `Ответ: ${result}.` } }
}

registerScene('explain_multiplication_grid', explainMultiplicationGrid as (args: unknown) => Generator<PrimitiveCall>)
