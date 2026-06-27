/**
 * SDK environment helper for dependency injection.
 *
 * This module provides SDK-specific env helpers that extend the base
 * process env with SDK-specific vars for binary paths and WASM.
 */

import { BYOK_OPENROUTER_ENV_VAR } from '@codebuff/common/constants/byok'
import { CHATGPT_OAUTH_TOKEN_ENV_VAR } from '@codebuff/common/constants/chatgpt-oauth'
import { API_KEY_ENV_VAR } from '@codebuff/common/constants/paths'
import { getBaseEnv } from '@codebuff/common/env-process'

import type { SdkEnv } from './types/env'

/**
 * Get SDK environment values.
 * Composes from getBaseEnv() + SDK-specific vars.
 */
export const getSdkEnv = (): SdkEnv => ({
  ...getBaseEnv(),

  // SDK-specific paths
  CODEBUFF_RG_PATH: process.env.CODEBUFF_RG_PATH,
  CODEBUFF_WASM_DIR: process.env.CODEBUFF_WASM_DIR,

  // Build flags
  VERBOSE: process.env.VERBOSE,
  OVERRIDE_TARGET: process.env.OVERRIDE_TARGET,
  OVERRIDE_PLATFORM: process.env.OVERRIDE_PLATFORM,
  OVERRIDE_ARCH: process.env.OVERRIDE_ARCH,
})

export const getCodebuffApiKeyFromEnv = (): string | undefined => {
  return process.env[API_KEY_ENV_VAR]
}

export const getSystemProcessEnv = (): NodeJS.ProcessEnv => {
  return process.env
}

export const getByokOpenrouterApiKeyFromEnv = (): string | undefined => {
  return process.env[BYOK_OPENROUTER_ENV_VAR]
}

/** Default NVIDIA NIM (build.nvidia.com) OpenAI-compatible inference endpoint. */
export const NVIDIA_API_BASE_DEFAULT = 'https://integrate.api.nvidia.com/v1'

/**
 * Personal NVIDIA API key (format: `nvapi-...`) for direct, BYOK inference
 * against NVIDIA NIM. When set, models whose id is routed by `isNvidiaModel`
 * bypass the Codebuff backend and hit NVIDIA directly. Each user brings their
 * own free key, so no Codebuff account or credits are required.
 */
export const getNvidiaApiKeyFromEnv = (): string | undefined => {
  return process.env.NVIDIA_API_KEY
}

/** Override the NVIDIA inference base URL (defaults to NVIDIA_API_BASE_DEFAULT). */
export const getNvidiaApiBaseFromEnv = (): string => {
  return process.env.NVIDIA_API_BASE || NVIDIA_API_BASE_DEFAULT
}

/**
 * Get ChatGPT OAuth token from environment variable.
 */
export const getChatGptOAuthTokenFromEnv = (): string | undefined => {
  return process.env[CHATGPT_OAUTH_TOKEN_ENV_VAR]
}
