// Behaviour-moderation detector + escalation policy (LESSON-FLOW.md §7).
// Pure & synchronous — no DB, no I/O. The API route (app/api/tutor/moderation)
// supplies prior-incident counts from progress_event and persists the outcome.

import { normalize } from './normalize'
import {
  PROFANITY_PATTERNS,
  PROFANITY_CORES,
  RUDE_PATTERNS,
  RUDE_PHRASES,
  ALLOWLIST,
} from './wordlist'

export type Severity = 'none' | 'rude' | 'profanity'

export interface ModerationDetection {
  severity: Severity
  /** Coarse reason tags (NOT the raw word — we never echo profanity back). */
  reasons: string[]
}

/**
 * Classify a child utterance. Returns the HIGHEST severity found.
 * Precision-first: allow-listed tokens and anchored patterns prevent the
 * astronomy vocabulary («небо», «корабля», «спутник») from false-triggering.
 */
export function detectMisbehavior(text: string): ModerationDetection {
  const reasons: string[] = []
  let hasProfanity = false
  let hasRude = false

  const n = normalize(text)

  // 1) Per-token matching (the common case: swear typed as one word).
  for (const token of n.tokens) {
    if (ALLOWLIST.has(token)) continue
    if (PROFANITY_PATTERNS.some((re) => re.test(token))) {
      hasProfanity = true
      reasons.push('profanity')
      continue
    }
    if (RUDE_PATTERNS.some((re) => re.test(token))) {
      hasRude = true
      reasons.push('rude')
    }
  }

  // 2) Spacing-evasion scan ("с у к а" / "х.у.й") — ONLY when the text looks
  //    deliberately spaced out. Running it on ordinary short prose would risk
  //    cross-word false positives (e.g. "хлебал суп" → core "ебал"). Normal
  //    single-word swears are already caught per-token in step 1.
  if (!hasProfanity && n.hasLetterSpacing && PROFANITY_CORES.some((re) => re.test(n.despaced))) {
    hasProfanity = true
    reasons.push('profanity:spaced')
  }

  // 3) Multi-word rude phrases.
  for (const phrase of RUDE_PHRASES) {
    if (n.spaced.includes(phrase)) {
      hasRude = true
      reasons.push('phrase')
    }
  }

  const severity: Severity = hasProfanity ? 'profanity' : hasRude ? 'rude' : 'none'
  return { severity, reasons: [...new Set(reasons)] }
}

export type ModerationAction = 'none' | 'warn' | 'escalate'

export interface ModerationDecision {
  action: ModerationAction
  /** Russian note pushed to the agent via sendContextualUpdate (no raw word). */
  contextualUpdate: string | null
  /** Whether the parent must be notified (true for escalation). */
  notifyParent: boolean
}

const WARN_UPDATE =
  '[МОДЕРАЦИЯ] Ребёнок грубит или ругается. Отреагируй ТВЁРДО и серьёзно (но без крика и оскорблений): скажи, что так разговаривать нельзя. ' +
  'Сразу и прямо предупреди — если он скажет ещё хоть одно такое слово, ты немедленно расскажешь его родителям всё, что он наговорил. Это не пустая угроза. Потом верни к уроку.'

const ESCALATE_UPDATE =
  '[МОДЕРАЦИЯ] Ребёнок грубит ПОВТОРНО, после предупреждения. Без колебаний и твёрдо скажи: ты предупреждала — и прямо сейчас отправляешь его родителям сообщение о его поведении. ' +
  'Сообщение родителям уже отправлено (на экране это подтверждено). Серьёзно, но без злости и оскорблений. После этого предложи продолжить урок.'

/**
 * Escalation policy: 1st flagged incident → calm warning; any subsequent →
 * escalation (record + notify parent). Pure function of the detection severity
 * and the count of prior incidents in THIS session.
 */
export function decideModerationAction(
  severity: Severity,
  priorIncidents: number,
): ModerationDecision {
  if (severity === 'none') {
    return { action: 'none', contextualUpdate: null, notifyParent: false }
  }
  if (priorIncidents <= 0) {
    return { action: 'warn', contextualUpdate: WARN_UPDATE, notifyParent: false }
  }
  return { action: 'escalate', contextualUpdate: ESCALATE_UPDATE, notifyParent: true }
}
