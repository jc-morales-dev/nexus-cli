/**
 * Rust diagnostics via the user's toolchain: `cargo check` on the crate that
 * owns each edited file (nearest ancestor with a Cargo.toml).
 *
 * cargo is whole-crate by design — there is no per-file check — so this is the
 * heaviest provider. It shares the global tool timeout; a cold dependency
 * build that exceeds it simply yields no diagnostics (fail soft).
 */
import { existsSync } from 'node:fs'
import path from 'node:path'

import { runTool } from './external-tool'

import type { Diagnostic, DiagnosticsProvider } from './types'

/** Walk up from `file` to the nearest directory containing Cargo.toml. */
export function findCrateRoot(file: string): string | null {
  let dir = path.dirname(path.resolve(file))
  for (;;) {
    if (existsSync(path.join(dir, 'Cargo.toml'))) return dir
    const parent = path.dirname(dir)
    if (parent === dir) return null
    dir = parent
  }
}

/**
 * Parse `cargo check --message-format=short` output. Error lines look like:
 *   src/main.rs:5:9: error[E0308]: mismatched types
 *   src\lib.rs:3:1: error: expected item, found `asdf`
 * Warnings are skipped — the gate only blocks on errors.
 */
export function parseCargoShortOutput(
  output: string,
  crateRoot: string,
): Diagnostic[] {
  const diagnostics: Diagnostic[] = []
  for (const raw of output.split(/\r?\n/)) {
    const line = raw.trim()
    if (!line) continue
    const m = /^(.+?\.rs):(\d+):(\d+):\s*error(\[(E\d+)\])?:\s*(.+)$/.exec(line)
    if (!m) continue
    diagnostics.push({
      file: path.resolve(crateRoot, m[1]),
      line: Number(m[2]),
      column: Number(m[3]),
      message: m[6].trim(),
      ...(m[5] ? { code: m[5] } : {}),
    })
  }
  return diagnostics
}

export const rustProvider: DiagnosticsProvider = {
  name: 'rust',
  extensions: ['.rs'],
  getDiagnostics(files: string[]): Diagnostic[] {
    const roots = new Set<string>()
    for (const file of files) {
      const root = findCrateRoot(file)
      if (root) roots.add(root)
    }
    const all: Diagnostic[] = []
    for (const root of roots) {
      const result = runTool(
        'cargo',
        ['check', '--quiet', '--message-format=short'],
        { cwd: root },
      )
      if (result === null || result.ok) continue
      all.push(...parseCargoShortOutput(result.stderr || result.stdout, root))
    }
    return all
  },
}
