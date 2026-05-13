// Phase 8 Wave 0 RED — Wave 1 plan 08-03 creates `scripts/restore-agent-config-body` to flip GREEN.
// Covers LLM-01 (PATCH includes 6 tool definitions).
import { describe, it, expect } from 'vitest'
// RED — Wave 1 plan 08-03 creates the named export.
// @ts-expect-error — module not yet created (Wave 0 RED contract)
import { buildAgentPatchBody, PHASE_8_TOOLS } from '@/scripts/restore-agent-config-body'

describe('restore-agent-config — Phase 8 tool definitions PATCH (LLM-01 + D-11)', () => {
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

  it('draw_explanation requires "prompt" parameter (string)', () => {
    const tool = (PHASE_8_TOOLS as Array<{ name: string; parameters?: { required?: string[]; properties?: Record<string, { type?: string; enum?: number[] }> } }>).find((t) => t.name === 'draw_explanation')
    expect(tool?.parameters?.required).toEqual(['prompt'])
    expect(tool?.parameters?.properties?.prompt?.type).toBe('string')
  })

  it('show_hint requires taskId + hintLevel enum [1,2,3]', () => {
    const tool = (PHASE_8_TOOLS as Array<{ name: string; parameters?: { required?: string[]; properties?: Record<string, { type?: string; enum?: number[] }> } }>).find((t) => t.name === 'show_hint')
    expect(tool?.parameters?.required).toEqual(['taskId', 'hintLevel'])
    expect(tool?.parameters?.properties?.hintLevel?.enum).toEqual([1, 2, 3])
  })

  it('buildAgentPatchBody produces conversation_config.agent.prompt.tools with 6 entries (D-11)', () => {
    const body = buildAgentPatchBody({ prompt: 'TEST PROMPT', firstMessage: 'hi', voiceId: 'V', tools: PHASE_8_TOOLS })
    // PATCH body key is conversation_config (singular), NOT conversational_config
    expect(body).toHaveProperty('conversation_config.agent.prompt.tools')
    expect(body.conversation_config.agent.prompt.tools).toHaveLength(6)
    expect(body.conversation_config.agent.prompt.llm).toBe('gpt-4.1-mini')
    expect(body.conversation_config.agent.language).toBe('ru')
  })

  it('buildAgentPatchBody preserves existing voice/TTS structure (Phase 6 baseline)', () => {
    const body = buildAgentPatchBody({ prompt: 'P', firstMessage: 'F', voiceId: 'NhY0kyTmsKuEpHvDMngm', tools: PHASE_8_TOOLS })
    expect(body.conversation_config.tts.voice_id).toBe('NhY0kyTmsKuEpHvDMngm')
    expect(body.conversation_config.tts.model_id).toBe('eleven_multilingual_v2')
  })
})
