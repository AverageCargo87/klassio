'use client'

// Маппинг tool calls LLM → tldraw editor API.
// Все ф-ции работают с уже подмонтированным Editor.

import type { Editor, IndexKey } from 'tldraw'
import { createShapeId, toRichText } from 'tldraw'

type ToolParams = Record<string, unknown>

// Палитра tldraw v3 (значения TLDefaultColorStyle).
const TLDRAW_COLORS = [
  'black',
  'grey',
  'light-violet',
  'violet',
  'blue',
  'light-blue',
  'yellow',
  'orange',
  'green',
  'light-green',
  'light-red',
  'red',
] as const

type TLColorName = (typeof TLDRAW_COLORS)[number]

// Приблизительные RGB якорей палитры (для подбора по hex).
const COLOR_ANCHORS: Array<[TLColorName, number, number, number]> = [
  ['black', 28, 28, 28],
  ['grey', 155, 155, 155],
  ['red', 224, 64, 64],
  ['light-red', 255, 124, 124],
  ['orange', 230, 145, 50],
  ['yellow', 240, 200, 30],
  ['green', 64, 167, 84],
  ['light-green', 116, 218, 130],
  ['blue', 64, 110, 220],
  ['light-blue', 80, 180, 220],
  ['violet', 145, 64, 200],
  ['light-violet', 200, 128, 240],
]

function hexToTldrawColor(hex: string): TLColorName {
  const c = hex.replace('#', '').trim()
  const full = c.length === 3 ? c.split('').map((x) => x + x).join('') : c.padEnd(6, '0').slice(0, 6)
  const r = parseInt(full.substring(0, 2), 16) || 0
  const g = parseInt(full.substring(2, 4), 16) || 0
  const b = parseInt(full.substring(4, 6), 16) || 0
  let best: TLColorName = 'black'
  let bestDist = Infinity
  for (const [name, tr, tg, tb] of COLOR_ANCHORS) {
    const d = (tr - r) ** 2 + (tg - g) ** 2 + (tb - b) ** 2
    if (d < bestDist) {
      bestDist = d
      best = name
    }
  }
  return best
}

function mapColor(input: unknown, fallback: TLColorName = 'black'): TLColorName {
  if (typeof input !== 'string') return fallback
  const lower = input.trim().toLowerCase()
  if (!lower || lower === 'none' || lower === 'transparent') return fallback
  if (lower === 'gray') return 'grey'
  if ((TLDRAW_COLORS as readonly string[]).includes(lower)) return lower as TLColorName
  if (lower.startsWith('#')) return hexToTldrawColor(lower)
  // короткие алиасы
  if (lower === 'purple') return 'violet'
  if (lower === 'cyan') return 'light-blue'
  if (lower === 'pink') return 'light-red'
  if (lower === 'lime') return 'light-green'
  return fallback
}

type TLSize = 's' | 'm' | 'l' | 'xl'

function mapFontSize(size: unknown): TLSize {
  if (typeof size === 'string') {
    const s = size.toLowerCase()
    if (s === 's' || s === 'm' || s === 'l' || s === 'xl') return s
    const n = Number(s)
    if (Number.isFinite(n)) return mapFontSize(n)
  }
  if (typeof size === 'number') {
    if (size <= 14) return 's'
    if (size <= 26) return 'm'
    if (size <= 40) return 'l'
    return 'xl'
  }
  return 'm'
}

function mapStrokeWidth(w: unknown): TLSize {
  if (typeof w === 'string') {
    const s = w.toLowerCase()
    if (s === 's' || s === 'm' || s === 'l' || s === 'xl') return s
    const n = Number(s)
    if (Number.isFinite(n)) return mapStrokeWidth(n)
  }
  if (typeof w === 'number') {
    if (w <= 2) return 's'
    if (w <= 4) return 'm'
    if (w <= 8) return 'l'
    return 'xl'
  }
  return 'm'
}

function asNum(v: unknown, fallback: number): number {
  if (typeof v === 'number' && Number.isFinite(v)) return v
  if (typeof v === 'string') {
    const n = Number(v)
    if (Number.isFinite(n)) return n
  }
  return fallback
}

