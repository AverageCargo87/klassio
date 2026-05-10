// lib/board/scenes/explain-column-subtraction.ts
// Объясняет вычитание в столбик (a - b).
import { registerScene } from './index'
import type { PrimitiveCall } from './types'

export function* explainColumnSubtraction(args: unknown): Generator<PrimitiveCall> {
  const { a, b } = args as { a: number; b: number }

  // Validation
  if (!Number.isInteger(a) || a <= 0) {
    throw new TypeError('explain_column_subtraction: a должно быть натуральным числом')
  }
  if (!Number.isInteger(b) || b < 0) {
    throw new TypeError('explain_column_subtraction: b должно быть неотрицательным целым числом')
  }
  if (b > a) {
    throw new TypeError('explain_column_subtraction: вычитаемое не может быть больше уменьшаемого')
  }

  const diff = a - b
  const strA = String(a)
  const strB = String(b)
  const strDiff = String(diff)

  const DIGIT_W = 32
  const COL_X = 500
  const ROW_Y1 = 130
  const ROW_Y2 = 180
  const LINE_Y = 225
  const RES_Y = 250
  const maxLen = Math.max(strA.length, strB.length)
  const colWidth = (maxLen + 1) * DIGIT_W + 20
  const lineX1 = Math.max(0, COL_X - colWidth)
  const lineX2 = Math.min(800, COL_X + 10)

  // Step 1: Intro
  yield { name: 'say', input: { text: `Вычитаем ${b} из ${a} в столбик.` } }
  yield {
    name: 'draw_text',
    input: {
      x: Math.max(10, COL_X - (maxLen + 2) * DIGIT_W),
      y: 70,
      text: `${a} - ${b} = ?`,
      fontSize: 28,
    },
  }
  yield { name: 'wait', input: { ms: 700 } }

  // Step 2: Write first number
  yield { name: 'say', input: { text: 'Записываем уменьшаемое.' } }
  yield {
    name: 'draw_text',
    input: { x: COL_X - strA.length * DIGIT_W, y: ROW_Y1, text: strA, fontSize: 32 },
  }
  yield { name: 'wait', input: { ms: 600 } }

  // Step 3: Write - sign and second number
  yield { name: 'say', input: { text: 'Под ним — вычитаемое с выравниванием по разрядам.' } }
  yield {
    name: 'draw_text',
    input: {
      x: Math.max(10, COL_X - (maxLen + 1) * DIGIT_W - 10),
      y: ROW_Y2,
      text: '-',
      fontSize: 32,
      color: 'red',
    },
  }
  yield {
    name: 'draw_text',
    input: { x: COL_X - strB.length * DIGIT_W, y: ROW_Y2, text: strB, fontSize: 32 },
  }
  yield { name: 'wait', input: { ms: 700 } }

  // Step 4: Horizontal line
  yield { name: 'say', input: { text: 'Подводим черту.' } }
  yield {
    name: 'draw_line',
    input: { x1: lineX1, y1: LINE_Y, x2: lineX2, y2: LINE_Y, stroke: 'black', strokeWidth: 2 },
  }
  yield { name: 'wait', input: { ms: 500 } }

  // Step 5: Subtract digit by digit from right
  const paddedA = strA.padStart(maxLen, '0').split('').map(Number)
  const paddedB = strB.padStart(maxLen, '0').split('').map(Number)
  const placeNames = ['единиц', 'десятков', 'сотен', 'тысяч', 'десятков тысяч']
  let borrow = 0

  for (let i = maxLen - 1; i >= 0; i--) {
    let dA = paddedA[i] - borrow
    const dB = paddedB[i]

    let needBorrow = false
    if (dA < dB) {
      needBorrow = true
      dA += 10
      borrow = 1
    } else {
      borrow = 0
    }

    const digit = dA - dB
    const placeName = placeNames[maxLen - 1 - i] ?? 'разряда'
    const borrowNote = needBorrow ? ' (занимаем 1 у следующего разряда)' : ''

    yield {
      name: 'say',
      input: {
        text: `В столбике ${placeName}: ${paddedA[i] - (needBorrow ? 1 : 0)} - ${dB}${borrowNote} = ${digit}.`,
      },
    }

    const highlightX = Math.max(0, COL_X - (maxLen - i) * DIGIT_W)
    yield {
      name: 'highlight_region',
      input: {
        x: highlightX,
        y: ROW_Y1 - 10,
        w: DIGIT_W,
        h: RES_Y - ROW_Y1 + DIGIT_W + 10,
        color: '#fff59d',
        duration_ms: 2000,
      },
    }
    yield { name: 'wait', input: { ms: 400 } }

    // Show borrow mark above current column
    if (needBorrow) {
      yield {
        name: 'draw_text',
        input: { x: Math.max(0, COL_X - (maxLen - i + 1) * DIGIT_W), y: ROW_Y1 - 30, text: '-1', fontSize: 18, color: 'red' },
      }
    }

    // Write result digit
    yield {
      name: 'draw_text',
      input: { x: Math.max(0, COL_X - (maxLen - i) * DIGIT_W), y: RES_Y, text: String(digit), fontSize: 32 },
    }
    yield { name: 'wait', input: { ms: 600 } }
  }

  // Final result
  yield { name: 'say', input: { text: `Ответ: ${strDiff}.` } }
  yield {
    name: 'draw_text',
    input: {
      x: Math.max(0, COL_X - strDiff.length * DIGIT_W),
      y: RES_Y + 50,
      text: strDiff,
      fontSize: 36,
      color: 'green',
      bold: true,
    },
  }
  yield {
    name: 'highlight_region',
    input: {
      x: Math.max(0, COL_X - strDiff.length * DIGIT_W - 10),
      y: RES_Y - 5,
      w: strDiff.length * DIGIT_W + 20,
      h: 45,
      color: '#a5f3fc',
      duration_ms: 3000,
    },
  }
  yield { name: 'wait', input: { ms: 800 } }
}

registerScene('explain_column_subtraction', explainColumnSubtraction as (args: unknown) => Generator<PrimitiveCall>)
