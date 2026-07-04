/**
 * Shared helper for external-toolchain diagnostics providers (Python/Go/Rust).
 *
 * These providers shell out to the user's locally-installed toolchain. Design
 * rules (same spirit as the TS provider):
 *   - FAIL SOFT: tool missing, timeout, crash → no diagnostics, never throw.
 *   - Remember missing tools for the session so we don't re-spawn every turn.
 *   - Hard timeout so a hung compiler can never wedge the agent loop.
 */
import { spawnSync } from 'node:child_process'

/** Hard cap per tool invocation. Compilers that take longer get skipped. */
export const TOOL_TIMEOUT_MS = 60_000

/** Tools we already know are not installed (per process). */
const missingTools = new Set<string>()

export interface ToolResult {
  ok: boolean
  stdout: string
  stderr: string
}

/**
 * Run `cmd args` and capture output. Returns null when the tool is missing
 * (and remembers that), or on timeout/spawn failure.
 */
export function runTool(
  cmd: string,
  args: string[],
  options: { cwd: string; timeoutMs?: number } = { cwd: process.cwd() },
): ToolResult | null {
  if (missingTools.has(cmd)) return null
  try {
    const r = spawnSync(cmd, args, {
      cwd: options.cwd,
      timeout: options.timeoutMs ?? TOOL_TIMEOUT_MS,
      encoding: 'utf8',
      windowsHide: true,
      env: process.env,
    })
    if (r.error) {
      const code = (r.error as NodeJS.ErrnoException).code
      if (code === 'ENOENT') {
        missingTools.add(cmd)
      }
      return null
    }
    return {
      ok: r.status === 0,
      stdout: r.stdout ?? '',
      stderr: r.stderr ?? '',
    }
  } catch {
    return null
  }
}

/** Test hook: forget which tools were missing. */
export function resetMissingToolCache(): void {
  missingTools.clear()
}
