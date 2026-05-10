// lib/board/scenes/explain-fraction-comparison.ts
// Объясняет сравнение дробей a/b и c/d через приведение к общему знаменателю.
import { registerScene } from './index'
import type { PrimitiveCall } from './types'

function gcd(m: number, n: number): number {
  m = Math.abs(m)
  n = Math.abs(n)
  while (n !== 0) {
    const t = n
    n = m % n
    m = t
  }
  return m
}

function lcm(m: number, n: number): number {
  return (Math.abs(m) * Math.abs(n)) / gcd(m, n)
}

function* drawFraction(
  numStr: string,
  denStr: string,
  x: number,
  numY: number,
  barY: number,
  denY: number,
  color?: string,
): Generator<PrimitiveCall> {
  const barW = Math.max(numStr.length, denStr.length) * 24 + 10
  yield {
    name: 'draw_text',
    input: { x, y: numY, text: numStr, fontSize: 28, ...(color ? { color } : {}) },
  }
  yield {
    name: 'draw_line',
    input: { x1: x - 5, y1: barY, x2: x + barW, y2: barY, stroke: color ?? 'black', strokeWidth: 2 },
  }
  yield {
    name: 'draw_text',
    input: { x, y: denY, text: denStr, fontSize: 28, ...(color ? { color } : {}) },
  }
}

export function* explainFractionComparison(args: unknown): Generator<PrimitiveCall> {
  const { a, b, c, d } = args as { a: number; b: number; c: number; d: number }

  if (b === 0 || d === 0) {
    throw new TypeError('explain_fraction_comparison: знаменатель не может быть равен нулю')
  }

  const numY = 160
  const barY = 195
  const denY = 205
  const opY = 180

  // Step 1: Show both fractions
  yield { name: 'say', input: { text: `Сравниваем дроби ${a}/${b} и ${c}/${d}.` } }
  yield* drawFraction(String(a), String(b), 60, numY, barY, denY)
  yield { name: 'draw_text', input: { x: 140, y: opY, text: '?', fontSize: 32, color: 'grey' } }
  yield* drawFraction(String(c), String(d), 190, numY, barY, denY)
  yield { name: 'wait', input: { ms: 700 } }

  // Step 2: Find common denominator
  const commonDen = lcm(b, d)
  const gcdBD = gcd(b, d)

  if (b === d) {
    // Same denominator — compare numerators directly
    yield { name: 'say', input: { text: `Знаменатели одинаковые (${b}). Сравниваем числители: ${a} и ${c}.` } }
    yield { name: 'wait', input: { ms: 600 } }

    let sign: string
    let conclusion: string
    if (a > c) {
      sign = '>'
      conclusion = `${a}/${b} больше ${c}/${d}, потому что числитель ${a} > ${c}.`
    } else if (a < c) {
      sign = '<'
      conclusion = `${a}/${b} меньше ${c}/${d}, потому что числитель ${a} < ${c}.`
    } else {
      sign = '='
      conclusion = `Дроби равны: ${a}/${b} = ${c}/${d}.`
    }

    yield { name: 'draw_text', input: { x: 350, y: opY, text: sign, fontSize: 36, color: 'red' } }
    yield { name: 'say', input: { text: conclusion } }
    yield { name: 'wait', input: { ms: 800 } }
    return
  }

  // Different denominators — bring to common denominator
  yield {
    name: 'say',
    input: {
      text: `Знаменатели разные. Приведём к НОК: НОД(${b}, ${d})=${gcdBD}, НОК=${commonDen}.`,
    },
  }
  yield {
    name: 'draw_text',
    input: { x: 60, y: 260, text: `НОК(${b}, ${d}) = ${commonDen}`, fontSize: 22, color: 'grey' },
  }
  yield { name: 'wait', input: { ms: 700 } }

  const factor1 = commonDen / b
  const factor2 = commonDen / d
  const newNum1 = a * factor1
  const newNum2 = c * factor2

  yield {
    name: 'say',
    input: {
      text: `${a}/${b} = ${newNum1}/${commonDen}; ${c}/${d} = ${newNum2}/${commonDen}.`,
    },
  }
  yield* drawFraction(String(newNum1), String(commonDen), 280, numY, barY, denY, 'blue')
  yield { name: 'draw_text', input: { x: 360, y: opY, text: '?', fontSize: 32, color: 'grey' } }
  yield* drawFraction(String(newNum2), String(commonDen), 400, numY, barY, denY, 'blue')
  yield { name: 'wait', input: { ms: 700 } }

  // Step 3: Compare numerators
  let sign: string
  let conclusion: string
  if (newNum1 > newNum2) {
    sign = '>'
    conclusion = `${newNum1} > ${newNum2}, значит ${a}/${b} > ${c}/${d}.`
  } else if (newNum1 < newNum2) {
    sign = '<'
    conclusion = `${newNum1} < ${newNum2}, значит ${a}/${b} < ${c}/${d}.`
  } else {
    sign = '='
    conclusion = `Числители равны (${newNum1} = ${newNum2}), значит дроби равны.`
  }

  yield { name: 'say', input: { text: `Сравниваем числители: ${conclusion}` } }
  yield { name: 'draw_text', input: { x: 570, y: opY, text: sign, fontSize: 36, color: 'red' } }

  // Highlight the larger fraction
  const largerX = newNum1 >= newNum2 ? 280 : 400
  yield {
    name: 'highlight_region',
    input: { x: largerX - 10, y: numY - 10, w: 100, h: 90, color: '#a5f3fc', duration_ms: 3000 },
  }
  yield { name: 'wait', input: { ms: 800 } }
}

registerScene('explain_fraction_comparison', explainFractionComparison as (args: unknown) => Generator<PrimitiveCall>)
