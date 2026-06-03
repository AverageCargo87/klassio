// POST /api/tutor/moderation — server-side behaviour check (LESSON-FLOW §7,
// layer 1 of 2). The client forwards the CHILD's transcript here; the server
// detects profanity/rudeness, decides warn/escalate from prior incidents in
// THIS session, records the incident (moderation_warning | moderation_escalation
// — these event types are ONLY writable here, never via /api/tutor/event), and
// returns the RU note the client pushes to the agent via sendContextualUpdate.
//
// PRIVACY: the raw utterance is never persisted or echoed — only coarse reason
// tags. A clean utterance writes nothing to the DB.
import { NextRequest } from 'next/server'
import { z } from 'zod'
import { getUserId, json } from '@/lib/tutor/http'
import { getSession, recordEvent, countSessionEvents } from '@/lib/tutor'
import { detectMisbehavior, decideModerationAction } from '@/lib/moderation'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const Body = z.object({
  sessionId: z.string().uuid(),
  text: z.string().min(1).max(2000),
})

export async function POST(req: NextRequest) {
  const userId = await getUserId()
  if (!userId) return json({ error: 'Войдите в систему' }, 401)

  let body: z.infer<typeof Body>
  try {
    body = Body.parse(await req.json())
  } catch {
    return json({ error: 'Неверный формат запроса' }, 400)
  }

  const session = await getSession(body.sessionId, userId)
  if (!session) return json({ error: 'Этот урок не ваш' }, 403)

  const detection = detectMisbehavior(body.text)
  if (detection.severity === 'none') {
    return json({ action: 'none', contextualUpdate: null, notifyParent: false })
  }

  try {
    const priorIncidents = await countSessionEvents(body.sessionId, userId, [
      'moderation_warning',
      'moderation_escalation',
    ])
    const decision = decideModerationAction(detection.severity, priorIncidents)

    await recordEvent({
      sessionId: body.sessionId,
      userId,
      eventType: decision.action === 'escalate' ? 'moderation_escalation' : 'moderation_warning',
      // Reason TAGS only — never the raw word.
      payload: { severity: detection.severity, reasons: detection.reasons },
    })

    return json({
      action: decision.action,
      contextualUpdate: decision.contextualUpdate,
      notifyParent: decision.notifyParent,
    })
  } catch (err) {
    console.error('[tutor/moderation] failed:', err)
    // Fail-safe: still return a warn instruction so the agent reacts, even if
    // the DB write failed — child safety over bookkeeping.
    return json({
      action: 'warn',
      contextualUpdate:
        '[МОДЕРАЦИЯ] Ребёнок грубо выразился. Спокойно скажи, что так нельзя, и мягко верни к уроку.',
      notifyParent: false,
    })
  }
}
