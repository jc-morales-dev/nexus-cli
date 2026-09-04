/**
 * The diagnostic checks behind `nexus doctor`.
 *
 * Every check is a plain async function over an injected environment, so the
 * whole suite is testable without touching the real filesystem, network, or
 * PATH — and so a check can never accidentally reach for a global. Rendering
 * lives in `./render.ts`; nothing here writes to the terminal.
 *
 * Rules that hold for every check:
 *   - No secret value is ever included in a result. Presence, length and shape
 *     are reportable; the value is not.
 *   - A check that cannot determine an answer returns `warn`, not `error`. An
 *     `error` means "NEXUS will not work until you fix this".
 */

import path from 'path'

import { maskSecret, redactSecrets } from '@nexus/common/util/redact'

export type CheckStatus = 'ok' | 'warn' | 'error'

export interface CheckResult {
  /** Stable identifier, used by tests and by `--json`. */
  id: string
  /** Short human label, e.g. "API key de OpenRouter". */
  label: string
  status: CheckStatus
  /** One-line finding. Never contains a secret. */
  detail: string
  /** What to do about it, when the status isn't ok. */
  hint?: string
}

/**
 * Everything the checks touch, injected. Tests pass fakes; production passes
 * the real thing from `./index.ts`.
 */
export interface DoctorContext {
  env: NodeJS.ProcessEnv
  platform: string
  arch: string
  /** Bun (or Node) version string, without a leading "v". */
  runtimeVersion: string
  nexusVersion: string
  homeDir: string
  cwd: string
  configDir: string
  fs: {
    existsSync(p: string): boolean
    readFileSync(p: string, encoding: 'utf8'): string
    statSync(p: string): { mode: number; isDirectory(): boolean }
    accessSync(p: string, mode: number): void
  }
  /** Access constants (fs.constants.W_OK / R_OK). */
  accessMode: { R_OK: number; W_OK: number }
  /** Resolve an executable on PATH; undefined when absent. */
  which(command: string): Promise<string | undefined>
  /** Probe a URL. Resolves to the HTTP status, or throws. */
  probe(url: string, init: { headers: Record<string, string>; timeoutMs: number }): Promise<number>
  /** Whether to run checks that make network requests. */
  allowNetwork: boolean
}

/** Bun versions below this have shipped fixes the CLI depends on. */
const MIN_BUN_MAJOR = 1
const MIN_BUN_MINOR = 3

const OPENROUTER_KEY_PREFIX = 'sk-or-'
/**
 * Validates the key against the account behind it.
 *
 * Deliberately NOT `/api/v1/models`: that endpoint is public and answers 200
 * for a revoked key, which made this check report a healthy connection for an
 * installation that could not run a single completion. `/api/v1/key` is
 * authenticated and free, so it fails exactly when inference would.
 */
const OPENROUTER_KEY_URL = 'https://openrouter.ai/api/v1/key'
const NETWORK_TIMEOUT_MS = 8000

function ok(id: string, label: string, detail: string): CheckResult {
  return { id, label, status: 'ok', detail }
}
function warn(id: string, label: string, detail: string, hint?: string): CheckResult {
  return { id, label, status: 'warn', detail, hint }
}
function fail(id: string, label: string, detail: string, hint?: string): CheckResult {
  return { id, label, status: 'error', detail, hint }
}

// ---------------------------------------------------------------------------
// Individual checks
// ---------------------------------------------------------------------------

export function checkRuntime(ctx: DoctorContext): CheckResult {
  const version = ctx.runtimeVersion.replace(/^v/, '')
  const [majorRaw, minorRaw] = version.split('.')
  const major = Number(majorRaw)
  const minor = Number(minorRaw)

  if (!Number.isFinite(major)) {
    return warn(
      'runtime',
      'Runtime',
      `No se pudo interpretar la versión ("${ctx.runtimeVersion}").`,
    )
  }

  // The published CLI is a compiled binary with Bun embedded, so this only
  // constrains people running from source.
  if (major < MIN_BUN_MAJOR || (major === MIN_BUN_MAJOR && minor < MIN_BUN_MINOR)) {
    return warn(
      'runtime',
      'Runtime',
      `Bun ${version} es más viejo que el mínimo probado (${MIN_BUN_MAJOR}.${MIN_BUN_MINOR}).`,
      'Actualizá con "bun upgrade". El binario publicado trae su propio runtime y no le afecta.',
    )
  }

  return ok('runtime', 'Runtime', `Bun ${version}`)
}

