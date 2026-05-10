'use client'
// BoardPanel — full tldraw integration ported from tldraw-test/app/page.tsx.
// Phase 4: real canvas + prompt UI + SSE processing + narration panel.
// Keeps Phase 3 export shape: export function BoardPanel({ lessonId }) { ... }
//
// Tldraw CSS scoped via 'tldraw-container' wrapper (Tailwind v4 compat).
// SSE processing: ReadableStream reader pattern (no EventSource — POST required).
// Phase 6 TODO: emit board:say to lesson bus when 'say' tool fires.
import dynamic from 'next/dynamic'
import { useCallback, useEffect, useRef, useState } from 'react'
import 'tldraw/tldraw.css'
import type { Editor } from 'tldraw'
import { executeToolCall } from '@/lib/board'
import { useLessonBus } from '@/lib/lesson-bus'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Loader2, Eraser } from 'lucide-react'

// Tldraw touches window/document at import — disable SSR.
const Tldraw = dynamic(() => import('tldraw').then((m) => m.Tldraw), {
  ssr: false,
  loading: () => (
    <div className="flex h-full w-full items-center justify-center text-sm text-muted-foreground">
      Загружаю канвас…
    </div>
  ),
})

// Preset suggestion chips — match CONTEXT.md specifics
const SUGGESTIONS = [
  'Сложение в столбик: 245 + 874',
  'Дроби: введение и простые примеры',
  'Умножение на 10, 100, 1000',
] as const

interface Narration {
  text: string
  spokenAt: number
}

interface ToolCallDebug {
  name: string
  input: Record<string, unknown>
  status: 'ok' | 'error' | 'pending'
  note?: string
}

interface BoardPanelProps {
  lessonId: string
}

