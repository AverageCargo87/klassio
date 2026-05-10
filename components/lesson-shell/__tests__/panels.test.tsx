import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import React from 'react'
import { LessonBusProvider } from '@/lib/lesson-bus'
import type { TrainerConfig } from '@/lib/trainer/config-schema'

// Mock the server action so LessonShell can be imported in client-side test context.
// The 'use server' action imports @/auth which transitively imports next/server (server-only).
vi.mock('@/app/lesson/[id]/end-lesson', () => ({
  endLesson: vi.fn().mockResolvedValue(undefined),
}))

// Mock next/dynamic to return a synchronous stub for Tldraw (DOM dependency, ssr:false)
vi.mock('next/dynamic', () => ({
  default: () => {
    const MockTldraw = ({ onMount }: { onMount?: (editor: unknown) => void }) => {
      // Simulate tldraw mount by calling onMount with a mock editor
      React.useEffect(() => {
        if (onMount) {
          const mockEditor = {
            setCamera: vi.fn(),
            updateInstanceState: vi.fn(),
            getCurrentPageShapeIds: vi.fn(() => new Set()),
            deleteShapes: vi.fn(),
            createShape: vi.fn(),
          }
          onMount(mockEditor)
        }
      }, [onMount])
      return React.createElement('div', { 'data-testid': 'tldraw-canvas', className: 'tl-canvas' })
    }
    return MockTldraw
  },
}))

// Mock tldraw/tldraw.css to avoid CSS import errors in test environment
vi.mock('tldraw/tldraw.css', () => ({}))

// Mock TrainerRenderer to isolate TrainerPanel tests from component implementation
vi.mock('@/components/trainer/trainer-renderer', () => ({
  TrainerRenderer: ({ config }: { config: { title: string } }) =>
    React.createElement('div', { 'data-block': 'trainer', 'data-testid': 'trainer-renderer' }, config.title),
}))

// Mock lib/board executeToolCall to avoid tldraw dependency in tests
vi.mock('@/lib/board', () => ({
  executeToolCall: vi.fn().mockResolvedValue({ ok: true }),
}))

// Import panels and LessonShell after mocks are set up
import { BoardPanel } from '@/components/panels/board-panel'
import { VoicePanel } from '@/components/panels/voice-panel'
import { TrainerPanel } from '@/components/panels/trainer-panel'
import { LessonShell } from '@/components/lesson-shell'

const wrap = (ui: React.ReactNode) =>
  render(React.createElement(LessonBusProvider, null, ui))

