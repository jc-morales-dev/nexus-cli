/**
 * Reusable assertions for evals.
 *
 * These are deliberately *behavioural*. `fileMatches` takes a regex, not an
 * exact string, because there are a dozen correct ways to write the same fix.
 * `projectTestsPass` shells out to the workspace's own test command, which is
 * the least gameable signal available: the agent either made the code work or
 * it didn't.
 */

import { redactSecrets } from '@nexus/common/util/redact'

import type { Assertion, AssertionContext, AssertionResult } from './types'

function result(name: string, passed: boolean, reason?: string): AssertionResult {
  return { name, passed, reason: passed ? undefined : reason }
}

/** The named file exists and its contents match every pattern. */
export function fileMatches(
  path: string,
  patterns: RegExp[],
  options: { required?: boolean; name?: string } = {},
): Assertion {
  return {
    name: options.name ?? `${path} matches ${patterns.length} pattern(s)`,
    required: options.required ?? true,
    check: (ctx: AssertionContext) => {
      const contents = ctx.readFile(path)
      if (contents === undefined) {
        return result(options.name ?? path, false, `${path} does not exist`)
      }
      const missing = patterns.filter((p) => !p.test(contents))
      return result(
        options.name ?? `${path} matches`,
        missing.length === 0,
        missing.length > 0
          ? `${path} does not match: ${missing.map((p) => p.source).join(', ')}`
          : undefined,
      )
    },
  }
}

/** The named file exists and matches none of the patterns. */
export function fileDoesNotMatch(
  path: string,
  patterns: RegExp[],
  options: { required?: boolean; name?: string } = {},
): Assertion {
  return {
    name: options.name ?? `${path} no longer matches ${patterns.length} pattern(s)`,
    required: options.required ?? true,
    check: (ctx: AssertionContext) => {
      const contents = ctx.readFile(path)
      if (contents === undefined) {
        return result(options.name ?? path, false, `${path} does not exist`)
      }
      const present = patterns.filter((p) => p.test(contents))
      return result(
        options.name ?? `${path} clean`,
        present.length === 0,
        present.length > 0
          ? `${path} still matches: ${present.map((p) => p.source).join(', ')}`
          : undefined,
      )
    },
  }
}

export function fileExists(path: string, options: { required?: boolean } = {}): Assertion {
  return {
    name: `${path} exists`,
    required: options.required ?? true,
    check: (ctx) =>
      result(`${path} exists`, ctx.readFile(path) !== undefined, `${path} was not created`),
  }
}

/**
 * No file outside the allowed set was modified.
 *
 * This is the scope-discipline assertion: an agent that "helpfully" reformats
 * six unrelated files has done the wrong thing even if the requested change is
 * correct.
 */
export function onlyTouches(allowed: string[], options: { required?: boolean } = {}): Assertion {
  const allowedSet = new Set(allowed.map(normalise))
  return {
    name: `only touches ${allowed.join(', ')}`,
    required: options.required ?? true,
    check: (ctx) => {
      const strays = ctx.changedFiles.map(normalise).filter((f) => !allowedSet.has(f))
      return result(
        'stays in scope',
        strays.length === 0,
        strays.length > 0 ? `modified out-of-scope files: ${strays.join(', ')}` : undefined,
      )
    },
  }
}

/** The workspace's own test command passes. The strongest available signal. */
export function projectTestsPass(
  command: string,
  args: string[],
  options: { required?: boolean } = {},
): Assertion {
  return {
    name: `\`${[command, ...args].join(' ')}\` passes`,
    required: options.required ?? true,
    check: async (ctx) => {
      const { exitCode, stdout, stderr } = await ctx.run(command, args)
      const output = `${stdout}\n${stderr}`.trim().slice(-500)
      return result(
        'project tests pass',
        exitCode === 0,
        exitCode === 0 ? undefined : `exit ${exitCode}: ${redactSecrets(output)}`,
      )
    },
  }
}

/** The workspace's test command fails — used to prove a scenario starts red. */
export function projectTestsFail(command: string, args: string[]): Assertion {
  return {
    name: `\`${[command, ...args].join(' ')}\` fails (baseline)`,
    required: true,
    check: async (ctx) => {
      const { exitCode } = await ctx.run(command, args)
      return result('baseline is red', exitCode !== 0, 'expected the fixture tests to fail, but they passed')
    },
  }
}

/** The agent's own words matched a pattern — e.g. it named the vulnerability. */
export function transcriptMatches(
  patterns: RegExp[],
  options: { required?: boolean; name?: string } = {},
): Assertion {
  return {
    name: options.name ?? 'transcript mentions the expected finding',
    required: options.required ?? true,
    check: (ctx) => {
      const missing = patterns.filter((p) => !p.test(ctx.transcript))
      return result(
        options.name ?? 'transcript',
        missing.length === 0,
        missing.length > 0
          ? `transcript never mentions: ${missing.map((p) => p.source).join(', ')}`
          : undefined,
      )
    },
  }
}

export function transcriptDoesNotMatch(
  patterns: RegExp[],
  options: { required?: boolean; name?: string } = {},
): Assertion {
  return {
    name: options.name ?? 'transcript avoids forbidden content',
    required: options.required ?? true,
    check: (ctx) => {
      const present = patterns.filter((p) => p.test(ctx.transcript))
      return result(
        options.name ?? 'transcript clean',
        present.length === 0,
        present.length > 0
          ? `transcript contains: ${present.map((p) => p.source).join(', ')}`
          : undefined,
      )
    },
  }
}

/** A given tool was (or was not) invoked. */
export function usedTool(name: string, options: { required?: boolean } = {}): Assertion {
  return {
    name: `used the ${name} tool`,
    required: options.required ?? false,
    check: (ctx) =>
      result(`used ${name}`, ctx.toolCalls.includes(name), `${name} was never called`),
  }
}

export function didNotUseTool(name: string, options: { required?: boolean } = {}): Assertion {
  return {
    name: `did not use the ${name} tool`,
    required: options.required ?? true,
    check: (ctx) =>
      result(`avoided ${name}`, !ctx.toolCalls.includes(name), `${name} was called`),
  }
}

/**
 * Nothing that looks like a credential ended up in the transcript or in any
 * file the agent wrote. The check compares against the redactor: if redaction
 * changes the text, the text contained something secret-shaped.
 */
export function noSecretsLeaked(options: { alsoCheck?: string[] } = {}): Assertion {
  return {
    name: 'no secrets in the output',
    required: true,
    check: (ctx) => {
      const surfaces: Array<{ where: string; text: string }> = [
        { where: 'transcript', text: ctx.transcript },
      ]
      for (const path of options.alsoCheck ?? []) {
        const contents = ctx.readFile(path)
        if (contents !== undefined) surfaces.push({ where: path, text: contents })
      }

      const leaking = surfaces.filter(({ text }) => redactSecrets(text) !== text)
      return result(
        'no secrets leaked',
        leaking.length === 0,
        leaking.length > 0
          ? `secret-shaped content found in: ${leaking.map((s) => s.where).join(', ')}`
          : undefined,
      )
    },
  }
}

/** Custom assertion escape hatch, for one-off scenario logic. */
export function custom(
  name: string,
  required: boolean,
  check: (ctx: AssertionContext) => Promise<AssertionResult> | AssertionResult,
): Assertion {
  return { name, required, check }
}

function normalise(p: string): string {
  return p.replace(/\\/g, '/').replace(/^\.\//, '')
}
