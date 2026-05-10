import { describe, it, expect } from 'vitest'
// parseArgs is exported from create-user.ts (the primary script that owns the shared parser)
import { parseArgs } from '../create-user'

describe('scripts/admin/create-user > parseArgs', () => {
  it('parses --email, --child-name, --child-age', () => {
    const result = parseArgs(['--email', 'x@y.com', '--child-name', 'Маша', '--child-age', '10'])
    expect(result).toEqual({ email: 'x@y.com', 'child-name': 'Маша', 'child-age': '10' })
  })

  it('parses single --topic arg', () => {
    const result = parseArgs(['--topic', 'Дроби'])
    expect(result).toEqual({ topic: 'Дроби' })
  })

  it('returns empty object for empty argv', () => {
    const result = parseArgs([])
    expect(result).toEqual({})
  })

  it('treats standalone --flag (no value) as boolean true', () => {
    const result = parseArgs(['--flag'])
    expect(result).toEqual({ flag: true })
  })

  it('parses multiple --a 1 --b 2 pairs', () => {
    const result = parseArgs(['--a', '1', '--b', '2'])
    expect(result).toEqual({ a: '1', b: '2' })
  })
})
