/**
 * Diagnostics entry point: route edited files to the right language provider,
 * collect error diagnostics, and format them as agent feedback.
 *
 * Public surface used by the agent loop:
 *   - {@link lspEnabled}            — is the diagnostics gate on?
 *   - {@link collectDiagnostics}    — diagnostics for a set of files
 *   - {@link formatDiagnosticsForAgent} — feedback text for the loop
 */
import path from 'node:path'

import { goProvider } from './go-provider'
import { pythonProvider } from './python-provider'
import { rustProvider } from './rust-provider'
import { tsProvider } from './ts-provider'

import type { Diagnostic, DiagnosticsProvider } from './types'

export type { Diagnostic, DiagnosticsProvider } from './types'
export { extractEditedFilePaths } from './edited-files'
export { MAX_PROGRAM_FILES } from './ts-provider'

/**
 * Registered providers. TS/JS runs in-process (bundled compiler); Python, Go
 * and Rust shell out to the user's own toolchain and fail soft when it's not
 * installed.
 */
const PROVIDERS: DiagnosticsProvider[] = [
  tsProvider,
  pythonProvider,
  goProvider,
  rustProvider,
]

/** Cap how many diagnostics we feed back, so a broken file can't flood context. */
export const MAX_REPORTED_DIAGNOSTICS = 25

/**
 * Whether the diagnostics gate runs. On by default; set `NEXUS_LSP=0` (or
 * `false`/`off`) to disable. Reads the env lazily so tests/config can flip it.
 */
export function lspEnabled(): boolean {
  const raw = (process.env.NEXUS_LSP ?? '').trim().toLowerCase()
  return raw !== '0' && raw !== 'false' && raw !== 'off'
}

function providerFor(file: string): DiagnosticsProvider | undefined {
  const ext = path.extname(file).toLowerCase()
  return PROVIDERS.find((p) => p.extensions.includes(ext))
}

/**
 * Collect error diagnostics for `files`, grouping by provider. Fails soft: any
 * provider error is swallowed and contributes no diagnostics.
 */
export async function collectDiagnostics(
  files: string[],
): Promise<Diagnostic[]> {
  const byProvider = new Map<DiagnosticsProvider, string[]>()
  for (const file of files) {
    const provider = providerFor(file)
    if (!provider) continue
    const list = byProvider.get(provider) ?? []
    list.push(file)
    byProvider.set(provider, list)
  }

  const all: Diagnostic[] = []
  for (const [provider, providerFiles] of byProvider) {
    try {
      all.push(...(await provider.getDiagnostics(providerFiles)))
    } catch {
      // ignore — fail soft
    }
  }
  return all
}

/** Format diagnostics as a compact, agent-readable block (paths relative to root). */
export function formatDiagnosticsForAgent(
  diagnostics: Diagnostic[],
  projectRoot: string,
): string {
  const shown = diagnostics.slice(0, MAX_REPORTED_DIAGNOSTICS)
  const extra = diagnostics.length - shown.length
  const lines = shown.map((d) => {
    const rel = path.relative(projectRoot, d.file) || d.file
    const where = d.line > 0 ? `:${d.line}:${d.column}` : ''
    const code = d.code !== undefined ? ` [${d.code}]` : ''
    return `- ${rel}${where}${code} ${d.message.replace(/\s+/g, ' ').trim()}`
  })
  const header =
    `Your edits introduced ${diagnostics.length} compiler error` +
    `${diagnostics.length === 1 ? '' : 's'}. Fix ${diagnostics.length === 1 ? 'it' : 'them'} before finishing:`
  const footer =
    extra > 0 ? `\n…and ${extra} more (fix the above first, then re-check).` : ''
  return `${header}\n${lines.join('\n')}${footer}`
}
