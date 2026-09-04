/**
 * Types for the NEXUS evaluation harness.
 *
 * Evals are not unit tests. A unit test asserts that a function returns an
 * exact value; an eval asserts that the *agent behaved acceptably* on a task
 * whose correct answer has many shapes. Comparing model output to a golden
 * string would fail on a better answer, so every assertion here is written
 * against observable outcomes — did the file end up containing a fix, do the
 * project's own tests pass now, was a file outside the requested scope touched,
 * did a secret leak into the transcript.
 *
 * Two kinds of scenario:
 *
 *   `agent`   — needs a real model. Runs the agent against a scratch workspace.
 *               Skipped when no provider key is configured, so the suite is
 *               still runnable (and meaningful) in CI and on a fresh clone.
 *   `offline` — exercises NEXUS's own behaviour with no model involved: how it
 *               classifies a malformed model response, whether it refuses a
 *               destructive command, whether the redactor holds. These are
 *               deterministic and always run.
 */

export type ScenarioKind = 'agent' | 'offline'

export type EvalStatus =
  /** Every assertion held. */
  | 'passed'
  /** Some assertions held, none of the required ones failed. */
  | 'partial'
  /** A required assertion failed. */
  | 'failed'
  /** The scenario could not be evaluated (crash, setup failure). */
  | 'error'
  /** Not applicable in this environment (e.g. no API key). */
  | 'skipped'

/** A file tree, as a map of relative path → contents. */
export type FileTree = Record<string, string>

export interface AssertionContext {
  /** Absolute path to the scratch workspace. */
  workspace: string
  /** Read a workspace file; undefined when it doesn't exist. */
  readFile(relativePath: string): string | undefined
  /** Every workspace path that changed relative to the fixture. */
  changedFiles: string[]
  /** Full text the agent produced. */
  transcript: string
  /** Tool names the agent invoked, in order (may contain duplicates). */
  toolCalls: string[]
  /** Run a command inside the workspace. */
  run(command: string, args: string[]): Promise<{ exitCode: number; stdout: string; stderr: string }>
}

export interface AssertionResult {
  name: string
  passed: boolean
  /** Why it failed. Empty when it passed. */
  reason?: string
}

export interface Assertion {
  name: string
  /**
   * A failing required assertion makes the scenario `failed`. A failing
   * optional one only downgrades `passed` to `partial` — this is how "did it
   * also write a test?" gets scored without making the whole eval brittle.
   */
  required: boolean
  check(ctx: AssertionContext): Promise<AssertionResult> | AssertionResult
}

export interface Scenario {
  /** Stable id, used in reports and to run one scenario at a time. */
  id: string
  /** One line: what capability this measures. */
  title: string
  kind: ScenarioKind
  /** Free-form tags for filtering, e.g. 'security', 'refactor'. */
  tags: string[]
  /** Files written into the scratch workspace before the run. */
  fixture?: FileTree
  /** What the user would type. Required for `agent` scenarios. */
  prompt?: string
  /** Agent id to run. Defaults to the CLI's own default agent. */
  agent?: string
  /** Assertions evaluated after the run. */
  assertions: Assertion[]
  /**
   * For `offline` scenarios: do the work directly and report. Receives the same
   * context shape so assertions can be shared between kinds.
   */
  execute?(ctx: OfflineExecutionContext): Promise<OfflineOutcome> | OfflineOutcome
}

export interface OfflineExecutionContext {
  workspace: string
}

export interface OfflineOutcome {
  transcript: string
  toolCalls: string[]
  changedFiles?: string[]
}

export interface EvalResult {
  scenarioId: string
  title: string
  kind: ScenarioKind
  status: EvalStatus
  /** Wall-clock milliseconds. */
  durationMs: number
  /** How many times the runner had to retry (transient provider failures). */
  attempts: number
  /** Distinct tools used, with counts. */
  toolUsage: Record<string, number>
  assertions: AssertionResult[]
  /** Human-readable explanation when the status isn't `passed`. */
  failureReason?: string
}

export interface EvalReport {
  startedAt: string
  /** NEXUS version under evaluation, so two reports can be compared. */
  version: string
  /** Model actually used, when known. */
  model?: string
  results: EvalResult[]
  totals: {
    passed: number
    partial: number
    failed: number
    error: number
    skipped: number
    durationMs: number
  }
}
