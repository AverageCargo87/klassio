'use client'
// components/lesson-v2/floating-teacher.tsx
// Floating right-side teacher chat with status + transcript. Two states:
// 1) collapsed — small pill in bottom-right with avatar + name + status dot;
//    if currentBubble is set, also renders a transient speech bubble above.
// 2) expanded — pinned side-panel (right edge, 360px) with header + scrollable
//    chat transcript + footer status.
//
// Ported from Claude Design lesson-overlays.jsx (LP_FloatingTeacher + LP_ChatMessage).

import { useEffect, useRef, useState } from 'react'
import { PALETTE } from './palette'
import type { ChatMessage, TeacherStatus } from './types'

const TEACHER_W = 360

function relTime(t: number, now: number): string {
  const s = Math.max(0, Math.floor((now - t) / 1000))
  if (s < 20) return 'сейчас'
  if (s < 60) return '<1 мин'
  const m = Math.floor(s / 60)
  if (m < 60) return m + ' мин'
  return Math.floor(m / 60) + ' ч'
}

interface ChatMessageBubbleProps {
  msg: ChatMessage
  now: number
  teacherName: string
}

function ChatMessageBubble({ msg, now, teacherName }: ChatMessageBubbleProps) {
  const isUser = msg.role === 'user'
  return (
    <div className={'flex ' + (isUser ? 'justify-end' : 'justify-start')}>
      <div className="max-w-[82%]">
        <div
          className="px-3.5 py-2.5 rounded-2xl leading-snug"
          style={{
            background: isUser ? PALETTE.userBubble : PALETTE.blueSoft,
            color: PALETTE.ink,
            border: isUser ? `1.5px solid ${PALETTE.line}` : `1.5px solid ${PALETTE.blueSoftBorder}`,
            borderBottomRightRadius: isUser ? 6 : 16,
            borderBottomLeftRadius: isUser ? 16 : 6,
            fontSize: 13.5,
            fontWeight: 600,
          }}
        >
          {msg.text}
        </div>
        <div
          className="text-[10px] mt-1 px-1 font-bold"
          style={{ color: PALETTE.sub, textAlign: isUser ? 'right' : 'left' }}
        >
          {isUser ? 'Ты · ' : `${teacherName} · `}
          {relTime(msg.t, now)}
        </div>
      </div>
    </div>
  )
}

interface FloatingTeacherProps {
  expanded: boolean
  onExpand: () => void
  onCollapse: () => void
  log: ChatMessage[]
  status: TeacherStatus
  currentBubble: string | null
  /** Persona name from the voice picker (e.g. 'Надя', 'Аня'). */
  teacherName: string
}

