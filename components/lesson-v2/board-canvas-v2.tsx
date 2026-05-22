'use client'
// components/lesson-v2/board-canvas-v2.tsx
// Phase 8.7 (Stage 2) — minimal tldraw canvas embed for lesson-v2 layout.
// Provides JUST the canvas surface + bus subscriptions + draw execution.
// No prompt UI, no narration panel, no card chrome — those belong to Claude
// Design's BoardOverlay (parent wraps this in its dark themed container).
//
// Logic ported from components/panels/board-panel.tsx — same SSE consumption
// pattern from /api/draw and same bus contract (board:draw_request, board:
// clear_request, board:draw_complete). Differences:
//   - No prompt textarea / suggestion chips
//   - No "Бот думает…" narration UI (handled by FloatingTeacher in v2)
//   - No error UI (errors logged to console; surface in chat-panel later)
//   - Higher contrast canvas background (dark overlay theme)
//
// Voice integration (Stage 3): the draw_explanation client tool emits
// board:draw_request on the bus → this component reacts.

import dynamic from 'next/dynamic'
import { useCallback, useEffect, useRef, useState } from 'react'
import 'tldraw/tldraw.css'
import type { Editor } from 'tldraw'
import { executeToolCall } from '@/lib/board'
import { useLessonBus, useLessonBusEvent } from '@/lib/lesson-bus'

// Tldraw touches window/document at import — disable SSR.
const Tldraw = dynamic(() => import('tldraw').then((m) => m.Tldraw), {
  ssr: false,
  loading: () => (
    <div className="absolute inset-0 flex items-center justify-center text-sm text-white/60">
      Загружаю канвас…
    </div>
  ),
})

interface BoardCanvasV2Props {
  lessonId: string
  /** Phase 8.7 UAT 2026-05-22 — robust mount-time draw trigger.
   *  Parent passes a pending prompt; the canvas executes it as soon as
   *  the tldraw editor is ready. Replaces the earlier setTimeout(900ms)
   *  hack which lost events on slow dynamic imports. */
  initialPrompt?: string | null
  onPromptConsumed?: () => void
}

