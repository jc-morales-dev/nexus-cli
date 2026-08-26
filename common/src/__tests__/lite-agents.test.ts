import { describe, expect, test } from 'bun:test'

import { GEMINI_THINKER_AGENT_ID } from '../constants/gemini-thinker'
import {
  canModelSpawnGeminiThinker,
  GEMINI_THINKER_PARENT_MODELS,
  LITE_DEEPSEEK_FLASH_MODEL_ID,
  LITE_DEEPSEEK_PRO_MODEL_ID,
  LITE_KIMI_MODEL_ID,
  LITE_MINIMAX_MODEL_ID,
  REVIEWER_AGENT_ID_BY_MODEL,
} from '../constants/lite-agents'

describe('lite model ids', () => {
  test('pin the exact OpenRouter ids the agent definitions ship with', () => {
    expect(LITE_KIMI_MODEL_ID).toBe('moonshotai/kimi-k2.6')
    expect(LITE_MINIMAX_MODEL_ID).toBe('minimax/minimax-m2.7')
    expect(LITE_DEEPSEEK_PRO_MODEL_ID).toBe('deepseek/deepseek-v4-pro')
    expect(LITE_DEEPSEEK_FLASH_MODEL_ID).toBe('deepseek/deepseek-v4-flash')
  })
})

describe('reviewer selection', () => {
  test('maps every lite model to its same-provider reviewer', () => {
    expect(REVIEWER_AGENT_ID_BY_MODEL[LITE_MINIMAX_MODEL_ID]).toBe(
      'code-reviewer-minimax',
    )
    expect(REVIEWER_AGENT_ID_BY_MODEL[LITE_KIMI_MODEL_ID]).toBe(
      'code-reviewer-kimi',
    )
    expect(REVIEWER_AGENT_ID_BY_MODEL[LITE_DEEPSEEK_PRO_MODEL_ID]).toBe(
      'code-reviewer-deepseek',
    )
    expect(REVIEWER_AGENT_ID_BY_MODEL[LITE_DEEPSEEK_FLASH_MODEL_ID]).toBe(
      'code-reviewer-deepseek-flash',
    )
  })

  test('has no entry for unknown models so callers hit their fallback', () => {
    expect(REVIEWER_AGENT_ID_BY_MODEL['anthropic/claude-opus-4.7']).toBe(
      undefined,
    )
  })

  /**
   * The trap: base2-lite runs on Kimi in ordinary (non-freetier) NEXUS, so this
   * lookup is production behavior. If it ever resolves to undefined, base2-lite
   * silently downgrades to the generic `code-reviewer-lite` fallback.
   */
  test("LITE's model resolves to code-reviewer-kimi", () => {
    expect(REVIEWER_AGENT_ID_BY_MODEL[LITE_KIMI_MODEL_ID]).toBe(
      'code-reviewer-kimi',
    )
  })
})

describe('gemini thinker gating', () => {
  test('only smart models can spawn the gemini thinker', () => {
    expect(canModelSpawnGeminiThinker(LITE_KIMI_MODEL_ID)).toBe(true)
    expect(canModelSpawnGeminiThinker(LITE_DEEPSEEK_PRO_MODEL_ID)).toBe(true)
    expect(canModelSpawnGeminiThinker(LITE_MINIMAX_MODEL_ID)).toBe(false)
    expect(canModelSpawnGeminiThinker(LITE_DEEPSEEK_FLASH_MODEL_ID)).toBe(false)
  })

  test('unknown models cannot spawn it', () => {
    expect(canModelSpawnGeminiThinker('z-ai/glm-5.1')).toBe(false)
  })

  /** Same trap as above: LITE must keep its thinker in ordinary NEXUS. */
  test("LITE's model can spawn the gemini thinker", () => {
    expect(GEMINI_THINKER_PARENT_MODELS.has(LITE_KIMI_MODEL_ID)).toBe(true)
    expect(canModelSpawnGeminiThinker(LITE_KIMI_MODEL_ID)).toBe(true)
  })

  test('the thinker agent id matches the agent definition file', () => {
    expect(GEMINI_THINKER_AGENT_ID).toBe('thinker-with-files-gemini')
  })
})

