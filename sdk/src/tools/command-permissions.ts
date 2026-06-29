/**
 * Command permission / safety gate for NEXUS.
 *
 * Before NEXUS runs a shell command on the user's behalf, the command is checked
 * against this policy. The goal is a safety net for publishing NEXUS publicly:
 * block the genuinely catastrophic, irreversible commands (wiping the disk,
 * fork bombs, formatting drives, force-pushing, piping the internet into a
 * shell) while letting normal dev commands run.
 *
 * Layered decision (first match wins):
 *   1. User allowlist (.nexus/permissions.json "allow") — explicit escape hatch.
 *   2. User denylist (.nexus/permissions.json "deny").
 *   3. Built-in dangerous patterns below.
 *   4. Otherwise: allowed (it's a coding tool; the denylist is the net, and file
 *      edits are already covered by /undo checkpoints).
 *
 * Set "disabled": true in the config to turn the gate off entirely.
 *
 * Pure + fs loader, so the policy logic is unit-testable without a runtime.
 */
import fs from 'fs'
import path from 'path'

export interface PermissionsConfig {
  /** Regex strings; a command matching any is always allowed (overrides deny). */
  allow?: string[]
  /** Regex strings; a command matching any is blocked. */
  deny?: string[]
  /** Turn the whole gate off. */
  disabled?: boolean
}

export interface PermissionDecision {
  allowed: boolean
  reason?: string
}

export const PERMISSIONS_CONFIG_RELATIVE_PATH = path.join(
  '.nexus',
  'permissions.json',
)

/**
 * Built-in blocks for catastrophic / irreversible commands. Kept deliberately
 * tight — these are "you almost certainly didn't mean this and it can't be
 * undone" commands, not merely destructive ones (deleting project files is a
 * normal coding action and is covered by /undo).
 */
const DANGEROUS_PATTERNS: { re: RegExp; reason: string }[] = [
  {
    // rm with a recursive+force flag (any order) targeting root / home / $HOME.
    // Deliberately NOT triggered by deleting project files or subpaths like
    // `rm -rf node_modules` or `rm -rf /tmp/x` — only the catastrophic targets.
    re: /\brm\s+(?:-\S+\s+)*-(?=\S*r)(?=\S*f)\S+\s+(?:--no-preserve-root\s+)?(?:\/(?:\s|$|\*)|~(?:\s|$|\/(?:\s|$))|\$HOME\b)/i,
    reason: 'recursive force-delete of root / home',
  },
  { re: /:\s*\(\s*\)\s*\{\s*:\s*\|\s*:\s*&\s*\}\s*;\s*:/, reason: 'fork bomb' },
  { re: /\bmkfs(\.\w+)?\b/i, reason: 'formats a filesystem' },
  { re: /\bdd\b[^\n]*\bof=\/dev\/(disk|sd|nvme|hd)/i, reason: 'overwrites a raw disk' },
  { re: />\s*\/dev\/(sd|nvme|hd|disk)/i, reason: 'overwrites a raw disk device' },
  { re: /\b(shutdown|reboot|halt|poweroff|init\s+0|init\s+6)\b/i, reason: 'shuts down or reboots the machine' },
  { re: /\bchmod\s+(-[a-z]*\s+)*-R[a-z]*\s+0*777\s+\//i, reason: 'recursively makes root world-writable' },
  { re: /\bchown\s+(-[a-z]*\s+)*-R\b[^\n]*\s\//i, reason: 'recursively changes ownership from root' },
  { re: /\bgit\s+push\b[^\n]*(--force\b|-f\b)/i, reason: 'force-pushes (can destroy remote history)' },
  { re: /\b(curl|wget)\b[^\n]*\|\s*(sudo\s+)?(ba)?sh\b/i, reason: 'pipes a downloaded script straight into a shell' },
  // Windows catastrophic
  { re: /\bformat\s+[a-z]:/i, reason: 'formats a Windows drive' },
  { re: /\b(del|erase)\s+\/[sq]\b[^\n]*[a-z]:\\?\s*$/i, reason: 'recursively deletes a Windows drive root' },
  { re: /\b(rd|rmdir)\s+\/s\b[^\n]*[a-z]:\\?\s*$/i, reason: 'recursively removes a Windows drive root' },
]

function compileList(patterns: string[] | undefined): RegExp[] {
  if (!Array.isArray(patterns)) return []
  const out: RegExp[] = []
  for (const p of patterns) {
    if (typeof p !== 'string' || p.length === 0) continue
    try {
      out.push(new RegExp(p, 'i'))
    } catch {
      /* skip malformed pattern */
    }
  }
  return out
}

/** Parse + validate a permissions config from raw JSON. Never throws. */
export function parsePermissionsConfig(rawText: string): PermissionsConfig {
  try {
    const parsed = JSON.parse(rawText)
    if (!parsed || typeof parsed !== 'object') return {}
    const obj = parsed as Record<string, unknown>
    return {
      allow: Array.isArray(obj.allow) ? (obj.allow as string[]) : undefined,
      deny: Array.isArray(obj.deny) ? (obj.deny as string[]) : undefined,
      disabled: obj.disabled === true,
    }
  } catch {
    return {}
  }
}

/** Load `.nexus/permissions.json` from a project root (null when absent). */
export function loadPermissionsConfig(projectRoot: string): PermissionsConfig | null {
  if (!projectRoot) return null
  try {
    const filePath = path.join(projectRoot, PERMISSIONS_CONFIG_RELATIVE_PATH)
    if (!fs.existsSync(filePath)) return null
    return parsePermissionsConfig(fs.readFileSync(filePath, 'utf8'))
  } catch {
    return null
  }
}

/** Decide whether a shell command is allowed to run. */
export function classifyCommand(
  command: string,
  config?: PermissionsConfig | null,
): PermissionDecision {
  if (config?.disabled) return { allowed: true }

  // 1. User allowlist wins (explicit escape hatch).
  if (compileList(config?.allow).some((re) => re.test(command))) {
    return { allowed: true }
  }

  // 2. User denylist.
  if (compileList(config?.deny).some((re) => re.test(command))) {
    return {
      allowed: false,
      reason: 'matches a deny rule in your .nexus/permissions.json',
    }
  }

  // 3. Built-in dangerous commands.
  for (const { re, reason } of DANGEROUS_PATTERNS) {
    if (re.test(command)) {
      return { allowed: false, reason }
    }
  }

  // 4. Default allow.
  return { allowed: true }
}
