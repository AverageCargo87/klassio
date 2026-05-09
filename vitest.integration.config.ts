// Vitest config for integration tests only.
// Loads .env.local before running tests so lib/env.ts can parse real credentials.
// Usage: npm run test:integration (see package.json scripts)
import { defineConfig, loadEnv } from 'vite'
import path from 'node:path'

export default defineConfig(({ mode }) => {
  // Load .env.local into process.env before test modules are resolved
  const env = loadEnv(mode, process.cwd(), '')
  // Merge into process.env so zod schema in lib/env.ts sees the values
  Object.assign(process.env, env)

  return {
    test: {
      environment: 'node', // integration tests run in node, not happy-dom
      globals: true,
      include: [
        'lib/auth/__tests__/whitelist.integration.test.ts',
        'lib/db/__tests__/**/*.test.ts',
      ],
      reporters: ['verbose'],
      hookTimeout: 30000, // Neon Free tier can be slow to wake up (autosuspend)
      testTimeout: 30000,
    },
    resolve: {
      alias: { '@': path.resolve(__dirname, './') },
    },
  }
})
