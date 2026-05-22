'use client'
// components/lesson-v2/theme-toggle.tsx
// Sun/moon toggle button for the lesson-v2 TopBar. Sits to the left of
// the UserMenu avatar. Single button — click flips the theme and
// persists via useTheme.

import { useTheme } from '@/lib/lesson-v2/use-theme'
import { PALETTE } from './palette'

export function ThemeToggle() {
  const { theme, toggle } = useTheme()
  const isDark = theme === 'dark'
  return (
    <button
      onClick={toggle}
      title={isDark ? 'Светлая тема' : 'Тёмная тема'}
      aria-label={isDark ? 'Переключить на светлую тему' : 'Переключить на тёмную тему'}
      className="w-10 h-10 rounded-full inline-flex items-center justify-center transition-transform hover:scale-105 active:scale-95"
      style={{
        background: PALETTE.card,
        color: PALETTE.ink,
        border: `1.5px solid ${PALETTE.line}`,
        boxShadow: `0 2px 0 ${PALETTE.line}, 0 3px 10px rgba(31,42,55,0.08)`,
        fontSize: 18,
        lineHeight: 1,
      }}
    >
      {isDark ? (
        // sun (light-mode target)
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="4" />
          <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
        </svg>
      ) : (
        // moon (dark-mode target)
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
        </svg>
      )}
    </button>
  )
}
