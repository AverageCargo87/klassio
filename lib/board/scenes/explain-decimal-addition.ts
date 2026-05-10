// lib/board/scenes/explain-decimal-addition.ts
// Объясняет сложение десятичных дробей с выравниванием запятых.
import { registerScene } from './index'
import type { PrimitiveCall } from './types'

// Format number as decimal string with Russian comma notation
function formatDecimal(n: number): string {
  // Use period in internal calc, show as-is
  const s = String(n)
  // Replace dot with comma for Russian notation display
  return s.replace('.', ',')
}

// Count decimal places
function decimalPlaces(n: number): number {
  const s = String(n)
  const dotIdx = s.indexOf('.')
  if (dotIdx === -1) return 0
  return s.length - dotIdx - 1
}

export function* explainDecimalAddition(args: unknown): Generator<PrimitiveCall> {
  const { a, b } = args as { a: number; b: number }

  const sum = Math.round((a + b) * 1e10) / 1e10  // avoid floating point drift
  const strA = formatDecimal(a)
  const strB = formatDecimal(b)
  const strSum = formatDecimal(sum)

  // Canvas layout
  const CHAR_W = 22   // px per character at fontSize 28
  const COL_X = 480   // right edge (decimal point column)
  const ROW_Y1 = 130  // first number
  const ROW_Y2 = 180  // second number
  const LINE_Y = 220
  const RES_Y = 245

  // Determine decimal places to pad correctly
  const dpA = decimalPlaces(a)
  const dpB = decimalPlaces(b)
  const maxDp = Math.max(dpA, dpB)

  // Pad both numbers to same number of decimal places
  function padToDecimals(n: number, places: number): string {
    const s = String(n)
    const dotIdx = s.indexOf('.')
    if (places === 0) return s
    if (dotIdx === -1) return s + ',' + '0'.repeat(places)
    const currentDp = s.length - dotIdx - 1
    const paddedS = s + '0'.repeat(places - currentDp)
    return paddedS.replace('.', ',')
  }

  const paddedA = padToDecimals(a, maxDp)
  const paddedB = padToDecimals(b, maxDp)
  const paddedSum = padToDecimals(sum, maxDp)

  // Find the comma position in paddedA (from right)
  const commaFromRight_A = maxDp > 0 ? maxDp + 1 : 0  // comma + decimal digits

  // Step 1: Intro
  yield { name: 'say', input: { text: `Складываем десятичные дроби ${strA} и ${strB}.` } }
  yield {
    name: 'draw_text',
    input: { x: 60, y: 70, text: `${strA} + ${strB} = ?`, fontSize: 26 },
  }
  yield { name: 'wait', input: { ms: 700 } }

  // Step 2: Draw comma alignment guide line
  yield { name: 'say', input: { text: 'Выравниваем запятые в столбик — это главное правило!' } }
  yield {
    name: 'draw_line',
    input: { x1: COL_X - commaFromRight_A * CHAR_W, y1: 110, x2: COL_X - commaFromRight_A * CHAR_W, y2: 260, stroke: 'grey', strokeWidth: 1 },
  }
  yield { name: 'wait', input: { ms: 600 } }

  // Step 3: Write first number right-aligned at comma
  yield { name: 'say', input: { text: 'Пишем первое число.' } }
  yield {
    name: 'draw_text',
    input: { x: COL_X - paddedA.length * CHAR_W + 2, y: ROW_Y1, text: paddedA, fontSize: 28 },
  }
  yield { name: 'wait', input: { ms: 600 } }

  // Step 4: Write + sign and second number
  yield { name: 'say', input: { text: 'Под ним — второе число с выравниванием запятых.' } }
  yield {
    name: 'draw_text',
    input: { x: Math.max(10, COL_X - (paddedB.length + 2) * CHAR_W), y: ROW_Y2, text: '+', fontSize: 28, color: 'blue' },
  }
  yield {
    name: 'draw_text',
    input: { x: COL_X - paddedB.length * CHAR_W + 2, y: ROW_Y2, text: paddedB, fontSize: 28 },
  }
  yield { name: 'wait', input: { ms: 700 } }

  // Step 5: Horizontal line
  yield { name: 'say', input: { text: 'Подводим черту.' } }
  const lineW = Math.max(paddedA.length, paddedB.length) * CHAR_W + 20
  yield {
    name: 'draw_line',
    input: { x1: Math.max(0, COL_X - lineW), y1: LINE_Y, x2: Math.min(800, COL_X + 20), y2: LINE_Y, stroke: 'black', strokeWidth: 2 },
  }
  yield { name: 'wait', input: { ms: 500 } }

  // Step 6: Reminder about comma position in result
  if (maxDp > 0) {
    yield {
      name: 'say',
      input: { text: `В ответе запятая на том же месте — ${maxDp} знак${maxDp === 1 ? '' : 'а'} после запятой.` },
    }
    yield {
      name: 'draw_text',
      input: { x: 60, y: 295, text: `Запятая: ${maxDp} знака после запятой`, fontSize: 20, color: 'grey' },
    }
    yield { name: 'wait', input: { ms: 600 } }
  }

  // Step 7: Show result
  yield { name: 'say', input: { text: `Складываем как целые числа, ставим запятую. Ответ: ${strSum}.` } }
  yield {
    name: 'draw_text',
    input: { x: COL_X - paddedSum.length * CHAR_W + 2, y: RES_Y, text: paddedSum, fontSize: 32, color: 'green', bold: true },
  }
  yield {
    name: 'highlight_region',
    input: {
      x: Math.max(0, COL_X - paddedSum.length * CHAR_W - 5),
      y: RES_Y - 5,
      w: paddedSum.length * CHAR_W + 15,
      h: 40,
      color: '#a5f3fc',
      duration_ms: 3000,
    },
  }
  yield { name: 'wait', input: { ms: 800 } }
}

registerScene('explain_decimal_addition', explainDecimalAddition as (args: unknown) => Generator<PrimitiveCall>)
