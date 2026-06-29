import fs from 'fs'
import path from 'path'

import { isFreeTierModelId } from '@nexus/common/constants/freetier-models'

import { getConfigDir } from './auth'
import { AGENT_MODES } from './constants'
import { logger } from './logger'

import type { AgentMode } from './constants'

const DEFAULT_SETTINGS: Settings = {
  mode: 'DEFAULT' as const,
  adsEnabled: true,
}

// Note: The old FREE mode has been renamed back to LITE; migrate on load.

/**
 * Settings schema - add new settings here as the product evolves
 */
export interface Settings {
  mode?: AgentMode
  adsEnabled?: boolean
  /** The user's own OpenRouter API key (format: sk-or-...). Stored in the user's
   *  config dir so NEXUS works as a distributable CLI without editing any .env
   *  or having the source. Injected into process.env.OPENROUTER_API_KEY at start. */
  openRouterApiKey?: string
  /** The user's chosen main (STRONG-tier) model id — the model NEXUS uses for
   *  reasoning and editing. Picked via /model and persisted here so it survives
   *  restarts. Loaded into process.env.NEXUS_MODEL_STRONG at start. Utility
   *  agents keep using the cheap tier, so this only changes the "smart" model. */
  nexusModel?: string
  /** Last model the user picked in the freetier model selector. Restored on
   *  next freetier launch so users land in the queue for their preferred
   *  model without re-picking. Persisted as the canonical model id. */
  freetierModel?: string
  /** @deprecated Use server-side fallbackToALaCarte setting instead */
  alwaysUseALaCarte?: boolean
  /** @deprecated Use server-side fallbackToALaCarte setting instead */
  fallbackToALaCarte?: boolean
}

/**
 * Get the settings file path
 */
export const getSettingsPath = (): string => {
  return path.join(getConfigDir(), 'settings.json')
}

/**
 * Ensure the config directory exists, creating it if necessary
 */
const ensureConfigDirExists = (): void => {
  const configDir = getConfigDir()
  if (!fs.existsSync(configDir)) {
    fs.mkdirSync(configDir, { recursive: true })
  }
}

/**
 * Load all settings from file system
 * @returns The saved settings object, with defaults for missing values
 */
export const loadSettings = (): Settings => {
  const settingsPath = getSettingsPath()

  if (!fs.existsSync(settingsPath)) {
    ensureConfigDirExists()
    // Create default settings file
    fs.writeFileSync(settingsPath, JSON.stringify(DEFAULT_SETTINGS, null, 2))
    return DEFAULT_SETTINGS
  }

  try {
    const settingsFile = fs.readFileSync(settingsPath, 'utf8')
    const parsed = JSON.parse(settingsFile)
    return validateSettings(parsed)
  } catch (error) {
    logger.debug(
      {
        error: error instanceof Error ? error.message : String(error),
      },
      'Error reading settings',
    )
    return {}
  }
}

/**
 * Validate and sanitize settings from file
 */
const validateSettings = (parsed: unknown): Settings => {
  if (typeof parsed !== 'object' || parsed === null) {
    return {}
  }

  const settings: Settings = {}
  const obj = parsed as Record<string, unknown>

  // Validate mode; migrate the previously-saved 'FREE' value to 'LITE'.
  if (typeof obj.mode === 'string') {
    const normalized = obj.mode === 'FREE' ? 'LITE' : obj.mode
    if (AGENT_MODES.includes(normalized as AgentMode)) {
      settings.mode = normalized as AgentMode
    }
  }

  // Validate adsEnabled
  if (typeof obj.adsEnabled === 'boolean') {
    settings.adsEnabled = obj.adsEnabled
  }

  // Validate openRouterApiKey — any non-empty string is accepted.
  if (
    typeof obj.openRouterApiKey === 'string' &&
    obj.openRouterApiKey.trim().length > 0
  ) {
    settings.openRouterApiKey = obj.openRouterApiKey.trim()
  }

  // Validate nexusModel — any non-empty model id string is accepted (the
  // OpenRouter catalog changes constantly, so we don't gate on a fixed list).
  if (
    typeof obj.nexusModel === 'string' &&
    obj.nexusModel.trim().length > 0
  ) {
    settings.nexusModel = obj.nexusModel.trim()
  }

  // Validate freetierModel — drop unknown ids so a removed model doesn't
  // strand the user on a non-existent queue.
  if (typeof obj.freetierModel === 'string' && isFreeTierModelId(obj.freetierModel)) {
    settings.freetierModel = obj.freetierModel
  }

  // Validate alwaysUseALaCarte (legacy)
  if (typeof obj.alwaysUseALaCarte === 'boolean') {
    settings.alwaysUseALaCarte = obj.alwaysUseALaCarte
  }

  // Validate fallbackToALaCarte (legacy)
  if (typeof obj.fallbackToALaCarte === 'boolean') {
    settings.fallbackToALaCarte = obj.fallbackToALaCarte
  }

  return settings
}

/**
 * Save settings to file system (merges with existing settings)
 */
export const saveSettings = (newSettings: Partial<Settings>): void => {
  const settingsPath = getSettingsPath()

  try {
    ensureConfigDirExists()

    // Load existing settings and merge
    const existingSettings = loadSettings()
    const mergedSettings = { ...existingSettings, ...newSettings }

    fs.writeFileSync(settingsPath, JSON.stringify(mergedSettings, null, 2))
  } catch (error) {
    logger.debug(
      {
        error: error instanceof Error ? error.message : String(error),
      },
      'Error saving settings',
    )
  }
}

/**
 * Load the saved agent mode preference
 * @returns The saved mode, or 'DEFAULT' if not found or invalid
 */
export const loadModePreference = (): AgentMode => {
  const settings = loadSettings()
  return settings.mode ?? 'DEFAULT'
}

/**
 * Save the agent mode preference
 */
export const saveModePreference = (mode: AgentMode): void => {
  saveSettings({ mode })
}

/**
 * Load the saved freetier model preference. Returns undefined if none is
 * saved yet — callers should fall back to DEFAULT_FREETIER_MODEL_ID.
 */
export const loadFreeTierModelPreference = (): string | undefined => {
  return loadSettings().freetierModel
}

/**
 * Save the freetier model preference. Called whenever the user picks a model
 * in the waiting room so the next launch defaults to it.
 */
export const saveFreeTierModelPreference = (model: string): void => {
  saveSettings({ freetierModel: model })
}

/** Load the user's saved OpenRouter API key, or undefined if none is set. */
export const loadOpenRouterApiKey = (): string | undefined => {
  return loadSettings().openRouterApiKey
}

/** Persist the user's OpenRouter API key to their config dir. */
export const saveOpenRouterApiKey = (key: string): void => {
  saveSettings({ openRouterApiKey: key.trim() })
}

/** Remove the saved OpenRouter API key. */
export const clearOpenRouterApiKey = (): void => {
  saveSettings({ openRouterApiKey: undefined })
}

/** Load the user's chosen main (STRONG-tier) model id, or undefined if none. */
export const loadNexusModel = (): string | undefined => {
  return loadSettings().nexusModel
}

/** Persist the user's chosen main model id (set via /model). */
export const saveNexusModel = (model: string): void => {
  saveSettings({ nexusModel: model.trim() })
}

/** Clear the saved model preference (fall back to the built-in default). */
export const clearNexusModel = (): void => {
  saveSettings({ nexusModel: undefined })
}

