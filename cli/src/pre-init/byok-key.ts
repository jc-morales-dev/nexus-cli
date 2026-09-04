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
import { NEXUS_DEFAULT_MODEL, isRetiredNexusModel } from '../data/nexus-models'
import {
  loadOpenRouterApiKey,
  loadNexusModel,
  clearNexusModel,
} from '../utils/settings'

/**
 * Settings accessors, injectable so tests can drive the retired-model migration
 * without touching the real config file.
 *
 * Injected rather than module-mocked on purpose: `mock.module` in Bun swaps the
 * module for the WHOLE test process, so stubbing `../utils/settings` here leaks
 * into every other test file that reads settings (it silently broke the API
 * integration suite when this was first written). Same shape as AnalyticsDeps in
 * utils/analytics.ts.
 */
export interface ByokSettingsDeps {
  loadOpenRouterApiKey: () => string | undefined
  loadNexusModel: () => string | undefined
  clearNexusModel: () => void
}

const defaultDeps: ByokSettingsDeps = {
  loadOpenRouterApiKey,
  loadNexusModel,
  clearNexusModel,
}

export function initByokKey(deps: ByokSettingsDeps = defaultDeps): void {
  // NEXUS is always an account-less, BYOK tool — never a Nexus account. This
  // marker makes isByokDirectMode() true from the very first run (before any key
  // is set), so the CLI skips the Nexus login and onboards the user to paste
  // their OpenRouter key instead.
  process.env.NEXUS_MODE = '1'
  // A non-empty value so the auth layer is satisfied without a real account.
  if (!process.env.NEXUS_API_KEY) {
    process.env.NEXUS_API_KEY = 'nexus-byok-local'
  }

  const savedKey = deps.loadOpenRouterApiKey()
  if (savedKey && !process.env.OPENROUTER_API_KEY) {
    process.env.OPENROUTER_API_KEY = savedKey
  }

  // Tiered models — single source of truth so the user's /model pick persists and
  // the distributable binary works with no .env. An explicit NEXUS_MODEL (a
  // forced single-model override) disables the tiered map entirely, so respect it.
  //   STRONG = reasoning/editing (the "smart" model the user picks via /model)
  //   CHEAP  = utility agents (file search, context pruning) — kept cheap to save
  //            tokens while quality work still runs on STRONG.
  // Single source of truth with the /model picker — a default that lives in two
  // places drifts, and the boot value is the one that actually reaches the API.
  const STRONG_DEFAULT = NEXUS_DEFAULT_MODEL
  const CHEAP_DEFAULT = 'deepseek/deepseek-v4-flash'
  if (!process.env.NEXUS_MODEL) {
    // The user's saved /model pick wins over the baked default (and over a STRONG
    // value inherited from a dev .env), so changing the model actually sticks.
    //
    // Unless OpenRouter retired it. A saved id outlives the catalog, so shipping
    // a new default is not enough on its own: anyone who had picked the old
    // default would keep sending requests to a model that no longer exists and
    // would get an error instead of a completion on every single turn. Drop the
    // stale preference (once — it's persisted) and fall through to the default.
    let savedModel = deps.loadNexusModel()
    if (savedModel && isRetiredNexusModel(savedModel)) {
      try {
        deps.clearNexusModel()
      } catch {
        // A read-only config dir must not stop the CLI from booting; the
        // in-memory fallback below still gets the user a working model.
      }
      savedModel = undefined
    }

    if (savedModel) {
      process.env.NEXUS_MODEL_STRONG = savedModel
    } else if (
      !process.env.NEXUS_MODEL_STRONG ||
      isRetiredNexusModel(process.env.NEXUS_MODEL_STRONG)
    ) {
      process.env.NEXUS_MODEL_STRONG = STRONG_DEFAULT
    }
    if (!process.env.NEXUS_MODEL_CHEAP) {
      process.env.NEXUS_MODEL_CHEAP = CHEAP_DEFAULT
    }
  }
}
