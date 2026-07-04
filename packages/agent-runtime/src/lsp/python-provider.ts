/**
 * Python diagnostics via the user's own interpreter: `python -m py_compile`.
 *
 * Zero extra installs — py_compile ships with CPython and catches syntax
 * errors (the dominant failure mode for model edits). Semantic checkers
 * (mypy/pyflakes) are NOT assumed to exist; if we ever want them, they slot in
 * as additional providers behind the same interface.
 */
import path from 'node:path'

import { runTool } from './external-tool'

import type { Diagnostic, DiagnosticsProvider } from './types'

/**
 * Parse a py_compile stderr traceback into diagnostics.
 *
 * Typical shapes:
 *   Traceback (most recent call last): ...
 *   File "C:\proj\calc.py", line 3
 *       def f(:
 *              ^
 *   SyntaxError: invalid syntax
 *
 * and (py_compile.PyCompileError re-raise):
 *   SyntaxError: ('invalid syntax', ('calc.py', 3, 8, 'def f(:\n', 3, 9))
 */
export function parsePyCompileOutput(
  stderr: string,
  fallbackFile: string,
): Diagnostic[] {
  const text = stderr.trim()
  if (!text) return []

  // Preferred: `File "<path>", line N` + last `SomethingError: message` line.
  const fileMatch = /File "(.+?)", line (\d+)/.exec(text)
  const errorLines = text
    .split(/\r?\n/)
    .filter((l) => /^[A-Za-z_.]*(Error|Warning|Exception)[: ]/.test(l.trim()))
  const lastError = errorLines[errorLines.length - 1]?.trim()

  if (fileMatch && lastError) {
    return [
      {
        file: path.resolve(fileMatch[1]),
        line: Number(fileMatch[2]),
        column: 1,
        message: lastError,
      },
    ]
  }

  if (lastError) {
    return [
      { file: path.resolve(fallbackFile), line: 0, column: 0, message: lastError },
    ]
  }

  // Unknown non-empty stderr with failed compile — surface the tail.
  return [
    {
      file: path.resolve(fallbackFile),
      line: 0,
      column: 0,
      message: text.split(/\r?\n/).slice(-1)[0] ?? 'compile failed',
    },
  ]
}

/** Candidate interpreter commands, tried in order. */
const PYTHON_COMMANDS = ['python', 'python3']

function compileOne(file: string): Diagnostic[] {
  for (const cmd of PYTHON_COMMANDS) {
    const result = runTool(cmd, ['-m', 'py_compile', file], {
      cwd: path.dirname(file),
    })
    if (result === null) continue // tool missing — try next candidate
    if (result.ok) return []
    return parsePyCompileOutput(result.stderr, file)
  }
  return [] // no interpreter installed — fail soft
}

export const pythonProvider: DiagnosticsProvider = {
  name: 'python',
  extensions: ['.py'],
  getDiagnostics(files: string[]): Diagnostic[] {
    const all: Diagnostic[] = []
    for (const file of files) {
      all.push(...compileOne(file))
    }
    return all
  },
}
