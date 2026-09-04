/**
 * The eval runner.
 *
 * Takes scenarios, prepares an isolated workspace for each, drives either the
 * real agent or the scenario's own offline routine, and scores the result
 * against its assertions.
 *
 * The agent driver is injected (`AgentDriver`) rather than imported directly.
 * That is what lets the runner itself be unit-tested with a scripted fake — a
 * harness that can only be verified by spending money on a model is a harness
 * nobody verifies.
 */

import {
  createWorkspace,
  destroyWorkspace,
  diffWorkspace,
  readWorkspaceFile,
  runInWorkspace,
} from './workspace'

import type {
  AssertionContext,
  AssertionResult,
  EvalReport,
  EvalResult,
  EvalStatus,
  Scenario,
} from './types'
import type { Workspace } from './workspace'

export interface AgentRunOutcome {
  transcript: string
  toolCalls: string[]
}

/** Drives one agent turn against a workspace. */
export type AgentDriver = (input: {
  workspace: string
  prompt: string
  agent?: string
  signal?: AbortSignal
}) => Promise<AgentRunOutcome>

export interface RunnerOptions {
  /** Omit to skip every `agent` scenario (reported as `skipped`). */
  driver?: AgentDriver
  /** Retries for transient provider failures. */
  maxAttempts?: number
  /** NEXUS version under evaluation, recorded in the report. */
  version: string
  model?: string
  /** Called after each scenario, for progress output. */
  onResult?: (result: EvalResult) => void
  /** Wall-clock cap per scenario. */
  timeoutMs?: number
  /** Injected for tests, so a retry doesn't make the suite wait for real. */
  sleep?: (ms: number) => Promise<void>
}

const DEFAULT_MAX_ATTEMPTS = 2
const DEFAULT_TIMEOUT_MS = 300_000
/** Base backoff between attempts, doubled per attempt. */
const RETRY_BASE_MS = 5_000
/** Never wait longer than this, even if the provider asks for more. */
const RETRY_MAX_MS = 120_000

const defaultSleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms))

/**
 * How long to wait before retrying.
 *
 * Providers say how long to wait when they rate-limit — OpenRouter sends
 * `Retry-After` and puts it in the error metadata — and honouring that is
 * strictly better than guessing. Falls back to exponential backoff.
 */
export function retryDelayMs(error: unknown, attempt: number): number {
  const fromProvider = retryAfterSeconds(error)
  if (fromProvider !== undefined) {
    return Math.min(fromProvider * 1000, RETRY_MAX_MS)
  }
  return Math.min(RETRY_BASE_MS * 2 ** (attempt - 1), RETRY_MAX_MS)
}

/** Dig a Retry-After value out of whatever shape the provider error has. */
function retryAfterSeconds(error: unknown): number | undefined {
  if (!error || typeof error !== 'object') return undefined

  const headers = (error as { responseHeaders?: Record<string, unknown> })
    .responseHeaders
  const headerValue = headers?.['retry-after'] ?? headers?.['Retry-After']
  const fromHeader = Number(headerValue)
  if (Number.isFinite(fromHeader) && fromHeader > 0) return fromHeader

  // OpenRouter also repeats it inside the JSON body.
  const body = (error as { responseBody?: unknown }).responseBody
  if (typeof body === 'string') {
    const match = /"Retry-After"\s*:\s*"?(\d+)"?/i.exec(body)
    if (match) {
      const seconds = Number(match[1])
      if (Number.isFinite(seconds) && seconds > 0) return seconds
    }
  }
  return undefined
}

export async function runScenario(
  scenario: Scenario,
  options: RunnerOptions,
): Promise<EvalResult> {
  const startedAt = Date.now()
  const base = {
    scenarioId: scenario.id,
    title: scenario.title,
    kind: scenario.kind,
    attempts: 0,
    toolUsage: {} as Record<string, number>,
    assertions: [] as AssertionResult[],
  }

  if (scenario.kind === 'agent' && !options.driver) {
    return {
      ...base,
      status: 'skipped',
      durationMs: 0,
      failureReason: 'No provider key configured — agent scenarios need a live model.',
    }
  }

  let workspace: Workspace | undefined
  try {
    workspace = createWorkspace(scenario.id, scenario.fixture)

    const { outcome, attempts } = await driveScenario(scenario, workspace, options)
    base.attempts = attempts
    base.toolUsage = countTools(outcome.toolCalls)

    const ctx = buildAssertionContext(workspace, outcome)
    const assertions = await evaluateAssertions(scenario, ctx)

    return {
      ...base,
      assertions,
      status: scoreAssertions(scenario, assertions),
      durationMs: Date.now() - startedAt,
      failureReason: summariseFailures(assertions),
    }
  } catch (error) {
    return {
      ...base,
      // `driveScenario` records attempts on the error before rethrowing, so a
      // run that burned three retries doesn't get reported as zero attempts.
      attempts: attemptsOf(error) ?? base.attempts,
      status: 'error',
      durationMs: Date.now() - startedAt,
      failureReason: error instanceof Error ? error.message : String(error),
    }
  } finally {
    if (workspace) destroyWorkspace(workspace)
  }
}

