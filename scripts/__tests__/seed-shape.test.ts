import { describe, it, expect } from 'vitest'

describe('scripts/seed', () => {
  it('exports a default main function', async () => {
    // Just verify the module loads + the contract — don't execute (would hit live DB)
    const mod = await import('../seed')
    expect(typeof mod.default).toBe('function')
  })
})