describe('BoardPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // Mock global fetch for SSE tests
    vi.stubGlobal('fetch', vi.fn())
  })

  it('renders Доска heading', () => {
    wrap(React.createElement(BoardPanel, { lessonId: 'test-lesson' }))
    expect(screen.getAllByText(/Доска/).length).toBeGreaterThan(0)
  })

  it('renders prompt textarea with placeholder', () => {
    wrap(React.createElement(BoardPanel, { lessonId: 'test-lesson' }))
    const textarea = screen.getByPlaceholderText(/объясни сложение/i)
    expect(textarea).toBeDefined()
  })

  it('renders Объяснить button disabled when prompt is empty', () => {
    wrap(React.createElement(BoardPanel, { lessonId: 'test-lesson' }))
    const button = screen.getByRole('button', { name: /Объяснить/ })
    expect(button).toBeDefined()
    // Button should be disabled when prompt is empty (initial state)
    expect(button.hasAttribute('disabled')).toBe(true)
  })

  it('renders 3 suggestion chips', () => {
    wrap(React.createElement(BoardPanel, { lessonId: 'test-lesson' }))
    expect(screen.getByRole('button', { name: /Сложение в столбик/ })).toBeDefined()
    expect(screen.getByRole('button', { name: /Дроби/ })).toBeDefined()
    expect(screen.getByRole('button', { name: /Умножение на 10/ })).toBeDefined()
  })

  it('clicking chip fills textarea value', async () => {
    // Provide a minimal fetch mock so auto-submit does not throw
    const mockStream = new ReadableStream({
      start(controller) {
        controller.enqueue(new TextEncoder().encode('data: {"type":"done","finish_reason":"finished","usage":{"prompt_tokens":1,"completion_tokens":1,"total_tokens":2}}\n\n'))
        controller.close()
      },
    })
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, body: mockStream }))

    wrap(React.createElement(BoardPanel, { lessonId: 'test-lesson' }))
    const chip = screen.getByRole('button', { name: /Сложение в столбик/ })
    fireEvent.click(chip)
    const textarea = screen.getByPlaceholderText(/объясни сложение/i) as HTMLTextAreaElement
    await waitFor(() => {
      expect(textarea.value).toMatch(/Сложение/)
    })
  })

  it('submit POSTs to /api/draw with prompt and lessonId', async () => {
    // Setup a mock fetch that returns a done SSE stream
    const mockStream = new ReadableStream({
      start(controller) {
        controller.enqueue(new TextEncoder().encode('data: {"type":"done","finish_reason":"finished","usage":{"prompt_tokens":10,"completion_tokens":5,"total_tokens":15}}\n\n'))
        controller.close()
      }
    })
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      body: mockStream,
    })
    vi.stubGlobal('fetch', mockFetch)

    wrap(React.createElement(BoardPanel, { lessonId: 'lesson-abc' }))

    // Type in the textarea
    const textarea = screen.getByPlaceholderText(/объясни сложение/i)
    fireEvent.change(textarea, { target: { value: 'Покажи умножение на 5' } })

    // Click submit
    const button = screen.getByRole('button', { name: /Объяснить/ })
    fireEvent.click(button)

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith(
        '/api/draw',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ prompt: 'Покажи умножение на 5', lessonId: 'lesson-abc' }),
        })
      )
    })
  })
})

describe('VoicePanel', () => {
  // Phase 6 (06-02) rewrote VoicePanel: it now REQUIRES { lessonId, topic } props and
  // renders «Запустить голос» instead of the legacy «Тест шины» dev button. The deep
  // SDK / mic / bus integration is covered by components/panels/__tests__/voice-panel.test.tsx;
  // this file only smoke-tests that the panel can render inside the LessonShell tree.
  it('renders Голос heading and «Запустить голос» button', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    wrap(React.createElement(VoicePanel as React.FC<any>, { lessonId: 'lid', topic: 'Дроби' }))
    expect(screen.getAllByText(/Голос/).length).toBeGreaterThan(0)
    expect(screen.getByRole('button', { name: /Запустить голос/ })).toBeDefined()
  })
})

describe('TrainerPanel', () => {
  it('renders Тренажёр heading and placeholder when no config provided', () => {
    wrap(React.createElement(TrainerPanel))
    // "Тренажёр" appears in both title and placeholder text; use getAllByText
    expect(screen.getAllByText(/Тренажёр/).length).toBeGreaterThan(0)
    // Placeholder text (trainerConfig=null/undefined shows placeholder)
    expect(screen.getByText(/Тренажёр для этого урока ещё не настроен/)).toBeDefined()
  })

  it('renders placeholder when trainerConfig is null', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    wrap(React.createElement(TrainerPanel as React.FC<any>, { trainerConfig: null }))
    expect(screen.getAllByText(/Тренажёр/).length).toBeGreaterThan(0)
    // Should NOT render the TrainerRenderer
    expect(screen.queryByTestId('trainer-renderer')).toBeNull()
  })

  it('renders TrainerRenderer when trainerConfig is provided', () => {
    const config: TrainerConfig = {
      title: 'Тест тренажёр',
      tasks: [
        { id: 'task-1', type: 'numeric-input', prompt: 'Реши: 2+2=?', correct: 4 },
      ],
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    wrap(React.createElement(TrainerPanel as React.FC<any>, { trainerConfig: config }))
    expect(screen.getByTestId('trainer-renderer')).toBeDefined()
    // Should render the config title via TrainerRenderer
    expect(screen.getByText('Тест тренажёр')).toBeDefined()
    // Should NOT show placeholder text
    expect(screen.queryByText(/Тренажёр для этого урока ещё не настроен/)).toBeNull()
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
