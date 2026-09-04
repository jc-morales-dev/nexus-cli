/**
 * Error taxonomy for the CLI.
 *
 * Everything that can go wrong at runtime — a missing key, a model id that
 * doesn't exist, a provider outage, a read-only directory, a truncated model
 * response — arrives here as an opaque `unknown` from three or four different
 * layers (the AI SDK, `fs`, `child_process`, our own throws). Left alone, all
 * of them render as one undifferentiated "Error: <whatever the library said>",
 * which tells the user nothing about what to do next.
 *
 * `classifyError` maps that opaque value onto a small closed set of kinds, and
 * each kind carries a title, a plain-language explanation, and — the part that
 * actually matters — a concrete next step. `formatCliError` renders it.
 *
 * Two rules hold for every message produced here:
 *   1. No secret is ever printed. Provider messages and stacks are passed
 *      through the redactor before they reach the terminal.
 *   2. No stack trace by default. The stack is available under `--debug`,
 *      where a developer asked for it.
 *
 * User-facing strings are Spanish (rioplatense), per the repo convention.
 */

import { redactSecrets } from '@nexus/common/util/redact'
import { getErrorStatusCode, sanitizeErrorMessage } from '@nexus/sdk'

import { isDebugMode } from './debug-mode'

export type CliErrorKind =
  /** No provider key configured at all. */
  | 'missing-api-key'
  /** A key is set but the provider rejected it (401). */
  | 'invalid-api-key'
  /** The key is valid but not allowed to use this resource (403). */
  | 'forbidden'
  /** The requested model id doesn't exist or isn't available to this account. */
  | 'invalid-model'
  /** The provider is reachable but failing (5xx). */
  | 'provider-unavailable'
  /** The provider throttled us (429). */
  | 'rate-limited'
  /** The request took too long. */
  | 'timeout'
  /** No network path to the provider (DNS, refused connection, offline). */
  | 'offline'
  /** The OS refused a file or directory operation. */
  | 'permission-denied'
  /** A file, directory, or external binary the CLI needs isn't there. */
  | 'not-found'
  /** The model returned something we could not parse or use. */
  | 'invalid-model-response'
  /** A tool ran and failed on its own terms. */
  | 'tool-failure'
  /** Provider says the account is out of funds (402). */
  | 'out-of-credits'
  /** Nothing matched. */
  | 'unknown'

export interface ClassifiedCliError {
  kind: CliErrorKind
  /** Short headline, no trailing punctuation. */
  title: string
  /** What happened, in the user's terms. Already redacted. */
  detail: string
  /** What to do about it. Omitted when there is no honest advice to give. */
  hint?: string
  /** The provider/OS message, redacted. Shown under --debug or as context. */
  raw?: string
  /** HTTP status, when the error carried one. */
  statusCode?: number
}

/** Node's filesystem/network error codes, when present. */
function getErrorCode(error: unknown): string | undefined {
  if (error && typeof error === 'object' && 'code' in error) {
    const code = (error as { code: unknown }).code
    if (typeof code === 'string') return code
  }
  return undefined
}

/** The path an fs error refers to, if it carried one. */
function getErrorPath(error: unknown): string | undefined {
  if (error && typeof error === 'object' && 'path' in error) {
    const p = (error as { path: unknown }).path
    if (typeof p === 'string') return p
  }
  return undefined
}

function getErrorName(error: unknown): string | undefined {
  if (error && typeof error === 'object' && 'name' in error) {
    const name = (error as { name: unknown }).name
    if (typeof name === 'string') return name
  }
  return undefined
}

const PERMISSION_CODES = new Set(['EACCES', 'EPERM', 'EROFS'])
const NOT_FOUND_CODES = new Set(['ENOENT', 'MODULE_NOT_FOUND'])
const OFFLINE_CODES = new Set([
  'ENOTFOUND',
  'ECONNREFUSED',
  'ECONNRESET',
  'EHOSTUNREACH',
  'ENETUNREACH',
  'EAI_AGAIN',
  'EPIPE',
])
const TIMEOUT_CODES = new Set(['ETIMEDOUT', 'ESOCKETTIMEDOUT', 'UND_ERR_CONNECT_TIMEOUT'])

