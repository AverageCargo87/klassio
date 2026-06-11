// POST /api/tutor/sber-url — выдать подписанный WS URL к Sber-оркестратору
// (RU-стек, маршрут /tutor-ru). Зеркало /api/tutor/signed-url: тот же auth +
// ownership-чек tutor_session, но вместо похода в 11labs просто минтим
// HMAC-токен (sid:t) — оркестратор проверяет его на upgrade.
import { NextRequest } from 'next/server'
import { z } from 'zod'
import { getUserId, json } from '@/lib/tutor/http'
import { getSession } from '@/lib/tutor'
import { buildSberTutorWsUrl } from '@/lib/tutor/sber-url'

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

  try {
    const wsUrl = buildSberTutorWsUrl(body.sessionId, {
      SBER_TUTOR_WSS_HOST: process.env.SBER_TUTOR_WSS_HOST,
      SBER_TUTOR_HMAC_SECRET: process.env.SBER_TUTOR_HMAC_SECRET,
      VOICE_PROXY_HOST: process.env.VOICE_PROXY_HOST,
      VOICE_PROXY_HMAC_SECRET: process.env.VOICE_PROXY_HMAC_SECRET,
    })
    return json({ wsUrl })
  } catch (err) {
    console.error('[tutor/sber-url]', err)
    return json({ error: 'RU-голосовой сервис не настроен' }, 500)
  }
}
