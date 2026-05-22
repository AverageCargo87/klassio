'use client'
// lib/lesson-v2/use-theme.ts
// Persisted light/dark theme for lesson-v2. Writes data-theme to the
// nearest .lesson-v2-root element so CSS variables defined in globals.css
// switch palette without re-rendering inline styles. Persistence via
// localStorage under 'klassio-lesson-v2-theme'.

import { useCallback, useEffect, useState } from 'react'

export type Theme = 'light' | 'dark'

const STORAGE_KEY = 'klassio-lesson-v2-theme'

function readStored(): Theme {
  if (typeof window === 'undefined') return 'light'
  const v = window.localStorage.getItem(STORAGE_KEY)
  return v === 'dark' ? 'dark' : 'light'
}

function applyToDom(theme: Theme) {
  if (typeof document === 'undefined') return
  const root = document.querySelector<HTMLElement>('.lesson-v2-root')
  if (root) root.dataset.theme = theme
}

export function useTheme(): { theme: Theme; toggle: () => void; setTheme: (t: Theme) => void } {
  const [theme, setThemeState] = useState<Theme>('light')

  // Hydrate from storage on mount.
  useEffect(() => {
    const stored = readStored()
    setThemeState(stored)
    applyToDom(stored)
  }, [])

  const setTheme = useCallback((next: Theme) => {
    setThemeState(next)
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(STORAGE_KEY, next)
    }
    applyToDom(next)
  }, [])

  const toggle = useCallback(() => {
    setTheme(theme === 'dark' ? 'light' : 'dark')
  }, [theme, setTheme])

  return { theme, toggle, setTheme }
}
