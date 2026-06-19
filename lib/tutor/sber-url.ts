// Server-only: сборка подписанного wss:// URL к Sber-оркестратору
// (infra/h2nexus/sber-tutor/index.mjs на франкфурт-VPS). Зеркало
// lib/elevenlabs/proxy-url.ts, но проще: подписываем сам sessionId,
// апстрим-URL внутрь токена не зашивается.
//
// Wire protocol (см. шапку index.mjs оркестратора):
//   wss://<host>/sber-tutor?sid=<sessionId>&t=<unix_ms>&s=<hmac>
//   s = HMAC-SHA256(SBER_TUTOR_HMAC_SECRET, sid + ':' + t)
//
// ENV-фолбэки сделаны так, чтобы preview-деплой работал БЕЗ новых переменных
// на Vercel: секрет = VOICE_PROXY_HMAC_SECRET (он же лежит в .env оркестратора
// на VPS), хост = VOICE_PROXY_HOST + '/sber-tutor' (тот же nginx, тот же TLS).
import { createHmac } from 'node:crypto'

export interface SberUrlEnv {
  SBER_TUTOR_WSS_HOST?: string
  SBER_TUTOR_HMAC_SECRET?: string
  VOICE_PROXY_HOST?: string
  VOICE_PROXY_HMAC_SECRET?: string
}

export function buildSberTutorWsUrl(
  sessionId: string,
  env: SberUrlEnv,
  now: number = Date.now(),
): string {
  const host =
    env.SBER_TUTOR_WSS_HOST ||
    (env.VOICE_PROXY_HOST ? `${env.VOICE_PROXY_HOST.replace(/\/+$/, '')}/sber-tutor` : undefined)
  const secret = env.SBER_TUTOR_HMAC_SECRET || env.VOICE_PROXY_HMAC_SECRET
  if (!host || !secret) {
    throw new Error('Sber tutor не настроен: нужны SBER_TUTOR_WSS_HOST/SBER_TUTOR_HMAC_SECRET (или VOICE_PROXY_*)')
  }
  const t = String(now)
  const s = createHmac('sha256', secret).update(`${sessionId}:${t}`).digest('hex')
  const params = new URLSearchParams({ sid: sessionId, t, s })
  return `wss://${host}?${params.toString()}`
}
