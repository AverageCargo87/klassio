'use client'
// Лента записи урока (дизайн Claude Design v3, тёмная тема — rec-* в /demo/site.css).
// Единый упорядоченный поток реплик и событий (доски/ошибки/верно/награда/имя).
// Табы фильтруют по data-kind. Данные приходят из server component (getTranscript).
import { useMemo, useState } from 'react'

type Kind = 'tool' | 'wrong' | 'solve' | 'reward' | 'name'
export interface RecordLine {
  role: 'agent' | 'child'
  text: string
  seq: number
  kind?: Kind | null
  meta?: Record<string, unknown> | null
}

type Filter = 'all' | 'dialog' | 'errors' | 'tools'
// data-kind для CSS-коннекторов/фильтров: речь→role; событие→tutor-нейтральный
// («tool») либо wrong/solve. name и reward живут в табе «Инструменты» как tool.
function dataKind(l: RecordLine): 'tutor' | 'child' | 'tool' | 'wrong' | 'solve' {
  if (!l.kind) return l.role === 'agent' ? 'tutor' : 'child'
  if (l.kind === 'wrong') return 'wrong'
  if (l.kind === 'solve') return 'solve'
  return 'tool'
}
const KIND_MAP: Record<Filter, string[] | null> = {
  all: null,
  dialog: ['tutor', 'child'],
  errors: ['wrong', 'solve'],
  tools: ['tool'],
}

// ── иконки событий (из v3-прототипа) ──
function EvIcon({ line }: { line: RecordLine }) {
  const tool = line.meta && typeof line.meta.tool === 'string' ? line.meta.tool : ''
  if (line.kind === 'reward') {
    return (
      <svg className="ic-s star" viewBox="0 0 24 24" fill="currentColor" stroke="none">
        <path d="M12 3l2.5 5.4 5.9.7-4.4 4 1.2 5.8L12 16l-5.2 2.9 1.2-5.8-4.4-4 5.9-.7L12 3z" />
      </svg>
    )
  }
  const stroke = { fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const }
  if (line.kind === 'name') {
    return <svg className="ic-s" viewBox="0 0 24 24" {...stroke}><circle cx="12" cy="8" r="3.6" /><path d="M5.5 20a6.5 6.5 0 0 1 13 0" /></svg>
  }
  if (line.kind === 'wrong') {
    return <svg className="ic-s" viewBox="0 0 24 24" {...stroke}><circle cx="12" cy="12" r="9" /><path d="M9.5 9.5l5 5" /><path d="M14.5 9.5l-5 5" /></svg>
  }
  if (line.kind === 'solve') {
    return <svg className="ic-s" viewBox="0 0 24 24" {...stroke}><circle cx="12" cy="12" r="9" /><path d="M8.5 12.4l2.4 2.4 4.6-5" /></svg>
  }
  if (tool === 'trainer') {
    return <svg className="ic-s" viewBox="0 0 24 24" {...stroke}><path d="M12 20h9" /><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" /></svg>
  }
  // доска (по умолчанию для tool)
  return <svg className="ic-s" viewBox="0 0 24 24" {...stroke}><rect x="5" y="4" width="14" height="17" rx="3" /><rect x="9" y="2.5" width="6" height="4" rx="1.5" /><path d="M9 11.5h6" /><path d="M9 15.5h4" /></svg>
}

export function LessonRecordTimeline({ lines }: { lines: RecordLine[] }) {
  const [filter, setFilter] = useState<Filter>('all')
  const prepared = useMemo(() => lines.map((l) => ({ l, dk: dataKind(l) })), [lines])
  const tabs: Array<{ key: Filter; label: string }> = [
    { key: 'all', label: 'Всё' },
    { key: 'dialog', label: 'Диалог' },
    { key: 'errors', label: 'Ошибки' },
    { key: 'tools', label: 'Инструменты' },
  ]

  return (
    <div>
      <div className="rec-tabs" role="tablist">
        {tabs.map((t) => (
          <button
            key={t.key} type="button" role="tab" aria-selected={filter === t.key}
            className={`rec-tab${filter === t.key ? ' on' : ''}`}
            onClick={() => setFilter(t.key)}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="rec-feed">
        {prepared.map(({ l, dk }) => {
          const kinds = KIND_MAP[filter]
          const hidden = !!kinds && !kinds.includes(dk)
          const isSpeech = !l.kind
          return (
            <div key={l.seq} className="rec-item" data-kind={dk} hidden={hidden}>
              {isSpeech ? (
                <>
                  <span className="who">{l.role === 'agent' ? 'Аня' : 'Ученик'}</span>
                  <span className="body">{l.text}</span>
                </>
              ) : (
                <div className="rec-ev"><EvIcon line={l} />{l.text}</div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
