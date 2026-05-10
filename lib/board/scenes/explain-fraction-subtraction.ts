// lib/board/scenes/explain-fraction-subtraction.ts
// Объясняет вычитание дробей a/b - c/d с приведением к общему знаменателю.
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

export function* explainFractionSubtraction(args: unknown): Generator<PrimitiveCall> {
  const { a, b, c, d } = args as { a: number; b: number; c: number; d: number }

  if (b === 0 || d === 0) {
    throw new TypeError('explain_fraction_subtraction: знаменатель не может быть равен нулю')
  }

  const numY = 160
  const barY = 195
  const denY = 205
  const opY = 180

  // Step 1: Show original expression
  yield { name: 'say', input: { text: `Вычитаем дробь ${c}/${d} из ${a}/${b}.` } }
  yield* drawFraction(String(a), String(b), 60, numY, barY, denY)
  yield { name: 'draw_text', input: { x: 130, y: opY, text: '-', fontSize: 32, color: 'red' } }
  yield* drawFraction(String(c), String(d), 170, numY, barY, denY)
  yield { name: 'wait', input: { ms: 700 } }

  // Step 2: Common denominator
  const commonDen = lcm(b, d)
  const gcdBD = gcd(b, d)

  if (b === d) {
    yield { name: 'say', input: { text: `Знаменатели одинаковые (${b}), вычитаем числители.` } }
    yield { name: 'wait', input: { ms: 500 } }
    const diffNum = a - c
    const rawGcd = gcd(Math.abs(diffNum), b)
    yield* drawFraction(String(diffNum), String(b), 300, numY, barY, denY, 'green')
    yield { name: 'wait', input: { ms: 700 } }

    if (rawGcd > 1) {
      yield { name: 'say', input: { text: `Сократим: НОД(${Math.abs(diffNum)}, ${b}) = ${rawGcd}.` } }
      yield {
        name: 'draw_text',
        input: { x: 300, y: 270, text: `НОД(${Math.abs(diffNum)}, ${b}) = ${rawGcd}`, fontSize: 22, color: 'grey' },
      }
      yield { name: 'wait', input: { ms: 600 } }
      const resN = diffNum / rawGcd
      const resD = b / rawGcd
      yield { name: 'say', input: { text: `Результат: ${resN}/${resD}.` } }
      yield* drawFraction(String(resN), String(resD), 420, numY, barY, denY, 'green')
    } else {
      yield { name: 'say', input: { text: `Результат: ${diffNum}/${b}.` } }
    }
    yield { name: 'wait', input: { ms: 700 } }
    return
  }

  // Different denominators
  yield {
    name: 'say',
    input: { text: `Знаменатели разные. НОД(${b}, ${d}) = ${gcdBD}. НОК = ${commonDen}.` },
  }
  yield {
    name: 'draw_text',
    input: { x: 60, y: 270, text: `НОК(${b}, ${d}) = ${commonDen}`, fontSize: 22, color: 'grey' },
  }
  yield { name: 'wait', input: { ms: 700 } }

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
  yield { name: 'draw_text', input: { x: 360, y: opY, text: '-', fontSize: 32, color: 'red' } }
  yield* drawFraction(String(newNum2), String(commonDen), 400, numY, barY, denY, 'blue')
  yield { name: 'wait', input: { ms: 700 } }

  // Subtract numerators
  const diffNum = newNum1 - newNum2
  yield { name: 'say', input: { text: `Вычитаем числители: ${newNum1} - ${newNum2} = ${diffNum}.` } }
  yield* drawFraction(String(diffNum), String(commonDen), 550, numY, barY, denY, 'green')
  yield { name: 'wait', input: { ms: 700 } }

  // Simplify
  const rawGcd = gcd(Math.abs(diffNum), commonDen)
  if (rawGcd > 1) {
    yield {
      name: 'say',
      input: { text: `Сократим: НОД(${Math.abs(diffNum)}, ${commonDen}) = ${rawGcd}.` },
    }
    yield {
      name: 'draw_text',
      input: {
        x: 60,
        y: 340,
        text: `НОД(${Math.abs(diffNum)}, ${commonDen}) = ${rawGcd}`,
        fontSize: 22,
        color: 'grey',
      },
    }
    yield { name: 'wait', input: { ms: 600 } }
    const resN = diffNum / rawGcd
    const resD = commonDen / rawGcd
    yield { name: 'say', input: { text: `Результат: ${resN}/${resD}.` } }
    yield* drawFraction(String(resN), String(resD), 650, numY, barY, denY, 'green')
  } else {
    yield { name: 'say', input: { text: `Дробь уже несократима. Ответ: ${diffNum}/${commonDen}.` } }
  }
  yield { name: 'wait', input: { ms: 800 } }
}

registerScene('explain_fraction_subtraction', explainFractionSubtraction as (args: unknown) => Generator<PrimitiveCall>)