export function checkVersion(ctx: DoctorContext): CheckResult {
  if (ctx.nexusVersion === 'dev') {
    return ok('version', 'Versión de NEXUS', 'dev (corriendo desde el código fuente)')
  }
  return ok('version', 'Versión de NEXUS', ctx.nexusVersion)
}

export function checkPlatform(ctx: DoctorContext): CheckResult {
  return ok('platform', 'Sistema', `${ctx.platform} ${ctx.arch}`)
}

export function checkConfigDir(ctx: DoctorContext): CheckResult {
  if (!ctx.fs.existsSync(ctx.configDir)) {
    return warn(
      'config-dir',
      'Directorio de configuración',
      `Todavía no existe (${ctx.configDir}).`,
      'Se crea solo la primera vez que guardás una key o un modelo.',
    )
  }

  try {
    ctx.fs.accessSync(ctx.configDir, ctx.accessMode.W_OK)
  } catch {
    return fail(
      'config-dir',
      'Directorio de configuración',
      `Existe pero no se puede escribir: ${ctx.configDir}`,
      'Sin permiso de escritura no se puede guardar la key ni el modelo elegido.',
    )
  }

  return ok('config-dir', 'Directorio de configuración', ctx.configDir)
}

export function checkSettingsFile(ctx: DoctorContext): CheckResult {
  const settingsPath = path.join(ctx.configDir, 'settings.json')
  if (!ctx.fs.existsSync(settingsPath)) {
    return ok('settings', 'settings.json', 'Sin configuración guardada todavía (se usan los valores por defecto).')
  }

  try {
    const parsed = JSON.parse(ctx.fs.readFileSync(settingsPath, 'utf8'))
    if (typeof parsed !== 'object' || parsed === null) {
      return fail(
        'settings',
        'settings.json',
        'El archivo no contiene un objeto JSON válido.',
        `Borralo para empezar de cero: ${settingsPath}`,
      )
    }
  } catch {
    return fail(
      'settings',
      'settings.json',
      'El archivo está corrupto y no se puede leer como JSON.',
      `NEXUS lo ignora y usa los valores por defecto. Borralo para limpiarlo: ${settingsPath}`,
    )
  }

  return ok('settings', 'settings.json', 'Válido')
}

/**
 * settings.json holds the provider key in plain text. On POSIX, group/world
 * read bits on that file mean any other account on the machine can take it.
 */
export function checkSettingsPermissions(ctx: DoctorContext): CheckResult {
  const settingsPath = path.join(ctx.configDir, 'settings.json')
  const label = 'Permisos de settings.json'

  if (ctx.platform === 'win32') {
    return ok('settings-permissions', label, 'No aplica en Windows (manda la ACL del perfil de usuario).')
  }
  if (!ctx.fs.existsSync(settingsPath)) {
    return ok('settings-permissions', label, 'El archivo todavía no existe.')
  }

  try {
    const mode = ctx.fs.statSync(settingsPath).mode & 0o777
    if ((mode & 0o077) !== 0) {
      return warn(
        'settings-permissions',
        label,
        `El archivo es legible por otros usuarios (modo ${mode.toString(8).padStart(3, '0')}).`,
        `Ahí está tu API key en texto plano. Corregilo con: chmod 600 ${settingsPath}`,
      )
    }
    return ok('settings-permissions', label, 'Solo tu usuario puede leerlo (600).')
  } catch {
    return warn('settings-permissions', label, 'No se pudieron leer los permisos del archivo.')
  }
}

/**
 * Reports whether a provider key is configured and where it came from.
 * The value itself is masked — `nexus doctor` output gets pasted into bug
 * reports, so it must be safe to share as-is.
 */
