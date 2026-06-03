// POST /api/tutor/signed-url — mint a signed WebSocket URL for the TUTOR agent.
// Mirrors app/api/voice/signed-url (Phase 6) but: (a) ownership is checked
// against tutor_session, not the legacy `lesson` table; (b) it uses the tutor
// agent (ELEVENLABS_TUTOR_AGENT_ID). Falls back to the math agent
// (ELEVENLABS_AGENT_ID) with a flag so the plumbing is testable before the
// dedicated tutor agent is provisioned — see scripts/restore-tutor-agent.mjs.
//
// Dynamic variables are NOT part of the signed URL — the client passes them to
// conversation.startSession (returned by /api/tutor/session), same as Phase 8.
import { NextRequest } from 'next/server'
import { z } from 'zod'
import { getUserId, json } from '@/lib/tutor/http'
import { getSession } from '@/lib/tutor'
import { getSignedUrl } from '@/lib/elevenlabs/get-signed-url'
import { wrapSignedUrl } from '@/lib/elevenlabs/proxy-url'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const Body = z.object({ sessionId: z.string().uuid() })

export async function POST(req: NextRequest) {
  const userId = await getUserId()
  if (!userId) return json({ error: 'Войдите в систему' }, 401)

  let body: z.infer<typeof Body>
  try {
    body = Body.parse(await req.json())
  } catch {
    return json({ error: 'Неверный формат запроса' }, 400)
  }

  // Ownership: the session must belong to this user.
  const session = await getSession(body.sessionId, userId)
  if (!session) return json({ error: 'Этот урок не ваш' }, 403)

  const apiKey = process.env.ELEVENLABS_API_KEY
  const tutorAgentId = process.env.ELEVENLABS_TUTOR_AGENT_ID
  const fallbackAgentId = process.env.ELEVENLABS_AGENT_ID
  const agentId = tutorAgentId || fallbackAgentId
  const usingFallbackAgent = !tutorAgentId && !!fallbackAgentId

  if (!apiKey || !agentId) {
    return json({ error: 'Voice service не настроен' }, 500)
  }
  if (usingFallbackAgent) {
    console.warn(
      '[tutor/signed-url] ELEVENLABS_TUTOR_AGENT_ID not set — falling back to the math agent. Voice will behave as the math teacher until the tutor agent is provisioned.',
    )
  }

  try {
    const upstreamUrl = await getSignedUrl(agentId, apiKey)
    const { url: signedUrl, proxied } = wrapSignedUrl(upstreamUrl, {
      VOICE_PROXY_HOST: process.env.VOICE_PROXY_HOST,
      VOICE_PROXY_HMAC_SECRET: process.env.VOICE_PROXY_HMAC_SECRET,
    })
    return json({ signedUrl, proxied, usingFallbackAgent })
  } catch (err) {
    console.error('[tutor/signed-url] 11labs upstream failure:', err)
    return json({ error: 'Не удалось подключиться к голосовому сервису' }, 502)
  }
}
