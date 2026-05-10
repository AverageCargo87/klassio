// Next.js instrumentation hook — runs once on server startup.
// Routes Node fetch through HTTPS_PROXY when set (dev-only, RU dev environment).
// No-op in production (Vercel sets no proxy vars) — D-05.
//
// Зачем: на машине пользователя локальный прокси (Clash/V2Ray/Shadowsocks-Win и т.п.)
// слушает на 127.0.0.1:108xx, и через него уходит весь VPN-трафик.
// Curl читает HTTPS_PROXY автоматически — Node нет.
// Без этого хука fetch к OpenAI уходит напрямую к провайдеру → блок по гео (CON-openai-rf-block).

import { createRequire } from 'node:module'

export async function register() {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return

  const proxyUrl =
    process.env.HTTPS_PROXY ||
    process.env.https_proxy ||
    process.env.HTTP_PROXY ||
    process.env.http_proxy

  if (!proxyUrl) {
    console.log('[instrumentation] HTTPS_PROXY/HTTP_PROXY не задан — fetch идёт напрямую')
    return
  }

  try {
    // createRequire — нативный Node CJS require. Webpack его не статически анализирует
    // и не пытается забандлить undici (а его mock-сабмодуль импортит `node:console`,
    // которое webpack по умолчанию не пропускает). CON-webpack-undici.
    const nodeRequire = createRequire(import.meta.url)
    const undici = nodeRequire('undici') as typeof import('undici')
    undici.setGlobalDispatcher(new undici.ProxyAgent({ uri: proxyUrl }))
    console.log('[instrumentation] global fetch routed through', proxyUrl)
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.warn('[instrumentation] не получилось включить прокси:', msg)
  }
}
