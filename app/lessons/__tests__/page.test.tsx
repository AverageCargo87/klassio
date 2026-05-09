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
vi.mock('next/navigation', () => ({ redirect: vi.fn() }))
vi.mock('drizzle-orm', () => ({
  eq: vi.fn(),
  asc: vi.fn(),
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
  it('renders heading "Уроки"', async () => {
    authMock.mockResolvedValue({ user: { id: 'user1' } })
    mockLessons([])
    const { default: Page } = await import('../page')
    const ui = await Page()
    render(ui)
    expect(screen.getByRole('heading', { name: /Уроки/ })).toBeInTheDocument()
  })

  it('renders empty-state when user has no lessons', async () => {
    authMock.mockResolvedValue({ user: { id: 'user1' } })
    mockLessons([])
    const { default: Page } = await import('../page')
    const ui = await Page()
    render(ui)
    expect(screen.getByText(/Пока уроков нет/)).toBeInTheDocument()
  })

  it('renders Card with topic and Начать урок button for an upcoming lesson', async () => {
    authMock.mockResolvedValue({ user: { id: 'user1' } })
    mockLessons([
      {
        id: 'lesson1',
        userId: 'user1',
        scheduledAt: new Date(Date.now() + 60 * 60 * 1000),
        topic: 'Сложение в столбик',
        durationMin: 45,
        status: 'scheduled',
        htmlTemplateUrl: null,
        createdAt: new Date(),
      },
    ])
    const { default: Page } = await import('../page')
    const ui = await Page()
    render(ui)
    expect(screen.getByText(/Сложение в столбик/)).toBeInTheDocument()
    expect(screen.getByText(/Начать урок/)).toBeInTheDocument()
  })
})
