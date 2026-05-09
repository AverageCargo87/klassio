import path from 'node:path'
import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  // CON-nextjs-tracing-root: lock workspace root, otherwise Next.js finds ~/package-lock.json
  outputFileTracingRoot: path.resolve(__dirname),
}

export default nextConfig