function asStr(v: unknown): string {
  return typeof v === 'string' ? v : ''
}

function isFilled(v: unknown): boolean {
  if (v === undefined || v === null) return false
  if (typeof v === 'boolean') return v
  if (typeof v === 'string') {
    const s = v.trim().toLowerCase()
    return s !== '' && s !== 'none' && s !== 'false' && s !== 'transparent'
  }
  return Boolean(v)
}

export interface ExecuteResult {
  ok: boolean
  note?: string
}

// Длительность fade-in анимации появления нового шейпа.
// Ease-out cubic, fire-and-forget — не блокирует следующий tool call,
// но wait в system prompt обычно >= этого значения, чтобы шейп успел проявиться
// до начала следующего шага.
// История: 900 → 1500 (увеличено для читаемости) → 1000 (Phase 8 UAT 2026-05-13:
// юзер сказал «текущая скорость устраивает но сделать чуть-чуть быстрее»;
// 1000ms — почти вдвое быстрее чем 1500, но всё ещё медленнее изначальных 900).
const FADE_IN_MS = 1000

// Задержка между появлением соседних цифр в одной staggered-строке.
// История: 280 → 450 (увеличено для не-торопливого появления цифр) → 320
// (Phase 8 UAT 2026-05-13: чуть-чуть быстрее чем 450, не возвращаемся к 280
// который ощущался как «слишком быстро» в Phase 4 раннем тестировании).
const DIGIT_STAGGER_MS = 320

interface FadeInOpts {
  delayMs?: number
  // Финальная прозрачность (1 = полностью видим, 0.6 = полупрозрачный шейп).
  targetOpacity?: number
}

function fadeInShape(
  editor: Editor,
  id: ReturnType<typeof createShapeId>,
  type: string,
  opts: FadeInOpts = {},
) {
  const { delayMs = 0, targetOpacity = 1 } = opts

  const runFade = () => {
    // На случай задержки — снова ставим opacity 0 (вдруг shape случайно проявился).
    try {
      editor.updateShape({
        id,
        type,
        opacity: 0,
      } as Parameters<Editor['updateShape']>[0])
    } catch {
      return
    }
    const start = performance.now()
    const tick = () => {
      if (!editor.getShape(id)) return // удалили снаружи
      const elapsed = performance.now() - start
      const t = Math.min(1, elapsed / FADE_IN_MS)
      // ease-out cubic
      const eased = 1 - Math.pow(1 - t, 3)
      try {
        editor.updateShape({
          id,
          type,
          opacity: eased * targetOpacity,
        } as Parameters<Editor['updateShape']>[0])
      } catch {
        return
      }
      if (t < 1) requestAnimationFrame(tick)
    }
    requestAnimationFrame(tick)
  }

  if (delayMs > 0) {
    setTimeout(runFade, delayMs)
  } else {
    runFade()
  }
}

// Эвристика: стоит ли разбивать текст на отдельные цифры с лесенкой fade-in.
// Применяем ТОЛЬКО к чисто цифровым строкам с/без пробелов («2 4 5», «245»,
// «1 1 1 9»). Слова и выражения с операторами («5 + 4 = 9», «Сложение в столбик»)
// рендерим одним шейпом — дробить их посимвольно нецелесообразно.
function shouldStaggerChars(text: string): boolean {
  const t = text.trim()
  if (t.length === 0 || t.length > 10) return false
  if (!/^[\d\s]+$/.test(t)) return false
  const nonSpace = t.replace(/\s/g, '').length
  return nonSpace >= 2 && nonSpace <= 5
}

// Приблизительная ширина символа monospace для tldraw size.
// Реальное измерение через editor.measureText было бы точнее, но это синхронно
// и ломает batching, плюс зависит от загруженного шрифта. Эмпирическое значение
// достаточно для выравнивания цифр столбикового сложения.
const MONO_CHAR_WIDTH: Record<TLSize, number> = {
  s: 10,
  m: 14,
  l: 22,
  xl: 30,
}

