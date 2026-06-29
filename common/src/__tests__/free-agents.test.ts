import { describe, expect, test } from 'bun:test'

import {
  FREETIER_DEEPSEEK_V4_FLASH_MODEL_ID,
  FREETIER_DEEPSEEK_V4_PRO_MODEL_ID,
  FREETIER_GEMINI_PRO_MODEL_ID,
  FREETIER_KIMI_MODEL_ID,
  FREETIER_MINIMAX_MODEL_ID,
} from '../constants/freetier-models'
import { FREETIER_GEMINI_THINKER_AGENT_ID } from '../constants/freetier-gemini-thinker'
import {
  getFreeTierRootAgentIdForModel,
  isFreeTierGeminiThinkerAgent,
  isFreeModeAllowedAgentModel,
  shouldUseLocalTokenCountForFreeTierDeepseekFlash,
} from '../constants/free-agents'

describe('free mode agent model allowlist', () => {
  test('maps selectable freetier models to concrete root agents', () => {
    expect(getFreeTierRootAgentIdForModel(FREETIER_MINIMAX_MODEL_ID)).toBe(
      'base2-free',
    )
    expect(getFreeTierRootAgentIdForModel(FREETIER_KIMI_MODEL_ID)).toBe(
      'base2-free-kimi',
    )
    expect(
      getFreeTierRootAgentIdForModel(FREETIER_DEEPSEEK_V4_PRO_MODEL_ID),
    ).toBe('base2-free-deepseek')
    expect(
      getFreeTierRootAgentIdForModel(FREETIER_DEEPSEEK_V4_FLASH_MODEL_ID),
    ).toBe('base2-free-deepseek-flash')
  })

  test('allows each freetier root agent only with its configured model', () => {
    expect(
      isFreeModeAllowedAgentModel('base2-free', FREETIER_MINIMAX_MODEL_ID),
    ).toBe(true)
    expect(
      isFreeModeAllowedAgentModel(
        'base2-free',
        FREETIER_DEEPSEEK_V4_PRO_MODEL_ID,
      ),
    ).toBe(true)
    expect(
      isFreeModeAllowedAgentModel('base2-free', FREETIER_KIMI_MODEL_ID),
    ).toBe(true)
    expect(
      isFreeModeAllowedAgentModel('base2-free-kimi', FREETIER_KIMI_MODEL_ID),
    ).toBe(true)
    expect(
      isFreeModeAllowedAgentModel(
        'base2-free-deepseek',
        FREETIER_DEEPSEEK_V4_PRO_MODEL_ID,
      ),
    ).toBe(true)
    expect(
      isFreeModeAllowedAgentModel(
        'base2-free-deepseek-flash',
        FREETIER_DEEPSEEK_V4_FLASH_MODEL_ID,
      ),
    ).toBe(true)
  })

  test('allows each freetier reviewer agent only with its configured model', () => {
    expect(
      isFreeModeAllowedAgentModel(
        'code-reviewer-minimax',
        FREETIER_MINIMAX_MODEL_ID,
      ),
    ).toBe(true)
    expect(
      isFreeModeAllowedAgentModel(
        'code-reviewer-minimax',
        FREETIER_KIMI_MODEL_ID,
      ),
    ).toBe(false)
    expect(
      isFreeModeAllowedAgentModel('code-reviewer-kimi', FREETIER_KIMI_MODEL_ID),
    ).toBe(true)
    expect(
      isFreeModeAllowedAgentModel(
        'code-reviewer-deepseek',
        FREETIER_DEEPSEEK_V4_PRO_MODEL_ID,
      ),
    ).toBe(true)
    expect(
      isFreeModeAllowedAgentModel(
        'code-reviewer-deepseek-flash',
        FREETIER_DEEPSEEK_V4_FLASH_MODEL_ID,
      ),
    ).toBe(true)
  })

  test('allows legacy code-reviewer-lite with freetier reviewer models', () => {
    expect(
      isFreeModeAllowedAgentModel(
        'code-reviewer-lite',
        FREETIER_MINIMAX_MODEL_ID,
      ),
    ).toBe(true)
    expect(
      isFreeModeAllowedAgentModel('code-reviewer-lite', FREETIER_KIMI_MODEL_ID),
    ).toBe(true)
    expect(
      isFreeModeAllowedAgentModel(
        'code-reviewer-lite',
        FREETIER_DEEPSEEK_V4_PRO_MODEL_ID,
      ),
    ).toBe(true)
    expect(
      isFreeModeAllowedAgentModel(
        'code-reviewer-lite',
        FREETIER_DEEPSEEK_V4_FLASH_MODEL_ID,
      ),
    ).toBe(true)
  })

  test('allows the browser-use subagent with its bundled model', () => {
    expect(
      isFreeModeAllowedAgentModel(
        'browser-use',
        'google/gemini-3.1-flash-lite-preview',
      ),
    ).toBe(true)
  })

  test('allows the tmux-cli subagent with its bundled model', () => {
    expect(
      isFreeModeAllowedAgentModel('tmux-cli', FREETIER_MINIMAX_MODEL_ID),
    ).toBe(true)
    expect(
      isFreeModeAllowedAgentModel(
        'nexus/tmux-cli@0.0.1',
        FREETIER_MINIMAX_MODEL_ID,
      ),
    ).toBe(true)
    expect(
      isFreeModeAllowedAgentModel(
        'other/tmux-cli@0.0.1',
        FREETIER_MINIMAX_MODEL_ID,
      ),
    ).toBe(false)
  })

  test('allows Gemini Pro for the thinker subagent but not the freetier root', () => {
    expect(
      isFreeModeAllowedAgentModel('base2-free', FREETIER_GEMINI_PRO_MODEL_ID),
    ).toBe(false)
    expect(
      isFreeModeAllowedAgentModel(
        FREETIER_GEMINI_THINKER_AGENT_ID,
        FREETIER_GEMINI_PRO_MODEL_ID,
      ),
    ).toBe(true)
  })

  test('recognizes the Gemini thinker agent in free mode', () => {
    expect(isFreeTierGeminiThinkerAgent(FREETIER_GEMINI_THINKER_AGENT_ID)).toBe(
      true,
    )
    expect(
      isFreeTierGeminiThinkerAgent(
        `nexus/${FREETIER_GEMINI_THINKER_AGENT_ID}@0.0.1`,
      ),
    ).toBe(true)
    expect(
      isFreeTierGeminiThinkerAgent(
        `other/${FREETIER_GEMINI_THINKER_AGENT_ID}@0.0.1`,
      ),
    ).toBe(false)
  })

  test('uses local token count only for the DeepSeek Flash freetier root', () => {
    expect(
      shouldUseLocalTokenCountForFreeTierDeepseekFlash({
        agentId: 'base2-free-deepseek-flash',
        model: FREETIER_DEEPSEEK_V4_FLASH_MODEL_ID,
      }),
    ).toBe(true)
    expect(
      shouldUseLocalTokenCountForFreeTierDeepseekFlash({
        agentId: 'nexus/base2-free-deepseek-flash@0.0.1',
        model: FREETIER_DEEPSEEK_V4_FLASH_MODEL_ID,
      }),
    ).toBe(true)
    expect(
      shouldUseLocalTokenCountForFreeTierDeepseekFlash({
        agentId: 'base2-free-deepseek',
        model: FREETIER_DEEPSEEK_V4_FLASH_MODEL_ID,
      }),
    ).toBe(false)
    expect(
      shouldUseLocalTokenCountForFreeTierDeepseekFlash({
        agentId: 'base2-free-deepseek-flash',
        model: FREETIER_DEEPSEEK_V4_PRO_MODEL_ID,
      }),
    ).toBe(false)
    expect(
      shouldUseLocalTokenCountForFreeTierDeepseekFlash({
        agentId: 'other/base2-free-deepseek-flash@0.0.1',
        model: FREETIER_DEEPSEEK_V4_FLASH_MODEL_ID,
      }),
    ).toBe(false)
  })
})
