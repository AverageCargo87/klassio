// Text normalisation for behaviour moderation (LESSON-FLOW.md §7 ⚠ Модерация).
// Children evade naive filters with leet-speak, latin look-alikes, spacing, and
// elongation ("сууука", "с у к а", "cyka", "$ука"). We fold all of these into a
// canonical cyrillic form BEFORE matching, then expose both a token list and a
// de-spaced concatenation so detect.ts can catch spaced-out evasions.

// Visual / leet look-alikes → cyrillic. Conservative: only unambiguous, common
// substitutions. We map latin homoglyphs that share a glyph with a cyrillic letter.
const CHAR_MAP: Record<string, string> = {
  // digits commonly used as letters
  '0': 'о', '3': 'е', '4': 'ч', '6': 'б', '9': 'g',
  // symbols
  '@': 'а', '$': 'с',
  // latin homoglyphs → cyrillic
  a: 'а', e: 'е', o: 'о', p: 'р', c: 'с', x: 'х', y: 'у', k: 'к',
  m: 'м', t: 'т', b: 'в', h: 'н', u: 'и', n: 'п', r: 'г',
}

/** Lowercase, fold ё→е, map look-alikes, collapse 3+ char runs, strip combining marks. */
export function canonicalize(input: string): string {
  // Strip standalone combining diacritics (stress marks á/у́) WITHOUT NFKD
  // decomposition — NFKD would split Cyrillic «й» (и + ◌̆) and then the breve
  // strip turns «й»→«и», silently breaking every «й» pattern (хуй→хуи).
  let s = (input ?? '').toLowerCase().replace(/[̀-ͯ]/g, '')
  s = s.replace(/ё/g, 'е')
  s = s.replace(/./g, (ch) => CHAR_MAP[ch] ?? ch)
  // Collapse runs of 3+ identical chars to a single one (сууука → сука).
  s = s.replace(/(.)\1{2,}/g, '$1')
  return s
}

/** True if a char is a cyrillic letter (post-canonicalisation alphabet). */
function isCyrillic(ch: string): boolean {
  const code = ch.charCodeAt(0)
  return code >= 0x0430 && code <= 0x044f // а..я (lowercase, post-ё-fold)
}

export interface NormalisedText {
  /** Canonical lowercase string with single spaces between word groups. */
  spaced: string
  /** Cyrillic word tokens (punctuation / latin dropped). */
  tokens: string[]
  /** All token letters concatenated — catches "с у к а" spacing evasion. */
  despaced: string
  /** True when the text looks like spaced-out single letters (evasion signal). */
  hasLetterSpacing: boolean
}

/**
 * Normalise raw child utterance into matchable forms.
 * - tokens: per-word matching (the 99% case — a swear typed as one word).
 * - despaced: spacing-evasion matching against high-confidence cores.
 */
export function normalize(input: string): NormalisedText {
  const canon = canonicalize(input)
  // Split into tokens on any non-cyrillic run.
  const tokens: string[] = []
  let cur = ''
  for (const ch of canon) {
    if (isCyrillic(ch)) {
      cur += ch
    } else if (cur) {
      tokens.push(cur)
      cur = ''
    }
  }
  if (cur) tokens.push(cur)

  const singleCharTokens = tokens.filter((t) => t.length === 1).length
  return {
    spaced: tokens.join(' '),
    tokens,
    despaced: tokens.join(''),
    // ≥3 single-letter tokens ⇒ likely "с у к а"-style spacing.
    hasLetterSpacing: singleCharTokens >= 3,
  }
}
