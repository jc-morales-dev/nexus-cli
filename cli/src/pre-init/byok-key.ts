// Runs before the rest of the CLI boots. Makes NEXUS work as a distributable CLI
// (no .env file, no source needed): it loads the user's saved OpenRouter API key
// from their settings into process.env, and bakes sensible default models so the
// tiered routing works out of the box. The user only ever pastes their key once
// (via the first-run onboarding or the /key command).
//
// Shape note: this is an exported function CALLED from the entry point, not a
// side-effect-only import. bun build --compile tree-shook the side-effect module
// out of the compiled binary entirely (the sideEffects glob in package.json is
// not honored), which silently broke account-less boot and saved-key loading in
// the distributed .exe. An explicit call cannot be stripped.
import { loadOpenRouterApiKey, loadNexusModel } from '../utils/settings'

export function initByokKey(): void {
  // NEXUS is always an account-less, BYOK tool — never a Nexus account. This
  // marker makes isByokDirectMode() true from the very first run (before any key
  // is set), so the CLI skips the Nexus login and onboards the user to paste
  // their OpenRouter key instead.
  process.env.NEXUS_MODE = '1'
  // A non-empty value so the auth layer is satisfied without a real account.
  if (!process.env.NEXUS_API_KEY) {
    process.env.NEXUS_API_KEY = 'nexus-byok-local'
  }

  const savedKey = loadOpenRouterApiKey()
  if (savedKey && !process.env.OPENROUTER_API_KEY) {
    process.env.OPENROUTER_API_KEY = savedKey
  }

  // Tiered models — single source of truth so the user's /model pick persists and
  // the distributable binary works with no .env. An explicit NEXUS_MODEL (a
  // forced single-model override) disables the tiered map entirely, so respect it.
  //   STRONG = reasoning/editing (the "smart" model the user picks via /model)
  //   CHEAP  = utility agents (file search, context pruning) — kept cheap to save
  //            tokens while quality work still runs on STRONG.
  const STRONG_DEFAULT = 'deepseek/deepseek-v3.2'
  const CHEAP_DEFAULT = 'deepseek/deepseek-v4-flash'
  if (!process.env.NEXUS_MODEL) {
    // The user's saved /model pick wins over the baked default (and over a STRONG
    // value inherited from a dev .env), so changing the model actually sticks.
    const savedModel = loadNexusModel()
    if (savedModel) {
      process.env.NEXUS_MODEL_STRONG = savedModel
    } else if (!process.env.NEXUS_MODEL_STRONG) {
      process.env.NEXUS_MODEL_STRONG = STRONG_DEFAULT
    }
    if (!process.env.NEXUS_MODEL_CHEAP) {
      process.env.NEXUS_MODEL_CHEAP = CHEAP_DEFAULT
    }
  }
}
