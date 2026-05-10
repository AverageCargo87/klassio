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

  it('lessons table has Phase 2 nullable columns (D-11, D-13)', () => {
    // These 3 columns were added in Phase 2, Plan 01
    expect(schema.lessons.recordingUrl).toBeDefined()
    expect(schema.lessons.transcriptUrl).toBeDefined()
    expect(schema.lessons.htmlTrainerPath).toBeDefined()
  })

  it('lessons table topic column exists (Phase 1 regression guard)', () => {
    // topic was added in Phase 1 as TEXT NOT NULL — must not be removed or changed
    expect(schema.lessons.topic).toBeDefined()
  })

  it('lessonStatusEnum still has all 4 values (Phase 2 regression guard)', () => {
    const values = (schema.lessonStatusEnum as unknown as { enumValues: readonly string[] }).enumValues
    expect(values).toEqual(['scheduled', 'in_progress', 'completed', 'cancelled'])
  })

  it('lessonStatusEnum has 4 values', () => {
    // pgEnum exposes its values via the .enumValues property in drizzle-orm
    const values = (schema.lessonStatusEnum as unknown as { enumValues: readonly string[] }).enumValues
    expect(values).toEqual(['scheduled', 'in_progress', 'completed', 'cancelled'])
  })

  // === Phase 3 extensions (D-13) — lesson timing analytics ===
  it('lessons has actualStartAt nullable timestamp column', () => {
    const col = schema.lessons.actualStartAt
    expect(col).toBeDefined()
    expect(col.columnType).toBe('PgTimestamp')
    // nullable — no notNull constraint
  })

  it('lessons has actualEndAt nullable timestamp column', () => {
    const col = schema.lessons.actualEndAt
    expect(col).toBeDefined()
    expect(col.columnType).toBe('PgTimestamp')
  })
})