export async function executeToolCall(
  editor: Editor,
  name: string,
  rawParams: ToolParams,
): Promise<ExecuteResult> {
  const p = rawParams ?? {}
  try {
    switch (name) {
      case 'draw_text': {
        const text = asStr(p.text) || ' '
        // tldraw TextShape: richText required (CON-tldraw-shape-quirks).
        // NEVER use text: string for TextShape — it causes a runtime error.
        // bold через font: 'sans' нет, но toRichText сейчас не поддерживает inline bold —
        // эмулируем «жирность» через крупный размер.
        const baseSize = mapFontSize(p.fontSize)
        const size: TLSize = p.bold === true ? upSize(baseSize) : baseSize
        const color = mapColor(p.color, 'black')
        const baseX = asNum(p.x, 0)
        const baseY = asNum(p.y, 0)

        if (shouldStaggerChars(text)) {
          // Разбиваем «2 4 5» / «245» / «1 1 1 9» на отдельные цифровые шейпы
          // с лесенкой fade-in — каждая цифра проявляется с задержкой.
          const charWidth = MONO_CHAR_WIDTH[size]
          let visibleIdx = 0
          for (let i = 0; i < text.length; i++) {
            const ch = text[i]
            if (ch === ' ' || ch === '\t') continue
            const id = createShapeId()
            editor.createShape({
              id,
              type: 'text',
              x: baseX + i * charWidth,
              y: baseY,
              opacity: 0,
              props: {
                richText: toRichText(ch),
                color,
                size,
                font: 'mono',
                textAlign: 'start',
                autoSize: true,
              },
            })
            fadeInShape(editor, id, 'text', {
              delayMs: visibleIdx * DIGIT_STAGGER_MS,
            })
            visibleIdx++
          }
          return { ok: true, note: `staggered ${visibleIdx} chars` }
        }

        const id = createShapeId()
        editor.createShape({
          id,
          type: 'text',
          x: baseX,
          y: baseY,
          opacity: 0,
          props: {
            richText: toRichText(text),
            color,
            size,
            font: 'mono',
            textAlign: 'start',
            autoSize: true,
          },
        })
        fadeInShape(editor, id, 'text')
        return { ok: true }
      }

      case 'draw_rectangle': {
        const stroke = mapColor(p.stroke ?? p.fill, 'black')
        const fill = isFilled(p.fill) ? 'semi' : 'none'
        const id = createShapeId()
        editor.createShape({
          id,
          type: 'geo',
          x: asNum(p.x, 0),
          y: asNum(p.y, 0),
          opacity: 0,
          props: {
            geo: 'rectangle',
            w: Math.max(1, asNum(p.w, 100)),
            h: Math.max(1, asNum(p.h, 60)),
            color: stroke,
            fill,
            dash: 'solid',
            size: 'm',
          },
        })
        fadeInShape(editor, id, 'geo')
        return { ok: true }
      }

      case 'draw_line': {
        const x1 = asNum(p.x1, 0)
        const y1 = asNum(p.y1, 0)
        const x2 = asNum(p.x2, 100)
        const y2 = asNum(p.y2, 0)
        // tldraw v3 line: points — record с id+index, координаты в локалке шейпа.
        // Кладём шейп в (x1, y1), а точки делаем относительными.
        const id = createShapeId()
        editor.createShape({
          id,
          type: 'line',
          x: x1,
          y: y1,
          opacity: 0,
          props: {
            points: {
              a1: { id: 'a1', index: 'a1' as IndexKey, x: 0, y: 0 },
              a2: { id: 'a2', index: 'a2' as IndexKey, x: x2 - x1, y: y2 - y1 },
            },
            color: mapColor(p.stroke, 'black'),
            size: mapStrokeWidth(p.strokeWidth),
            dash: 'solid',
            spline: 'line',
          },
        } as Parameters<Editor['createShape']>[0])
        fadeInShape(editor, id, 'line')
        return { ok: true }
      }

      case 'draw_circle': {
        const r = Math.max(1, asNum(p.radius, 30))
        const stroke = mapColor(p.stroke ?? p.fill, 'black')
        const fill = isFilled(p.fill) ? 'semi' : 'none'
        const id = createShapeId()
        editor.createShape({
          id,
          type: 'geo',
          x: asNum(p.x, 0) - r,
          y: asNum(p.y, 0) - r,
          opacity: 0,
          props: {
            geo: 'ellipse',
            w: r * 2,
            h: r * 2,
            color: stroke,
            fill,
            dash: 'solid',
            size: 'm',
          },
        })
        fadeInShape(editor, id, 'geo')
        return { ok: true }
      }

      case 'draw_arrow': {
        const x1 = asNum(p.x1, 0)
        const y1 = asNum(p.y1, 0)
        const x2 = asNum(p.x2, 100)
        const y2 = asNum(p.y2, 0)
        const label = asStr(p.label)
        // ArrowShape в tldraw v3 хранит текст метки как plain string (CON-tldraw-shape-quirks).
        // NEVER use richText for ArrowShape — it causes a TypeError.
        // D-11: ArrowShape text: string plain (not richText).
        const id = createShapeId()
        editor.createShape({
          id,
          type: 'arrow',
          x: 0,
          y: 0,
          opacity: 0,
          props: {
            start: { x: x1, y: y1 },
            end: { x: x2, y: y2 },
            text: label,
            color: 'black',
            size: 'm',
            arrowheadStart: 'none',
            arrowheadEnd: 'arrow',
            bend: 0,
            dash: 'solid',
          },
        } as Parameters<Editor['createShape']>[0])
        fadeInShape(editor, id, 'arrow')
        return { ok: true }
      }

      case 'highlight_region': {
        // Dedup active highlights — only ONE highlight on the canvas at a time.
        // Without this, two adjacent column highlights (units → tens) overlap
        // by their dashed borders and the user sees two pink frames touching.
        // We tag each highlight with meta.kind='highlight' and sweep prior ones.
        for (const existingId of Array.from(editor.getCurrentPageShapeIds())) {
          const shape = editor.getShape(existingId)
          if (shape?.meta?.kind === 'highlight') {
            try {
              editor.deleteShape(existingId)
            } catch {
              /* may have been auto-cleared already — fine */
            }
          }
        }

        const id = createShapeId()
        const colorName = mapColor(p.color, 'yellow')
        editor.createShape({
          id,
          type: 'geo',
          x: asNum(p.x, 0),
          y: asNum(p.y, 0),
          opacity: 0,
          meta: { kind: 'highlight' },
          props: {
            geo: 'rectangle',
            w: Math.max(1, asNum(p.w, 100)),
            h: Math.max(1, asNum(p.h, 60)),
            color: colorName,
            // Без заливки — только пунктирная рамка. Цифры внутри не перекрываются.
            fill: 'none',
            dash: 'dashed',
            size: 's',
          },
        })
        // Сама пунктирная рамка тоже полупрозрачная, чтобы быть мягким акцентом,
        // а не «жирной обводкой».
        fadeInShape(editor, id, 'geo', { targetOpacity: 0.65 })
        // Default duration bumped 1500 → 4000ms: highlight should linger long
        // enough for the child to read the side annotation it points at.
        const dur = Math.max(0, asNum(p.duration_ms, 4000))
        if (dur > 0) {
          setTimeout(() => {
            try {
              editor.deleteShape(id)
            } catch {
              /* шейп мог быть удалён очисткой — это нормально */
            }
          }, dur)
        }
        return { ok: true, note: `auto-cleared in ${dur}ms` }
      }

      case 'wait': {
        const ms = Math.max(0, asNum(p.ms, 300))
        await new Promise((res) => setTimeout(res, ms))
        return { ok: true, note: `waited ${ms}ms` }
      }

      case 'say': {
        // На канвас не рисуем — это для панели объяснений (и потом TTS).
        // Возвращаем text, чтобы вызывающий код знал что это «реплика».
        // TODO Phase 6: emit board:say to bus when SSE includes say tool
        return { ok: true, note: asStr(p.text) }
      }

      case 'finish': {
        // Маркер завершения — обрабатывается в route.ts (там выходим из agent loop).
        // На клиенте ничего не делаем.
        return { ok: true, note: 'finished' }
      }

      default:
        return { ok: false, note: `unknown tool: ${name}` }
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return { ok: false, note: `error: ${msg}` }
  }
}

function upSize(s: TLSize): TLSize {
  return s === 's' ? 'm' : s === 'm' ? 'l' : s === 'l' ? 'xl' : 'xl'
}
