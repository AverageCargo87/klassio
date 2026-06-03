// Browser-side handlers for «Аня»'s 8 client tools. Names MUST match
// scripts/restore-tutor-agent-body.mjs TUTOR_TOOLS. Pure factory (no React, no
// SDK lookup) → unit-testable. Each handler:
//   1. emits a lesson-bus event the tutor page components react to (reveal/hide
//      a tool, change phase highlight, show a reward, enter break mode), and
//   2. fire-and-forgets a tracking POST to /api/tutor/* (D-09 style: return the
//      ack PROMPTLY so the voice keeps flowing; never await the network).
//
// CLIENT-SAFE imports only (no '@/lib/tutor' — that pulls the DB into the
// bundle). Uses '@/lib/tutor/types' (pure consts/types) + '@/lib/lesson-bus'.
import type { ClientTools } from '@elevenlabs/react'
import type { LessonBus } from '@/lib/lesson-bus'
import { TUTOR_PHASES } from '@/lib/tutor/types'

const TASK_ID_RE = /^task-\d+$/
const PHASES = TUTOR_PHASES as readonly string[]

export interface TutorToolsDeps {
  bus: LessonBus
  /** tutor_session id — used as the tracking key and the board's lessonId. */
  sessionId: string
  /** Compact lesson-state snapshot for the lesson_state tool. */
  getState: () => string
}

/** Fire-and-forget POST — never awaited, errors are logged not thrown. */
function post(url: string, body: unknown): void {
  void fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }).catch((err) => console.error('[tutor-tools] POST failed', url, err))
}

export function buildTutorClientTools(deps: TutorToolsDeps): ClientTools {
  const { bus, sessionId, getState } = deps

  const track = (eventType: string, payload: Record<string, unknown>) =>
    post('/api/tutor/event', { sessionId, eventType, payload })

  return {
    // Reveal a prebuilt board (Solar System, sizes, orbits…).
    show_board: (p: Record<string, unknown>) => {
      const board = typeof p.board === 'string' ? p.board.trim() : ''
      if (!board) return 'Error: empty board id, narrate verbally'
      try {
        bus.emit('tutor:show_tool', { tool: 'board', variant: board })
        track('tool_used', { tool: 'board', variant: board })
        return `OK, доска "${board}" показана — рассказывай чуть медленнее, чтобы ребёнок успевал смотреть.`
      } catch (err) {
        console.error('[tutor-tools] show_board:', err)
        return 'Error: board unavailable, narrate verbally'
      }
    },

    // Ad-hoc drawing on the board (reuses the Phase 8 board:draw_request path).
    draw_board: (p: Record<string, unknown>) => {
      const prompt = typeof p.prompt === 'string' ? p.prompt.trim() : ''
      if (!prompt) return 'Error: empty prompt, narrate verbally'
      try {
        bus.emit('board:draw_request', { prompt, lessonId: sessionId })
        return 'OK, рисую параллельно — продолжай объяснять не спеша, чтобы анимация успевала.'
      } catch (err) {
        console.error('[tutor-tools] draw_board:', err)
        return 'Error: board unavailable, narrate verbally'
      }
    },

    // Reveal an interactive trainer task.
    show_trainer: (p: Record<string, unknown>) => {
      const taskId = typeof p.taskId === 'string' ? p.taskId.trim() : ''
      if (!TASK_ID_RE.test(taskId)) return `Error: invalid taskId "${String(p.taskId)}"`
      try {
        bus.emit('tutor:show_tool', { tool: 'trainer', taskId })
        track('tool_used', { tool: 'trainer', taskId })
        return `OK, задание ${taskId} показано.`
      } catch (err) {
        console.error('[tutor-tools] show_trainer:', err)
        return 'Error: trainer unavailable, narrate verbally'
      }
    },

    // Back to the empty canvas.
    hide_tool: () => {
      try {
        bus.emit('tutor:hide_tool', {})
        return 'Холст очищен'
      } catch (err) {
        console.error('[tutor-tools] hide_tool:', err)
        return 'Error: continue'
      }
    },

    // Lesson-phase transition (state machine + DB log).
    set_phase: (p: Record<string, unknown>) => {
      const phase = typeof p.phase === 'string' ? p.phase.trim() : ''
      if (!PHASES.includes(phase)) return `Error: invalid phase "${String(p.phase)}"`
      try {
        bus.emit('tutor:phase', { phase })
        post('/api/tutor/phase', { sessionId, phase })
        return `Фаза: ${phase}`
      } catch (err) {
        console.error('[tutor-tools] set_phase:', err)
        return 'Error: continue'
      }
    },

    // Visible reward / milestone.
    give_reward: (p: Record<string, unknown>) => {
      const label = typeof p.label === 'string' ? p.label.trim() : undefined
      try {
        bus.emit('tutor:reward', { label })
        track('reward_given', { label: label ?? null })
        return 'Награда показана'
      } catch (err) {
        console.error('[tutor-tools] give_reward:', err)
        return 'Error: continue'
      }
    },

    // Enter / leave break mode (fatigue pause).
    take_break: (p: Record<string, unknown>) => {
      const mode = typeof p.active === 'string' ? p.active.trim() : ''
      if (mode !== 'start' && mode !== 'stop') return `Error: active must be "start" or "stop"`
      const active = mode === 'start'
      try {
        bus.emit('tutor:break', { active })
        track(active ? 'pause_started' : 'pause_ended', {})
        return active ? 'Пауза включена' : 'Возвращаемся к уроку'
      } catch (err) {
        console.error('[tutor-tools] take_break:', err)
        return 'Error: continue'
      }
    },

    // Snapshot for when «Аня» loses the thread.
    lesson_state: () => {
      try {
        return getState()
      } catch (err) {
        console.error('[tutor-tools] lesson_state:', err)
        return 'Error: state unavailable'
      }
    },
  }
}
