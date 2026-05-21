// lib/board/scenes/explain-column-addition.ts
// Объясняет сложение двух натуральных чисел в столбик.
import { registerScene } from './index'
import type { PrimitiveCall } from './types'
import { getMonoCharWidth } from '../typography'

export function* explainColumnAddition(args: unknown): Generator<PrimitiveCall> {
  const { a, b } = args as { a: number; b: number }

  // Validation (T-05-01-01)
  if (!Number.isInteger(a) || !Number.isInteger(b) || a <= 0 || b <= 0) {
    throw new TypeError('explain_column_addition: a и b должны быть натуральными числами (целые, больше нуля)')
  }

  const sum = a + b
  const strA = String(a)
  const strB = String(b)
  const strSum = String(sum)

  // Canvas layout: centered around x=400, numbers aligned to right edge at COL_X.
  // DIGIT_W must match the staggered renderer step in lib/board/executor.ts —
  // otherwise highlight/result coords miss the rendered digits.
  const DIGIT_W = getMonoCharWidth(32)
  const COL_X = 500      // right edge of column
  const ROW_Y1 = 130     // y of first number (a)
  const ROW_Y2 = 180     // y of second number (b)
  const LINE_Y = 225     // y of horizontal line
  const RES_Y = 250      // y of result row
  const maxLen = Math.max(strA.length, strB.length)
  const colWidth = (maxLen + 1) * DIGIT_W + 20
  const lineX1 = COL_X - colWidth
  const lineX2 = COL_X + 10

  // Step 1: Intro
  yield { name: 'say', input: { text: `Складываем ${a} и ${b} в столбик.` } }
  yield {
    name: 'draw_text',
    input: {
      x: Math.max(10, COL_X - (maxLen + 2) * DIGIT_W),
      y: 70,
      text: `${a} + ${b} = ?`,
      fontSize: 28,
      color: 'black',
    },
  }
  yield { name: 'wait', input: { ms: 3000 } }

  // Step 2: Write first number (right-aligned)
  yield { name: 'say', input: { text: 'Записываем первое число.' } }
  yield {
    name: 'draw_text',
    input: {
      x: COL_X - strA.length * DIGIT_W,
      y: ROW_Y1,
      text: strA,
      fontSize: 32,
    },
  }
  yield { name: 'wait', input: { ms: 3000 } }

  // Step 3: Write + sign and second number
  yield { name: 'say', input: { text: 'Под ним — второе число, разряды под разрядами.' } }
  yield {
    name: 'draw_text',
    input: {
      x: Math.max(10, COL_X - (maxLen + 1) * DIGIT_W - 10),
      y: ROW_Y2,
      text: '+',
      fontSize: 32,
      color: 'blue',
    },
  }
  yield {
    name: 'draw_text',
    input: {
      x: COL_X - strB.length * DIGIT_W,
      y: ROW_Y2,
      text: strB,
      fontSize: 32,
    },
  }
  yield { name: 'wait', input: { ms: 3500 } }

  // Step 4: Horizontal line
  yield { name: 'say', input: { text: 'Подводим черту.' } }
  yield {
    name: 'draw_line',
    input: { x1: Math.max(0, lineX1), y1: LINE_Y, x2: Math.min(800, lineX2), y2: LINE_Y, stroke: 'black', strokeWidth: 2 },
  }
  yield { name: 'wait', input: { ms: 3000 } }

  // Step 5: Add digit by digit from right (units → tens → hundreds ...)
  const paddedA = strA.padStart(maxLen, '0')
  const paddedB = strB.padStart(maxLen, '0')
  let carry = 0
  const resultDigits: string[] = []

  const placeNames = ['единиц', 'десятков', 'сотен', 'тысяч', 'десятков тысяч']

  for (let i = maxLen - 1; i >= 0; i--) {
    const digitA = Number(paddedA[i])
    const digitB = Number(paddedB[i])
    const colSum = digitA + digitB + carry
    const digit = colSum % 10
    const newCarry = Math.floor(colSum / 10)

    const placeName = placeNames[maxLen - 1 - i] ?? 'разряда'
    const carryNote = carry > 0 ? ' + 1 (перенос)' : ''

    yield {
      name: 'say',
      input: {
        text: `В столбике ${placeName}: ${digitA} + ${digitB}${carryNote} = ${colSum}. Пишем ${digit}${newCarry > 0 ? ', переносим 1' : ''}.`,
      },
    }

    // Highlight current column. Width slightly less than DIGIT_W so adjacent
    // column highlights don't touch borders. Active-highlight dedup in
    // executor (lib/board/executor.ts highlight_region case) also ensures
    // only one highlight is on the canvas at a time — defence in depth.
    const highlightX = Math.max(0, COL_X - (maxLen - i) * DIGIT_W) + 2
    yield {
      name: 'highlight_region',
      input: {
        x: highlightX,
        y: ROW_Y1 - 10,
        w: DIGIT_W - 4,
        h: RES_Y - ROW_Y1 + DIGIT_W + 10,
        color: '#fff59d',
        duration_ms: 4000,
      },
    }
    // Wait must outlast highlight duration so child reads the column before
    // the next one lights up. 4500ms > 4000ms duration_ms.
    yield { name: 'wait', input: { ms: 4500 } }

    // Show carry digit above next column if needed
    if (newCarry > 0 && i > 0) {
      const carryX = Math.max(0, COL_X - (maxLen - i + 1) * DIGIT_W)
      yield {
        name: 'draw_text',
        input: { x: carryX, y: ROW_Y1 - 30, text: '1', fontSize: 20, color: 'red' },
      }
      yield { name: 'wait', input: { ms: 2500 } }
    }

    // Write result digit
    const resX = COL_X - (maxLen - i) * DIGIT_W
    yield {
      name: 'draw_text',
      input: { x: Math.max(0, resX), y: RES_Y, text: String(digit), fontSize: 32 },
    }
    yield { name: 'wait', input: { ms: 3500 } }

    resultDigits.unshift(String(digit))
    carry = newCarry
  }

  // Final carry produces leading digit
  if (carry > 0) {
    yield { name: 'say', input: { text: `Переносим единицу в следующий разряд — пишем ${carry}.` } }
    yield {
      name: 'draw_text',
      input: { x: Math.max(0, COL_X - (maxLen + 1) * DIGIT_W), y: RES_Y, text: String(carry), fontSize: 32 },
    }
    resultDigits.unshift(String(carry))
    yield { name: 'wait', input: { ms: 3500 } }
  }

  // Write the full result as a separate text for easy testing assertion
  yield { name: 'say', input: { text: `Ответ: ${strSum}. Молодец!` } }
  yield {
    name: 'draw_text',
    input: {
      x: Math.max(0, COL_X - strSum.length * DIGIT_W),
      y: RES_Y + 50,
      text: strSum,
      fontSize: 36,
      color: 'green',
      bold: true,
    },
  }
  yield {
    name: 'highlight_region',
    input: {
      x: Math.max(0, COL_X - strSum.length * DIGIT_W - 10),
      y: RES_Y - 5,
      w: strSum.length * DIGIT_W + 20,
      h: 45,
      color: '#a5f3fc',
      duration_ms: 5000,
    },
  }
  yield { name: 'wait', input: { ms: 3000 } }
}

registerScene('explain_column_addition', explainColumnAddition as (args: unknown) => Generator<PrimitiveCall>)
