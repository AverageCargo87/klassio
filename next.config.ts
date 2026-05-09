import path from 'node:path'
import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  // CON-nextjs-tracing-root: lock workspace root, otherwise Next.js finds ~/package-lock.json
  outputFileTracingRoot: path.resolve(__dirname),

  // Prevent webpack from bundling Node.js native modules used in server-only code.
  // pg (node-postgres) uses native Node.js net/tls/fs — webpack bundling breaks it in RSC.
  // drizzle-orm and @auth/drizzle-adapter must also be excluded so they load from the
  // same module instance (module identity used for instanceof checks in drizzle-orm).
  // @neondatabase/serverless is similarly excluded for consistency.
  // These packages run only in the Node.js server runtime (Route Handlers, Server Actions),
  // never in edge or browser contexts.
  serverExternalPackages: [
    'pg',
    'pg-native',
    'drizzle-orm',
    '@auth/drizzle-adapter',
    '@neondatabase/serverless',
  ],
}

export default nextConfig
