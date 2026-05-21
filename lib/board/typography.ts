// lib/board/typography.ts
// Single source of truth for monospace glyph step used by the board renderer.
//
// Shared by executor.ts (which steps staggered fade-in digits by this width)
// and scene generators (which lay out columns assuming the same step). Keeping
// it in one file prevents the executor and scenes from drifting apart, which
// would manifest as misaligned highlights and result digits.

export type TLSize = 's' | 'm' | 'l' | 'xl'

export function mapFontSize(size: unknown): TLSize {
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

// Approximate monospace glyph advance for each tldraw size bucket. Empirical —
// editor.measureText would be exact but it's synchronous and breaks batching.
// These values match what the staggered fade-in path in executor uses to space
// adjacent digit shapes (`baseX + i * MONO_CHAR_WIDTH[size]`).
export const MONO_CHAR_WIDTH: Record<TLSize, number> = {
  s: 10,
  m: 14,
  l: 22,
  xl: 30,
}

// Resolve a fontSize in px to the actual glyph step the renderer will use.
// Scenes should compute DIGIT_W = getMonoCharWidth(theirFontSize) instead of
// guessing — otherwise highlight/result coordinates miss the rendered digits.
export function getMonoCharWidth(fontSize: number): number {
  return MONO_CHAR_WIDTH[mapFontSize(fontSize)]
}
