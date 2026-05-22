import path from 'node:path'
import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  // CON-nextjs-tracing-root: lock workspace root in DEV only, otherwise Next.js finds ~/package-lock.json.
  // On Vercel this path bakes into the bundle and breaks function routing — Vercel's default
  // tracing handles its own isolated build context correctly.
  outputFileTracingRoot: process.env.VERCEL ? undefined : path.resolve(__dirname),

  // UAT 2026-05-22 round 14: expose the Vercel build's git short-SHA to the
  // client bundle so the lesson-v2 TopBar can render "Klassio · abc1234".
  // VERCEL_GIT_COMMIT_SHA is provided automatically on every Vercel deploy.
  // Fallback "dev" used during local development.
  env: {
    NEXT_PUBLIC_BUILD_SHA: (process.env.VERCEL_GIT_COMMIT_SHA || 'dev').slice(0, 7),
    NEXT_PUBLIC_BUILD_BRANCH: process.env.VERCEL_GIT_COMMIT_REF || 'local',
  },

  // Prevent webpack from bundling Node.js native modules used in server-only code.
  // pg (node-postgres) uses native Node.js net/tls/fs — webpack bundling breaks it in RSC.
  // drizzle-orm and @auth/drizzle-adapter must also be excluded so they load from the
  // same module instance (module identity used for instanceof checks in drizzle-orm).
  // @neondatabase/serverless is similarly excluded for consistency.
  // undici: used by instrumentation.ts ProxyAgent for dev HTTPS_PROXY tunnel (CON-webpack-undici).
  // These packages run only in the Node.js server runtime (Route Handlers, Server Actions),
  // never in edge or browser contexts.
  serverExternalPackages: [
    'pg',
    'pg-native',
    'drizzle-orm',
    '@auth/drizzle-adapter',
    '@neondatabase/serverless',
    'undici',
  ],

  webpack: (config, { isServer }) => {
    if (isServer) {
      // CON-webpack-undici: undici imports node:console, node:crypto, node:module.
      // Webpack by default does not handle node: URI scheme — mark all as commonjs externals.
      // This pairs with createRequire usage in instrumentation.ts (webpack skips static analysis).
      const originalExternals = config.externals ?? []
      config.externals = [
        ...(Array.isArray(originalExternals) ? originalExternals : [originalExternals]),
        ({ request }: { request?: string }, callback: (err?: Error | null, result?: string) => void) => {
          if (request && request.startsWith('node:')) {
            callback(null, 'commonjs ' + request)
            return
          }
          callback()
        },
      ]
    }
    return config
  },
}

export default nextConfig
