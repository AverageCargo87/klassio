// lib/board/scenes/explain-long-division.ts
// Объясняет деление «уголком» (длинное деление) — классический русский метод.
import { registerScene } from './index'
import type { PrimitiveCall } from './types'

export function* explainLongDivision(args: unknown): Generator<PrimitiveCall> {
  const { dividend, divisor } = args as { dividend: number; divisor: number }

  // Validation (T-05-02-03)
  if (!Number.isInteger(dividend) || !Number.isInteger(divisor) || divisor === 0) {
    throw new TypeError('explain_long_division: делитель не может быть 0')
  }
  if (dividend <= 0 || divisor < 0) {
    throw new TypeError('explain_long_division: dividend и divisor должны быть натуральными числами')
  }

  const strDividend = String(dividend)
  const DIGIT_W = 22
  const X_LEFT = 80
  const Y_NUMBERS = 160
  const BRACKET_X = X_LEFT + strDividend.length * DIGIT_W + 12
  const Y_BRACKET_TOP = 130
  const Y_BRACKET_BOT = 185

  yield { name: 'say', input: { text: `Делим ${dividend} на ${divisor} в столбик.` } }

  // Draw dividend
  yield {
    name: 'draw_text',
    input: { x: X_LEFT, y: Y_NUMBERS, text: strDividend, fontSize: 28 },
  }
  yield { name: 'wait', input: { ms: 500 } }

  // Draw divisor to the right of bracket
  yield {
    name: 'draw_text',
    input: { x: BRACKET_X + 6, y: Y_NUMBERS, text: String(divisor), fontSize: 28 },
  }

  // Draw division bracket: vertical line + horizontal line above quotient area
  yield {
    name: 'draw_line',
    input: { x1: BRACKET_X, y1: Y_BRACKET_TOP, x2: BRACKET_X, y2: Y_BRACKET_BOT, stroke: 'black', strokeWidth: 2 },
  }
  yield {
    name: 'draw_line',
    input: {
      x1: BRACKET_X,
      y1: Y_BRACKET_TOP,
      x2: Math.min(790, BRACKET_X + 200),
      y2: Y_BRACKET_TOP,
      stroke: 'black',
      strokeWidth: 2,
    },
  }
  yield { name: 'wait', input: { ms: 500 } }

  // Long division algorithm: process each digit of dividend
  let current = 0
  let quotientStr = ''
  let quotientX = BRACKET_X + 6  // x position for next quotient digit
  let stepY = 210  // y for first subtraction row

  for (let i = 0; i < strDividend.length; i++) {
    current = current * 10 + Number(strDividend[i])

    // Skip leading digits that are less than divisor (only for the very first group)
    if (current < divisor && quotientStr === '') {
      continue
    }

    const q = Math.floor(current / divisor)
    const product = q * divisor
    const remainder = current - product
    quotientStr += String(q)

    yield {
      name: 'say',
      input: { text: `Делим ${current} на ${divisor}: получаем ${q}.` },
    }

    // Write quotient digit above the bracket line
    yield {
      name: 'draw_text',
      input: { x: quotientX, y: Y_BRACKET_TOP + 5, text: String(q), fontSize: 26, color: 'blue' },
    }
    quotientX += DIGIT_W
    yield { name: 'wait', input: { ms: 500 } }

    // Show subtraction step if space allows
    if (stepY <= 530) {
      // Write "− product" below current working number
      yield {
        name: 'draw_text',
        input: { x: X_LEFT, y: stepY, text: `− ${product}`, fontSize: 24, color: 'grey' },
      }
      yield {
        name: 'draw_line',
        input: {
          x1: X_LEFT,
          y1: stepY + 32,
          x2: Math.min(790, X_LEFT + (String(current).length + 2) * DIGIT_W),
          y2: stepY + 32,
          stroke: 'black',
          strokeWidth: 1,
        },
      }
      yield { name: 'wait', input: { ms: 500 } }

      // Write remainder
      yield {
        name: 'draw_text',
        input: { x: X_LEFT, y: stepY + 40, text: String(remainder), fontSize: 24 },
      }
      yield { name: 'wait', input: { ms: 600 } }
      stepY += 80
    }

    current = remainder
  }

  // Final conclusion
  const finalQuotient = Math.floor(dividend / divisor)
  const finalRemainder = dividend % divisor
  const conclusionText =
    finalRemainder === 0
      ? `${dividend} ÷ ${divisor} = ${finalQuotient}.`
      : `${dividend} ÷ ${divisor} = ${finalQuotient}, остаток ${finalRemainder}.`

  yield { name: 'say', input: { text: conclusionText } }
  yield {
    name: 'highlight_region',
    input: {
      x: BRACKET_X,
      y: Y_BRACKET_TOP - 5,
      w: Math.min(200, quotientStr.length * DIGIT_W + 20),
      h: 38,
      color: '#a5f3fc',
      duration_ms: 3500,
    },
  }
}

registerScene('explain_long_division', explainLongDivision as (args: unknown) => Generator<PrimitiveCall>)
