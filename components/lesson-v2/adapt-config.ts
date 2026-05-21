// components/lesson-v2/adapt-config.ts
// Adapter: TrainerConfig (JSON schema, lib/trainer/config-schema.ts) → Screen[]
// (Claude Design component data shape).
//
// Why an adapter, not a schema rewrite: our JSON schema is the source of truth
// for content (validated by zod, tested, used in seed scripts). The component
// shape comes from Claude Design's prototype. Keeping them separate lets us
// evolve each independently — content authors write JSON; UI iterates on shape.

import type { TrainerConfig, TrainerTask } from '@/lib/trainer/config-schema'
import type {
  IntroScreen,
  Screen,
  TaskScreen,
  SingleChoiceOption,
  MatchingPair,
} from './types'

// Map intro emoji — JSON schema doesn't have emoji per intro, so we guess from
// the title text or use a default. Authors can override later by extending the
// schema. For now: first emoji in title, else default by index.
const DEFAULT_INTRO_EMOJI = ['🧮', '✨', '➕', '📚', '🎯'] as const

function pickIntroEmoji(title: string, idx: number): string {
  // Look for an emoji at the end of the title (e.g. "Что такое столбик? 🧮").
  // Emoji regex covers the ranges Claude Design uses: misc-symbols, geometric,
  // arrows, math, plus the supplementary planes for newer emoji.
  const match = title.match(/([\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{2300}-\u{23FF}])\s*$/u)
  if (match) return match[1]
  return DEFAULT_INTRO_EMOJI[idx] ?? '📖'
}

function stripTrailingEmoji(title: string): string {
  return title.replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{2300}-\u{23FF}]+\s*$/u, '').trim()
}

// Split a JSON body string into paragraphs for the IntroCard.
// JSON has body as a single string; we split on double-newline or sentence
// boundaries (period + space). Claude Design rendered an array of paragraphs.
function splitBody(body: string): string[] {
  // Prefer explicit paragraph breaks if author put them.
  if (body.includes('\n\n')) {
    return body.split('\n\n').map((s) => s.trim()).filter(Boolean)
  }
  // Otherwise split on ". " when followed by capital — basic Russian sentence
  // boundary. Keep the period attached to each sentence.
  const sentences = body.split(/(?<=[.!?])\s+(?=[А-ЯA-Z])/)
  if (sentences.length === 1) return [body]
  // Group every 2 sentences into one paragraph for readability.
  const paragraphs: string[] = []
  for (let i = 0; i < sentences.length; i += 2) {
    paragraphs.push(sentences.slice(i, i + 2).join(' ').trim())
  }
  return paragraphs.filter(Boolean)
}

function adaptTask(task: TrainerTask): TaskScreen {
  const difficulty = (task.difficulty ?? 2) as 1 | 2 | 3
  const explanation = task.explanation ?? ''

  if (task.type === 'numeric-input') {
    // Extract "A + B" expression from the prompt if it looks like
    // "Сложи в столбик: 25 + 34" or "Реши: 245 + 874 = ?".
    const exprMatch =
      task.prompt.match(/(\d+\s*[+\-×]\s*\d+)/) ?? null
    const expr = exprMatch ? exprMatch[1].replace(/\s+/g, ' ').trim() : null
    // Short prompt label without the expression. If we extracted "25 + 34",
    // replace it with the canonical label "Сложи в столбик:".
    const shortPrompt = expr
      ? task.prompt.replace(/[:.]\s*\d+\s*[+\-×]\s*\d+\s*(=\s*\?)?$/, ':').trim()
      : task.prompt
    return {
      kind: 'task',
      id: task.id,
      type: 'numeric-input',
      difficulty,
      prompt: shortPrompt,
      expr,
      answer: String(task.correct),
      hints: task.hints ?? [],
      explanation,
    }
  }

  if (task.type === 'single-choice') {
    // JSON has options: string[] and correct: number (index).
    // Adapter -> options with key A/B/C/D and per-option correct: boolean.
    const correctIdx = Number(task.correct)
    const options = (task.options ?? []).map((label, i): SingleChoiceOption => ({
      key: String.fromCharCode(65 + i), // 65 = 'A'
      label,
      correct: i === correctIdx,
    }))
    return {
      kind: 'task',
      id: task.id,
      type: 'single-choice',
      difficulty,
      prompt: task.prompt,
      options,
      hints: task.hints ?? [],
      explanation,
    }
  }

  // matching: JSON has correct: [[left, right], ...] + options: string[].
  const pairsRaw = Array.isArray(task.correct) ? task.correct : []
  const pairs: MatchingPair[] = pairsRaw.map(([left, right]) => ({ left, right }))
  return {
    kind: 'task',
    id: task.id,
    type: 'matching',
    difficulty,
    prompt: task.prompt,
    pairs,
    rightOptions: task.options ?? [],
    hints: task.hints ?? [],
    explanation,
  }
}

/**
 * Convert validated TrainerConfig (JSON) into the Screen[] array consumed by
 * LessonPage. Intro blocks come first (in order), then tasks (in order). The
 * order matches what Claude Design's prototype uses.
 */
export function trainerConfigToScreens(config: TrainerConfig): Screen[] {
  const intros: IntroScreen[] =
    (config.intro ?? []).map((b, idx) => ({
      kind: 'intro',
      id: b.id,
      emoji: pickIntroEmoji(b.title, idx),
      title: stripTrailingEmoji(b.title),
      body: splitBody(b.body),
    }))

  const tasks: TaskScreen[] = config.tasks.map(adaptTask)

  return [...intros, ...tasks]
}
