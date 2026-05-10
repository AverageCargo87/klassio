// lib/board/scenes/explain-fraction-simplification.ts
// Объясняет сокращение дроби numerator/denominator через нахождение НОД.
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

// Step-by-step Euclidean algorithm steps
function gcdSteps(m: number, n: number): Array<[number, number, number]> {
  const steps: Array<[number, number, number]> = []
  m = Math.abs(m)
  n = Math.abs(n)
  while (n !== 0) {
    const q = Math.floor(m / n)
    const r = m % n
    steps.push([m, n, r])
    m = n
    n = r
  }
  return steps
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
    input: { x, y: numY, text: numStr, fontSize: 32, ...(color ? { color } : {}) },
  }
  yield {
    name: 'draw_line',
    input: { x1: x - 5, y1: barY, x2: x + barW, y2: barY, stroke: color ?? 'black', strokeWidth: 2 },
  }
  yield {
    name: 'draw_text',
    input: { x, y: denY, text: denStr, fontSize: 32, ...(color ? { color } : {}) },
  }
}

export function* explainFractionSimplification(args: unknown): Generator<PrimitiveCall> {
  const { numerator, denominator } = args as { numerator: number; denominator: number }

  if (denominator === 0) {
    throw new TypeError('explain_fraction_simplification: знаменатель не может быть равен нулю')
  }

  const numY = 150
  const barY = 190
  const denY = 200

  // Step 1: Show original fraction
  yield { name: 'say', input: { text: `Сократим дробь ${numerator}/${denominator}.` } }
  yield* drawFraction(String(numerator), String(denominator), 80, numY, barY, denY)
  yield { name: 'wait', input: { ms: 700 } }

  const g = gcd(numerator, denominator)

  if (g === 1) {
    // Already irreducible
    yield {
      name: 'say',
      input: { text: `НОД(${numerator}, ${denominator}) = 1 — дробь уже несократима.` },
    }
    yield {
      name: 'draw_text',
      input: {
        x: 80,
        y: 270,
        text: `НОД(${numerator}, ${denominator}) = 1`,
        fontSize: 24,
        color: 'grey',
      },
    }
    yield { name: 'wait', input: { ms: 600 } }
    yield {
      name: 'draw_text',
      input: { x: 80, y: 320, text: 'Дробь уже несократима.', fontSize: 22, color: 'green' },
    }
    yield { name: 'wait', input: { ms: 700 } }
    return
  }

  // Step 2: Show GCD calculation (first step of Euclidean algorithm)
  yield {
    name: 'say',
    input: { text: `Находим НОД(${numerator}, ${denominator}) алгоритмом Евклида.` },
  }
  const steps = gcdSteps(numerator, denominator)
  let stepY = 270
  for (const [m, n, r] of steps.slice(0, 3)) {
    // Show max 3 steps to fit canvas
    yield {
      name: 'draw_text',
      input: { x: 80, y: stepY, text: `${m} = ${n} × ${Math.floor(m / n)} + ${r}`, fontSize: 20, color: 'grey' },
    }
    stepY += 30
    yield { name: 'wait', input: { ms: 400 } }
  }

  yield {
    name: 'draw_text',
    input: {
      x: 80,
      y: Math.min(stepY, 560),
      text: `НОД(${numerator}, ${denominator}) = ${g}`,
      fontSize: 24,
      color: 'blue',
    },
  }
  yield { name: 'wait', input: { ms: 600 } }

  // Step 3: Show division
  const resN = numerator / g
  const resD = denominator / g
  yield {
    name: 'say',
    input: {
      text: `НОД равен ${g}. Делим числитель и знаменатель на ${g}: ${numerator}÷${g}=${resN}, ${denominator}÷${g}=${resD}.`,
    },
  }
  yield {
    name: 'draw_text',
    input: { x: 80, y: Math.min(stepY + 30, 570), text: `${numerator} ÷ ${g} = ${resN}`, fontSize: 22, color: 'orange' },
  }
  yield {
    name: 'draw_text',
    input: { x: 80, y: Math.min(stepY + 55, 595), text: `${denominator} ÷ ${g} = ${resD}`, fontSize: 22, color: 'orange' },
  }
  yield { name: 'wait', input: { ms: 700 } }

  // Step 4: Show result
  yield { name: 'say', input: { text: `Сокращённая дробь: ${resN}/${resD}.` } }
  yield* drawFraction(String(resN), String(resD), 350, numY, barY, denY, 'green')
  yield {
    name: 'highlight_region',
    input: { x: 340, y: numY - 10, w: 100, h: 100, color: '#a5f3fc', duration_ms: 3000 },
  }
  yield { name: 'wait', input: { ms: 800 } }
}

registerScene('explain_fraction_simplification', explainFractionSimplification as (args: unknown) => Generator<PrimitiveCall>)
