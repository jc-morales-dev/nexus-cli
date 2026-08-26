/**
 * SDK environment helper for dependency injection.
 *
 * This module provides SDK-specific env helpers that extend the base
 * process env with SDK-specific vars for binary paths and WASM.
 */

import { BYOK_OPENROUTER_ENV_VAR } from '@nexus/common/constants/byok'
import { API_KEY_ENV_VAR } from '@nexus/common/constants/paths'
import { getBaseEnv } from '@nexus/common/env-process'

import type { SdkEnv } from './types/env'

/**
 * Get SDK environment values.
 * Composes from getBaseEnv() + SDK-specific vars.
 */
export const getSdkEnv = (): SdkEnv => ({
  ...getBaseEnv(),

  // SDK-specific paths
  NEXUS_RG_PATH: process.env.NEXUS_RG_PATH,
  NEXUS_WASM_DIR: process.env.NEXUS_WASM_DIR,

  // Build flags
  VERBOSE: process.env.VERBOSE,
  OVERRIDE_TARGET: process.env.OVERRIDE_TARGET,
  OVERRIDE_PLATFORM: process.env.OVERRIDE_PLATFORM,
  OVERRIDE_ARCH: process.env.OVERRIDE_ARCH,
})

export const getNexusApiKeyFromEnv = (): string | undefined => {
  return process.env[API_KEY_ENV_VAR]
}

export const getSystemProcessEnv = (): NodeJS.ProcessEnv => {
  return process.env
}

export const getByokOpenrouterApiKeyFromEnv = (): string | undefined => {
  return process.env[BYOK_OPENROUTER_ENV_VAR]
}

/** OpenRouter direct (BYOK) OpenAI-compatible endpoint. */
export const OPENROUTER_API_BASE = 'https://openrouter.ai/api/v1'

/**
 * Personal OpenRouter key (format: `sk-or-...`). When set, ALL model requests
 * go directly to OpenRouter, bypassing the Nexus backend — no Nexus
 * account or credits. OpenRouter hosts the same model ids the agents already
 * use (anthropic/*, deepseek/*, qwen/*, ...). Falls back to the legacy
 * NEXUS_BYOK_OPENROUTER var for compatibility.
 */
export const getOpenRouterApiKeyFromEnv = (): string | undefined => {
  return process.env.OPENROUTER_API_KEY || process.env[BYOK_OPENROUTER_ENV_VAR]
}

/**
 * Optional global model override. When set, EVERY agent uses this model id
 * regardless of its own definition — a single forced model (highest priority,
 * e.g. NEXUS_MODEL=deepseek/deepseek-v3.2). Takes precedence over the tiered
 * STRONG/CHEAP map below.
 */
export const getForcedModelFromEnv = (): string | undefined => {
  return process.env.NEXUS_MODEL || undefined
}

/**
 * Tiered model map. Instead of one model for everything, route the agent's
 * nominal model to a tier: STRONG for editing/reasoning agents, CHEAP for
 * utility agents (file search, context pruning). Cheaper AND more reliable,
 * since the token-heavy utility work goes to the cheap model and the critical
 * editing goes to the strong one. Used only when NEXUS_MODEL is unset.
 */
export const getStrongModelFromEnv = (): string | undefined => {
  return process.env.NEXUS_MODEL_STRONG || undefined
}

export const getCheapModelFromEnv = (): string | undefined => {
  return process.env.NEXUS_MODEL_CHEAP || undefined
}
