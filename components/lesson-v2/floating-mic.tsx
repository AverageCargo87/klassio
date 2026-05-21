'use client'
// components/lesson-v2/floating-mic.tsx
// Floating microphone button, fixed bottom-center between board and chat.
// `style.left` is computed by parent (LessonPage) based on board/chat visibility.

import { PALETTE } from './palette'

interface FloatingMicProps {
  on: boolean
  onToggle: () => void
  style?: React.CSSProperties
}

export function FloatingMic({ on, onToggle, style }: FloatingMicProps) {
  return (
    <button
      onClick={onToggle}
      title={on ? 'Слушаю тебя' : 'Микрофон выключен'}
      className="fixed z-30 rounded-full flex items-center justify-center transition-all active:scale-95"
      style={{
        bottom: 28,
        width: 72,
        height: 72,
        background: on ? PALETTE.green : '#D5D9DF',
        color: 'white',
        boxShadow: on
          ? `0 6px 0 ${PALETTE.greenDeep}, 0 0 0 8px ${PALETTE.green}33, 0 0 0 16px ${PALETTE.green}1a`
          : '0 6px 0 #BCC1C9',
        border: '3px solid white',
        animation: on ? 'lpMicPulse 1.6s ease-in-out infinite' : 'none',
        transform: 'translateX(-50%)',
        transitionProperty: 'left, background, box-shadow',
        transitionDuration: '300ms',
        transitionTimingFunction: 'ease-out',
        ...style,
      }}
    >
      <svg viewBox="0 0 24 24" width="32" height="32" fill="currentColor">
        <path d="M12 14a3 3 0 0 0 3-3V6a3 3 0 0 0-6 0v5a3 3 0 0 0 3 3z" />
        <path d="M19 11a1 1 0 0 0-2 0 5 5 0 0 1-10 0 1 1 0 0 0-2 0 7 7 0 0 0 6 6.92V21h-3a1 1 0 0 0 0 2h8a1 1 0 0 0 0-2h-3v-3.08A7 7 0 0 0 19 11z" />
      </svg>
      {!on && (
        <span
          className="absolute"
          style={{
            width: 50,
            height: 4,
            background: 'white',
            transform: 'rotate(-45deg)',
            borderRadius: 2,
            opacity: 0.85,
          }}
        />
      )}

      <span
        className="absolute whitespace-nowrap px-3 py-1.5 rounded-full text-xs font-bold pointer-events-none"
        style={{
          bottom: 88,
          background: PALETTE.ink,
          color: 'white',
          opacity: 0.92,
        }}
      >
        {on ? 'Слушаю тебя' : 'Микрофон выключен'}
      </span>
    </button>
  )
}
