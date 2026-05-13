// Phase 8 — client tool handlers consumed by VoicePanel through @elevenlabs/react.
// SDK contract (verified node_modules/@elevenlabs/react@1.6.0):
//   export type ClientTool = (parameters: Record<string, unknown>) => Promise<string|number|void> | string|number|void
//   Both sync and Promise-returning functions accepted; we use sync — returning a string
//   is the canonical ack/error.
// D-09 fire-and-forget: handlers return ack strings PROMPTLY (< 50ms target). Heavy work
// (e.g. /api/draw SSE stream) is started but NOT awaited — this lets Nataly continue
// speaking in parallel with board animation, preserving INV-02.
import type { ClientTools } from '@elevenlabs/react'
import type { LessonBus } from '@/lib/lesson-bus'
import { formatMiniRecap } from '@/lib/contextual-updates'

/**
 * Allow-listed taskId pattern (T-2 mitigation per CONTEXT.md threat model).
 * Matches public/trainer-configs/*.json convention: task-1, task-2, ...
 * Prevents injection attacks via hallucinated taskIds like '../etc/passwd'.
 */
const TASK_ID_RE = /^task-\d+$/

/**
 * Dependencies injected by VoicePanel. Factoring through a factory keeps the handlers
 * pure (no React, no SDK lookup) and unit-testable.
 */
export interface ClientToolsDeps {
  bus: LessonBus
  lessonId: string
  /** Latched reference — see PATTERNS.md cleanup-bug pattern. */
  sendContextualUpdate: (text: string) => void
  /** Reads VoicePanel-owned ref so handler always sees latest taskId */
  getCurrentTaskId: () => string
  /** Reads VoicePanel-owned ref of solved task IDs (insertion-ordered) */
  getSolvedTaskIds: () => Set<string>
  /** Reads trainerConfig task prompt for mini-recap; '' if unknown */
  getTaskTopic: (taskId: string) => string
  /** Composed lesson-state snapshot getter (typically getLessonStateSnapshot bound) */
  getState: () => string
}

/**
 * Build the 6 client tool handlers for registration with @elevenlabs/react useConversation.
 * Pure factory — no side effects until a handler is invoked by the SDK.
 */
