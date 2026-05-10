import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import React from 'react'
import { LessonBusProvider } from '@/lib/lesson-bus'
import { BoardPanel } from '@/components/panels/board-panel'
import { VoicePanel } from '@/components/panels/voice-panel'
import { TrainerPanel } from '@/components/panels/trainer-panel'

// Mock the server action so LessonShell can be imported in client-side test context.
// The 'use server' action imports @/auth which transitively imports next/server (server-only).
vi.mock('@/app/lesson/[id]/end-lesson', () => ({
  endLesson: vi.fn().mockResolvedValue(undefined),
}))

// Import LessonShell after mocks are set up
import { LessonShell } from '@/components/lesson-shell'

const wrap = (ui: React.ReactNode) =>
  render(React.createElement(LessonBusProvider, null, ui))

describe('BoardPanel', () => {
  it('renders Доска heading and Phase 4 placeholder', () => {
    wrap(React.createElement(BoardPanel))
    expect(screen.getByText(/Доска/)).toBeDefined()
    expect(screen.getByText(/Phase 4/)).toBeDefined()
  })
})

describe('VoicePanel', () => {
  it('renders Голос heading', () => {
    wrap(React.createElement(VoicePanel))
    // Use getAllByText since "Голос" appears in both title and paragraph; verify at least one exists
    expect(screen.getAllByText(/Голос/).length).toBeGreaterThan(0)
  })

  it('renders test bus button (dev env)', () => {
    // NEXT_PUBLIC_LESSON_BUS_TEST defaults to undefined (not 'false')
    // The component checks process.env.NEXT_PUBLIC_LESSON_BUS_TEST !== 'false'
    // So the button is shown by default.
    wrap(React.createElement(VoicePanel))
    expect(screen.getByRole('button', { name: /Тест шины/ })).toBeDefined()
  })
})

describe('TrainerPanel', () => {
  it('renders Тренажёр heading and initial counter', () => {
    wrap(React.createElement(TrainerPanel))
    // "Тренажёр" appears in both title and description paragraph; use getAllByText
    expect(screen.getAllByText(/Тренажёр/).length).toBeGreaterThan(0)
    expect(screen.getByText(/Получено 0 тестовых событий/)).toBeDefined()
  })
})

describe('LessonShell cross-panel bus', () => {
  it('renders all 3 panel headings', () => {
    render(
      React.createElement(LessonShell, {
        lessonId: 'test-lesson-id',
        topic: 'Дроби',
      })
    )
    // LessonShell renders panels in both tablet and desktop layout containers,
    // so use getAllByText to handle multiple occurrences.
    expect(screen.getAllByText(/Доска/).length).toBeGreaterThan(0)
    expect(screen.getAllByText(/Голос/).length).toBeGreaterThan(0)
    expect(screen.getAllByText(/Тренажёр/).length).toBeGreaterThan(0)
  })
})