export function checkApiKey(ctx: DoctorContext): CheckResult {
  const label = 'API key de OpenRouter'
  const fromEnv = ctx.env.OPENROUTER_API_KEY?.trim()
  const settingsPath = path.join(ctx.configDir, 'settings.json')

  let fromSettings: string | undefined
  if (ctx.fs.existsSync(settingsPath)) {
    try {
      const parsed = JSON.parse(ctx.fs.readFileSync(settingsPath, 'utf8'))
      const saved = (parsed as { openRouterApiKey?: unknown }).openRouterApiKey
      if (typeof saved === 'string' && saved.trim().length > 0) {
        fromSettings = saved.trim()
      }
    } catch {
      // checkSettingsFile already reports a corrupt settings file.
    }
  }

  const key = fromEnv ?? fromSettings
  if (!key) {
    return fail(
      'api-key',
      label,
      'No hay ninguna key configurada.',
      'NEXUS es BYOK: conseguí una key en https://openrouter.ai/keys y pegala con "/key <tu-key>", ' +
        'o exportá OPENROUTER_API_KEY antes de arrancar.',
    )
  }

  // The CLI's pre-init copies the saved key into OPENROUTER_API_KEY, so
  // "present in the environment" does not mean "the user exported it". When
  // both hold the same value, the saved key is the real source — and it's the
  // one the user has to change to change anything.
  const source =
    fromEnv && fromEnv !== fromSettings
      ? 'variable de entorno OPENROUTER_API_KEY'
      : 'settings.json (guardada con /key)'

  if (!key.startsWith(OPENROUTER_KEY_PREFIX)) {
    return warn(
      'api-key',
      label,
      `Configurada (${maskSecret(key)}, desde ${source}), pero no empieza con "${OPENROUTER_KEY_PREFIX}".`,
      'Las keys de OpenRouter tienen ese prefijo. Si apuntás a un gateway compatible, ignorá este aviso.',
    )
  }

  return ok('api-key', label, `Configurada (${maskSecret(key)}, desde ${source}).`)
}

export function checkModel(ctx: DoctorContext): CheckResult {
  const label = 'Modelo'
  const forced = ctx.env.NEXUS_MODEL?.trim()
  if (forced) {
    return ok('model', label, `Forzado a "${forced}" por NEXUS_MODEL (ignora los tiers).`)
  }

  const strong = ctx.env.NEXUS_MODEL_STRONG?.trim()
  const cheap = ctx.env.NEXUS_MODEL_CHEAP?.trim()
  if (!strong) {
    return warn(
      'model',
      label,
      'No hay modelo principal configurado.',
      'Elegí uno con /model. Sin esto se usa el valor por defecto del binario.',
    )
  }

  return ok('model', label, `principal: ${strong}${cheap ? ` · utilitario: ${cheap}` : ''}`)
}

export async function checkGit(ctx: DoctorContext): Promise<CheckResult> {
  const label = 'git'
  const found = await ctx.which('git')
  if (!found) {
    return warn(
      'git',
      label,
      'No está en el PATH.',
      'NEXUS funciona sin git, pero /undo y el seguimiento de cambios andan mejor dentro de un repo.',
    )
  }
  return ok('git', label, found)
}

export async function checkRipgrep(ctx: DoctorContext): Promise<CheckResult> {
  const label = 'ripgrep'
  const fromEnv = ctx.env.NEXUS_RG_PATH?.trim()
  if (fromEnv && ctx.fs.existsSync(fromEnv)) {
    return ok('ripgrep', label, `${fromEnv} (via NEXUS_RG_PATH)`)
  }
  const found = await ctx.which('rg')
  if (found) {
    return ok('ripgrep', label, found)
  }
  return warn(
    'ripgrep',
    label,
    'No se encontró en el PATH.',
    'El binario publicado trae su propia copia. Si corrés desde el código fuente, instalá ripgrep para que la búsqueda de código sea rápida.',
  )
}

export function checkProjectWritable(ctx: DoctorContext): CheckResult {
  const label = 'Directorio de trabajo'
  try {
    ctx.fs.accessSync(ctx.cwd, ctx.accessMode.R_OK)
  } catch {
    return fail('project-dir', label, `No se puede leer ${ctx.cwd}.`, 'Abrí NEXUS desde una carpeta accesible.')
  }
  try {
    ctx.fs.accessSync(ctx.cwd, ctx.accessMode.W_OK)
  } catch {
    return warn(
      'project-dir',
      label,
      `${ctx.cwd} es de solo lectura.`,
      'NEXUS puede leer y explicar el código, pero no va a poder editarlo.',
    )
  }
  return ok('project-dir', label, ctx.cwd)
}

/**
 * A `.env` in the project that git is not ignoring is how keys end up in
 * public repos. Cheap to check, and the failure is expensive.
 */
