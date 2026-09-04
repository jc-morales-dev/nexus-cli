/**
 * User-facing error strings for the chat surface.
 *
 * Thin wrappers over the taxonomy in `cli-errors.ts`, kept as separate exports
 * because callers want a title-prefixed line ("Error de red: ...") or a retry
 * banner rather than the bare classification.
 */

import { describeError } from './cli-errors'

/**
 * Format an unknown error into a user-facing string.
 *
 * Delegates to the shared classifier, so a missing key, an unknown model and a
 * timeout each get their own explanation and next step instead of one generic
 * line. Secrets are redacted and stack traces are withheld unless `--debug`.
 */
export function formatErrorForDisplay(
  error: unknown,
  fallbackTitle: string,
): string {
  return describeError(error, { fallbackTitle })
}

/**
 * Format the banner shown while messages are queued for retry.
 *
 * Example output:
 *   "⚠️ Error de red: El proveedor no está disponible
 *    ... • 3 mensajes se reintentan cuando vuelva la conexión"
 */
export function formatRetryBannerMessage(
  error: unknown,
  pendingCount: number,
): string {
  const formatted = formatErrorForDisplay(error, 'Error de red')

  const suffix =
    pendingCount > 0
      ? ` • ${pendingCount} mensaje${pendingCount === 1 ? '' : 's'} se reintenta${
          pendingCount === 1 ? '' : 'n'
        } cuando vuelva la conexión`
      : ''

  return `⚠️ ${formatted}${suffix}`
}
