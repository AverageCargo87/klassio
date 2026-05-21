// Phase 8 plan 08-03 GREEN — flips on the body builder used by
// scripts/restore-agent-config.mjs. Covers LLM-01 (Phase 8 tool surface) +
// D-11 (PATCH-based agent restore).
//
// API migration note (2026-05-13): 11labs deprecated inline
// `agent.prompt.tools[]` for custom client tools. New flow:
//   1. POST /v1/convai/tools with { tool_config } → returns { id }
//   2. PATCH /v1/convai/agents/{id} with `agent.prompt.tool_ids[]`
// Body builder split: buildToolCreateBody (per-tool) + buildAgentPatchBody (agent).
import { describe, it, expect } from 'vitest'
// tsconfig has `allowJs: false`, so TSC can't see `.mjs` exports — `@ts-expect-error`
// on the line above the import statement suppresses TS2307. Single-line form is
// required because @ts-expect-error only covers the immediately-following line.
// Vitest/Vite resolves the module fine at runtime.
// @ts-expect-error — TSC cannot resolve .mjs with allowJs:false, vitest resolves it fine
import { buildAgentPatchBody, buildToolCreateBody, PHASE_8_TOOLS, PHASE_8_TOOL_NAMES } from '@/scripts/restore-agent-config-body'

