// lib/board/scenes/explain-arithmetic-mean.ts
// Объясняет среднее арифметическое: складываем все числа, делим на количество.
import { registerScene } from './index'
import type { PrimitiveCall } from './types'

export function* explainArithmeticMean(args: unknown): Generator<PrimitiveCall> {
  const { numbers } = args as { numbers: number[] }

  // Validation (T-05-02-01)
  if (!Array.isArray(numbers) || numbers.length < 2 || numbers.length > 8) {
    throw new TypeError('explain_arithmetic_mean: нужно от 2 до 8 чисел')
  }
  if (numbers.some((n) => !isFinite(n))) {
    throw new TypeError('explain_arithmetic_mean: все числа должны быть конечными')
  }

  const count = numbers.length
  const sum = numbers.reduce((acc, n) => acc + n, 0)
  const mean = sum / count

  const X = 150
  const Y = 120

  yield {
    name: 'say',
    input: { text: `Найдём среднее арифметическое ${count} чисел.` },
  }
  yield {
    name: 'draw_text',
    input: { x: X, y: Y, text: 'Среднее арифметическое', fontSize: 28 },
  }
  yield { name: 'wait', input: { ms: 600 } }

  // Write all numbers in a row
  const numbersStr = numbers.join(', ')
  yield {
    name: 'draw_text',
    input: { x: X, y: Y + 55, text: `Числа: ${numbersStr}`, fontSize: 24 },
  }
  yield { name: 'wait', input: { ms: 600 } }

  // Show sum expression
  const sumExpr = numbers.join(' + ')
  yield {
    name: 'say',
    input: { text: `Складываем все числа: ${sumExpr} = ${sum}.` },
  }
  yield {
    name: 'draw_text',
    input: { x: X, y: Y + 115, text: `${sumExpr} = ${sum}`, fontSize: 24, color: 'grey' },
  }
  yield { name: 'wait', input: { ms: 700 } }

  // Show division
  yield {
    name: 'say',
    input: { text: `Делим сумму на количество слагаемых: ${sum} ÷ ${count} = ${mean}.` },
  }
  yield {
    name: 'draw_text',
    input: { x: X, y: Y + 175, text: `${sum} ÷ ${count} = ${mean}`, fontSize: 28, color: 'blue' },
  }
  yield { name: 'wait', input: { ms: 700 } }

  // Final result
  yield {
    name: 'draw_text',
    input: { x: X, y: Y + 240, text: `Среднее = ${mean}`, fontSize: 36 },
  }
  yield { name: 'wait', input: { ms: 700 } }
  yield {
    name: 'highlight_region',
    input: { x: X - 10, y: Y + 232, w: Math.min(570, 250 + String(mean).length * 20), h: 52, color: '#bbf7d0', duration_ms: 3500 },
  }
  yield {
    name: 'say',
    input: { text: `Среднее арифметическое равно ${mean}.` },
  }
}

registerScene('explain_arithmetic_mean', explainArithmeticMean as (args: unknown) => Generator<PrimitiveCall>)
