// Test fixtures used by unit, integration, and e2e tests.
// Keep deterministic — no Date.now() at module-load time.

export const allowedEmail = {
  email: 'parent@example.com',
  notes: 'test fixture',
}

export const testUser = {
  id: '00000000-0000-0000-0000-000000000001',
  email: 'parent@example.com',
  name: null as string | null,
  emailVerified: null as Date | null,
  image: null as string | null,
  childName: 'Тест-ребёнок',
  childAge: 10,
  createdAt: new Date('2026-01-01T00:00:00Z'),
  lastLoginAt: null as Date | null,
}

export const testLesson = {
  id: '00000000-0000-0000-0000-000000000010',
  userId: testUser.id,
  scheduledAt: new Date('2026-06-01T10:00:00Z'),
  topic: 'Сложение в столбик',
  durationMin: 45,
  htmlTemplateUrl: null as string | null,
  status: 'scheduled' as const,
  createdAt: new Date('2026-01-01T00:00:00Z'),
}

// Helpers for "now" injection — tests pass an explicit now to pure functions
// instead of mocking Date.now(). Used by canStartLesson tests.
export function fixedNow(iso: string): Date {
  return new Date(iso)
}
