'use client'
// components/lesson-v2/intro-card.tsx
// Intro screen (theory block) — soft yellow card with emoji + title + body
// paragraphs. Ported from Claude Design components.jsx IntroCard.

import { PALETTE } from './palette'
import type { IntroScreen } from './types'

interface IntroCardProps {
  item: IntroScreen
  idx: number
}

export function IntroCard({ item, idx }: IntroCardProps) {
  return (
    <div
      className="rounded-3xl p-6 md:p-7 shadow-sm relative overflow-hidden"
      style={{ background: PALETTE.paperWarm, border: `2px solid ${PALETTE.paperWarmBorder}` }}
    >
      <div
        className="absolute -right-4 -top-4 w-24 h-24 rounded-full opacity-30"
        style={{ background: PALETTE.yellow }}
      />
      <div className="flex items-start gap-4 relative">
        <div className="text-4xl md:text-5xl leading-none select-none">{item.emoji}</div>
        <div className="flex-1">
          <div
            className="text-xs font-bold uppercase tracking-wider mb-1"
            style={{ color: PALETTE.lilac }}
          >
            Что почитать · {idx + 1}
          </div>
          <h3 className="text-xl md:text-2xl font-extrabold mb-3" style={{ color: PALETTE.ink }}>
            {item.title}
          </h3>
          <div
            className="space-y-2 text-[15px] md:text-base leading-relaxed"
            style={{ color: PALETTE.ink }}
          >
            {item.body.map((p, i) => (
              <p key={i}>{p}</p>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
