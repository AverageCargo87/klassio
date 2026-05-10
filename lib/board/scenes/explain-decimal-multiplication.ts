// lib/board/scenes/explain-decimal-multiplication.ts
// Объясняет умножение десятичных дробей: умножаем как целые, затем ставим запятую.
import { registerScene } from './index'
import type { PrimitiveCall } from './types'

export function* explainDecimalMultiplication(args: unknown): Generator<PrimitiveCall> {
  const { a, b } = args as { a: number; b: number }

  if (!isFinite(a) || !isFinite(b)) {
    throw new TypeError('explain_decimal_multiplication: нужны конечные числа')
  }

  const strA = String(a)
  const strB = String(b)
  const decA = (strA.split('.')[1] ?? '').length
  const decB = (strB.split('.')[1] ?? '').length
  const totalDec = decA + decB

  const intA = Math.round(a * Math.pow(10, decA))
  const intB = Math.round(b * Math.pow(10, decB))
  const intProduct = intA * intB
  const result = intProduct / Math.pow(10, totalDec)

  const X = 200
  const Y = 120

  yield { name: 'say', input: { text: `Умножаем десятичные дроби: ${a} и ${b}.` } }
  yield {
    name: 'draw_text',
    input: { x: X, y: Y, text: `${a} × ${b} = ?`, fontSize: 32 },
  }
  yield { name: 'wait', input: { ms: 700 } }

  yield {
    name: 'say',
    input: {
      text: `Сначала умножаем как целые числа: ${intA} × ${intB} = ${intProduct}.`,
    },
  }
  yield {
    name: 'draw_text',
    input: { x: X, y: Y + 70, text: `${intA} × ${intB} = ${intProduct}`, fontSize: 28, color: 'grey' },
  }
  yield { name: 'wait', input: { ms: 700 } }

  const decNote =
    totalDec === 0
      ? 'Знаков после запятой нет — результат целый.'
      : `Отсчитываем ${totalDec} знак${totalDec === 1 ? '' : 'а'} после запятой в результате (${decA} + ${decB}).`

  yield { name: 'say', input: { text: decNote } }
  yield {
    name: 'draw_text',
    input: {
      x: X,
      y: Y + 140,
      text: `Знаков после запятой: ${decA} + ${decB} = ${totalDec}`,
      fontSize: 22,
      color: 'grey',
    },
  }
  yield { name: 'wait', input: { ms: 600 } }

  // Format result: show with proper decimal places
  const resultStr = totalDec > 0 ? result.toFixed(totalDec).replace(/0+$/, '').replace(/\.$/, '') : String(result)

  yield { name: 'say', input: { text: `Результат: ${resultStr}.` } }
  yield {
    name: 'draw_text',
    input: { x: X, y: Y + 200, text: `${a} × ${b} = ${resultStr}`, fontSize: 36 },
  }
  yield { name: 'wait', input: { ms: 700 } }
  yield {
    name: 'highlight_region',
    input: {
      x: X - 10,
      y: Y + 192,
      w: Math.min(500, String(resultStr).length * 28 + 180),
      h: 48,
      color: '#a5f3fc',
      duration_ms: 3500,
    },
  }
}

registerScene('explain_decimal_multiplication', explainDecimalMultiplication as (args: unknown) => Generator<PrimitiveCall>)
