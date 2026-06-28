// Runs before the rest of the CLI boots. Makes NEXUS work as a distributable CLI
// (no .env file, no source needed): it loads the user's saved OpenRouter API key
// from their settings into process.env, and bakes sensible default models so the
// tiered routing works out of the box. The user only ever pastes their key once
// (via the first-run onboarding or the /key command).
import { loadOpenRouterApiKey } from '../utils/settings'

// NEXUS is always an account-less, BYOK tool — never a Codebuff account. This
// marker makes isByokDirectMode() true from the very first run (before any key
// is set), so the CLI skips the Codebuff login and onboards the user to paste
// their OpenRouter key instead.
process.env.NEXUS_MODE = '1'
// A non-empty value so the auth layer is satisfied without a real account.
if (!process.env.CODEBUFF_API_KEY) {
  process.env.CODEBUFF_API_KEY = 'nexus-byok-local'
}

const savedKey = loadOpenRouterApiKey()
if (savedKey && !process.env.OPENROUTER_API_KEY) {
  process.env.OPENROUTER_API_KEY = savedKey
}

// Default tiered models (only when the user hasn't overridden via env). STRONG
// for editing/reasoning, CHEAP for utility agents. Both cheap+reliable on
// OpenRouter; the user can change them later.
if (
  !process.env.CODEBUFF_MODEL &&
  !process.env.CODEBUFF_MODEL_STRONG &&
  !process.env.CODEBUFF_MODEL_CHEAP
) {
  process.env.CODEBUFF_MODEL_STRONG = 'deepseek/deepseek-v3.2'
  process.env.CODEBUFF_MODEL_CHEAP = 'deepseek/deepseek-v4-flash'
}
