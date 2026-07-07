'use client'
// Лента записи урока: единый упорядоченный поток реплик и событий (доски, ошибки,
// верные ответы, награда, имя). Табы фильтруют по типу. Данные приходят из server
// component (getTranscript) уже отсортированными по seq.
import { useMemo, useState } from 'react'

type Kind = 'tool' | 'wrong' | 'solve' | 'reward' | 'name'
export interface RecordLine {
  role: 'agent' | 'child'
  text: string
  seq: number
  kind?: Kind | null
  meta?: Record<string, unknown> | null
}

type Filter = 'all' | 'talk' | 'wrong' | 'tools'

const isSpeech = (l: RecordLine) => !l.kind
const matches = (l: RecordLine, f: Filter) =>
  f === 'all' ? true : f === 'talk' ? isSpeech(l) : f === 'wrong' ? l.kind === 'wrong' : l.kind === 'tool'

function toolIcon(meta?: Record<string, unknown> | null): string {
  const t = meta && typeof meta.tool === 'string' ? meta.tool : ''
  return t === 'trainer' ? '✏️' : '📋'
}

export function LessonRecordTimeline({ lines }: { lines: RecordLine[] }) {
  const [filter, setFilter] = useState<Filter>('all')

  const counts = useMemo(() => ({
    all: lines.length,
    talk: lines.filter((l) => isSpeech(l)).length,
    wrong: lines.filter((l) => l.kind === 'wrong').length,
    tools: lines.filter((l) => l.kind === 'tool').length,
  }), [lines])

  const shown = useMemo(() => lines.filter((l) => matches(l, filter)), [lines, filter])

  const tabs: Array<{ key: Filter; label: string }> = [
    { key: 'all', label: 'Всё' },
    { key: 'talk', label: 'Диалог' },
    { key: 'wrong', label: 'Ошибки' },
    { key: 'tools', label: 'Инструменты' },
  ]

  return (
    <div>
      <div className="kc-tabs" role="tablist">
        {tabs.map((t) => (
          <button
            key={t.key}
            type="button"
            role="tab"
            aria-selected={filter === t.key}
            className={`kc-tab ${filter === t.key ? 'kc-on' : ''}`}
            onClick={() => setFilter(t.key)}
          >
            {t.label}<span className="kc-tab-n">{counts[t.key]}</span>
          </button>
        ))}
      </div>

      <div className="kc-list">
        {shown.length === 0 ? (
          <div className="kc-card-2"><span className="kc-empty">Ничего в этой категории.</span></div>
        ) : (
          shown.map((l) => <RecordRow key={l.seq} line={l} />)
        )}
      </div>
    </div>
  )
}

function RecordRow({ line }: { line: RecordLine }) {
  if (isSpeech(line)) {
    return (
      <div className={`kc-tline ${line.role === 'agent' ? 'kc-agent' : 'kc-child'}`}>
        <span className="kc-who-lbl">{line.role === 'agent' ? 'Аня' : 'Ученик'}</span>
        {line.text}
      </div>
    )
  }
  const ico =
    line.kind === 'wrong' ? '❌'
      : line.kind === 'solve' ? '✅'
        : line.kind === 'reward' ? '⭐'
          : line.kind === 'name' ? '🧒'
            : toolIcon(line.meta)
  const mod = line.kind ? ` kc-ev--${line.kind}` : ''
  return (
    <div className={`kc-ev${mod}`}>
      <span className="kc-ev-ico" aria-hidden>{ico}</span>
      <span>{line.text}</span>
    </div>
  )
}
