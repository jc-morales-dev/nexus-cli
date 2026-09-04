/**
 * Centralised secret redaction.
 *
 * NEXUS is a BYOK tool: the user's provider key lives in this process, in
 * `process.env`, in request headers, and — if nothing stops it — in log files,
 * error messages, telemetry payloads and crash reports. This module is the one
 * place that decides what a redacted secret looks like, so every one of those
 * sinks can call it instead of inventing its own masking.
 *
 * Two complementary strategies, because neither is sufficient alone:
 *
 *   1. Pattern matching (`redactSecrets`) catches well-known key shapes even
 *      when they show up in free-form text we never modelled — a provider
 *      echoing the key back inside an error body, for instance.
 *   2. An explicit registry (`registerSecret`) catches the keys we actually
 *      hold. Provider key formats change and self-hosted gateways issue keys
 *      with no recognisable prefix at all, so pattern matching alone would
 *      miss them.
 *
 * Redaction is intentionally lossy but *identifiable*: `sk-or-v1-…9f2c` keeps
 * enough for a user to tell which key is which without the value being usable.
 */

/** How many trailing characters of a secret stay visible. */
const VISIBLE_SUFFIX = 4

/** Secrets shorter than this are masked whole — a 6-char value with 4 shown is not redacted. */
const MIN_LENGTH_FOR_PARTIAL = 12

/** Below this length a string is not treated as a registered secret at all (avoids masking noise like "1" or "dev"). */
const MIN_REGISTERED_SECRET_LENGTH = 8

export const REDACTED = '[REDACTED]'

/**
 * Known API-key shapes, most specific first. Anchored on their provider prefix
 * so ordinary prose can't match: a bare 32-char hex string is not assumed to be
 * a secret, because half the git SHAs in a log would disappear.
 */
