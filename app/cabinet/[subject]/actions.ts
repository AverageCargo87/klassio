'use server'
// Действия на странице предмета: отметить домашку выполненной, прочитать замечание.
// Ownership — внутри data-access (id AND userId).
import { auth } from '@/auth'
import { markHomeworkDone, acknowledgeModerationEvent } from '@/lib/tutor'
import { revalidatePath } from 'next/cache'

export async function completeHomeworkAction(formData: FormData): Promise<void> {
  const session = await auth()
  if (!session?.user?.id) return
  const homeworkId = String(formData.get('homeworkId') ?? '')
  const subjectId = String(formData.get('subjectId') ?? '')
  if (!homeworkId) return
  await markHomeworkDone({ homeworkId, userId: session.user.id })
  if (subjectId) revalidatePath(`/cabinet/${subjectId}`)
  revalidatePath('/cabinet')
}

export async function ackNoticeAction(formData: FormData): Promise<void> {
  const session = await auth()
  if (!session?.user?.id) return
  const eventId = String(formData.get('eventId') ?? '')
  const subjectId = String(formData.get('subjectId') ?? '')
  if (!eventId) return
  await acknowledgeModerationEvent(session.user.id, eventId)
  if (subjectId) revalidatePath(`/cabinet/${subjectId}`)
  revalidatePath('/cabinet')
}
