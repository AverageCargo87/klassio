// Avatar component tests — Phase 9 (D-10).
// 3+ tests: renders correct emoji, correct state attribute, correct label.
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import React from 'react'

// No bus dependency needed — Avatar is a controlled component
const { Avatar } = await import('../avatar')

describe('Avatar component', () => {
  it('renders idle emoji and data-avatar-state="idle" by default', () => {
    render(React.createElement(Avatar, { state: 'idle' }))
    // 🙂 for idle
    expect(screen.getByText('🙂')).toBeTruthy()
    const wrapper = screen.getByRole('img')
    expect(wrapper.getAttribute('data-avatar-state')).toBe('idle')
  })

  it('renders speaking emoji and data-avatar-state="speaking"', () => {
    render(React.createElement(Avatar, { state: 'speaking' }))
    // 🗣️ for speaking
    expect(screen.getByText('🗣️')).toBeTruthy()
    const wrapper = screen.getByRole('img')
    expect(wrapper.getAttribute('data-avatar-state')).toBe('speaking')
    expect(wrapper.getAttribute('aria-label')).toBe('Учитель говорит')
  })

  it('renders happy emoji and data-avatar-state="happy"', () => {
    render(React.createElement(Avatar, { state: 'happy' }))
    expect(screen.getByText('😊')).toBeTruthy()
    const wrapper = screen.getByRole('img')
    expect(wrapper.getAttribute('data-avatar-state')).toBe('happy')
    expect(wrapper.getAttribute('aria-label')).toBe('Учитель доволен')
  })

  it('renders sad emoji and data-avatar-state="sad"', () => {
    render(React.createElement(Avatar, { state: 'sad' }))
    expect(screen.getByText('😟')).toBeTruthy()
    const wrapper = screen.getByRole('img')
    expect(wrapper.getAttribute('data-avatar-state')).toBe('sad')
  })

  it('renders thinking emoji and data-avatar-state="thinking"', () => {
    render(React.createElement(Avatar, { state: 'thinking' }))
    expect(screen.getByText('🤔')).toBeTruthy()
    const wrapper = screen.getByRole('img')
    expect(wrapper.getAttribute('data-avatar-state')).toBe('thinking')
  })

  it('renders listening emoji and data-avatar-state="listening"', () => {
    render(React.createElement(Avatar, { state: 'listening' }))
    expect(screen.getByText('👂')).toBeTruthy()
    const wrapper = screen.getByRole('img')
    expect(wrapper.getAttribute('data-avatar-state')).toBe('listening')
    expect(wrapper.getAttribute('aria-label')).toBe('Учитель слушает')
  })

  it('applies the correct animation class per state', () => {
    const { container } = render(React.createElement(Avatar, { state: 'speaking' }))
    const emoji = container.querySelector('.avatar-anim-speaking')
    expect(emoji).toBeTruthy()
  })

  it('applies custom size prop', () => {
    const { container } = render(React.createElement(Avatar, { state: 'idle', size: 'text-5xl' }))
    const emoji = container.querySelector('.text-5xl')
    expect(emoji).toBeTruthy()
  })
})
