import { describe, expect, test } from 'bun:test'

import {
  FREETIER_DEEPSEEK_V4_FLASH_MODEL_ID,
  FREETIER_DEEPSEEK_V4_PRO_MODEL_ID,
  FREETIER_KIMI_MODEL_ID,
  FREETIER_MINIMAX_MODEL_ID,
} from '@nexus/common/constants/freetier-models'

import { createBase2 } from '../base2/base2'

describe('base2 reviewer selection', () => {
  test.each([
    [FREETIER_MINIMAX_MODEL_ID, 'code-reviewer-minimax'],
    [FREETIER_KIMI_MODEL_ID, 'code-reviewer-kimi'],
    [FREETIER_DEEPSEEK_V4_PRO_MODEL_ID, 'code-reviewer-deepseek'],
    [FREETIER_DEEPSEEK_V4_FLASH_MODEL_ID, 'code-reviewer-deepseek-flash'],
  ])('uses matching reviewer for model %p', (model, expectedReviewer) => {
    const base2 = createBase2('free', { model })

    expect(base2.spawnableAgents).toContain(expectedReviewer)
    expect(base2.instructionsPrompt).toContain(`Spawn a ${expectedReviewer}`)
    expect(base2.stepPrompt).toContain(`spawn a ${expectedReviewer}`)
  })
})
