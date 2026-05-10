// lib/board/scenes/explain-fraction-addition.ts
// Объясняет сложение дробей a/b + c/d с приведением к общему знаменателю.
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

// Draws a fraction at (x, y): numerator above bar, denominator below bar
// Returns the next available x position (x + fraction width)
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

export function* explainFractionAddition(args: unknown): Generator<PrimitiveCall> {
  const { a, b, c, d } = args as { a: number; b: number; c: number; d: number }

  if (b === 0 || d === 0) {
    throw new TypeError('explain_fraction_addition: знаменатель не может быть равен нулю')
  }

  const numY = 160
  const barY = 195
  const denY = 205
  const opY = 180

  // Step 1: Show original expression
  yield { name: 'say', input: { text: `Складываем дроби ${a}/${b} и ${c}/${d}.` } }
  yield* drawFraction(String(a), String(b), 60, numY, barY, denY)
  yield { name: 'draw_text', input: { x: 130, y: opY, text: '+', fontSize: 32, color: 'blue' } }
  yield* drawFraction(String(c), String(d), 170, numY, barY, denY)
  yield { name: 'wait', input: { ms: 700 } }

  // Step 2: Find LCM (common denominator)
  const commonDen = lcm(b, d)
  const gcdBD = gcd(b, d)

  if (b === d) {
    // Same denominator — simpler case
    yield { name: 'say', input: { text: `Знаменатели одинаковые (${b}), складываем числители.` } }
    yield { name: 'wait', input: { ms: 500 } }
    const sumNum = a + c
    const rawGcd = gcd(sumNum, b)
    yield* drawFraction(String(sumNum), String(b), 300, numY, barY, denY, 'green')
    yield { name: 'wait', input: { ms: 700 } }

    if (rawGcd > 1) {
      yield { name: 'say', input: { text: `Сократим: НОД(${sumNum}, ${b}) = ${rawGcd}.` } }
      yield {
        name: 'draw_text',
        input: { x: 300, y: 270, text: `НОД(${sumNum}, ${b}) = ${rawGcd}`, fontSize: 22, color: 'grey' },
      }
      yield { name: 'wait', input: { ms: 600 } }
      const resN = sumNum / rawGcd
      const resD = b / rawGcd
      yield { name: 'say', input: { text: `Результат: ${resN}/${resD}.` } }
      yield* drawFraction(String(resN), String(resD), 420, numY, barY, denY, 'green')
    } else {
      yield { name: 'say', input: { text: `Результат: ${sumNum}/${b}.` } }
    }
    yield { name: 'wait', input: { ms: 700 } }
    return
  }

  // Different denominators — need LCM
  yield {
    name: 'say',
    input: { text: `Знаменатели разные. НОД(${b}, ${d}) = ${gcdBD}. НОК = ${b} × ${d} / ${gcdBD} = ${commonDen}.` },
  }
  yield {
    name: 'draw_text',
    input: { x: 60, y: 270, text: `НОК(${b}, ${d}) = ${commonDen}`, fontSize: 22, color: 'grey' },
  }
  yield { name: 'wait', input: { ms: 700 } }

  // Step 3: Convert both fractions to common denominator
  const factor1 = commonDen / b
  const factor2 = commonDen / d
  const newNum1 = a * factor1
  const newNum2 = c * factor2

  yield {
    name: 'say',
    input: {
      text: `Приводим к знаменателю ${commonDen}: ${a}×${factor1}=${newNum1}, ${c}×${factor2}=${newNum2}.`,
    },
  }
  yield* drawFraction(String(newNum1), String(commonDen), 280, numY, barY, denY, 'blue')
  yield { name: 'draw_text', input: { x: 360, y: opY, text: '+', fontSize: 32, color: 'blue' } }
  yield* drawFraction(String(newNum2), String(commonDen), 400, numY, barY, denY, 'blue')
  yield { name: 'wait', input: { ms: 700 } }

  // Step 4: Add numerators
  const sumNum = newNum1 + newNum2
  yield { name: 'say', input: { text: `Складываем числители: ${newNum1} + ${newNum2} = ${sumNum}.` } }
  yield* drawFraction(String(sumNum), String(commonDen), 550, numY, barY, denY, 'green')
  yield { name: 'wait', input: { ms: 700 } }

  // Step 5: Simplify if possible
  const rawGcd = gcd(sumNum, commonDen)
  if (rawGcd > 1) {
    yield {
      name: 'say',
      input: { text: `Сократим: НОД(${sumNum}, ${commonDen}) = ${rawGcd}.` },
    }
    yield {
      name: 'draw_text',
      input: {
        x: 60,
        y: 340,
        text: `НОД(${sumNum}, ${commonDen}) = ${rawGcd}`,
        fontSize: 22,
        color: 'grey',
      },
    }
    yield { name: 'wait', input: { ms: 600 } }
    const resN = sumNum / rawGcd
    const resD = commonDen / rawGcd
    yield { name: 'say', input: { text: `Результат: ${resN}/${resD}.` } }
    yield* drawFraction(String(resN), String(resD), 650, numY, barY, denY, 'green')
  } else {
    yield { name: 'say', input: { text: `Дробь уже несократима. Ответ: ${sumNum}/${commonDen}.` } }
  }
  yield { name: 'wait', input: { ms: 800 } }
}

registerScene('explain_fraction_addition', explainFractionAddition as (args: unknown) => Generator<PrimitiveCall>)
