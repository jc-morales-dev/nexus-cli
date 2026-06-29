import { describe, expect, test } from 'bun:test'

import {
  canFreeTierModelSpawnGeminiThinker,
  DEFAULT_FREETIER_MODEL_ID,
  FREETIER_DEEPSEEK_V4_FLASH_MODEL_ID,
  FREETIER_DEEPSEEK_V4_PRO_MODEL_ID,
  FREETIER_KIMI_MODEL_ID,
  LIMITED_FREETIER_MODEL_ID,
  FREETIER_MINIMAX_MODEL_ID,
  FREETIER_MODELS,
  SUPPORTED_FREETIER_MODELS,
  getFreeTierDeploymentAvailabilityLabel,
  getFreeTierModelsForAccessTier,
  isFreeTierDeploymentHours,
  isFreeTierModelId,
  isFreeTierModelAllowedForAccessTier,
  isFreeTierPremiumModelId,
  isSupportedFreeTierModelId,
  resolveFreeTierModelForAccessTier,
} from '../constants/freetier-models'

describe('freetier model availability', () => {
  test('defaults to MiniMax M2.7 for base2-free', () => {
    expect(DEFAULT_FREETIER_MODEL_ID).toBe(FREETIER_MINIMAX_MODEL_ID)
  })

  test('DeepSeek Pro carries the data-collection warning so users see it before picking', () => {
    const deepseek = FREETIER_MODELS.find(
      (m) => m.id === FREETIER_DEEPSEEK_V4_PRO_MODEL_ID,
    )
    expect(deepseek?.warning).toBe('Collects data for training')
  })

  test('DeepSeek Flash carries the data-collection warning so users see it before picking', () => {
    const deepseek = FREETIER_MODELS.find(
      (m) => m.id === FREETIER_DEEPSEEK_V4_FLASH_MODEL_ID,
    )
    expect(deepseek?.warning).toBe('Collects data for training')
  })

  test('DeepSeek V4 Flash is selectable and unlimited', () => {
    expect(FREETIER_MODELS.map((model) => model.id)).toContain(
      FREETIER_DEEPSEEK_V4_FLASH_MODEL_ID,
    )
    expect(isFreeTierModelId(FREETIER_DEEPSEEK_V4_FLASH_MODEL_ID)).toBe(true)
    expect(isFreeTierPremiumModelId(FREETIER_DEEPSEEK_V4_FLASH_MODEL_ID)).toBe(
      false,
    )
  })

  test('limited access exposes only DeepSeek V4 Flash', () => {
    expect(LIMITED_FREETIER_MODEL_ID).toBe(FREETIER_DEEPSEEK_V4_FLASH_MODEL_ID)
    expect(getFreeTierModelsForAccessTier('limited').map((m) => m.id)).toEqual([
      FREETIER_DEEPSEEK_V4_FLASH_MODEL_ID,
    ])
    expect(
      isFreeTierModelAllowedForAccessTier(
        FREETIER_DEEPSEEK_V4_FLASH_MODEL_ID,
        'limited',
      ),
    ).toBe(true)
    expect(
      isFreeTierModelAllowedForAccessTier(FREETIER_MINIMAX_MODEL_ID, 'limited'),
    ).toBe(false)
    expect(
      resolveFreeTierModelForAccessTier(FREETIER_MINIMAX_MODEL_ID, 'limited'),
    ).toBe(FREETIER_DEEPSEEK_V4_FLASH_MODEL_ID)
  })

  test('only smart freetier models can spawn the gemini-thinker subagent', () => {
    expect(canFreeTierModelSpawnGeminiThinker(FREETIER_KIMI_MODEL_ID)).toBe(
      true,
    )
    expect(
      canFreeTierModelSpawnGeminiThinker(FREETIER_DEEPSEEK_V4_PRO_MODEL_ID),
    ).toBe(true)
    expect(canFreeTierModelSpawnGeminiThinker(FREETIER_MINIMAX_MODEL_ID)).toBe(
      false,
    )
    expect(
      canFreeTierModelSpawnGeminiThinker(FREETIER_DEEPSEEK_V4_FLASH_MODEL_ID),
    ).toBe(false)
  })

  test('does not support GLM 5.1 for freetier sessions', () => {
    const glm = 'z-ai/glm-5.1'
    expect(FREETIER_MODELS.map((model) => model.id)).not.toContain(glm)
    expect(SUPPORTED_FREETIER_MODELS.map((model) => model.id)).not.toContain(
      glm,
    )
    expect(isFreeTierModelId(glm)).toBe(false)
    expect(isSupportedFreeTierModelId(glm)).toBe(false)
  })

  test('formats the close time in the user local timezone while deployment is open', () => {
    expect(
      getFreeTierDeploymentAvailabilityLabel(new Date('2026-01-05T18:00:00Z'), {
        locale: 'en-US',
        timeZone: 'America/Los_Angeles',
      }),
    ).toBe('until 5:00 PM')
  })

  test('formats the next open time in the user local timezone while deployment is closed', () => {
    expect(
      getFreeTierDeploymentAvailabilityLabel(new Date('2026-01-05T12:00:00Z'), {
        locale: 'en-US',
        timeZone: 'America/Los_Angeles',
      }),
    ).toBe('opens 6:00 AM')
  })

  test('includes the weekday when the next opening is on a later local day', () => {
    expect(
      getFreeTierDeploymentAvailabilityLabel(new Date('2026-01-11T03:00:00Z'), {
        locale: 'en-US',
        timeZone: 'America/Los_Angeles',
      }),
    ).toBe('opens Sun 6:00 AM')
  })

  test('tracks deployment hours correctly across the open and close boundaries', () => {
    expect(isFreeTierDeploymentHours(new Date('2026-01-05T13:59:00Z'))).toBe(
      false,
    )
    expect(isFreeTierDeploymentHours(new Date('2026-01-05T14:00:00Z'))).toBe(
      true,
    )
    expect(isFreeTierDeploymentHours(new Date('2026-01-06T00:59:00Z'))).toBe(
      true,
    )
    expect(isFreeTierDeploymentHours(new Date('2026-01-06T01:00:00Z'))).toBe(
      false,
    )
    expect(isFreeTierDeploymentHours(new Date('2026-01-10T20:00:00Z'))).toBe(
      true,
    )
  })
})
