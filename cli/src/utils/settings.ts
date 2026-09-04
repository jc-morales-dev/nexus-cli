import fs from 'fs'
import path from 'path'

import { registerSecret, unregisterSecret } from '@nexus/common/util/redact'

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
 * settings.json holds the user's provider key in plain text, so it is written
 * owner-only. On Windows these bits are ignored by the filesystem; the ACL
 * inherited from the user's profile directory is what applies there.
 */
const SETTINGS_FILE_MODE = 0o600
const CONFIG_DIR_MODE = 0o700

/**
 * Ensure the config directory exists, creating it if necessary
 */
const ensureConfigDirExists = (): void => {
  const configDir = getConfigDir()
  if (!fs.existsSync(configDir)) {
    fs.mkdirSync(configDir, { recursive: true, mode: CONFIG_DIR_MODE })
  }
}

/**
 * Write settings.json with owner-only permissions.
 *
 * `writeFileSync`'s mode only applies when the file is created, so an existing
 * world-readable file — left by an older NEXUS, or by a permissive umask — is
 * tightened explicitly. Failures are ignored: a settings file that can't be
 * chmod'ed (network share, exotic filesystem) is still better than a CLI that
 * refuses to start.
 */
const writeSettingsFile = (settingsPath: string, contents: string): void => {
  fs.writeFileSync(settingsPath, contents, { mode: SETTINGS_FILE_MODE })
  try {
    fs.chmodSync(settingsPath, SETTINGS_FILE_MODE)
  } catch {
    // Permission bits are advisory on some platforms; don't fail the write.
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
    writeSettingsFile(settingsPath, JSON.stringify(DEFAULT_SETTINGS, null, 2))
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

    writeSettingsFile(settingsPath, JSON.stringify(mergedSettings, null, 2))
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
 * Load the user's saved OpenRouter API key, or undefined if none is set.
 *
 * Registers the key with the redactor on the way out: this is the earliest
 * point at which the process knows the value, and every reader of the key goes
 * through here.
 */
export const loadOpenRouterApiKey = (): string | undefined => {
  const key = loadSettings().openRouterApiKey
  registerSecret(key)
  return key
}

/** Persist the user's OpenRouter API key to their config dir. */
export const saveOpenRouterApiKey = (key: string): void => {
  const trimmed = key.trim()
  // Registered here rather than at the call sites so no future caller of
  // saveOpenRouterApiKey can introduce a key the redactor doesn't know about.
  registerSecret(trimmed)
  saveSettings({ openRouterApiKey: trimmed })
}

/** Remove the saved OpenRouter API key. */
export const clearOpenRouterApiKey = (): void => {
  unregisterSecret(loadSettings().openRouterApiKey)
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

