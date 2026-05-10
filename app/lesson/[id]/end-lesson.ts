'use server'
// Server Action: mark lesson as completed and redirect to /lessons.
// Uses pg (node-postgres) for Neon-safe DML (matches Phase 2 admin CLI pattern, D-12).
// Ownership check: WHERE user_id = $2 prevents cross-user completion.
// Guard: AND status = 'in_progress' — cannot complete a lesson that is not active.
// T-03-03-03 mitigation: cross-user completion returns 0 rows updated (silent no-op, no error leak).
// T-03-03-04 mitigation: guard prevents completing a scheduled/completed/cancelled lesson.
import { auth } from '@/auth'
import { redirect } from 'next/navigation'
import pkg from 'pg'

const { Client } = pkg

async function withPg<T>(fn: (client: InstanceType<typeof Client>) => Promise<T>): Promise<T> {
  const connectionString = process.env.DATABASE_URL_DIRECT
  if (!connectionString) throw new Error('DATABASE_URL_DIRECT required')
  const client = new Client({ connectionString, ssl: { rejectUnauthorized: false } })
  await client.connect()
  try {
    return await fn(client)
  } finally {
    await client.end()
  }
}

export async function endLesson(lessonId: string): Promise<void> {
  const session = await auth()
  if (!session?.user?.id) redirect('/login')

  const userId = session.user.id

  await withPg(async (client) => {
    await client.query(
      `UPDATE lesson
         SET status = 'completed', actual_end_at = now()
       WHERE id = $1
         AND user_id = $2
         AND status = 'in_progress'`,
      [lessonId, userId],
    )
  })

  redirect('/lessons')
}