export function BoardCanvasV2({ lessonId, initialPrompt, onPromptConsumed }: BoardCanvasV2Props) {
  const editorRef = useRef<Editor | null>(null)
  const runningRef = useRef(false)
  const [editorReady, setEditorReady] = useState(false)
  const bus = useLessonBus()

  const onMount = useCallback((editor: Editor) => {
    editorRef.current = editor
    editor.setCamera({ x: 0, y: 0, z: 1 })
    // Phase 8.7 UAT 2026-05-22 — blueprint look:
    //   - dark colorScheme inverts shape `'black'` colors to white automatically,
    //     so digit text renders visibly on the dark bg
    //   - grid mode draws the subtle dot pattern characteristic of the design mock
    editor.user.updateUserPreferences({ colorScheme: 'dark' })
    editor.updateInstanceState({ isGridMode: true })
    setEditorReady(true)
  }, [])

  const handleClear = useCallback(() => {
    const editor = editorRef.current
    if (!editor) return
    const ids = Array.from(editor.getCurrentPageShapeIds())
    if (ids.length > 0) editor.deleteShapes(ids)
  }, [])

  const executeDraw = useCallback(
    async (promptText: string) => {
      const editor = editorRef.current
      if (!editor || runningRef.current) {
        bus.emit('board:draw_complete', {
          lessonId,
          status: 'cancelled',
          reason: 'no-editor-or-already-running',
        })
        return
      }
      const userPrompt = promptText.trim()
      if (!userPrompt) {
        bus.emit('board:draw_complete', {
          lessonId,
          status: 'cancelled',
          reason: 'empty-prompt',
        })
        return
      }

      // Auto-clear board on new prompt to avoid layered shapes.
      const existingIds = Array.from(editor.getCurrentPageShapeIds())
      if (existingIds.length > 0) editor.deleteShapes(existingIds)

      runningRef.current = true
      let completeEmitted = false

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
        if (!res.body) throw new Error('empty response')

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

            if (evt.type === 'tool_use') {
              const name = String(evt.name)
              const input = (evt.input ?? {}) as Record<string, unknown>

              // Emit `say` reply on the bus — FloatingTeacher will pick it up
              // and show it in the chat transcript (Stage 3 integration).
              if (name === 'say') {
                const text = typeof input.text === 'string' ? input.text : ''
                if (text) {
                  bus.emit('board:say', { text, timestamp: Date.now() })
                }
              }

              await executeToolCall(editor, name, input)

              // Auto-fit camera to created shapes, but with breathing room
              // around the bounds — UAT 2026-05-22 user feedback was «как
              // будто носом в цифры». We expand the bounding box of all
              // shapes by ~100 world-units on each side, then zoom to that
              // expanded box. Effect: roughly 70-80% of the fit zoom, so
              // content sits in the center with margin on all sides.
              const hasContent = editor.getCurrentPageShapeIds().size > 0
              if (hasContent && name.startsWith('draw_')) {
                const bounds = editor.getCurrentPageBounds()
                if (bounds) {
                  const padded = bounds.clone().expandBy(100)
                  editor.zoomToBounds(padded, { animation: { duration: 200 } })
                } else {
                  editor.zoomToFit({ animation: { duration: 200 } })
                }
                // UAT 2026-05-22 (Variant B): scenes used to render almost
                // instantly while Nadya's narration ran ~30s — visible
                // desync. Inserting 700 ms between draw_* shapes paces the
                // canvas to ~8–15 sec total per scene, matching Nadya's
                // shortened narration rhythm. Non-draw events (say, etc.)
                // are not gated.
                await new Promise((r) => setTimeout(r, 700))
              }
            } else if (evt.type === 'error') {
              const msg = String(evt.error ?? 'sse-error')
              console.error('[BoardCanvasV2] SSE error:', msg)
              bus.emit('board:draw_complete', { lessonId, status: 'error', reason: msg })
              completeEmitted = true
            } else if (evt.type === 'done') {
              bus.emit('board:draw_complete', { lessonId, status: 'ok' })
              completeEmitted = true
            }
          }
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : 'Неизвестная ошибка'
        console.error('[BoardCanvasV2] execute error:', msg)
        if (!completeEmitted) {
          bus.emit('board:draw_complete', { lessonId, status: 'error', reason: msg })
          completeEmitted = true
        }
      } finally {
        runningRef.current = false
        if (!completeEmitted) {
          bus.emit('board:draw_complete', {
            lessonId,
            status: 'cancelled',
            reason: 'stream-ended-without-done',
          })
        }
      }
    },
    [bus, lessonId],
  )

  useLessonBusEvent('board:draw_request', ({ prompt, lessonId: requestLessonId }) => {
    if (requestLessonId !== lessonId) {
      console.warn(
        `[BoardCanvasV2] board:draw_request lessonId mismatch — expected ${lessonId}, got ${requestLessonId}`,
      )
      return
    }
    void executeDraw(prompt)
  })

  useLessonBusEvent('board:clear_request', () => {
    handleClear()
  })

  // Phase 8.7 UAT 2026-05-22 — consume initialPrompt as soon as the editor
  // is ready. Avoids the previous bus-emit race (board:draw_request fired
  // before BoardCanvasV2's subscription was active).
  useEffect(() => {
    if (!editorReady || !initialPrompt) return
    const prompt = initialPrompt
    onPromptConsumed?.()
    void executeDraw(prompt)
  }, [editorReady, initialPrompt, onPromptConsumed, executeDraw])

  // ESLint placeholder — bus is consumed via hooks, this prevents the
  // "useLessonBus called but result unused" warning when only emits are read
  // off the bus from inside callbacks.
  useEffect(() => {
    /* no-op */
  }, [bus])

  return (
    <div className="absolute inset-0 tldraw-container">
      <Tldraw onMount={onMount} />
    </div>
  )
}
