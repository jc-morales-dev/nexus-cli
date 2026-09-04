#!/usr/bin/env bun
/**
 * `bun run eval` — run the NEXUS evaluation suite.
 *
 *   bun run eval                      every scenario (agent ones need a key)
 *   bun run eval --offline            only the deterministic scenarios
 *   bun run eval --scenario fix-bug   one scenario
 *   bun run eval --tag security       everything tagged security
 *   bun run eval --json report.json   also write a machine-readable report
 *
 * The point of the JSON report is version-to-version comparison: same
 * scenarios, same assertions, different NEXUS build.
 */

import fs from 'fs'
import path from 'path'

// MUST come before anything that reaches @nexus/common: that module validates
// a set of NEXT_PUBLIC_* vars at import time and throws when they're missing.
import { initEvalEnv } from './pre-init'

initEvalEnv()

const { redactSecrets } = await import('@nexus/common/util/redact')
const { createAgentDriver } = await import('./driver')
const { runScenarios } = await import('./runner')
const { filterScenarios } = await import('./scenarios')

import type { EvalReport, EvalResult, EvalStatus } from './types'

const STATUS_LABEL: Record<EvalStatus, string> = {
  passed: 'PASS   ',
  partial: 'PARTIAL',
  failed: 'FAIL   ',
  error: 'ERROR  ',
  skipped: 'SKIP   ',
}

function parseArgs(argv: string[]) {
  const flag = (name: string): string | undefined => {
    const index = argv.indexOf(`--${name}`)
    return index >= 0 ? argv[index + 1] : undefined
  }
  return {
    offline: argv.includes('--offline'),
    scenario: flag('scenario'),
    tag: flag('tag'),
    jsonPath: flag('json'),
  }
}

function readVersion(): string {
  try {
    const pkg = JSON.parse(
      fs.readFileSync(path.join(import.meta.dir, '..', 'cli', 'package.json'), 'utf8'),
    ) as { version?: string }
    return pkg.version ?? 'dev'
  } catch {
    return 'dev'
  }
}

function formatDuration(ms: number): string {
  return ms >= 1000 ? `${(ms / 1000).toFixed(1)}s` : `${ms}ms`
}

function printResult(result: EvalResult): void {
  const tools = Object.entries(result.toolUsage)
    .map(([name, count]) => `${name}×${count}`)
    .join(' ')

  console.log(
    `${STATUS_LABEL[result.status]} ${result.scenarioId.padEnd(32)} ` +
      `${formatDuration(result.durationMs).padStart(7)}  ` +
      `intentos:${result.attempts}${tools ? `  herramientas: ${tools}` : ''}`,
  )

  if (result.failureReason) {
    console.log(`         ↳ ${redactSecrets(result.failureReason)}`)
  }
}

function printSummary(report: EvalReport): void {
  const { totals } = report
  console.log('')
  console.log(
    `${totals.passed} passed · ${totals.partial} partial · ${totals.failed} failed · ` +
      `${totals.error} error · ${totals.skipped} skipped  (${formatDuration(totals.durationMs)})`,
  )
  if (totals.skipped > 0) {
    console.log(
      'Los escenarios que necesitan modelo se saltearon: configurá OPENROUTER_API_KEY para correrlos.',
    )
  }
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2))

  const scenarios = filterScenarios({
    ids: args.scenario ? [args.scenario] : undefined,
    tags: args.tag ? [args.tag] : undefined,
    kind: args.offline ? 'offline' : undefined,
  })

  if (scenarios.length === 0) {
    console.error('Ningún escenario coincide con el filtro.')
    process.exit(2)
  }

  const driver = args.offline ? undefined : createAgentDriver()
  if (!args.offline && !driver) {
    console.log(
      'Sin OPENROUTER_API_KEY: se corren solo los escenarios deterministas.\n',
    )
  }

  const report = await runScenarios(scenarios, {
    driver,
    version: readVersion(),
    model: process.env.NEXUS_MODEL_STRONG ?? process.env.NEXUS_MODEL,
    onResult: printResult,
  })

  printSummary(report)

  if (args.jsonPath) {
    fs.writeFileSync(args.jsonPath, JSON.stringify(report, null, 2))
    console.log(`Reporte escrito en ${args.jsonPath}`)
  }

  // Only hard failures gate. `partial` is a signal to look, not a red build:
  // optional assertions exist precisely so a good-but-different answer doesn't
  // fail the suite.
  const gating = report.totals.failed + report.totals.error
  process.exit(gating > 0 ? 1 : 0)
}

void main()
