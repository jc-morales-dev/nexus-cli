import { describe, expect, test } from 'bun:test'

import { GEMINI_THINKER_AGENT_ID } from '@nexus/common/constants/gemini-thinker'
import {
  LITE_DEEPSEEK_FLASH_MODEL_ID,
  LITE_DEEPSEEK_PRO_MODEL_ID,
  LITE_KIMI_MODEL_ID,
  LITE_MINIMAX_MODEL_ID,
} from '@nexus/common/constants/lite-agents'

import base2Lite from '../base2/base2-lite'
import { createBase2 } from '../base2/base2'

describe('base2 reviewer selection', () => {
  test.each([
    [LITE_MINIMAX_MODEL_ID, 'code-reviewer-minimax'],
    [LITE_KIMI_MODEL_ID, 'code-reviewer-kimi'],
    [LITE_DEEPSEEK_PRO_MODEL_ID, 'code-reviewer-deepseek'],
    [LITE_DEEPSEEK_FLASH_MODEL_ID, 'code-reviewer-deepseek-flash'],
  ])('uses matching reviewer for model %p', (model, expectedReviewer) => {
    const base2 = createBase2('free', { model })

    expect(base2.spawnableAgents).toContain(expectedReviewer)
    expect(base2.instructionsPrompt).toContain(`Spawn a ${expectedReviewer}`)
    expect(base2.stepPrompt).toContain(`spawn a ${expectedReviewer}`)
  })
})

/**
 * These are the regressions that a "delete everything named FREETIER" pass
 * causes silently: base2-lite is a normal, always-shipping NEXUS agent, and it
 * depends on the model->reviewer table and on the gemini-thinker gating that
 * used to live behind freetier-sounding names.
 */
describe('base2-lite wiring (LITE is a normal NEXUS mode, not freetier)', () => {
  test('runs on Kimi', () => {
    expect(base2Lite.model).toBe(LITE_KIMI_MODEL_ID)
  })

  test('spawns code-reviewer-kimi, not the generic lite reviewer fallback', () => {
    expect(base2Lite.spawnableAgents).toContain('code-reviewer-kimi')
    expect(base2Lite.spawnableAgents).not.toContain('code-reviewer-lite')
  })

  test('can spawn the gemini thinker subagent', () => {
    expect(base2Lite.spawnableAgents).toContain(GEMINI_THINKER_AGENT_ID)
  })

  test('tells the model to use the reviewer and the gemini thinker', () => {
    expect(base2Lite.instructionsPrompt).toContain('Spawn a code-reviewer-kimi')
    expect(base2Lite.instructionsPrompt).toContain(GEMINI_THINKER_AGENT_ID)
    expect(base2Lite.stepPrompt).toContain('spawn a code-reviewer-kimi')
    expect(base2Lite.stepPrompt).toContain(GEMINI_THINKER_AGENT_ID)
    expect(base2Lite.systemPrompt).toContain(GEMINI_THINKER_AGENT_ID)
  })

  test('createBase2("lite") matches the shipped base2-lite definition', () => {
    const lite = createBase2('lite')
    expect(lite.model).toBe(base2Lite.model)
    expect(lite.spawnableAgents).toEqual(base2Lite.spawnableAgents)
  })
})
