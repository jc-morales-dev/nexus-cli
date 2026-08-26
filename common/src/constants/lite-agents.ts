/**
 * Model routing for the LITE agent lineup.
 *
 * These are the non-Claude OpenRouter models NEXUS runs its "lite" orchestrator
 * and its matching reviewer/thinker subagents on. Nothing here is tied to a
 * hosted free tier: `base2-lite` (and the reviewer + gemini-thinker subagents it
 * spawns) uses this in the ordinary BYOK path.
 */

/** Default model for `base2-lite`. Kimi is the balanced pick and its provider
 *  does not train on user data, which matters because the CLI has no
 *  data-retention surface to warn through. */
export const LITE_KIMI_MODEL_ID = 'moonshotai/kimi-k2.6'
export const LITE_MINIMAX_MODEL_ID = 'minimax/minimax-m2.7'
export const LITE_DEEPSEEK_PRO_MODEL_ID = 'deepseek/deepseek-v4-pro'
export const LITE_DEEPSEEK_FLASH_MODEL_ID = 'deepseek/deepseek-v4-flash'

/**
 * Models smart enough to benefit from offloading deep reasoning to the
 * gemini-thinker subagent. Fast models (MiniMax, DeepSeek Flash) skip it: the
 * extra round-trip would defeat the point of picking them.
 */
export const GEMINI_THINKER_PARENT_MODELS = new Set<string>([
  LITE_KIMI_MODEL_ID,
  LITE_DEEPSEEK_PRO_MODEL_ID,
])

export function canModelSpawnGeminiThinker(modelId: string): boolean {
  return GEMINI_THINKER_PARENT_MODELS.has(modelId)
}

/**
 * Which reviewer subagent a lite orchestrator spawns, keyed by the model it is
 * itself running on. Keeping reviewer and orchestrator on the same model avoids
 * mixing providers mid-task. Callers fall back to `code-reviewer-lite` for
 * models that aren't in this table.
 */
export const REVIEWER_AGENT_ID_BY_MODEL: Record<string, string> = {
  [LITE_MINIMAX_MODEL_ID]: 'code-reviewer-minimax',
  [LITE_KIMI_MODEL_ID]: 'code-reviewer-kimi',
  [LITE_DEEPSEEK_PRO_MODEL_ID]: 'code-reviewer-deepseek',
  [LITE_DEEPSEEK_FLASH_MODEL_ID]: 'code-reviewer-deepseek-flash',
}