describe('restore-agent-config — Phase 8 tool definitions (LLM-01 + D-11)', () => {
  it('PHASE_8_TOOLS has exactly 6 tool definitions', () => {
    expect(PHASE_8_TOOLS).toHaveLength(6)
  })

  it('every tool has type:"client", name, description, parameters, execution_mode:"immediate"', () => {
    for (const tool of PHASE_8_TOOLS as Array<{ type: string; name: string; description: string; parameters: { type: string }; execution_mode: string }>) {
      expect(tool.type).toBe('client')
      expect(typeof tool.name).toBe('string')
      expect(typeof tool.description).toBe('string')
      expect(tool.description.length).toBeGreaterThan(20)
      expect(tool.parameters).toMatchObject({ type: 'object' })
      expect(tool.execution_mode).toBe('immediate')
    }
  })

  it('tool names cover the exact 6 tools from D-07', () => {
    const names = (PHASE_8_TOOLS as Array<{ name: string }>).map((t) => t.name).sort()
    expect(names).toEqual([
      'clear_board', 'draw_explanation', 'get_lesson_state',
      'goto_trainer_task', 'highlight_trainer_task', 'show_hint',
    ])
  })

  it('PHASE_8_TOOL_NAMES mirrors the tool name list (used for workspace cleanup safety)', () => {
    expect(PHASE_8_TOOL_NAMES).toEqual((PHASE_8_TOOLS as Array<{ name: string }>).map((t) => t.name))
    // Must NOT contain webhook/MCP-style names that the script must NOT touch
    expect(PHASE_8_TOOL_NAMES).not.toContain('send_to_makeAI')
    expect(PHASE_8_TOOL_NAMES).not.toContain('n8nLLL')
  })

  it('draw_explanation requires "prompt" parameter (string)', () => {
    const tool = (PHASE_8_TOOLS as Array<{ name: string; parameters?: { required?: string[]; properties?: Record<string, { type?: string; enum?: number[] }> } }>).find((t) => t.name === 'draw_explanation')
    expect(tool?.parameters?.required).toEqual(['prompt'])
    expect(tool?.parameters?.properties?.prompt?.type).toBe('string')
  })

  it('show_hint requires taskId + hintLevel (number, runtime-validated 1/2/3)', () => {
    // 11labs API rejects `enum` on `type: 'number'` (HTTP 400 — "Input should be a valid string"
    // at agent.prompt.tools.N.client.parameters.properties.hintLevel.number.enum.0). Constraint
    // moved from schema to handler — see lib/client-tools/handlers.ts:143 which rejects
    // anything other than 1/2/3 at runtime. LLM is steered by description text.
    const tool = (PHASE_8_TOOLS as Array<{ name: string; parameters?: { required?: string[]; properties?: Record<string, { type?: string; enum?: unknown; description?: string }> } }>).find((t) => t.name === 'show_hint')
    expect(tool?.parameters?.required).toEqual(['taskId', 'hintLevel'])
    expect(tool?.parameters?.properties?.hintLevel?.type).toBe('number')
    expect(tool?.parameters?.properties?.hintLevel?.enum).toBeUndefined()
    // Description must include the valid value set so the LLM gets steering even without enum
    expect(tool?.parameters?.properties?.hintLevel?.description).toMatch(/1.*2.*3/)
  })

  it('buildToolCreateBody wraps tool definition in { tool_config: ... } envelope', () => {
    const body = buildToolCreateBody(PHASE_8_TOOLS[0])
    expect(body).toHaveProperty('tool_config')
    expect((body as { tool_config: { name: string } }).tool_config.name).toBe(PHASE_8_TOOLS[0].name)
  })

  it('buildAgentPatchBody attaches tool_ids (not inline tools — 11labs API migration)', () => {
    const fakeIds = ['tool_aaa', 'tool_bbb', 'tool_ccc', 'tool_ddd', 'tool_eee', 'tool_fff']
    const body = buildAgentPatchBody({
      prompt: 'TEST PROMPT',
      firstMessage: 'hi',
      voiceId: 'V',
      toolIds: fakeIds,
    })
    // PATCH body key is conversation_config (singular), NOT conversational_config
    expect(body).toHaveProperty('conversation_config.agent.prompt.tool_ids')
    expect(body.conversation_config.agent.prompt.tool_ids).toEqual(fakeIds)
    // Old inline path MUST be gone — 11labs silently drops custom tools sent inline
    expect(body.conversation_config.agent.prompt).not.toHaveProperty('tools')
    expect(body.conversation_config.agent.prompt.llm).toBe('gpt-4.1-mini')
    expect(body.conversation_config.agent.language).toBe('ru')
  })

  it('buildAgentPatchBody preserves Phase 6 voice/TTS baseline', () => {
    const body = buildAgentPatchBody({ prompt: 'P', firstMessage: 'F', voiceId: 'NhY0kyTmsKuEpHvDMngm', toolIds: [] })
    expect(body.conversation_config.tts.voice_id).toBe('NhY0kyTmsKuEpHvDMngm')
    expect(body.conversation_config.tts.model_id).toBe('eleven_multilingual_v2')
    // 11labs PATCH is REPLACE-on-object: any TTS field not passed reverts to default.
    // Phase 6 tuning evolved through UAT — Phase 8.6 focus-group fix:
    //   stability 0.30 → 0.20 (less monotone)
    //   style added: 0.60   (liveliness — was defaulting to 0)
    expect(body.conversation_config.tts.stability).toBe(0.35)
    expect(body.conversation_config.tts.similarity_boost).toBe(0.75)
    expect(body.conversation_config.tts.speed).toBe(1.0)
    expect(body.conversation_config.tts.text_normalisation_type).toBe('elevenlabs')
  })

  it('buildAgentPatchBody includes Phase 6 turn/conversation/asr baseline (REPLACE-on-object guard)', () => {
    const body = buildAgentPatchBody({ prompt: 'P', firstMessage: 'F', toolIds: [] })
    // Conversation max duration: 60 minutes (45-min lesson + buffer)
    expect(body.conversation_config.conversation.max_duration_seconds).toBe(3600)
    // Turn timeout: 25s — gives the child plenty of time to think between turns
    // (raised from Phase 6 baseline 10s per UAT — Nataly was interrupting too early)
    expect(body.conversation_config.turn.turn_timeout).toBe(25)
    expect(body.conversation_config.turn.turn_eagerness).toBe('normal')
    // ASR keywords for math vocabulary (Phase 6 § 6 ASR)
    expect(body.conversation_config.asr.keywords).toContain('дроби')
    expect(body.conversation_config.asr.keywords).toContain('периметр')
    expect(body.conversation_config.asr.keywords).toContain('столбиком')
    expect(body.conversation_config.asr.keywords.length).toBeGreaterThanOrEqual(15)
  })

  it('buildAgentPatchBody rejects non-array toolIds', () => {
    expect(() =>
      buildAgentPatchBody({ prompt: 'P', firstMessage: 'F', toolIds: 'not-array' as unknown as string[] }),
    ).toThrow(/toolIds/)
  })
})