export function checkEnvFileIgnored(ctx: DoctorContext): CheckResult {
  const label = 'Secretos del proyecto'
  const envPath = path.join(ctx.cwd, '.env')
  if (!ctx.fs.existsSync(envPath)) {
    return ok('env-file', label, 'No hay .env en esta carpeta.')
  }

  const gitignorePath = path.join(ctx.cwd, '.gitignore')
  if (!ctx.fs.existsSync(gitignorePath)) {
    return warn(
      'env-file',
      label,
      'Hay un .env y no hay .gitignore.',
      'Agregá un .gitignore con ".env" antes de commitear, o vas a publicar tus keys.',
    )
  }

  const gitignore = ctx.fs.readFileSync(gitignorePath, 'utf8')
  const ignoresEnv = gitignore
    .split(/\r?\n/)
    .map((line) => line.trim())
    .some((line) => line === '.env' || line === '.env*' || line === '.env.*')

  if (!ignoresEnv) {
    return warn(
      'env-file',
      label,
      'Hay un .env que el .gitignore no cubre.',
      'Agregá ".env" al .gitignore antes de commitear.',
    )
  }

  return ok('env-file', label, '.env presente y correctamente ignorado por git.')
}

/**
 * Confirms the provider is reachable *and* that the key is accepted, using a
 * cheap catalogue endpoint rather than a paid completion.
 */
export async function checkProviderReachable(ctx: DoctorContext): Promise<CheckResult> {
  const label = 'Conexión con OpenRouter'
  if (!ctx.allowNetwork) {
    return ok('provider', label, 'Omitido (--no-network).')
  }

  const key = ctx.env.OPENROUTER_API_KEY?.trim()
  if (!key) {
    return warn('provider', label, 'Sin key configurada, no se puede probar.', 'Configurá la key y volvé a correr "nexus doctor".')
  }

  try {
    const status = await ctx.probe(OPENROUTER_KEY_URL, {
      headers: { Authorization: `Bearer ${key}` },
      timeoutMs: NETWORK_TIMEOUT_MS,
    })

    if (status === 401 || status === 403) {
      return fail(
        'provider',
        label,
        `OpenRouter rechazó la key (${status}). Ninguna consulta al modelo va a funcionar así.`,
        'Puede estar revocada, mal copiada, o pertenecer a una cuenta que ya no existe. ' +
          'Generá otra en https://openrouter.ai/keys y guardala con "/key <tu-key>".',
      )
    }
    if (status >= 500) {
      return warn('provider', label, `OpenRouter respondió ${status}. El problema es de su lado.`, 'Reintentá en un rato.')
    }
    if (status >= 400) {
      return warn('provider', label, `Respuesta inesperada: HTTP ${status}.`)
    }
    return ok('provider', label, `Alcanzable y la cuenta acepta la key (HTTP ${status}).`)
  } catch (error) {
    // Redacted: fetch failures quote the request, and the request carries the
    // Authorization header.
    const message = redactSecrets(
      error instanceof Error ? error.message : String(error),
    )
    return warn(
      'provider',
      label,
      `No se pudo conectar (${message}).`,
      'Revisá tu conexión, el DNS o el proxy. También podés correr "nexus doctor --no-network" para saltear esta prueba.',
    )
  }
}

// ---------------------------------------------------------------------------
// Suite
// ---------------------------------------------------------------------------

/** Run every check, in display order. */
export async function runAllChecks(ctx: DoctorContext): Promise<CheckResult[]> {
  const synchronous = [
    checkVersion(ctx),
    checkRuntime(ctx),
    checkPlatform(ctx),
    checkConfigDir(ctx),
    checkSettingsFile(ctx),
    checkSettingsPermissions(ctx),
    checkApiKey(ctx),
    checkModel(ctx),
    checkProjectWritable(ctx),
    checkEnvFileIgnored(ctx),
  ]

  const asynchronous = await Promise.all([
    checkGit(ctx),
    checkRipgrep(ctx),
    checkProviderReachable(ctx),
  ])

  return [...synchronous, ...asynchronous]
}

export interface DoctorSummary {
  passed: number
  warnings: number
  errors: number
  /** Process exit code: non-zero only when something is actually broken. */
  exitCode: number
}

export function summarize(results: CheckResult[]): DoctorSummary {
  const passed = results.filter((r) => r.status === 'ok').length
  const warnings = results.filter((r) => r.status === 'warn').length
  const errors = results.filter((r) => r.status === 'error').length
  return { passed, warnings, errors, exitCode: errors > 0 ? 1 : 0 }
}