export function buildClientTools(deps: ClientToolsDeps): ClientTools {
  const { bus, lessonId, sendContextualUpdate, getCurrentTaskId, getSolvedTaskIds, getTaskTopic, getState } = deps

  return {
    /**
     * D-07 baseline #1 — initiate a board explanation. OQ-1 Option B: emit a bus
     * event instead of accessing the tldraw Editor across React subtrees.
     * BoardPanel subscribes to 'board:draw_request' (plan 08-05) and calls its
     * local executeDraw with the prompt.
     */
    draw_explanation: (parameters: Record<string, unknown>) => {
      console.log('[client-tools] 🎨 draw_explanation CALLED', parameters)
      const promptRaw = parameters.prompt
      const text = typeof promptRaw === 'string' ? promptRaw.trim() : ''
      if (!text) {
        console.warn('[client-tools] draw_explanation called with empty prompt')
        return 'Error: empty prompt, narrate verbally'
      }
      // D-09 fire-and-forget: handler returns ack IMMEDIATELY so the voice can
      // continue narrating in parallel with the board animation. UAT (2026-05-13)
      // explored a BLOCKING variant where the handler awaited 'board:draw_complete'
      // before returning — but the operator preferred parallel speech-and-draw
      // (it feels more like a live teacher who writes while talking). Speed is
      // tuned at the board animation level (lib/draw-engine — animation duration
      // shortened) rather than by blocking voice. See revert in board-panel.tsx
      // and api/draw helpers for the tuning knobs.
      try {
        bus.emit('board:draw_request', { prompt: text, lessonId })
        console.log('[client-tools] ✅ draw_explanation emitted board:draw_request', { prompt: text, lessonId })
        return 'OK, drawing in parallel — keep narrating step by step at a slightly slowed pace so the visuals can keep up.'
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'unknown error'
        console.error('[client-tools] draw_explanation emit failed:', msg)
        return 'Error: board unavailable, narrate verbally'
      }
    },

    /** D-07 baseline #2 — wipe canvas. */
    clear_board: () => {
      console.log('[client-tools] 🧹 clear_board CALLED')
      try {
        bus.emit('board:clear_request', {})
        console.log('[client-tools] ✅ clear_board emitted board:clear_request')
        return 'Board cleared'
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'unknown error'
        console.error('[client-tools] clear_board emit failed:', msg)
        return 'Error: clear failed, continue'
      }
    },

    /**
     * D-07 baseline #3 — navigate trainer. D-03 + D-08 prescribe a mini-recap
     * via sendContextualUpdate BEFORE the navigation event so Nataly receives
     * a fresh state snapshot at the tail of her context window. Order is
     * load-bearing: contextual update must precede bus emit.
     */
    goto_trainer_task: (parameters: Record<string, unknown>) => {
      console.log('[client-tools] 🎯 goto_trainer_task CALLED', parameters)
      const taskId = parameters.taskId
      if (typeof taskId !== 'string' || !TASK_ID_RE.test(taskId)) {
        console.warn('[client-tools] goto_trainer_task rejected invalid taskId:', taskId)
        return `Error: invalid taskId "${String(taskId)}"`
      }
      try {
        const fromTask = getCurrentTaskId() || '(start)'
        const solvedList = [...getSolvedTaskIds()]
        const toTopic = getTaskTopic(taskId) || taskId
        // 1) mini-recap FIRST (D-03)
        sendContextualUpdate(formatMiniRecap({
          fromTask,
          toTask: taskId,
          solvedTaskIds: solvedList,
          toTaskTopic: toTopic,
        }))
        // 2) bus emit AFTER
        bus.emit('trainer:goto_task', { taskId })
        return `Navigating to ${taskId}`
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'unknown error'
        console.error('[client-tools] goto_trainer_task failed:', msg)
        return 'Error: navigation failed, continue verbally'
      }
    },

    /**
     * D-07 baseline #4 — highlight without navigating. Reuses Phase 7 trainer:highlight
     * (TrainerPanel maps elementId → data-task-id selector).
     */
    highlight_trainer_task: (parameters: Record<string, unknown>) => {
      console.log('[client-tools] ✨ highlight_trainer_task CALLED', parameters)
      const taskId = parameters.taskId
      const durationMsRaw = parameters.durationMs
      if (typeof taskId !== 'string' || !TASK_ID_RE.test(taskId)) {
        return `Error: invalid taskId "${String(taskId)}"`
      }
      const durationMs = typeof durationMsRaw === 'number' ? durationMsRaw : undefined
      try {
        bus.emit('trainer:highlight', { elementId: taskId, durationMs })
        return `Highlighting ${taskId}`
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'unknown error'
        console.error('[client-tools] highlight_trainer_task failed:', msg)
        return 'Error: highlight failed, continue'
      }
    },

    /** D-07 extension #1 — show a hint level (1/2/3). Reuses Phase 7 trainer:show_hint. */
    show_hint: (parameters: Record<string, unknown>) => {
      console.log('[client-tools] 💡 show_hint CALLED', parameters)
      const taskId = parameters.taskId
      const hintLevel = parameters.hintLevel
      if (typeof taskId !== 'string' || !TASK_ID_RE.test(taskId)) {
        return `Error: invalid taskId "${String(taskId)}"`
      }
      if (hintLevel !== 1 && hintLevel !== 2 && hintLevel !== 3) {
        return `Error: invalid hintLevel "${String(hintLevel)}"`
      }
      try {
        bus.emit('trainer:show_hint', { taskId, hintLevel })
        return `Showing hint level ${hintLevel} for ${taskId}`
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'unknown error'
        console.error('[client-tools] show_hint failed:', msg)
        return 'Error: hint unavailable, narrate verbally'
      }
    },

    /**
     * D-07 extension #2 — safety net per D-03. Nataly may call this if she feels
     * she lost track of progress. Returns the same compact string format she sees
     * from the periodic checkpoint and mini-recap — consistent vocabulary.
     */
    get_lesson_state: () => {
      console.log('[client-tools] 📊 get_lesson_state CALLED')
      try {
        return getState()
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'unknown error'
        console.error('[client-tools] get_lesson_state failed:', msg)
        return 'Error: state unavailable'
      }
    },
  }
}
