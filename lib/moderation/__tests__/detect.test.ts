import { describe, it, expect } from 'vitest'
import { detectMisbehavior, decideModerationAction } from '../detect'

describe('detectMisbehavior — profanity', () => {
  it('flags common obscenities typed as one word', () => {
    for (const w of ['сука', 'блять', 'пиздец', 'ебать', 'мудак', 'хуйня', 'долбоеб', 'пидор']) {
      expect(detectMisbehavior(w).severity, w).toBe('profanity')
    }
  })

  it('flags obscenities inside a sentence', () => {
    expect(detectMisbehavior('это какая-то хуйня вообще').severity).toBe('profanity')
    expect(detectMisbehavior('да пошла ты, сука').severity).toBe('profanity')
  })

  it('catches spacing evasion (с у к а)', () => {
    expect(detectMisbehavior('с у к а').severity).toBe('profanity')
    expect(detectMisbehavior('п и з д е ц').severity).toBe('profanity')
  })

  it('catches leet / latin substitution and elongation', () => {
    expect(detectMisbehavior('cyka').severity).toBe('profanity') // c,y,k,a → с,у,к,а
    expect(detectMisbehavior('сууука').severity).toBe('profanity')
    expect(detectMisbehavior('сук@').severity).toBe('profanity') // @ → а
  })
})

describe('detectMisbehavior — rudeness', () => {
  it('flags rude words toward the teacher', () => {
    for (const w of ['дура', 'тупая', 'идиот', 'заткнись', 'ненавижу', 'дебил']) {
      expect(detectMisbehavior(w).severity, w).toBe('rude')
    }
  })

  it('flags rude multi-word phrases', () => {
    expect(detectMisbehavior('ты тупая и я тебя ненавижу').severity).toBe('rude')
    expect(detectMisbehavior('сама дура').severity).toBe('rude')
  })
})

describe('detectMisbehavior — FALSE POSITIVE guards (astronomy lesson 1 vocab)', () => {
  // These MUST stay clean — they are the actual words of «Мир глазами астронома».
  const innocent = [
    'небо', 'на небе много звёзд', 'звёздное небо',
    'космический корабль', 'на корабле к Марсу', 'вижу корабля вдалеке',
    'спутник Земли', 'у Юпитера много спутников', 'спутница луна',
    'солнце это звезда', 'солнечная система', 'планеты вращаются',
    'сухой климат на Марсе', 'период обращения', 'команда астронавтов',
    'хлеб', 'я думаю про себя', 'я тебя слушаю', 'это требует внимания',
    'блин, как интересно', 'область неба', 'мудрый учёный',
    'это тупик в рассуждении', 'надо разгадать загадку', 'наша родина Земля',
    'наблюдать за планетами', 'телескоп', 'астрономия наука о космосе',
  ]

  for (const text of innocent) {
    it(`does NOT flag: "${text}"`, () => {
      expect(detectMisbehavior(text).severity).toBe('none')
    })
  }
})

describe('decideModerationAction — escalation policy', () => {
  it('does nothing when clean', () => {
    expect(decideModerationAction('none', 0)).toMatchObject({ action: 'none', notifyParent: false })
  })

  it('first incident → calm warning, no parent notice', () => {
    const d = decideModerationAction('profanity', 0)
    expect(d.action).toBe('warn')
    expect(d.notifyParent).toBe(false)
    expect(d.contextualUpdate).toContain('[МОДЕРАЦИЯ]')
  })

  it('repeat incident → escalate + notify parent', () => {
    const d = decideModerationAction('rude', 1)
    expect(d.action).toBe('escalate')
    expect(d.notifyParent).toBe(true)
    expect(d.contextualUpdate).toContain('родител')
  })
})
