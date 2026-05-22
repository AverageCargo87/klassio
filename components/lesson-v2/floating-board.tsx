'use client'
// components/lesson-v2/floating-board.tsx
// Bottom-left pill toggle for the Board overlay + the BoardOverlay slide-in
// panel itself. Stage 1: BoardOverlay shows a static placeholder. Stage 2
// will replace it with the real tldraw canvas (BoardCanvasEmbed component).

import { PALETTE } from './palette'

interface FloatingBoardToggleProps {
  open: boolean
  onToggle: () => void
}

export function FloatingBoardToggle({ open, onToggle }: FloatingBoardToggleProps) {
  return (
    <button
      onClick={onToggle}
      title={open ? 'Скрыть доску' : 'Открыть доску'}
      className="fixed z-30 rounded-full inline-flex items-center gap-2 transition-all hover:-translate-y-0.5 active:translate-y-0"
      style={{
        left: 24,
        bottom: 24,
        height: 52,
        padding: '0 22px',
        background: open ? PALETTE.blue : PALETTE.card,
        color: open ? 'white' : PALETTE.ink,
        border: open ? `2px solid ${PALETTE.blueDeep}` : `2px solid ${PALETTE.line}`,
        boxShadow: open
          ? `0 4px 0 ${PALETTE.blueDeep}, 0 8px 22px rgba(28,176,246,0.25)`
          : `0 4px 0 ${PALETTE.line}, 0 6px 20px rgba(31,42,55,0.06)`,
        fontSize: 14,
        fontWeight: 800,
        transitionProperty: 'transform, box-shadow, background, color, border-color',
        transitionDuration: '180ms',
      }}
    >
      <span style={{ fontSize: 20, lineHeight: 1 }}>📋</span>
      <span>Доска</span>
    </button>
  )
}

interface BoardOverlayProps {
  open: boolean
  onClose: () => void
  contextLabel: string
  /** Optional child (e.g. real tldraw canvas). When omitted, shows placeholder. */
  children?: React.ReactNode
}

export function BoardOverlay({ open, onClose, contextLabel, children }: BoardOverlayProps) {
  return (
    <div
      className="fixed top-0 bottom-0 left-0 z-20 transition-transform duration-300 ease-out"
      style={{
        width: '50vw',
        transform: open ? 'translateX(0)' : 'translateX(-105%)',
        padding: '76px 16px 16px 16px',
        pointerEvents: open ? 'auto' : 'none',
      }}
    >
      <div
        className="h-full w-full rounded-3xl flex flex-col overflow-hidden"
        style={{
          background: '#1F2A37',
          boxShadow: '0 20px 50px rgba(0,0,0,0.25)',
          border: '2px solid #1F2A37',
        }}
      >
        <div
          className="flex items-center justify-between px-4 py-3 text-white"
          style={{ background: '#0F1722' }}
        >
          <div className="flex items-center gap-2.5">
            <div
              className="w-8 h-8 rounded-lg flex items-center justify-center"
              style={{ background: PALETTE.blue }}
            >
              📋
            </div>
            <div>
              <div className="text-sm font-extrabold leading-tight">Доска Нади</div>
              <div className="text-[11px] opacity-70">{contextLabel}</div>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-9 h-9 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white transition-colors"
            title="Скрыть доску"
          >
            <svg
              viewBox="0 0 24 24"
              width="18"
              height="18"
              fill="none"
              stroke="currentColor"
              strokeWidth="3"
              strokeLinecap="round"
            >
              <path d="M7 7l10 10M17 7L7 17" />
            </svg>
          </button>
        </div>

        <div
          className="flex-1 relative"
          style={{
            // Blueprint pattern is the canvas backdrop in both states — the
            // real tldraw canvas is dark + transparent enough that the
            // pattern doesn't bleed through, but it's a clean placeholder
            // during dynamic-import loading.
            background: `repeating-linear-gradient(0deg, #2A3340 0 1px, transparent 1px 32px),
                         repeating-linear-gradient(90deg, #2A3340 0 1px, transparent 1px 32px),
                         #1F2A37`,
          }}
        >
          {children ?? <BoardPlaceholder />}
        </div>
      </div>
    </div>
  )
}

function BoardPlaceholder() {
  return (
    <div className="absolute inset-0 flex items-center justify-center text-center p-6">
      <div className="relative max-w-sm">
        <div className="text-5xl mb-3">✏️</div>
        <div className="text-white font-extrabold text-lg mb-1">здесь будет tldraw канвас</div>
        <div className="text-white/60 text-sm leading-snug">
          Надя нарисует объяснение прямо здесь — столбик, переносы и пометки.
        </div>
        <div
          className="mt-6 mx-auto inline-block p-5 rounded-xl font-mono text-3xl font-extrabold text-left"
          style={{
            background: 'rgba(255,255,255,0.06)',
            color: '#F4F6F9',
            border: '1.5px dashed #4B5563',
          }}
        >
          <div className="flex justify-end gap-1 relative">
            <span className="absolute -top-3 right-7 text-amber-300 text-xs">¹</span>
            <span>2 7</span>
          </div>
          <div className="flex justify-end gap-1">
            + <span>4 8</span>
          </div>
          <div className="border-t-2 border-white/40 my-1" />
          <div className="flex justify-end text-emerald-300">7 5</div>
        </div>
      </div>
    </div>
  )
}