/** Message shapes providers use for "that model doesn't exist". */
const INVALID_MODEL_PATTERNS = [
  /\bmodel\b[^.]*\b(not found|does not exist|is not available|unknown|invalid|no such)\b/i,
  /\bno endpoints found\b/i, // OpenRouter's wording for an unroutable model id
  /\binvalid model\b/i,
  /\bunknown model\b/i,
]

/** Message shapes that mean "the model's output was unusable". */
const INVALID_RESPONSE_PATTERNS = [
  /\b(failed to parse|could not parse|unable to parse|invalid json|malformed)\b/i,
  /\bunexpected end of (json|input|stream)\b/i,
  /\bno object generated\b/i,
  /\bempty (response|completion|content)\b/i,
]

function matchesAny(text: string, patterns: RegExp[]): boolean {
  return patterns.some((pattern) => pattern.test(text))
}

/**
 * The env var / setting a user has to change for a given provider. Only
 * OpenRouter is wired up today; the shape exists so adding a second provider
 * is a data change rather than a new branch in the formatter.
 */
export const PROVIDER_KEY_SOURCES: Record<
  string,
  { envVar: string; command: string; signupUrl: string }
> = {
  openrouter: {
    envVar: 'OPENROUTER_API_KEY',
    command: '/key',
    signupUrl: 'https://openrouter.ai/keys',
  },
}

const DEFAULT_PROVIDER = 'openrouter'

function missingApiKeyError(provider = DEFAULT_PROVIDER): ClassifiedCliError {
  const source = PROVIDER_KEY_SOURCES[provider] ?? PROVIDER_KEY_SOURCES[DEFAULT_PROVIDER]
  return {
    kind: 'missing-api-key',
    title: `Falta la API key de ${provider}`,
    detail:
      `NEXUS es BYOK: usa tu propia key, así que no hay ninguna configurada todavía. ` +
      `Se busca en la variable de entorno ${source.envVar} o en la key que guardaste con ${source.command}.`,
    hint:
      `Conseguí una en ${source.signupUrl} y pegala con "${source.command} <tu-key>" dentro de NEXUS ` +
      `(o exportá ${source.envVar} antes de arrancar). Corré "nexus doctor" para verificar.`,
  }
}

function timeoutError(raw: string, statusCode?: number): ClassifiedCliError {
  return {
    kind: 'timeout',
    title: 'Se agotó el tiempo de espera',
    detail:
      'El proveedor no respondió a tiempo. No es lo mismo que estar sin conexión: la petición salió, pero no volvió.',
    hint: 'Probá de nuevo. Si se repite, puede ser un modelo lento o saturado — cambiá de modelo con /model.',
    raw,
    statusCode,
  }
}

/**
 * Map an arbitrary thrown value onto the taxonomy.
 *
 * Ordered from most specific to least: an error can carry both a status code
 * and an OS code, and the more specific signal wins.
 */
