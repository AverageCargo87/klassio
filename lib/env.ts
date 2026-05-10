// Source: RESEARCH.md Code Example 4 + Pitfall 3 (dual DATABASE_URL) + Pitfall 6 (AUTH_SECRET min length)
// Validates env vars at module load — if any required var is missing/malformed,
// the app crashes immediately with a structured zod error rather than dying later
// with a cryptic "JWT signature verification failed" or "prepared statement does not exist".
import { z } from 'zod'

const envSchema = z.object({
  // App runtime DB — Supabase transaction pooler (port 6543), used by /api/* and Server Components
  DATABASE_URL: z.string().url(),
  // Migrations / seed DB — Supabase direct connection (port 5432), used by drizzle-kit and scripts/seed.ts
  // Required because transaction pooler does NOT support prepared statements (Pitfall 3)
  DATABASE_URL_DIRECT: z.string().url(),
  // NextAuth signing secret — generate via `npx auth secret`. Min 32 chars per Auth.js docs (Pitfall 6).
  AUTH_SECRET: z.string().min(32),
  // Resend API key — issued from resend.com dashboard. Format: re_<chars>
  AUTH_RESEND_KEY: z.string().min(10),
  // Optional in dev (defaults to http://localhost:3000); auto-set on Vercel via VERCEL_URL
  AUTH_URL: z.string().url().optional(),
  // Seed script target — used by scripts/seed.ts only
  SEED_ADMIN_EMAIL: z.string().email().optional(),
  // OpenAI API key for board /api/draw endpoint — required for Phase 4 board functionality.
  // Format: sk-... (or sk-proj-... for project-scoped keys). Optional so app boots in CI/test.
  // CON-openai-rf-block: dev needs HTTPS_PROXY tunnel; prod Vercel hits OpenAI with US IP.
  OPENAI_API_KEY: z.string().min(10).optional(),
  // Node env — Next.js sets this; we read it for conditional logic (e.g. test-mode shortcuts)
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
})

export const env = envSchema.parse(process.env)
export type Env = z.infer<typeof envSchema>