export function FloatingTeacher({
  expanded,
  onExpand,
  onCollapse,
  log,
  status,
  currentBubble,
  teacherName,
}: FloatingTeacherProps) {
  const statusMap: Record<TeacherStatus, { color: string; label: string }> = {
    idle: { color: '#B0B6BF', label: 'Жду' },
    listening: { color: PALETTE.green, label: 'Слушаю' },
    speaking: { color: PALETTE.blue, label: 'Говорю' },
  }
  const dot = statusMap[status]

  // tick to keep timestamps fresh
  const [now, setNow] = useState<number>(() => Date.now())
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30000)
    return () => clearInterval(id)
  }, [])

  // auto-scroll on new messages
  const scrollRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!expanded) return
    const el = scrollRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [log.length, expanded])

  if (!expanded) {
    return (
      <>
        {currentBubble && (
          <div
            className="fixed z-40 max-w-[300px] px-4 py-2.5 rounded-2xl text-sm font-semibold leading-snug animate-[lpBubbleIn_.25s_ease-out]"
            style={{
              right: 24,
              bottom: 92,
              background: PALETTE.card,
              color: PALETTE.ink,
              border: `2px solid ${PALETTE.line}`,
              boxShadow: '0 6px 24px rgba(31,42,55,0.10)',
            }}
          >
            {currentBubble}
            <span
              className="absolute -bottom-1.5 right-10 w-3 h-3 rotate-45"
              style={{
                background: PALETTE.card,
                borderRight: `2px solid ${PALETTE.line}`,
                borderBottom: `2px solid ${PALETTE.line}`,
              }}
            />
          </div>
        )}
        <button
          onClick={onExpand}
          className="fixed z-30 rounded-full inline-flex items-center gap-2.5 transition-all hover:-translate-y-0.5 active:translate-y-0"
          style={{
            right: 24,
            bottom: 24,
            height: 52,
            padding: '0 18px 0 10px',
            background: PALETTE.card,
            color: PALETTE.ink,
            border: `2px solid ${PALETTE.line}`,
            boxShadow: `0 4px 0 ${PALETTE.line}, 0 6px 20px rgba(31,42,55,0.06)`,
            fontSize: 14,
            fontWeight: 800,
            transitionProperty: 'transform, box-shadow, background, color',
            transitionDuration: '180ms',
          }}
          title={`Открыть чат с ${teacherName === 'Надя' ? 'Надей' : teacherName === 'Аня' ? 'Аней' : teacherName}`}
        >
          <span
            className="relative inline-flex items-center justify-center"
            style={{
              width: 32,
              height: 32,
              borderRadius: '50%',
              background: `linear-gradient(135deg, ${PALETTE.blue}, ${PALETTE.lilac})`,
              boxShadow: 'inset 0 0 0 2px rgba(255,255,255,0.6)',
            }}
          >
            <span style={{ fontSize: 18, lineHeight: 1 }}>🙂</span>
            <span
              className="absolute rounded-full"
              style={{
                right: -2,
                bottom: -2,
                width: 11,
                height: 11,
                background: dot.color,
                border: '2px solid white',
                animation: status === 'speaking' ? 'lpPulse 1.4s ease-in-out infinite' : 'none',
              }}
            />
          </span>
          <span>{teacherName}</span>
        </button>
      </>
    )
  }

  /* expanded persistent side panel */
  return (
    <aside
      className="fixed z-30 flex flex-col animate-[lpTeacherIn_.3s_ease-out]"
      style={{
        top: 64,
        bottom: 0,
        right: 0,
        width: TEACHER_W,
        background: PALETTE.card,
        borderLeft: `2px solid ${PALETTE.line}`,
        boxShadow: '-8px 0 30px rgba(31,42,55,0.06)',
      }}
    >
      {/* header */}
      <div
        className="flex items-center gap-3 px-4 py-3.5 text-white"
        style={{ background: `linear-gradient(135deg, ${PALETTE.blue}, ${PALETTE.lilac})` }}
      >
        <div
          className="w-12 h-12 rounded-full bg-white/20 flex items-center justify-center"
          style={{ border: '2px solid rgba(255,255,255,0.6)' }}
        >
          <span style={{ fontSize: 24 }}>🙂</span>
        </div>
        <div className="flex-1 min-w-0">
          <div className="font-extrabold leading-tight">{teacherName} · твой репетитор</div>
          <div className="text-xs flex items-center gap-1.5 opacity-95 mt-0.5">
            <span
              className="inline-block w-2 h-2 rounded-full"
              style={{
                background: dot.color,
                animation: status === 'speaking' ? 'lpPulse 1.4s ease-in-out infinite' : 'none',
              }}
            />
            {dot.label}
          </div>
        </div>
        <button
          onClick={onCollapse}
          className="w-9 h-9 rounded-full bg-white/20 hover:bg-white/30 flex items-center justify-center text-white transition-colors"
          title="Свернуть"
        >
          <svg
            viewBox="0 0 24 24"
            width="18"
            height="18"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.6"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M5 12h14" />
          </svg>
        </button>
      </div>

      {/* transcript */}
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto p-4 space-y-3"
        style={{ background: PALETTE.bg }}
      >
        {log.length === 0 && (
          <div className="text-center text-xs py-8" style={{ color: PALETTE.sub }}>
            Здесь появится наш диалог.
          </div>
        )}
        {log.map((m, i) => (
          <ChatMessageBubble key={i} msg={m} now={now} teacherName={teacherName} />
        ))}
      </div>

      {/* footer status */}
      <div
        className="px-4 py-3 text-xs font-bold flex items-center justify-center gap-2"
        style={{ borderTop: `1px solid ${PALETTE.line}`, color: PALETTE.sub, background: 'white' }}
      >
        <span
          className="inline-block w-2 h-2 rounded-full"
          style={{
            background: dot.color,
            animation: status === 'speaking' ? 'lpPulse 1.4s ease-in-out infinite' : 'none',
          }}
        />
        {status === 'listening' && 'Слушаю тебя…'}
        {status === 'speaking' && `${teacherName} сейчас говорит`}
        {status === 'idle' && 'Включи микрофон, чтобы говорить'}
      </div>
    </aside>
  )
}

export { TEACHER_W }
