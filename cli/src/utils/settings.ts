import fs from 'fs'
import path from 'path'

import { registerSecret, unregisterSecret } from '@nexus/common/util/redact'

import { getConfigDir } from './auth'
import { AGENT_MODES } from './constants'
import { logger } from './logger'
import { isProviderId } from '../data/providers'

import type { AgentMode } from './constants'
import type { ProviderId } from '../data/providers'

const DEFAULT_SETTINGS: Settings = {
  mode: 'DEFAULT' as const,
  adsEnabled: true,
}

// Note: The old FREE mode has been renamed back to LITE; migrate on load.

/** Credenciales guardadas de un proveedor. */
export interface ProviderCredentials {
  /** Key pegada por el usuario. Ausente en los proveedores de tipo OAuth. */
  apiKey?: string
}

/**
 * El modelo en uso, con su proveedor pegado.
 *
 * Nunca se guarda el id del modelo suelto: `gpt-5.2` existe en OpenAI y en
 * OpenRouter (como `openai/gpt-5.2`), con facturas distintas. Ver
 * `data/providers.ts`.
 */
export interface ActiveModel {
  provider: ProviderId
  model: string
}

/**
 * Settings schema - add new settings here as the product evolves
 */
export interface Settings {
  mode?: AgentMode
  adsEnabled?: boolean
  /** Credenciales por proveedor. Sustituye a `openRouterApiKey`, que se sigue
   *  leyendo y migrando pero ya no es la fuente de verdad. */
  providers?: Partial<Record<ProviderId, ProviderCredentials>>
  /** Proveedor + modelo en uso. Sustituye a `nexusModel`. */
  activeModel?: ActiveModel
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
 * Traduce los campos sueltos de la época de un solo proveedor al formato nuevo.
 *
 * Se ejecuta en cada carga y es idempotente. Los campos viejos NO se borran a
 * propósito: si el usuario vuelve a una versión anterior de NEXUS —o tiene dos
 * instaladas— esa versión solo entiende `openRouterApiKey` y `nexusModel`, y
 * borrarlos le dejaría el CLI sin key. Ocupan nada; que convivan.
 *
 * Lo nuevo manda: si ya hay `providers.openrouter`, el campo viejo se ignora.
 */
export const migrateLegacyProviderSettings = (settings: Settings): Settings => {
  const migrated: Settings = { ...settings }

  if (settings.openRouterApiKey && !settings.providers?.openrouter?.apiKey) {
    migrated.providers = {
      ...settings.providers,
      openrouter: {
        ...settings.providers?.openrouter,
        apiKey: settings.openRouterApiKey,
      },
    }
  }

  if (settings.nexusModel && !settings.activeModel) {
    // Todo lo guardado antes de esto pasaba por OpenRouter, que era el único
    // proveedor que existía.
    migrated.activeModel = {
      provider: 'openrouter',
      model: settings.nexusModel,
    }
  }

  return migrated
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
    // La migración va en memoria, no reescribe el fichero: cargar los ajustes
    // pasa muchas veces por ejecución y no debe tocar el disco. El formato
    // nuevo se persiste la primera vez que el usuario guarda algo.
    return migrateLegacyProviderSettings(validateSettings(parsed))
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
  if (typeof obj.nexusModel === 'string' && obj.nexusModel.trim().length > 0) {
    settings.nexusModel = obj.nexusModel.trim()
  }

  // Validate providers — un mapa de proveedor conocido a sus credenciales. Los
  // ids que no reconocemos se descartan en silencio en vez de arrastrarse: si
  // el usuario vuelve de una versión más nueva con un proveedor que esta no
  // entiende, es preferible ignorarlo a intentar llamarlo.
  if (typeof obj.providers === 'object' && obj.providers !== null) {
    const raw = obj.providers as Record<string, unknown>
    const providers: Partial<Record<ProviderId, ProviderCredentials>> = {}
    for (const [id, value] of Object.entries(raw)) {
      if (!isProviderId(id)) continue
      if (typeof value !== 'object' || value === null) continue
      const apiKey = (value as Record<string, unknown>).apiKey
      if (typeof apiKey === 'string' && apiKey.trim().length > 0) {
        providers[id] = { apiKey: apiKey.trim() }
      } else {
        // Un proveedor sin key sigue siendo un proveedor configurado: es el
        // caso de Codex, que se autentica por navegador y no guarda key.
        providers[id] = {}
      }
    }
    if (Object.keys(providers).length > 0) {
      settings.providers = providers
    }
  }

  // Validate activeModel — el par proveedor+modelo. Si falta cualquiera de las
  // dos mitades se descarta entero: medio par no sirve para enrutar nada.
  if (typeof obj.activeModel === 'object' && obj.activeModel !== null) {
    const am = obj.activeModel as Record<string, unknown>
    if (
      isProviderId(am.provider) &&
      typeof am.model === 'string' &&
      am.model.trim().length > 0
    ) {
      settings.activeModel = {
        provider: am.provider,
        model: am.model.trim(),
      }
    }
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
  const settings = loadSettings()
  // El mapa de proveedores manda; el campo suelto queda como respaldo para los
  // ajustes escritos por versiones anteriores. Mirar los dos permite que la
  // migración sea silenciosa: da igual cuál de los dos formatos haya en disco.
  const key =
    settings.providers?.openrouter?.apiKey ?? settings.openRouterApiKey
  registerSecret(key)
  return key
}

/**
 * Persist the user's OpenRouter API key to their config dir.
 *
 * Se escribe en los dos sitios a la vez, y es a propósito: el formato nuevo
 * para lo que viene, y el campo suelto para que una versión anterior de NEXUS
 * instalada en la misma máquina siga encontrando la key.
 */
export const saveOpenRouterApiKey = (key: string): void => {
  const trimmed = key.trim()
  // Registered here rather than at the call sites so no future caller of
  // saveOpenRouterApiKey can introduce a key the redactor doesn't know about.
  registerSecret(trimmed)
  saveProviderApiKey('openrouter', trimmed)
}

/** Remove the saved OpenRouter API key. */
export const clearOpenRouterApiKey = (): void => {
  unregisterSecret(loadOpenRouterApiKey())
  clearProvider('openrouter')
}

// ---------------------------------------------------------------------------
// Proveedores
// ---------------------------------------------------------------------------

/** Los proveedores que el usuario tiene configurados, en orden estable. */
export const loadConfiguredProviders = (): ProviderId[] => {
  const providers = loadSettings().providers
  if (!providers) return []
  return (Object.keys(providers) as ProviderId[]).filter((id) => providers[id])
}

/** La key guardada de un proveedor, o undefined si no tiene. */
export const loadProviderApiKey = (id: ProviderId): string | undefined => {
  const key = loadSettings().providers?.[id]?.apiKey
  registerSecret(key)
  return key
}

/** Guardar la key de un proveedor, dejándolo configurado. */
export const saveProviderApiKey = (id: ProviderId, key: string): void => {
  const trimmed = key.trim()
  registerSecret(trimmed)
  const settings = loadSettings()
  saveSettings({
    providers: {
      ...settings.providers,
      [id]: { ...settings.providers?.[id], apiKey: trimmed },
    },
    // Espejo del campo viejo, solo para OpenRouter: es el único que las
    // versiones anteriores saben leer.
    ...(id === 'openrouter' ? { openRouterApiKey: trimmed } : {}),
  })
}

/** Quitar un proveedor entero, credenciales incluidas. */
export const clearProvider = (id: ProviderId): void => {
  const settings = loadSettings()
  unregisterSecret(settings.providers?.[id]?.apiKey)
  const providers = { ...settings.providers }
  delete providers[id]
  saveSettings({
    providers,
    ...(id === 'openrouter' ? { openRouterApiKey: undefined } : {}),
  })
}

/** El par proveedor+modelo en uso, o undefined si el usuario no eligió nada. */
export const loadActiveModel = (): ActiveModel | undefined => {
  return loadSettings().activeModel
}

/** Fijar el modelo en uso, con su proveedor. */
export const saveActiveModel = (active: ActiveModel): void => {
  const model = active.model.trim()
  saveSettings({
    activeModel: { provider: active.provider, model },
    // Igual que con la key: las versiones anteriores solo entienden nexusModel,
    // y solo tiene sentido para ellas si el modelo es de OpenRouter.
    ...(active.provider === 'openrouter' ? { nexusModel: model } : {}),
  })
}

/** Olvidar el modelo elegido y volver al de por defecto. */
export const clearActiveModel = (): void => {
  saveSettings({ activeModel: undefined, nexusModel: undefined })
}

/**
 * Load the user's chosen main (STRONG-tier) model id, or undefined if none.
 *
 * Devuelve el id pelado porque es lo que espera `NEXUS_MODEL_STRONG`, y hoy el
 * SDK solo sabe enrutar a OpenRouter. Por eso un `activeModel` de otro
 * proveedor se ignora en vez de devolverse: mandar `claude-opus-4.8` a
 * OpenRouter da un 404, y un modelo que no existe es peor que el de por
 * defecto. Lo levanta el paso 2, cuando el enrutado entienda proveedores.
 */
export const loadNexusModel = (): string | undefined => {
  const settings = loadSettings()
  const active = settings.activeModel
  if (active) {
    return active.provider === 'openrouter' ? active.model : undefined
  }
  return settings.nexusModel
}

/** Persist the user's chosen main model id (set via /model). */
export const saveNexusModel = (model: string): void => {
  saveActiveModel({ provider: 'openrouter', model })
}

/** Clear the saved model preference (fall back to the built-in default). */
export const clearNexusModel = (): void => {
  clearActiveModel()
}