export function classifyError(error: unknown): ClassifiedCliError {
  const raw = sanitizeErrorMessage(error)
  const statusCode = getErrorStatusCode(error)
  const code = getErrorCode(error)
  const name = getErrorName(error)

  // --- Our own explicit "no key" throw from the model provider -------------
  if (/no openrouter api key/i.test(raw)) {
    return { ...missingApiKeyError('openrouter'), raw }
  }

  // --- OS-level errors ----------------------------------------------------
  if (code && PERMISSION_CODES.has(code)) {
    const target = getErrorPath(error)
    return {
      kind: 'permission-denied',
      title: 'El sistema bloqueó la operación',
      detail: target
        ? `No hay permisos para acceder a "${redactSecrets(target)}" (${code}).`
        : `El sistema operativo rechazó la operación (${code}).`,
      hint:
        code === 'EROFS'
          ? 'El sistema de archivos es de solo lectura. Probá desde otra carpeta.'
          : 'Revisá los permisos del archivo o del directorio, o abrí NEXUS desde una carpeta donde puedas escribir.',
      raw,
      statusCode,
    }
  }

  if (code && NOT_FOUND_CODES.has(code)) {
    const target = getErrorPath(error)
    return {
      kind: 'not-found',
      title: 'No se encontró lo que hacía falta',
      detail: target
        ? `No existe "${redactSecrets(target)}".`
        : `Falta un archivo o un ejecutable que NEXUS necesita: ${raw}`,
      hint: 'Si es un comando externo (git, rg, node), verificá que esté instalado y en el PATH. "nexus doctor" lo comprueba.',
      raw,
      statusCode,
    }
  }

  // A transport-level timeout: the socket itself gave up. Deliberately does
  // NOT match on the word "timeout" in the message — that check lives after
  // the status-code branches, so a 504 that says "gateway timeout" is
  // attributed to the provider (more actionable) rather than to the network.
  if ((code && TIMEOUT_CODES.has(code)) || name === 'TimeoutError') {
    return timeoutError(raw, statusCode)
  }

  if (code && OFFLINE_CODES.has(code)) {
    return {
      kind: 'offline',
      title: 'Sin conexión con el proveedor',
      detail: `No se pudo alcanzar el servidor (${code}).`,
      hint: 'Revisá tu conexión a internet, el DNS o el proxy corporativo, y volvé a intentar.',
      raw,
      statusCode,
    }
  }

  // --- HTTP status codes --------------------------------------------------
  if (statusCode === 401) {
    const source = PROVIDER_KEY_SOURCES[DEFAULT_PROVIDER]
    return {
      kind: 'invalid-api-key',
      title: 'El proveedor rechazó la API key',
      detail: 'Hay una key configurada, pero OpenRouter la rechazó (401). Puede estar mal copiada, revocada o vencida.',
      hint: `Generá una nueva en ${source.signupUrl} y guardala con "${source.command} <tu-key>". Con "${source.command} clear" borrás la actual.`,
      raw,
      statusCode,
    }
  }

  if (statusCode === 402) {
    return {
      kind: 'out-of-credits',
      title: 'Sin saldo en el proveedor',
      detail: 'OpenRouter reporta que la cuenta no tiene crédito para este modelo (402).',
      hint: 'Cargá saldo en openrouter.ai, o cambiá a un modelo gratuito con /model.',
      raw,
      statusCode,
    }
  }

  if (statusCode === 403) {
    return {
      kind: 'forbidden',
      title: 'Acceso denegado por el proveedor',
      detail: 'La key es válida pero no tiene permiso para este recurso (403).',
      hint: 'Revisá los límites y permisos de tu key en openrouter.ai. Algunos modelos exigen habilitación aparte.',
      raw,
      statusCode,
    }
  }

  if (statusCode === 404 || matchesAny(raw, INVALID_MODEL_PATTERNS)) {
    const model = extractModelId(error, raw)
    return {
      kind: 'invalid-model',
      title: 'Modelo inexistente o no disponible',
      detail: model
        ? `El proveedor openrouter no reconoce el modelo "${model}".`
        : 'El proveedor openrouter no reconoce el modelo pedido.',
      hint:
        'Revisá el id exacto en https://openrouter.ai/models (formato "autor/modelo") y elegí otro con /model. ' +
        'Un modelo también puede desaparecer del catálogo sin aviso.',
      raw,
      statusCode,
    }
  }

  if (statusCode === 408) {
    return {
      ...timeoutError(raw, statusCode),
      detail: 'El proveedor cerró la petición por tiempo (408).',
    }
  }

  if (statusCode === 429) {
    return {
      kind: 'rate-limited',
      title: 'Límite de velocidad alcanzado',
      detail: 'El proveedor está limitando las peticiones (429).',
      hint: 'Esperá unos segundos. Los modelos gratuitos suelen tener límites bajos; con saldo o con otro modelo se afloja.',
      raw,
      statusCode,
    }
  }

  if (statusCode !== undefined && statusCode >= 500) {
    return {
      kind: 'provider-unavailable',
      title: 'El proveedor no está disponible',
      detail: `openrouter respondió con un error del servidor (${statusCode}). El problema está de su lado, no en tu configuración.`,
      hint: 'Reintentá en un rato, o cambiá de modelo con /model — puede estar caído solo el modelo que elegiste.',
      raw,
      statusCode,
    }
  }

  // Last-resort timeout detection: no OS code, no status, just the wording.
  if (/\btimed? ?out\b/i.test(raw)) {
    return timeoutError(raw, statusCode)
  }

  // --- Model output problems ---------------------------------------------
  if (matchesAny(raw, INVALID_RESPONSE_PATTERNS)) {
    return {
      kind: 'invalid-model-response',
      title: 'Respuesta inválida del modelo',
      detail: 'El modelo devolvió algo que NEXUS no pudo interpretar (salida cortada o mal formada).',
      hint: 'Se puede reintentar. Si pasa seguido, el modelo elegido puede no manejar bien las herramientas: probá otro con /model.',
      raw,
      statusCode,
    }
  }

  return {
    kind: 'unknown',
    title: 'Error inesperado',
    detail: raw || 'Ocurrió un error del que no tenemos detalles.',
    raw,
    statusCode,
  }
}