async function driveScenario(
  scenario: Scenario,
  workspace: Workspace,
  options: RunnerOptions,
): Promise<{ outcome: AgentRunOutcome & { changedFiles?: string[] }; attempts: number }> {
  if (scenario.kind === 'offline') {
    if (!scenario.execute) {
      throw new Error(`Offline scenario "${scenario.id}" has no execute()`)
    }
    const outcome = await scenario.execute({ workspace: workspace.dir })
    return { outcome, attempts: 1 }
  }

  if (!scenario.prompt) {
    throw new Error(`Agent scenario "${scenario.id}" has no prompt`)
  }

  const maxAttempts = options.maxAttempts ?? DEFAULT_MAX_ATTEMPTS
  let lastError: unknown

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const controller = new AbortController()
    const timer = setTimeout(
      () => controller.abort(),
      options.timeoutMs ?? DEFAULT_TIMEOUT_MS,
    )
    try {
      const outcome = await options.driver!({
        workspace: workspace.dir,
        prompt: scenario.prompt,
        agent: scenario.agent,
        signal: controller.signal,
      })
      return { outcome, attempts: attempt }
    } catch (error) {
      lastError = error
      if (attempt < maxAttempts) {
        // Retrying instantly is worse than not retrying at all: the failures
        // worth retrying are rate limits and in-flight budget exhaustion, and
        // both need time to clear. An immediate second attempt just burns the
        // retry and reports the same error — which is exactly what a full eval
        // run against a free-tier account did before this existed.
        const wait = options.sleep ?? defaultSleep
        await wait(retryDelayMs(error, attempt))
      }
    } finally {
      clearTimeout(timer)
    }
  }

  const failure =
    lastError instanceof Error
      ? lastError
      : new Error(`Agent run failed after ${maxAttempts} attempts: ${String(lastError)}`)
  throw withAttempts(failure, maxAttempts)
}

/** Attach the attempt count to an error so the result can report it. */
const ATTEMPTS_KEY = Symbol.for('nexus.eval.attempts')

function withAttempts(error: Error, attempts: number): Error {
  ;(error as unknown as Record<symbol, number>)[ATTEMPTS_KEY] = attempts
  return error
}

function attemptsOf(error: unknown): number | undefined {
  if (error && typeof error === 'object') {
    const value = (error as Record<symbol, unknown>)[ATTEMPTS_KEY]
    if (typeof value === 'number') return value
  }
  return undefined
}

function buildAssertionContext(
  workspace: Workspace,
  outcome: AgentRunOutcome & { changedFiles?: string[] },
): AssertionContext {
  return {
    workspace: workspace.dir,
    readFile: (relativePath) => readWorkspaceFile(workspace, relativePath),
    changedFiles: outcome.changedFiles ?? diffWorkspace(workspace),
    transcript: outcome.transcript,
    toolCalls: outcome.toolCalls,
    run: (command, args) => runInWorkspace(workspace, command, args),
  }
}

async function evaluateAssertions(
  scenario: Scenario,
  ctx: AssertionContext,
): Promise<AssertionResult[]> {
  const results: AssertionResult[] = []
  for (const assertion of scenario.assertions) {
    try {
      const result = await assertion.check(ctx)
      // Keep the declared name: assertion helpers sometimes report a shorter
      // internal label, and the report should show what the scenario declared.
      results.push({ ...result, name: assertion.name })
    } catch (error) {
      results.push({
        name: assertion.name,
        passed: false,
        reason: `assertion threw: ${error instanceof Error ? error.message : String(error)}`,
      })
    }
  }
  return results
}

function scoreAssertions(scenario: Scenario, results: AssertionResult[]): EvalStatus {
  const requiredNames = new Set(
    scenario.assertions.filter((a) => a.required).map((a) => a.name),
  )
  const failedRequired = results.some((r) => !r.passed && requiredNames.has(r.name))
  if (failedRequired) return 'failed'

  const anyFailed = results.some((r) => !r.passed)
  return anyFailed ? 'partial' : 'passed'
}

function summariseFailures(results: AssertionResult[]): string | undefined {
  const failures = results.filter((r) => !r.passed)
  if (failures.length === 0) return undefined
  return failures.map((f) => `${f.name}: ${f.reason ?? 'failed'}`).join(' | ')
}

function countTools(toolCalls: string[]): Record<string, number> {
  const counts: Record<string, number> = {}
  for (const name of toolCalls) {
    counts[name] = (counts[name] ?? 0) + 1
  }
  return counts
}

export async function runScenarios(
  scenarios: Scenario[],
  options: RunnerOptions,
): Promise<EvalReport> {
  const startedAt = new Date().toISOString()
  const results: EvalResult[] = []

  for (const scenario of scenarios) {
    const result = await runScenario(scenario, options)
    results.push(result)
    options.onResult?.(result)
  }

  return {
    startedAt,
    version: options.version,
    model: options.model,
    results,
    totals: {
      passed: results.filter((r) => r.status === 'passed').length,
      partial: results.filter((r) => r.status === 'partial').length,
      failed: results.filter((r) => r.status === 'failed').length,
      error: results.filter((r) => r.status === 'error').length,
      skipped: results.filter((r) => r.status === 'skipped').length,
      durationMs: results.reduce((sum, r) => sum + r.durationMs, 0),
    },
  }
}