export function BoardPanel({ lessonId }: BoardPanelProps) {
  const editorRef = useRef<Editor | null>(null)
  const narrationEndRef = useRef<HTMLDivElement | null>(null)
  const [prompt, setPrompt] = useState('')
  const [running, setRunning] = useState(false)
  const [narrations, setNarrations] = useState<Narration[]>([])
  const [calls, setCalls] = useState<ToolCallDebug[]>([])
  const [error, setError] = useState<string | null>(null)
  const [hasShapes, setHasShapes] = useState(false)

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const _bus = useLessonBus() // Phase 6 will use bus.emit('board:say', ...)

  const onMount = useCallback((editor: Editor) => {
    editorRef.current = editor
    editor.setCamera({ x: 0, y: 0, z: 1 })
    editor.updateInstanceState({ isGridMode: false })
  }, [])

  // Auto-scroll narrations to bottom when new item appears
  useEffect(() => {
    narrationEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
  }, [narrations.length])

  const handleClear = useCallback(() => {
    const editor = editorRef.current
    if (!editor) return
    const ids = Array.from(editor.getCurrentPageShapeIds())
    if (ids.length > 0) editor.deleteShapes(ids)
    setNarrations([])
    setCalls([])
    setError(null)
    setHasShapes(false)
  }, [])

  // Core draw function — accepts an explicit promptText so it can be called
  // either from the textarea submit button or from chip click (before state update flush).
  const executeDraw = useCallback(
    async (promptText: string) => {
      const editor = editorRef.current
      if (!editor || running) return
      const userPrompt = promptText.trim()
      if (!userPrompt) return

      setRunning(true)
      setError(null)
      setCalls([])
      // Show immediate "Бот думает..." narration so user sees activity
      // while LLM call is in flight. Replaced by real narrations as soon
      // as first SSE event arrives (or by 'started' confirmation event).
      setNarrations([{ text: 'Бот думает…', spokenAt: Date.now() }])
      setHasShapes(true)

      try {
        const res = await fetch('/api/draw', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ prompt: userPrompt, lessonId }),
        })

        if (!res.ok) {
          const text = await res.text().catch(() => '')
          throw new Error(text || `HTTP ${res.status}`)
        }
        if (!res.body) throw new Error('пустой ответ от сервера')

        const reader = res.body.getReader()
        const decoder = new TextDecoder()
        let buffer = ''

        while (true) {
          const { done, value } = await reader.read()
          if (done) break
          buffer += decoder.decode(value, { stream: true })

          let sep
          while ((sep = buffer.indexOf('\n\n')) !== -1) {
            const chunk = buffer.slice(0, sep)
            buffer = buffer.slice(sep + 2)
            const dataLine = chunk.split('\n').find((l) => l.startsWith('data: '))
            if (!dataLine) continue
            let evt: { type: string; [k: string]: unknown }
            try {
              evt = JSON.parse(dataLine.slice(6))
            } catch {
              continue
            }

            if (evt.type === 'started') {
              // Server confirmed connection — replace placeholder narration
              setNarrations([{ text: 'Учитель готовит объяснение…', spokenAt: Date.now() }])
              continue
            }

            if (evt.type === 'tool_use') {
              const name = String(evt.name)
              const input = (evt.input ?? {}) as Record<string, unknown>

              if (name === 'say') {
                const text = typeof input.text === 'string' ? input.text : ''
                if (text) {
                  // First real `say` replaces the "thinking" placeholder
                  setNarrations((prev) => {
                    const isPlaceholder =
                      prev.length === 1 &&
                      (prev[0].text === 'Бот думает…' || prev[0].text === 'Учитель готовит объяснение…')
                    return isPlaceholder ? [{ text, spokenAt: Date.now() }] : [...prev, { text, spokenAt: Date.now() }]
                  })
                  // TODO Phase 6: emit board:say event when SSE includes 'say' tool
                  //   _bus.emit('board:say', { text, timestamp: Date.now() })
                }
              }

              setCalls((prev) => [...prev, { name, input, status: 'pending' }])
              const result = await executeToolCall(editor, name, input)
              setCalls((prev) => {
                const next = prev.slice()
                for (let i = next.length - 1; i >= 0; i--) {
                  if (next[i].status === 'pending') {
                    next[i] = { ...next[i], status: result.ok ? 'ok' : 'error', note: result.note }
                    break
                  }
                }
                return next
              })
              // Auto-fit camera to created shapes — eliminates need for manual
              // "Назад к содержанию" click. Triggers when shapes exist and a
              // drawing primitive just ran.
              const hasContent = editor.getCurrentPageShapeIds().size > 0
              if (hasContent && name.startsWith('draw_')) {
                editor.zoomToFit({ animation: { duration: 200 } })
              }
            } else if (evt.type === 'text') {
              const text = String(evt.text ?? '')
              if (text) {
                setNarrations((prev) => [...prev, { text, spokenAt: Date.now() }])
              }
            } else if (evt.type === 'error') {
              setError(String(evt.error ?? 'Неизвестная ошибка'))
            } else if (evt.type === 'done') {
              // Stream complete — running will be set false in finally
            }
          }
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Неизвестная ошибка')
      } finally {
        setRunning(false)
      }
    },
    [running, lessonId],
  )

  const handleDraw = useCallback(() => {
    return executeDraw(prompt)
  }, [prompt, executeDraw])

  const handleChipClick = useCallback(
    (suggestion: string) => {
      setPrompt(suggestion)
      // Auto-submit with the chip text directly (prompt state may not flush yet)
      void executeDraw(suggestion)
    },
    [executeDraw],
  )

  return (
    <Card className="h-full flex flex-col overflow-hidden">
      {/* Header row: title + clear button */}
      <CardHeader className="pb-1 pt-2 px-3 shrink-0">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-medium">Доска</CardTitle>
          <Button
            variant="ghost"
            size="sm"
            onClick={handleClear}
            disabled={running}
            className="h-7 w-7 p-0"
            title="Очистить доску"
          >
            <Eraser className="h-3.5 w-3.5" />
          </Button>
        </div>
      </CardHeader>

      <CardContent className="flex-1 flex flex-col min-h-0 px-3 pb-3 pt-0 gap-2">
        {/* tldraw canvas — fills available space */}
        <div className="relative flex-1 min-h-0 rounded overflow-hidden border border-border tldraw-container">
          {!hasShapes && !running && (
            <div
              className="absolute inset-0 flex items-center justify-center pointer-events-none"
              style={{ zIndex: 1 }}
            >
              <p className="text-xs text-muted-foreground text-center px-4">
                Доска готова. Введи пример или задай вопрос боту.
              </p>
            </div>
          )}
          <Tldraw onMount={onMount} />
        </div>

        {/* Prompt section */}
        <div className="shrink-0 flex flex-col gap-1.5">
          <label className="text-xs font-medium text-muted-foreground">Что объяснить?</label>

          {/* Suggestion chips */}
          <div className="flex flex-wrap gap-1">
            {SUGGESTIONS.map((s) => (
              <Button
                key={s}
                variant="outline"
                size="sm"
                className="h-6 text-xs px-2 py-0"
                onClick={() => handleChipClick(s)}
                disabled={running}
              >
                {s}
              </Button>
            ))}
          </div>

          {/* Textarea */}
          <Textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="Например: объясни сложение 358 + 467 в столбик"
            className="resize-none text-sm min-h-[4rem] max-h-[6rem]"
            disabled={running}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                e.preventDefault()
                void handleDraw()
              }
            }}
          />

          {/* Action buttons */}
          <div className="flex gap-2">
            <Button
              type="button"
              onClick={() => void handleDraw()}
              disabled={running || !prompt.trim()}
              className="flex-1"
              size="sm"
            >
              {running ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                  Рисую…
                </>
              ) : (
                'Объяснить'
              )}
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={handleClear}
              disabled={running}
              size="sm"
            >
              Очистить
            </Button>
          </div>

          {/* Error display */}
          {error && (
            <div className="rounded border border-destructive/50 bg-destructive/10 px-2.5 py-1.5 text-xs text-destructive">
              <span className="font-semibold">Ошибка: </span>
              {error}
            </div>
          )}
        </div>

        {/* Narration panel — shown when teacher has spoken */}
        {narrations.length > 0 && (
          <div className="shrink-0 flex flex-col gap-1">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-muted-foreground">Объяснение учителя</span>
              <span className="text-xs text-muted-foreground">{narrations.length} реплик</span>
            </div>
            <div className="max-h-[7.5rem] overflow-y-auto rounded border border-border bg-muted/30 p-2 text-sm leading-relaxed">
              {narrations.map((n, i) => {
                const isLast = i === narrations.length - 1
                return (
                  <p
                    key={i}
                    className={
                      isLast && running
                        ? 'mb-1.5 rounded bg-primary/10 px-2 py-1 text-foreground ring-1 ring-primary/20'
                        : 'mb-1.5 text-muted-foreground'
                    }
                  >
                    {n.text}
                  </p>
                )
              })}
              <div ref={narrationEndRef} />
            </div>
          </div>
        )}

        {/* Debug tool calls log (collapsed by default) */}
        {calls.length > 0 && (
          <details className="shrink-0 rounded border border-border bg-background">
            <summary className="cursor-pointer px-2 py-1 text-xs font-medium text-muted-foreground select-none">
              Debug: tool calls ({calls.length})
            </summary>
            <div className="max-h-32 overflow-auto px-2 pb-2 font-mono text-[10px] leading-snug">
              {calls.map((c, i) => (
                <div key={i} className="mb-1 border-b border-border pb-1 last:border-b-0">
                  <div className="flex items-center gap-1">
                    <span
                      className={
                        c.status === 'ok'
                          ? 'text-green-700'
                          : c.status === 'error'
                            ? 'text-destructive'
                            : 'text-yellow-600'
                      }
                    >
                      {c.status === 'ok' ? '✓' : c.status === 'error' ? '✗' : '…'}
                    </span>
                    <span className="font-semibold text-primary">{c.name}</span>
                  </div>
                  <div className="break-all text-muted-foreground">{JSON.stringify(c.input)}</div>
                  {c.note && <div className="text-muted-foreground/70">{c.note}</div>}
                </div>
              ))}
            </div>
          </details>
        )}
      </CardContent>
    </Card>
  )
}
