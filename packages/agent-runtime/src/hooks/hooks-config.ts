/**
 * Deterministic lifecycle hooks for the agent loop (NEXUS).
 *
 * A project opts in by adding `.nexus/hooks.json` at its root. The harness then
 * runs the configured shell commands automatically — independent of the model —
 * at two points in the main agent's turn:
 *
 *   - PostToolUse: after a step in which a matching tool ran (e.g. an edit).
 *       The command's output is fed back to the agent so it can react (e.g. fix
 *       the lints a formatter reported).
 *   - Stop: when the agent is about to finish its turn. If a Stop hook exits
 *       non-zero, its output is fed back and the turn is NOT allowed to end —
 *       the agent must fix the problem first (bounded so it can't loop forever).
 *
 * Example `.nexus/hooks.json`:
 * {
 *   "PostToolUse": [
 *     { "matcher": "write_file|str_replace", "command": "bun run format" }
 *   ],
 *   "Stop": [
 *     { "command": "bun run typecheck", "timeout": 120 }
 *   ]
 * }
 *
 * This file holds only pure helpers (parse / match) plus a tiny fs loader, so
 * the matching and validation logic is unit-testable without a runtime.
 */
import fs from 'fs'
import path from 'path'

export interface HookEntry {
  /** Regex (as a string) tested against each tool name that ran. Omit = any. */
  matcher?: string
  /** Shell command to run. */
  command: string
  /** Feed the command output back to the agent. Default true. */
  feedback?: boolean
  /** Timeout in seconds. Default 60. */
  timeout?: number
  /** Optional label for logs/UI. */
  name?: string
}

export interface HooksConfig {
  PostToolUse: HookEntry[]
  Stop: HookEntry[]
}

export const EMPTY_HOOKS: HooksConfig = { PostToolUse: [], Stop: [] }

/** Where a project declares its hooks, relative to the project root. */
export const HOOKS_CONFIG_RELATIVE_PATH = path.join('.nexus', 'hooks.json')

const DEFAULT_TIMEOUT_SECONDS = 60
/** Bound how many times Stop hooks can force the turn to continue per turn. */
export const MAX_STOP_HOOK_RETRIES = 3

function sanitizeEntry(raw: unknown): HookEntry | null {
  if (!raw || typeof raw !== 'object') return null
  const obj = raw as Record<string, unknown>
  if (typeof obj.command !== 'string' || obj.command.trim().length === 0) {
    return null
  }
  const entry: HookEntry = { command: obj.command.trim() }
  if (typeof obj.matcher === 'string' && obj.matcher.trim().length > 0) {
    // Validate the regex up front; drop the matcher if it's malformed so a typo
    // doesn't crash the loop (an entry with no matcher simply matches any tool).
    try {
      void new RegExp(obj.matcher)
      entry.matcher = obj.matcher
    } catch {
      /* ignore bad regex */
    }
  }
  if (typeof obj.feedback === 'boolean') entry.feedback = obj.feedback
  if (typeof obj.timeout === 'number' && obj.timeout > 0) {
    entry.timeout = obj.timeout
  }
  if (typeof obj.name === 'string' && obj.name.trim().length > 0) {
    entry.name = obj.name.trim()
  }
  return entry
}

function sanitizeList(raw: unknown): HookEntry[] {
  if (!Array.isArray(raw)) return []
  return raw.map(sanitizeEntry).filter((e): e is HookEntry => e !== null)
}

/** Parse + validate a hooks config from raw JSON text. Never throws. */
export function parseHooksConfig(rawText: string): HooksConfig {
  let parsed: unknown
  try {
    parsed = JSON.parse(rawText)
  } catch {
    return EMPTY_HOOKS
  }
  if (!parsed || typeof parsed !== 'object') return EMPTY_HOOKS
  const obj = parsed as Record<string, unknown>
  return {
    PostToolUse: sanitizeList(obj.PostToolUse),
    Stop: sanitizeList(obj.Stop),
  }
}

/** Load + parse `.nexus/hooks.json` from a project root. null when absent. */
export function loadHooksConfig(projectRoot: string): HooksConfig | null {
  if (!projectRoot) return null
  try {
    const filePath = path.join(projectRoot, HOOKS_CONFIG_RELATIVE_PATH)
    if (!fs.existsSync(filePath)) return null
    return parseHooksConfig(fs.readFileSync(filePath, 'utf8'))
  } catch {
    return null
  }
}

/** True if a project has at least one usable hook configured. */
export function hasAnyHooks(config: HooksConfig | null): boolean {
  return !!config && (config.PostToolUse.length > 0 || config.Stop.length > 0)
}

/**
 * Select the hooks whose matcher matches at least one of the tool names that
 * ran. An entry with no matcher matches any tool (so it always fires when at
 * least one tool ran).
 */
export function matchingHooks(
  hooks: HookEntry[],
  toolNames: string[],
): HookEntry[] {
  if (toolNames.length === 0) return []
  return hooks.filter((hook) => {
    if (!hook.matcher) return true
    let re: RegExp
    try {
      re = new RegExp(hook.matcher)
    } catch {
      return false
    }
    return toolNames.some((name) => re.test(name))
  })
}

/** Resolve the effective timeout (seconds) for a hook. */
export function hookTimeoutSeconds(hook: HookEntry): number {
  return hook.timeout && hook.timeout > 0 ? hook.timeout : DEFAULT_TIMEOUT_SECONDS
}
