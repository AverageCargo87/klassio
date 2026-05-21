// components/lesson-v2/palette.ts
// Color palette ported from Claude Design lesson-data.js (window.LP_PALETTE).
// Used inline via `style={{ background: PALETTE.green }}` across all v2 components.
// Kept as TS const so refactoring is one place.

export const PALETTE = {
  // background
  bg: '#F4F6F9',
  card: '#FFFFFF',
  ink: '#1F2A37',
  sub: '#6B7280',
  line: '#E5E7EB',
  // brand (Duolingo-like)
  green: '#58CC02',
  greenDeep: '#46A302',
  greenSoft: '#E8F7D8',
  blue: '#1CB0F6',
  blueDeep: '#1591CC',
  blueSoft: '#E3F4FD',
  yellow: '#FFC800',
  yellowSoft: '#FFF3C7',
  coral: '#FF6B6B',
  coralDeep: '#E04B4B',
  coralSoft: '#FFE4E4',
  lilac: '#A78BFA',
  lilacSoft: '#EFE9FE',
  // difficulty
  d1: '#58CC02',
  d2: '#1CB0F6',
  d3: '#FB923C',
} as const

export type PaletteKey = keyof typeof PALETTE
