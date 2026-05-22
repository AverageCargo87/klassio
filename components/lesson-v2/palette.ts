// components/lesson-v2/palette.ts
// Color palette ported from Claude Design lesson-data.js (window.LP_PALETTE).
// Used inline via `style={{ background: PALETTE.green }}` across all v2 components.
// Kept as TS const so refactoring is one place.
//
// UAT 2026-05-22: themeable values switched to CSS variables defined in
// app/globals.css under .lesson-v2-root (+ data-theme="dark" override).
// Brand colours (green/blue/coral/yellow/lilac) stay as hex literals
// because they read well on both light and dark backdrops.

export const PALETTE = {
  // theme-aware surfaces & text — resolved via CSS vars
  bg: 'var(--lp-bg)',
  card: 'var(--lp-card)',
  ink: 'var(--lp-ink)',
  sub: 'var(--lp-sub)',
  line: 'var(--lp-line)',
  // theme-aware "paper" tints used by ColumnExpression and inputs
  paperWarm: 'var(--lp-paper-warm)',
  paperWarmBorder: 'var(--lp-paper-warm-border)',
  paperWarmSoft: 'var(--lp-paper-warm-soft)',
  paperWarmBorderSoft: 'var(--lp-paper-warm-border-soft)',
  placeholderDot: 'var(--lp-placeholder-dot)',
  // feedback soft backgrounds — theme-aware
  greenSoft: 'var(--lp-correct-soft)',
  coralSoft: 'var(--lp-wrong-soft)',
  // brand (Duolingo-like) — same on both themes
  green: '#58CC02',
  greenDeep: '#46A302',
  blue: '#1CB0F6',
  blueDeep: '#1591CC',
  blueSoft: '#E3F4FD',
  yellow: '#FFC800',
  yellowSoft: '#FFF3C7',
  coral: '#FF6B6B',
  coralDeep: '#E04B4B',
  lilac: '#A78BFA',
  lilacSoft: '#EFE9FE',
  // difficulty
  d1: '#58CC02',
  d2: '#1CB0F6',
  d3: '#FB923C',
} as const

export type PaletteKey = keyof typeof PALETTE
