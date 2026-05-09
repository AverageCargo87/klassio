import { describe, it, expect } from 'vitest'
import { getTableName } from 'drizzle-orm'
import * as schema from '../schema'

describe('lib/db/schema', () => {
  it('exports all 7 named symbols', () => {
    expect(schema).toHaveProperty('users')
    expect(schema).toHaveProperty('accounts')
    expect(schema).toHaveProperty('sessions')
    expect(schema).toHaveProperty('verificationTokens')
    expect(schema).toHaveProperty('allowedEmails')
    expect(schema).toHaveProperty('lessons')
    expect(schema).toHaveProperty('lessonStatusEnum')
  })

  it('schema exports are real Drizzle pgTables (smoke check)', () => {
    expect(getTableName(schema.users)).toBe('user')
    expect(getTableName(schema.accounts)).toBe('account')
    expect(getTableName(schema.sessions)).toBe('session')
    expect(getTableName(schema.verificationTokens)).toBe('verificationToken')
    expect(getTableName(schema.allowedEmails)).toBe('allowed_email')
    expect(getTableName(schema.lessons)).toBe('lesson')
  })

  it('users table has required NextAuth + Klassio columns', () => {
    // Explicit column-existence assertions — robust against Drizzle internal representation
    // changes between minor versions (avoid Object.keys() which leaks Symbols / internals).
    expect(schema.users.id).toBeDefined()
    expect(schema.users.name).toBeDefined()
    expect(schema.users.email).toBeDefined()
    expect(schema.users.emailVerified).toBeDefined()
    expect(schema.users.image).toBeDefined()
    expect(schema.users.childName).toBeDefined()
    expect(schema.users.childAge).toBeDefined()
    expect(schema.users.createdAt).toBeDefined()
    expect(schema.users.lastLoginAt).toBeDefined()
  })

  it('allowedEmails table has whitelist columns', () => {
    expect(schema.allowedEmails.id).toBeDefined()
    expect(schema.allowedEmails.email).toBeDefined()
    expect(schema.allowedEmails.addedAt).toBeDefined()
    expect(schema.allowedEmails.notes).toBeDefined()
  })

  it('lessons table has scheduling columns', () => {
    expect(schema.lessons.id).toBeDefined()
    expect(schema.lessons.userId).toBeDefined()
    expect(schema.lessons.scheduledAt).toBeDefined()
    expect(schema.lessons.topic).toBeDefined()
    expect(schema.lessons.durationMin).toBeDefined()
    expect(schema.lessons.htmlTemplateUrl).toBeDefined()
    expect(schema.lessons.status).toBeDefined()
    expect(schema.lessons.createdAt).toBeDefined()
  })

  it('lessonStatusEnum has 4 values', () => {
    // pgEnum exposes its values via the .enumValues property in drizzle-orm
    const values = (schema.lessonStatusEnum as unknown as { enumValues: readonly string[] }).enumValues
    expect(values).toEqual(['scheduled', 'in_progress', 'completed', 'cancelled'])
  })
})
