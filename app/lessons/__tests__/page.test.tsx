import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import React from 'react'

const authMock = vi.fn()
const dbSelectMock = vi.fn()

vi.mock('@/auth', () => ({ auth: authMock }))
vi.mock('@/lib/db', () => ({
  db: { select: dbSelectMock },
  schema: {
    lessons: { userId: 'col_user_id', scheduledAt: 'col_scheduled_at' },
  },
}))
// redirect() in Next.js throws internally — mock it to throw so the page stops executing
const redirectMock = vi.fn().mockImplementation(() => {
  throw new Error('NEXT_REDIRECT')
})
vi.mock('next/navigation', () => ({ redirect: redirectMock }))
vi.mock('drizzle-orm', () => ({
  eq: vi.fn(),
  asc: vi.fn(),
}))

// Mock pure function modules — tested separately
vi.mock('../week-grouping', () => ({
  groupByWeek: vi.fn(() => []),
}))
vi.mock('../smart-date', () => ({
  formatSmartDate: vi.fn(() => 'Тест дата'),
}))

// Mock client component — it uses useState which isn't available in RSC rendering context
vi.mock('@/components/past-lessons', () => ({
  PastLessons: vi.fn(() => null),
}))

beforeEach(() => {
  authMock.mockReset()
  dbSelectMock.mockReset()
  vi.resetModules()
})

function mockLessons(rows: unknown[]) {
  dbSelectMock.mockReturnValue({
    from: () => ({
      where: () => ({
        orderBy: () => Promise.resolve(rows),
      }),
    }),
  })
}

describe('LessonsPage', () => {
  it('renders heading "Расписание"', async () => {
    authMock.mockResolvedValue({ user: { id: 'user1' } })
    mockLessons([])
    const { default: Page } = await import('../page')
    const ui = await Page()
    render(ui)
    expect(screen.getByRole('heading', { name: /Расписание/ })).toBeInTheDocument()
  })

  it('renders upcoming empty-state when user has no lessons', async () => {
    authMock.mockResolvedValue({ user: { id: 'user1' } })
    mockLessons([])
    const { default: Page } = await import('../page')
    const ui = await Page()
    render(ui)
    expect(
      screen.getByText(/Уроков на ближайшие 4 недели не запланировано/),
    ).toBeInTheDocument()
  })

  it('renders Card with topic and Начать урок button for an upcoming lesson', async () => {
    authMock.mockResolvedValue({ user: { id: 'user1' } })
    // Mock groupByWeek to return a bucket with the upcoming lesson
    const { groupByWeek } = await import('../week-grouping')
    const upcomingLesson = {
      id: 'lesson1',
      userId: 'user1',
      scheduledAt: new Date(Date.now() + 60 * 60 * 1000),
      topic: 'Сложение в столбик',
      durationMin: 45,
      status: 'scheduled' as const,
      htmlTemplateUrl: null,
      htmlTrainerPath: null,
      recordingUrl: null,
      transcriptUrl: null,
      createdAt: new Date(),
      // Phase 3 extensions (D-13)
      actualStartAt: null,
      actualEndAt: null,
    }
    vi.mocked(groupByWeek).mockReturnValueOnce([
      {
        label: 'Эта неделя',
        weekIndex: 0,
        lessons: [upcomingLesson],
      },
    ])
    mockLessons([upcomingLesson])
    const { default: Page } = await import('../page')
    const ui = await Page()
    render(ui)
    expect(screen.getByText(/Сложение в столбик/)).toBeInTheDocument()
    expect(screen.getByText(/Начать урок/)).toBeInTheDocument()
  })

  it('renders week header when groupByWeek returns a bucket', async () => {
    authMock.mockResolvedValue({ user: { id: 'user1' } })
    const { groupByWeek } = await import('../week-grouping')
    const lesson = {
      id: 'lesson2',
      userId: 'user1',
      scheduledAt: new Date(Date.now() + 60 * 60 * 1000),
      topic: 'Деление',
      durationMin: 45,
      status: 'scheduled' as const,
      htmlTemplateUrl: null,
      htmlTrainerPath: null,
      recordingUrl: null,
      transcriptUrl: null,
      createdAt: new Date(),
      // Phase 3 extensions (D-13)
      actualStartAt: null,
      actualEndAt: null,
    }
    vi.mocked(groupByWeek).mockReturnValueOnce([
      {
        label: 'Эта неделя',
        weekIndex: 0,
        lessons: [lesson],
      },
    ])
    mockLessons([lesson])
    const { default: Page } = await import('../page')
    const ui = await Page()
    render(ui)
    expect(screen.getByText('Эта неделя')).toBeInTheDocument()
  })

  it('redirects when not authenticated', async () => {
    authMock.mockResolvedValue(null)
    mockLessons([])
    const { default: Page } = await import('../page')
    // redirect() throws NEXT_REDIRECT in Next.js — we verify the throw
    await expect(Page()).rejects.toThrow('NEXT_REDIRECT')
    expect(redirectMock).toHaveBeenCalledWith('/login')
  })
})