const SECRET_PATTERNS: RegExp[] = [
  /sk-or-v1-[A-Za-z0-9]{16,}/g, // OpenRouter
  /sk-ant-[A-Za-z0-9_-]{16,}/g, // Anthropic
  /sk-proj-[A-Za-z0-9_-]{16,}/g, // OpenAI project keys
  /sk-[A-Za-z0-9]{32,}/g, // OpenAI legacy / generic sk-
  /gsk_[A-Za-z0-9]{20,}/g, // Groq
  /r8_[A-Za-z0-9]{20,}/g, // Replicate
  /hf_[A-Za-z0-9]{16,}/g, // Hugging Face
  /(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{20,}/g, // GitHub tokens
  /github_pat_[A-Za-z0-9_]{20,}/g, // GitHub fine-grained PAT
  /xox[abposr]-[A-Za-z0-9-]{10,}/g, // Slack
  /AIza[A-Za-z0-9_-]{20,}/g, // Google API keys
  /npm_[A-Za-z0-9]{30,}/g, // npm tokens
]

/**
 * Header/field names whose *value* is a secret regardless of its shape.
 * Matched case-insensitively against object keys in `redactDeep`.
 */
const SENSITIVE_KEY_PATTERN =
  /^(?:authorization|proxy-authorization|cookie|set-cookie|x-api-key|api[_-]?key|apikey|access[_-]?token|refresh[_-]?token|id[_-]?token|auth[_-]?token|secret|client[_-]?secret|password|passwd|private[_-]?key|session[_-]?token|x-openrouter-api-key|openrouterapikey|.*_api_key)$/i

/**
 * `Authorization: Bearer <token>` and friends inside free-form strings.
 * The token itself may have no recognisable prefix, so the surrounding syntax
 * is what identifies it.
 */
const BEARER_PATTERN = /\b(Bearer\s+)([A-Za-z0-9._~+/=-]{12,})/gi
const HEADER_ASSIGNMENT_PATTERN =
  /\b((?:authorization|x-api-key|api[_-]?key|apikey|x-openrouter-api-key)\s*[:=]\s*)(["']?)([^\s"',;}]{12,})\2/gi

/**
 * Secrets registered at runtime. A Set (not an array) so repeated registration
 * of the same key — which happens every time `/key` is run — stays O(1).
 */
const registeredSecrets = new Set<string>()

/**
 * Mask a value that is *known* to be a secret.
 *
 * Long enough values keep their provider prefix and last 4 characters
 * (`sk-or-v1-…9f2c`) so the user can still tell one key from another; short
 * ones are replaced wholesale, since showing 4 of 8 characters leaks half the
 * secret.
 */
export function maskSecret(value: string): string {
  if (!value) return REDACTED
  if (value.length < MIN_LENGTH_FOR_PARTIAL) return REDACTED

  // Keep a recognisable provider prefix when there is one (`sk-or-v1-`,
  // `github_pat_`, ...). Everything up to and including the last separator in
  // the first 12 characters counts as prefix.
  const head = value.slice(0, MIN_LENGTH_FOR_PARTIAL)
  const separatorIndex = Math.max(head.lastIndexOf('-'), head.lastIndexOf('_'))
  const prefix = separatorIndex > 0 ? value.slice(0, separatorIndex + 1) : ''

  return `${prefix}…${value.slice(-VISIBLE_SUFFIX)}`
}

/**
 * Register a value that must never appear in output, whatever its shape.
 *
 * Call this wherever a provider key enters the process (settings load, `/key`,
 * env import). Values that are too short, or obvious non-secret placeholders,
 * are ignored so we don't start masking every occurrence of "true" in a log.
 */
export function registerSecret(value: string | undefined | null): void {
  if (typeof value !== 'string') return
  const trimmed = value.trim()
  if (trimmed.length < MIN_REGISTERED_SECRET_LENGTH) return
  registeredSecrets.add(trimmed)
}

/** Forget a registered secret (used when the user clears their key). */
export function unregisterSecret(value: string | undefined | null): void {
  if (typeof value !== 'string') return
  registeredSecrets.delete(value.trim())
}

/** Test seam: drop every registered secret. */
export function clearRegisteredSecrets(): void {
  registeredSecrets.clear()
}

/** Escape a literal string for safe use inside a RegExp. */
function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/**
 * Redact every secret found in a string: registered values first (exact
 * matches, whatever their shape), then known key patterns, then secrets
 * identified by their surrounding header syntax.
 */
export function redactSecrets(text: string): string {
  if (!text) return text

  let result = text

  // Registered secrets first: an exact match is the strongest signal we have,
  // and doing it first means a registered key inside an Authorization header
  // is masked identifiably rather than blanket-[REDACTED]ed.
  for (const secret of registeredSecrets) {
    if (result.includes(secret)) {
      result = result.split(secret).join(maskSecret(secret))
    }
  }

  for (const pattern of SECRET_PATTERNS) {
    result = result.replace(pattern, (match) => maskSecret(match))
  }

  result = result.replace(BEARER_PATTERN, (_m, prefix: string, token: string) =>
    `${prefix}${maskSecret(token)}`,
  )

  result = result.replace(
    HEADER_ASSIGNMENT_PATTERN,
    (_m, prefix: string, quote: string, token: string) =>
      `${prefix}${quote}${maskSecret(token)}${quote}`,
  )

  return result
}

/** True when this object key names a field whose value is inherently secret. */
export function isSensitiveKey(key: string): boolean {
  return SENSITIVE_KEY_PATTERN.test(key)
}

/**
 * Recursively redact a value of any shape before it reaches a log file, a
 * telemetry payload or a diagnostics report.
 *
 * - Strings are scanned with `redactSecrets`.
 * - Values under a sensitive key (`authorization`, `apiKey`, ...) are masked
 *   whole, regardless of shape.
 * - Errors become plain objects, so `message` and `stack` get scanned too —
 *   a stack frame can carry a key in a URL.
 * - Cycles and over-deep structures are cut off rather than throwing: this
 *   runs on the logging path, where an exception would be worse than a
 *   truncated field.
 */
export function redactDeep<T>(value: T, maxDepth = 8): T {
  return redactValue(value, maxDepth, new WeakSet()) as T
}

function redactValue(value: unknown, depth: number, seen: WeakSet<object>): unknown {
  if (typeof value === 'string') return redactSecrets(value)
  if (value === null || typeof value !== 'object') return value
  if (depth <= 0) return '[Truncated]'

  if (seen.has(value as object)) return '[Circular]'
  seen.add(value as object)

  if (value instanceof Error) {
    return {
      name: value.name,
      message: redactSecrets(value.message),
      ...(value.stack ? { stack: redactSecrets(value.stack) } : {}),
    }
  }

  if (Array.isArray(value)) {
    return value.map((item) => redactValue(item, depth - 1, seen))
  }

  const result: Record<string, unknown> = {}
  for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
    if (isSensitiveKey(key)) {
      result[key] = typeof item === 'string' ? maskSecret(item) : REDACTED
      continue
    }
    result[key] = redactValue(item, depth - 1, seen)
  }
  return result
}
