/**
 * Lightweight diagnostics ("LSP-lite") for the agent loop.
 *
 * The point of this subsystem is reliability that is *model-agnostic*: after the
 * main coding agent edits files and is about to finish, we surface compiler
 * diagnostics (type errors, syntax errors) on exactly the files it touched and
 * feed them back so it fixes them before ending the turn. A small/cheap model
 * benefits the most — it gets the same compiler feedback a strong model would
 * have reasoned about on its own.
 *
 * Providers are pluggable per language. v1 ships an in-process TypeScript/JS
 * provider (zero install — reuses the bundled `typescript` compiler). Other
 * languages can be added later behind the same {@link DiagnosticsProvider}
 * interface (e.g. an external LSP-server client for Python/Go/Rust).
 */

/** A single compiler diagnostic, normalized across providers. */
export interface Diagnostic {
  /** Absolute path of the file the diagnostic belongs to. */
  file: string
  /** 1-based line number. */
  line: number
  /** 1-based column number. */
  column: number
  /** Human-readable message. */
  message: string
  /** Provider-specific code (e.g. TS error code 2345), if any. */
  code?: string | number
}

/** A language diagnostics provider for a set of file extensions. */
export interface DiagnosticsProvider {
  /** Provider name, for logs. */
  readonly name: string
  /** Lowercased file extensions this provider handles, incl. the dot. */
  readonly extensions: readonly string[]
  /**
   * Return error diagnostics for `files` (absolute paths, all handled by this
   * provider). MUST fail soft: any internal error should yield `[]`, never throw
   * — a flaky diagnostics pass must never break the agent loop.
   */
  getDiagnostics(files: string[]): Diagnostic[] | Promise<Diagnostic[]>
}
