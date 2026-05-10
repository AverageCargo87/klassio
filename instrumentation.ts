// Next.js instrumentation hook — runs once on server startup.
// This file is loaded by BOTH Node.js and Edge runtimes.
// Per Next.js docs: gate Node-only logic behind a dynamic import that
// references a separate file (`./instrumentation-node`). This is the
// canonical way to keep Node-only code (like `node:module`) out of the
// edge bundle.
// https://nextjs.org/docs/app/building-your-application/optimizing/instrumentation

export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    await import('./instrumentation-node')
  }
}