/**
 * Best-effort extraction of the model id from an error, so the message can
 * name the model the user actually asked for. Providers put it in different
 * places; a missing id degrades the message, it doesn't break it.
 */
function extractModelId(error: unknown, raw: string): string | undefined {
  if (error && typeof error === 'object') {
    for (const key of ['modelId', 'model']) {
      const value = (error as Record<string, unknown>)[key]
      if (typeof value === 'string' && value.length > 0) return value
    }
  }
  // "... model `deepseek/deepseek-v3.2` ..." / quoted variants.
  const quoted = raw.match(/["'`]([\w.-]+\/[\w.:-]+)["'`]/)
  if (quoted) return quoted[1]
  const bare = raw.match(/\b([\w-]+\/[\w.:-]+)\b/)
  return bare?.[1]
}

export interface FormatOptions {
  /** Prefix for the headline, e.g. "Error de red". Defaults to the kind's own title. */
  fallbackTitle?: string
  /** Force debug detail on/off. Defaults to the process-wide --debug flag. */
  debug?: boolean
  /** The original error, so a stack can be shown in debug mode. */
  error?: unknown
}

/**
 * Render a classified error as the string the user sees.
 *
 * Default output is three short lines at most. Under `--debug` the provider's
 * own message and the stack trace are appended — both redacted.
 */
export function formatCliError(
  classified: ClassifiedCliError,
  options: FormatOptions = {},
): string {
  const debug = options.debug ?? isDebugMode()
  const title = options.fallbackTitle
    ? `${options.fallbackTitle}: ${classified.title}`
    : classified.title

  const lines = [title, classified.detail]
  if (classified.hint) {
    lines.push(`→ ${classified.hint}`)
  }

  if (debug) {
    if (classified.raw && classified.raw !== classified.detail) {
      lines.push('', `[debug] ${classified.raw}`)
    }
    const stack = options.error instanceof Error ? options.error.stack : undefined
    if (stack) {
      lines.push('', `[debug] ${redactSecrets(stack)}`)
    }
  } else if (classified.kind === 'unknown') {
    // The only case where we have nothing better to offer than "ask for more".
    lines.push('→ Volvé a correr con --debug para ver el detalle completo.')
  }

  return lines.join('\n')
}

/** Classify and format in one step — the common case. */
export function describeError(error: unknown, options: FormatOptions = {}): string {
  return formatCliError(classifyError(error), { ...options, error })
}

/** Convenience for the "no key configured" path, which has no thrown error behind it. */
export function missingApiKeyMessage(provider = DEFAULT_PROVIDER): string {
  return formatCliError(missingApiKeyError(provider))
}
