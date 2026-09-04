/**
 * `nexus doctor` — diagnose the installation before blaming the agent.
 *
 * Prints one line per check with a clear indicator, then a summary. Exits 1
 * only when a check is a hard `error`; warnings are informational, so the
 * command stays usable in a script that just wants "is this installation
 * fundamentally broken?".
 *
 * This file owns the terminal; `./checks.ts` owns the logic. That split is why
 * the checks can be tested without a TTY, a network, or a home directory.
 */

import fs from 'fs'
import os from 'os'
import path from 'path'

import { redactSecrets } from '@nexus/common/util/redact'
import { bold, cyan, dim, green, red, yellow } from 'picocolors'

import { runAllChecks, summarize } from './checks'

import type { CheckResult, DoctorContext, DoctorSummary } from './checks'

export type { CheckResult, DoctorSummary }

const INDICATORS: Record<CheckResult['status'], string> = {
  ok: green('✓ OK'),
  warn: yellow('! WARNING'),
  error: red('✗ ERROR'),
}

/**
 * Look up an executable on PATH without shelling out to `which`/`where`,
 * which differ per platform and don't exist in minimal containers.
 */
async function which(command: string): Promise<string | undefined> {
  const pathValue = process.env.PATH ?? ''
  const separator = process.platform === 'win32' ? ';' : ':'
  const extensions =
    process.platform === 'win32'
      ? (process.env.PATHEXT ?? '.EXE;.CMD;.BAT').split(';')
      : ['']

  for (const dir of pathValue.split(separator).filter(Boolean)) {
    for (const ext of extensions) {
      const candidate = path.join(dir, command + ext.toLowerCase())
      try {
        if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {
          return candidate
        }
      } catch {
        // Unreadable PATH entry — keep looking.
      }
    }
  }
  return undefined
}

/** HEAD-style probe with a hard timeout, returning only the status code. */
async function probe(
  url: string,
  init: { headers: Record<string, string>; timeoutMs: number },
): Promise<number> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), init.timeoutMs)
  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: init.headers,
      signal: controller.signal,
    })
    return response.status
  } finally {
    clearTimeout(timer)
  }
}

function buildContext(options: DoctorOptions): DoctorContext {
  return {
    env: process.env,
    platform: process.platform,
    arch: process.arch,
    runtimeVersion:
      typeof Bun !== 'undefined' ? Bun.version : process.version.replace(/^v/, ''),
    nexusVersion: options.version,
    homeDir: os.homedir(),
    cwd: process.cwd(),
    configDir: options.configDir,
    fs: {
      existsSync: (p) => fs.existsSync(p),
      readFileSync: (p, encoding) => fs.readFileSync(p, encoding),
      statSync: (p) => fs.statSync(p),
      accessSync: (p, mode) => fs.accessSync(p, mode),
    },
    accessMode: { R_OK: fs.constants.R_OK, W_OK: fs.constants.W_OK },
    which,
    probe,
    allowNetwork: options.allowNetwork,
  }
}

export interface DoctorOptions {
  version: string
  configDir: string
  allowNetwork: boolean
  /** Emit machine-readable JSON instead of the human report. */
  json: boolean
}

/** Format the human-readable report. Exported so it can be tested as a string. */
export function formatReport(results: CheckResult[], summary: DoctorSummary): string {
  const lines: string[] = ['', bold(cyan('NEXUS doctor')), '']

  for (const result of results) {
    lines.push(`${INDICATORS[result.status]}  ${bold(result.label)}`)
    lines.push(`        ${redactSecrets(result.detail)}`)
    if (result.hint && result.status !== 'ok') {
      lines.push(dim(`        → ${redactSecrets(result.hint)}`))
    }
  }

  const parts = [
    green(`${summary.passed} checks passed`),
    summary.warnings > 0 ? yellow(`${summary.warnings} warnings`) : null,
    summary.errors > 0 ? red(`${summary.errors} errors`) : null,
  ].filter(Boolean)

  lines.push('', parts.join(dim(' · ')))

  if (summary.errors > 0) {
    lines.push(dim('Arreglá los ✗ primero: son los que impiden que NEXUS funcione.'))
  } else if (summary.warnings > 0) {
    lines.push(dim('Los ! no impiden usar NEXUS, pero conviene revisarlos.'))
  } else {
    lines.push(dim('Todo en orden.'))
  }
  lines.push('')

  return lines.join('\n')
}

/**
 * Run the diagnostics and print the report.
 *
 * @returns the process exit code (1 when a check failed hard).
 */
export async function runDoctor(options: DoctorOptions): Promise<number> {
  const results = await runAllChecks(buildContext(options))
  const summary = summarize(results)

  if (options.json) {
    // Redaction still applies: this output ends up in bug reports too.
    console.log(
      JSON.stringify(
        {
          summary,
          checks: results.map((r) => ({
            ...r,
            detail: redactSecrets(r.detail),
            hint: r.hint ? redactSecrets(r.hint) : undefined,
          })),
        },
        null,
        2,
      ),
    )
  } else {
    console.log(formatReport(results, summary))
  }

  return summary.exitCode
}
