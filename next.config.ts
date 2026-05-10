import path from 'node:path'
import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  // CON-nextjs-tracing-root: lock workspace root in DEV only, otherwise Next.js finds ~/package-lock.json.
  // On Vercel this path bakes into the bundle and breaks function routing — Vercel's default
  // tracing handles its own isolated build context correctly.
  outputFileTracingRoot: process.env.VERCEL ? undefined : path.resolve(__dirname),

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
