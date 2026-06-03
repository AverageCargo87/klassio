'use server'
// Server action: parent acknowledges a behaviour-moderation notice.
// Ownership enforced inside acknowledgeModerationEvent (eventId AND userId).
import { auth } from '@/auth'
import { acknowledgeModerationEvent } from '@/lib/tutor'
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
