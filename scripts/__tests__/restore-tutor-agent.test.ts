// Locks the tutor agent config contract. Most important assertion: tutor tool
// names are DISJOINT from the math agent's — both restore scripts delete tools
// by name from the shared 11labs workspace, so a collision could delete the
// LIVE math agent's tools.
import { describe, it, expect } from 'vitest'
// @ts-expect-error — TSC cannot resolve .mjs with allowJs:false, vitest resolves it fine
import { TUTOR_TOOLS, TUTOR_TOOL_NAMES, TUTOR_FIRST_MESSAGE, TUTOR_ASR_KEYWORDS, buildTutorAgentPatchBody, stripPromptComments } from '@/scripts/restore-tutor-agent-body'
// @ts-expect-error — TSC cannot resolve .mjs with allowJs:false, vitest resolves it fine
import { PHASE_8_TOOL_NAMES } from '@/scripts/restore-agent-config-body'

type ToolDef = { type: string; name: string; description: string; parameters: { type: string } }
const tools = TUTOR_TOOLS as ToolDef[]
const tutorNames = TUTOR_TOOL_NAMES as string[]
const mathNames = PHASE_8_TOOL_NAMES as string[]

describe('tutor agent — tool definitions', () => {
  it('defines 7 well-formed client tools', () => {
    expect(tools).toHaveLength(7)
    for (const t of tools) {
      expect(t.type).toBe('client')
      expect(typeof t.name).toBe('string')
      expect(t.description.length).toBeGreaterThan(10)
      expect(t.parameters?.type).toBe('object')
    }
  })

  it('tool names are DISJOINT from the math agent (protects live prod agent)', () => {
    const collisions = tutorNames.filter((n: string) => mathNames.includes(n))
    expect(collisions).toEqual([])
  })

  it('uses no JSON-schema enum (11labs validator rejects it; steer via description)', () => {
    expect(JSON.stringify(tools)).not.toContain('"enum"')
  })
})

describe('tutor agent — patch body', () => {
  it('builds a complete REPLACE-safe body', () => {
    const body = buildTutorAgentPatchBody({
      prompt: 'тест',
      firstMessage: TUTOR_FIRST_MESSAGE,
      toolIds: ['a', 'b', 'c'],
    })
    const cc = body.conversation_config
    expect(cc.agent.language).toBe('ru')
    expect(cc.agent.prompt.prompt).toBe('тест')
    expect(cc.agent.prompt.tool_ids).toEqual(['a', 'b', 'c'])
    expect(cc.agent.first_message).toContain('как зовут') // asks the child's name
    expect(cc.tts.voice_id).toBeTruthy()
    expect(cc.asr.keywords).toBe(TUTOR_ASR_KEYWORDS)
    expect((cc.asr.keywords as string[]).length).toBeGreaterThan(10)
  })

  it('rejects an empty prompt', () => {
    expect(() => buildTutorAgentPatchBody({ prompt: '', firstMessage: 'x', toolIds: [] })).toThrow()
  })
})

describe('tutor agent — prompt comment stripping', () => {
  it('removes HTML comments (doc header) and trims', () => {
    const out = stripPromptComments('<!-- header\nmultiline -->\n\n# Кто ты\nтекст')
    expect(out.startsWith('# Кто ты')).toBe(true)
    expect(out).not.toContain('header')
  })
})
