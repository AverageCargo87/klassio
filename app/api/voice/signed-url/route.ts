// POST /api/voice/signed-url — Phase 6 plan 06-01
//
// Server-only endpoint that mints a signed WebSocket URL for the 11labs
// Conversational AI agent (`agent_7701kr9c2v7eev3tabzv4f2b0e8b`). The signed URL
// is the only valid connection path because Authentication=ON is set on the agent.
//
// Threat model refs (see 06-01-PLAN.md <threat_model>):
// - T-06-01-01: ELEVENLABS_API_KEY never leaves this process (server-only env).
// - T-06-01-02: ELEVENLABS_AGENT_ID never leaves this process (server-only env).
// - T-06-01-03: auth() guard FIRST, ownership check enforced via session.user.id.
// - T-06-01-04: defensive typeof validation on lessonId; malformed JSON → 400.
// - T-06-01-05: upstream 11labs errors are logged server-side and replaced with
//   a generic 502 Russian message — no stack trace crosses the trust boundary.
//
// Decision refs:
// - D-05: server-only env (no NEXT_PUBLIC_ prefix; per-request guard, same as OPENAI_API_KEY).
// - D-06: client uses returned `topic` for first_message override (defense-in-depth — server is
//   the source of truth for topic, not the client request body).
//
// Analog: app/api/draw/route.ts (Phase 4) — copy auth + ownership + env-guard order.

import { NextRequest } from 'next/server'
import { auth } from '@/auth'
import { db } from '@/lib/db'
import { lessons } from '@/lib/db/schema'
import { eq, and } from 'drizzle-orm'
import { getSignedUrl } from '@/lib/elevenlabs/get-signed-url'
import { wrapSignedUrl } from '@/lib/elevenlabs/proxy-url'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  // ── Step 1: Auth guard — must run before body parse (T-06-01-03) ──────
  const session = await auth()
  if (!session?.user?.id) {
    return new Response(
      JSON.stringify({ error: 'Войдите в систему' }),
      { status: 401, headers: { 'Content-Type': 'application/json' } },
    )
  }

  // ── Step 2: Input validation (T-06-01-04) ─────────────────────────────
  let lessonId = ''
  try {
    const body = (await req.json()) as { lessonId?: unknown }
    lessonId = typeof body.lessonId === 'string' ? body.lessonId.trim() : ''
  } catch {
    return new Response(
      JSON.stringify({ error: 'Неверный формат запроса' }),
      { status: 400, headers: { 'Content-Type': 'application/json' } },
    )
  }

  if (!lessonId) {
    return new Response(
      JSON.stringify({ error: 'lessonId обязателен' }),
      { status: 400, headers: { 'Content-Type': 'application/json' } },
    )
  }

  // ── Step 3: Ownership check (T-06-01-03) ──────────────────────────────
  // Select topic too — we return it in the response so the client can use it
  // as the first_message override (D-06).
  const rows = await db
    .select({ id: lessons.id, topic: lessons.topic })
    .from(lessons)
    .where(and(eq(lessons.id, lessonId), eq(lessons.userId, session.user.id)))
    .limit(1)

  if (rows.length === 0) {
    return new Response(
      JSON.stringify({ error: 'Этот урок не ваш' }),
      { status: 403, headers: { 'Content-Type': 'application/json' } },
    )
  }
  const lesson = rows[0]

  // ── Step 4: Env var guard (D-05 / T-06-01-01/02) ──────────────────────
  // Read inside handler closure on every request; never imported by client code.
  const apiKey = process.env.ELEVENLABS_API_KEY
  const agentId = process.env.ELEVENLABS_AGENT_ID
  if (!apiKey || !agentId) {
    return new Response(
      JSON.stringify({ error: 'Voice service не настроен' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } },
    )
  }

  // ── Step 5: Upstream call wrapped in 502 (T-06-01-05) ─────────────────
  // Phase 6.5: if VOICE_PROXY_HOST is set in env, we wrap the upstream signed_url
  // into a token-protected proxy URL pointing at our Frankfurt VPS. The browser
  // never connects to api.elevenlabs.io directly — see lib/elevenlabs/proxy-url.ts.
  try {
    const upstreamUrl = await getSignedUrl(agentId, apiKey)
    const { url: signedUrl, proxied } = wrapSignedUrl(upstreamUrl, {
      VOICE_PROXY_HOST: process.env.VOICE_PROXY_HOST,
      VOICE_PROXY_HMAC_SECRET: process.env.VOICE_PROXY_HMAC_SECRET,
    })
    return new Response(
      JSON.stringify({ signedUrl, topic: lesson.topic, proxied }),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    )
  } catch (err) {
    console.error('[voice/signed-url] 11labs upstream failure:', err)
    return new Response(
      JSON.stringify({ error: 'Не удалось подключиться к голосовому сервису' }),
      { status: 502, headers: { 'Content-Type': 'application/json' } },
    )
  }
}
