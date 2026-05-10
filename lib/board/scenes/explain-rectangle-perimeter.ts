// lib/board/scenes/explain-rectangle-perimeter.ts
// Объясняет периметр прямоугольника: P = 2 × (ширина + высота).
import { registerScene } from './index'
import type { PrimitiveCall } from './types'

export function* explainRectanglePerimeter(args: unknown): Generator<PrimitiveCall> {
  const { width, height } = args as { width: number; height: number }

  if (!isFinite(width) || !isFinite(height) || width <= 0 || height <= 0) {
    throw new TypeError(
      'explain_rectangle_perimeter: width и height должны быть положительными числами',
    )
  }

  const sum = width + height
  const perimeter = 2 * sum

  // Visualize rectangle: cap visual size at 280×180, center at 400,230
  const VIS_W = Math.min(280, Math.max(60, width * 20))
  const VIS_H = Math.min(180, Math.max(40, height * 20))
  const RECT_X = Math.round(400 - VIS_W / 2)
  const RECT_Y = Math.round(230 - VIS_H / 2)

  yield {
    name: 'say',
    input: { text: `Найдём периметр прямоугольника со сторонами ${width} и ${height}.` },
  }
  yield {
    name: 'draw_rectangle',
    input: { x: RECT_X, y: RECT_Y, w: VIS_W, h: VIS_H, stroke: 'orange' },
  }
  yield { name: 'wait', input: { ms: 700 } }

  // Label width (below bottom edge)
  yield {
    name: 'draw_text',
    input: {
      x: Math.max(10, RECT_X + Math.round(VIS_W / 2) - 16),
      y: Math.min(570, RECT_Y + VIS_H + 10),
      text: String(width),
      fontSize: 22,
      color: 'orange',
    },
  }
  // Label height (right side)
  yield {
    name: 'draw_text',
    input: {
      x: Math.min(770, RECT_X + VIS_W + 8),
      y: Math.max(10, RECT_Y + Math.round(VIS_H / 2) - 12),
      text: String(height),
      fontSize: 22,
      color: 'orange',
    },
  }
  yield { name: 'wait', input: { ms: 600 } }

  yield {
    name: 'say',
    input: {
      text: `Периметр: P = 2 × (ширина + высота) = 2 × (${width} + ${height}) = 2 × ${sum} = ${perimeter}.`,
    },
  }
  yield {
    name: 'draw_text',
    input: {
      x: 130,
      y: 420,
      text: `P = 2 × (${width} + ${height}) = 2 × ${sum} = ${perimeter}`,
      fontSize: 28,
    },
  }
  yield { name: 'wait', input: { ms: 700 } }
  yield {
    name: 'highlight_region',
    input: {
      x: 125,
      y: 412,
      w: Math.min(650, String(perimeter).length * 28 + 340),
      h: 48,
      color: '#fed7aa',
      duration_ms: 3500,
    },
  }
  yield {
    name: 'say',
    input: { text: `Периметр прямоугольника равен ${perimeter}.` },
  }
}

registerScene('explain_rectangle_perimeter', explainRectanglePerimeter as (args: unknown) => Generator<PrimitiveCall>)
