export const BYOK_OPENROUTER_HEADER = 'x-openrouter-api-key'
export const BYOK_OPENROUTER_ENV_VAR = 'CODEBUFF_BYOK_OPENROUTER'

/**
 * True when the user has configured a direct BYOK provider (OpenRouter or
 * NVIDIA). In this mode inference goes straight to the provider with the user's
 * own key, so a Codebuff account, login, credits, and backend are NOT needed —
 * auth/credit gates are skipped and user lookups return a local stub.
 */
export function isByokDirectMode(): boolean {
  return Boolean(
    process.env.NEXUS_MODE ||
      process.env.OPENROUTER_API_KEY ||
      process.env[BYOK_OPENROUTER_ENV_VAR] ||
      process.env.NVIDIA_API_KEY,
  )
}

/** Synthetic user returned for user-info lookups while in BYOK direct mode. */
export const BYOK_STUB_USER: Record<string, unknown> = {
  id: 'byok-local-user',
  email: 'byok@local',
}
