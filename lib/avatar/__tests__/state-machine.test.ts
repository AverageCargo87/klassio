// Unit tests for avatarReducer — Phase 9 (D-09).
// 8+ tests covering all state transitions.
import { describe, it, expect } from 'vitest'
import { avatarReducer, type AvatarState } from '../state-machine'

describe('avatarReducer', () => {
  // --- reset action ---
  it('reset: always returns idle regardless of current state', () => {
    const states: AvatarState[] = ['idle', 'listening', 'speaking', 'thinking', 'happy', 'sad']
    for (const s of states) {
      expect(avatarReducer(s, { type: 'reset' })).toBe('idle')
    }
  })

  // --- voice actions ---
  it('voice.idle: transitions to idle from any state', () => {
    expect(avatarReducer('speaking', { type: 'voice', state: 'idle' })).toBe('idle')
    expect(avatarReducer('happy', { type: 'voice', state: 'idle' })).toBe('idle')
  })

  it('voice.listening: transitions to listening', () => {
    expect(avatarReducer('idle', { type: 'voice', state: 'listening' })).toBe('listening')
    expect(avatarReducer('speaking', { type: 'voice', state: 'listening' })).toBe('listening')
  })

  it('voice.speaking: transitions to speaking', () => {
    expect(avatarReducer('idle', { type: 'voice', state: 'speaking' })).toBe('speaking')
    expect(avatarReducer('thinking', { type: 'voice', state: 'speaking' })).toBe('speaking')
  })

  it('voice.thinking: transitions to thinking', () => {
    expect(avatarReducer('idle', { type: 'voice', state: 'thinking' })).toBe('thinking')
    expect(avatarReducer('speaking', { type: 'voice', state: 'thinking' })).toBe('thinking')
  })

  // --- emotion actions ---
  it('emotion.neutral: transitions to idle', () => {
    expect(avatarReducer('happy', { type: 'emotion', emotion: 'neutral' })).toBe('idle')
    expect(avatarReducer('sad', { type: 'emotion', emotion: 'neutral' })).toBe('idle')
  })

  it('emotion.happy: transitions to happy', () => {
    expect(avatarReducer('idle', { type: 'emotion', emotion: 'happy' })).toBe('happy')
    expect(avatarReducer('sad', { type: 'emotion', emotion: 'happy' })).toBe('happy')
  })

  it('emotion.sad: transitions to sad', () => {
    expect(avatarReducer('idle', { type: 'emotion', emotion: 'sad' })).toBe('sad')
    expect(avatarReducer('happy', { type: 'emotion', emotion: 'sad' })).toBe('sad')
  })

  it('emotion.thinking: transitions to thinking', () => {
    expect(avatarReducer('idle', { type: 'emotion', emotion: 'thinking' })).toBe('thinking')
    expect(avatarReducer('speaking', { type: 'emotion', emotion: 'thinking' })).toBe('thinking')
  })

  // --- answer actions ---
  it('answer.correct: transitions to happy', () => {
    expect(avatarReducer('idle', { type: 'answer', correct: true })).toBe('happy')
    expect(avatarReducer('thinking', { type: 'answer', correct: true })).toBe('happy')
  })

  it('answer.wrong: transitions to sad', () => {
    expect(avatarReducer('idle', { type: 'answer', correct: false })).toBe('sad')
    expect(avatarReducer('happy', { type: 'answer', correct: false })).toBe('sad')
  })

  // --- no-op: unknown action falls through (type safety guard) ---
  it('idle state stays idle with voice.idle (identity transition)', () => {
    expect(avatarReducer('idle', { type: 'voice', state: 'idle' })).toBe('idle')
  })

  // --- sequence test: realistic flow ---
  it('realistic flow: idle → speaking → thinking → happy → idle (reset)', () => {
    let s: AvatarState = 'idle'
    s = avatarReducer(s, { type: 'voice', state: 'speaking' })
    expect(s).toBe('speaking')
    s = avatarReducer(s, { type: 'voice', state: 'thinking' })
    expect(s).toBe('thinking')
    s = avatarReducer(s, { type: 'answer', correct: true })
    expect(s).toBe('happy')
    s = avatarReducer(s, { type: 'reset' })
    expect(s).toBe('idle')
  })
})
