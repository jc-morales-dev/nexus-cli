/**
 * In-process TypeScript / JavaScript diagnostics provider.
 *
 * Reuses the bundled `typescript` compiler (zero install). For each edited file
 * it locates the nearest tsconfig.json, builds a Program for that config, and
 * returns the *error* diagnostics for the edited files only.
 *
 * Accuracy over speed: we build a real Program so cross-file type errors resolve
 * correctly (no false "cannot find name" noise). To avoid hanging on large
 * repos, a config whose file set exceeds {@link MAX_PROGRAM_FILES} is skipped —
 * for big projects a project-wide typecheck hook is the right tool, and this
 * provider stays focused on small/medium projects and freshly created files.
 */
import path from 'node:path'

import ts from 'typescript'

import type { Diagnostic, DiagnosticsProvider } from './types'

const TS_EXTENSIONS = [
  '.ts',
  '.tsx',
  '.mts',
  '.cts',
  '.js',
  '.jsx',
  '.mjs',
  '.cjs',
] as const

/** Skip building a Program larger than this many files (avoids long hangs). */
export const MAX_PROGRAM_FILES = 800

/**
 * Parsed-config cache keyed by tsconfig path. The Program itself is NOT cached:
 * file contents change between turns, so it is rebuilt each pass (cheap relative
 * to type-checking, and bounded by the size guard).
 */
const parsedConfigCache = new Map<string, ts.ParsedCommandLine | null>()

/**
 * Last Program built per tsconfig, reused as `oldProgram` on the next pass.
 * Lives for the process (the long-running CLI), so after the first cold build
 * the expensive lib.d.ts load is reused and subsequent passes are fast. Reuse
 * is correctness-safe: TypeScript re-parses any file whose text changed.
 */
const lastProgramByConfig = new Map<string, ts.Program>()

/** Test hook: drop cached configs/programs so a freshly written tsconfig is re-read. */
export function clearTsConfigCache(): void {
  parsedConfigCache.clear()
  lastProgramByConfig.clear()
}

function findTsconfig(file: string): string | undefined {
  return (
    ts.findConfigFile(path.dirname(file), ts.sys.fileExists, 'tsconfig.json') ??
    undefined
  )
}

function loadParsedConfig(tsconfigPath: string): ts.ParsedCommandLine | null {
  if (parsedConfigCache.has(tsconfigPath)) {
    return parsedConfigCache.get(tsconfigPath) ?? null
  }
  let parsed: ts.ParsedCommandLine | null = null
  try {
    const read = ts.readConfigFile(tsconfigPath, ts.sys.readFile)
    if (!read.error) {
      parsed = ts.parseJsonConfigFileContent(
        read.config,
        ts.sys,
        path.dirname(tsconfigPath),
      )
    }
  } catch {
    parsed = null
  }
  parsedConfigCache.set(tsconfigPath, parsed)
  return parsed
}

function toDiagnostic(d: ts.Diagnostic): Diagnostic {
  const message = ts.flattenDiagnosticMessageText(d.messageText, '\n')
  let line = 0
  let column = 0
  if (d.file && typeof d.start === 'number') {
    const pos = d.file.getLineAndCharacterOfPosition(d.start)
    line = pos.line + 1
    column = pos.character + 1
  }
  return {
    file: d.file ? path.resolve(d.file.fileName) : '(unknown)',
    line,
    column,
    message,
    code: d.code,
  }
}

function getDiagnosticsForConfig(
  tsconfigPath: string,
  config: ts.ParsedCommandLine,
  wantedFiles: Set<string>,
): Diagnostic[] {
  // Ensure edited files are compiled even if a freshly created file is not yet
  // matched by the config's include globs.
  const rootNames = Array.from(new Set([...config.fileNames, ...wantedFiles]))
  if (rootNames.length === 0 || rootNames.length > MAX_PROGRAM_FILES) {
    return []
  }

  let program: ts.Program
  try {
    program = ts.createProgram({
      rootNames,
      options: config.options,
      oldProgram: lastProgramByConfig.get(tsconfigPath),
    })
    lastProgramByConfig.set(tsconfigPath, program)
  } catch {
    return []
  }

  const out: Diagnostic[] = []
  for (const sourceFile of program.getSourceFiles()) {
    if (sourceFile.isDeclarationFile) continue
    const resolved = path.resolve(sourceFile.fileName)
    if (!wantedFiles.has(resolved)) continue
    const diags = [
      ...program.getSyntacticDiagnostics(sourceFile),
      ...program.getSemanticDiagnostics(sourceFile),
    ]
    for (const d of diags) {
      if (d.category !== ts.DiagnosticCategory.Error) continue
      out.push(toDiagnostic(d))
    }
  }
  return out
}

/** Build the TS/JS provider. */
export const tsProvider = {
  name: 'typescript',
  extensions: TS_EXTENSIONS,
  getDiagnostics(files: string[]): Diagnostic[] {
    try {
      // Group edited files by their governing tsconfig.
      const byConfig = new Map<string, Set<string>>()
      const configs = new Map<string, ts.ParsedCommandLine>()
      for (const f of files) {
        const ext = path.extname(f).toLowerCase()
        if (!(TS_EXTENSIONS as readonly string[]).includes(ext)) continue
        const tsconfigPath = findTsconfig(f)
        if (!tsconfigPath) continue
        const parsed = loadParsedConfig(tsconfigPath)
        if (!parsed) continue
        configs.set(tsconfigPath, parsed)
        let set = byConfig.get(tsconfigPath)
        if (!set) {
          set = new Set<string>()
          byConfig.set(tsconfigPath, set)
        }
        set.add(path.resolve(f))
      }

      const out: Diagnostic[] = []
      for (const [tsconfigPath, wanted] of byConfig) {
        const config = configs.get(tsconfigPath)
        if (!config) continue
        out.push(...getDiagnosticsForConfig(tsconfigPath, config, wanted))
      }
      return out
    } catch {
      // Fail soft: diagnostics must never break the agent loop.
      return []
    }
  },
} satisfies DiagnosticsProvider
