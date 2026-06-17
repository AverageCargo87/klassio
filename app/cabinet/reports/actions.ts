'use server'
// Server actions for the parent cabinet.
// Ownership is enforced inside each data-access call (id AND userId).
import { auth } from '@/auth'
import { acknowledgeModerationEvent, markHomeworkDone } from '@/lib/tutor'
import { revalidatePath } from 'next/cache'

export async function ackModeration(formData: FormData): Promise<void> {
  const session = await auth()
  if (!session?.user?.id) return
  const eventId = String(formData.get('eventId') ?? '')
  if (!eventId) return
  await acknowledgeModerationEvent(session.user.id, eventId)
  revalidatePath('/cabinet/reports')
  revalidatePath('/cabinet')
}

export async function completeHomework(formData: FormData): Promise<void> {
  const session = await auth()
  if (!session?.user?.id) return
  const homeworkId = String(formData.get('homeworkId') ?? '')
  if (!homeworkId) return
  await markHomeworkDone({ homeworkId, userId: session.user.id })
  revalidatePath('/cabinet/reports')
}
