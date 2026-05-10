// lib/board/scenes/explain-percent-calculation.ts
// Объясняет нахождение percent% от числа value.
import { registerScene } from './index'
import type { PrimitiveCall } from './types'

export function* explainPercentCalculation(args: unknown): Generator<PrimitiveCall> {
  const { value, percent } = args as { value: number; percent: number }

  if (percent < 0 || value < 0) {
    throw new TypeError('explain_percent_calculation: value и percent должны быть неотрицательными')
  }

  const result = (value * percent) / 100
  // Format result: if integer, show without decimals
  const strResult = Number.isInteger(result) ? String(result) : result.toFixed(2)
  const product = value * percent

  // Canvas layout
  const CX = 400  // center x
  const TitleY = 60
  const FormulaY = 140
  const Step1Y = 220
  const Step2Y = 300
  const ResultY = 380

  // Step 1: Pose the problem
  yield { name: 'say', input: { text: `Найдём ${percent}% от числа ${value}.` } }
  yield {
    name: 'draw_text',
    input: { x: 60, y: TitleY, text: `${percent}% от ${value} = ?`, fontSize: 32, color: 'black' },
  }
  yield { name: 'wait', input: { ms: 700 } }

  // Step 2: Show the formula
  yield { name: 'say', input: { text: 'Чтобы найти процент, используем формулу: число × процент ÷ 100.' } }
  yield {
    name: 'draw_text',
    input: { x: 60, y: FormulaY, text: 'Формула: Число × Процент ÷ 100', fontSize: 22, color: 'grey' },
  }
  yield { name: 'wait', input: { ms: 700 } }

  // Step 3: Substitute values
  yield {
    name: 'say',
    input: { text: `Подставляем: ${value} × ${percent} ÷ 100.` },
  }
  yield {
    name: 'draw_text',
    input: { x: 60, y: Step1Y, text: `${value} × ${percent} ÷ 100`, fontSize: 28, color: 'blue' },
  }
  yield { name: 'wait', input: { ms: 600 } }

  // Step 4: First multiplication
  yield { name: 'say', input: { text: `Сначала умножим: ${value} × ${percent} = ${product}.` } }
  yield {
    name: 'draw_text',
    input: { x: 60, y: Step2Y, text: `${value} × ${percent} = ${product}`, fontSize: 28, color: 'orange' },
  }
  yield { name: 'wait', input: { ms: 700 } }

  // Step 5: Then divide by 100
  yield { name: 'say', input: { text: `Теперь делим на 100: ${product} ÷ 100 = ${strResult}.` } }
  yield {
    name: 'draw_text',
    input: { x: 60, y: ResultY, text: `${product} ÷ 100 = ${strResult}`, fontSize: 28, color: 'green' },
  }
  yield { name: 'wait', input: { ms: 700 } }

  // Step 6: Final answer highlighted
  yield {
    name: 'say',
    input: { text: `Ответ: ${percent}% от ${value} равно ${strResult}.` },
  }
  yield {
    name: 'draw_text',
    input: { x: 60, y: ResultY + 60, text: `${percent}% от ${value} = ${strResult}`, fontSize: 36, color: 'green', bold: true },
  }
  yield {
    name: 'highlight_region',
    input: { x: 50, y: ResultY + 50, w: 500, h: 55, color: '#a5f3fc', duration_ms: 3000 },
  }
  yield { name: 'wait', input: { ms: 800 } }

  // Step 7: Tip — percent means "per hundred"
  yield {
    name: 'say',
    input: { text: 'Запомни: «процент» — значит «из ста». Поэтому всегда делим на 100.' },
  }
  yield {
    name: 'draw_text',
    input: { x: 60, y: ResultY + 120, text: '% = «из ста» = ÷ 100', fontSize: 20, color: 'grey' },
  }
  yield { name: 'wait', input: { ms: 600 } }
}

registerScene('explain_percent_calculation', explainPercentCalculation as (args: unknown) => Generator<PrimitiveCall>)
