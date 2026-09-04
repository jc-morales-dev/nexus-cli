/**
 * Whether the CLI is running in debug mode (`nexus --debug`, or NEXUS_DEBUG=1).
 *
 * Debug mode only changes how much detail the user is shown — full stack
 * traces and raw provider messages instead of the short, actionable summary.
 * It never changes behaviour, and it never disables redaction: a stack trace
 * printed in debug mode still goes through the secret redactor.
 *
 * Kept in its own module (rather than on a store or passed down as a prop)
 * because error formatting happens in leaf utilities that have no access to
 * React state, and because the flag has to be readable before the renderer
 * exists — the earliest startup crashes are exactly the ones worth a stack.
 */

let debugEnabled = false

/** Read once at startup from the parsed flags and the environment. */
export function initDebugMode(fromFlag: boolean): void {
  debugEnabled =
    fromFlag ||
    process.env.NEXUS_DEBUG === '1' ||
    process.env.NEXUS_DEBUG === 'true'
}

export function isDebugMode(): boolean {
  return debugEnabled
}

/** Test seam. */
export function setDebugMode(value: boolean): void {
  debugEnabled = value
}
