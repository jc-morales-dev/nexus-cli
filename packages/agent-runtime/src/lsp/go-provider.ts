/**
 * Go diagnostics via the user's toolchain: `go vet` on the packages (dirs)
 * that contain the edited files. `go vet` type-checks the package as part of
 * its analysis, so it reports both compile errors and classic vet findings.
 */
import path from 'node:path'

import { runTool } from './external-tool'

import type { Diagnostic, DiagnosticsProvider } from './types'

/**
 * Parse `go vet` output lines of the form:
 *   ./calc.go:12:5: undefined: foo
 *   calc.go:3:1: expected declaration, found asdf
 * Lines starting with '#' (package headers) and 'vet:' wrappers are skipped.
 * Paths are resolved relative to `cwd`.
 */
export function parseGoVetOutput(output: string, cwd: string): Diagnostic[] {
  const diagnostics: Diagnostic[] = []
  for (const raw of output.split(/\r?\n/)) {
    const line = raw.trim()
    if (!line || line.startsWith('#')) continue
    const m = /^(?:vet:\s*)?(.+?\.go):(\d+):(\d+):\s*(.+)$/.exec(line)
    if (!m) continue
    diagnostics.push({
      file: path.resolve(cwd, m[1]),
      line: Number(m[2]),
      column: Number(m[3]),
      message: m[4].trim(),
    })
  }
  return diagnostics
}

export const goProvider: DiagnosticsProvider = {
  name: 'go',
  extensions: ['.go'],
  getDiagnostics(files: string[]): Diagnostic[] {
    // One `go vet .` per unique package dir.
    const dirs = [...new Set(files.map((f) => path.dirname(f)))]
    const all: Diagnostic[] = []
    for (const dir of dirs) {
      const result = runTool('go', ['vet', '.'], { cwd: dir })
      if (result === null || result.ok) continue
      // go vet reports findings on stderr.
      all.push(...parseGoVetOutput(result.stderr || result.stdout, dir))
    }
    return all
  },
}
