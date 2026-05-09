import '@testing-library/jest-dom/vitest'

// Load env vars from .env.local for tests that need them
// Tests that exercise lib/env.ts must set process.env directly OR use loadEnv
// Don't auto-load .env here to avoid hiding missing-var errors in unit tests.
