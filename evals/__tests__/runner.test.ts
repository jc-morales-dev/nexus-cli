import { describe, expect, test } from 'bun:test'

import { custom, fileMatches, noSecretsLeaked, onlyTouches } from '../assertions'
import { retryDelayMs, runScenario, runScenarios } from '../runner'
import { allScenarios, filterScenarios, offlineScenarios } from '../scenarios'

import type { AgentDriver } from '../runner'
import type { Scenario } from '../types'

const VERSION = 'test'

/** Retries are real seconds in production; tests must not wait for them. */
const noSleep = async (): Promise<void> => {}

/**
 * A scripted agent: writes the files it's told to and reports a fixed
 * transcript. This is what makes the harness itself verifiable — without it,
 * the only way to know the runner works would be to spend tokens.
 */
function fakeDriver(script: {
  writes?: Record<string, string>
  transcript?: string
  toolCalls?: string[]
  throws?: Error
  failuresBeforeSuccess?: number
}): AgentDriver {
  let calls = 0
  return async ({ workspace }) => {
    calls++
    if (script.throws && calls > (script.failuresBeforeSuccess ?? 0)) {
      throw script.throws
    }
    if (script.failuresBeforeSuccess && calls <= script.failuresBeforeSuccess) {
      throw new Error('transient provider failure')
    }

    const fs = await import('fs')
    const path = await import('path')
    for (const [relative, contents] of Object.entries(script.writes ?? {})) {
      const target = path.join(workspace, relative)
      fs.mkdirSync(path.dirname(target), { recursive: true })
      fs.writeFileSync(target, contents)
    }
    return {
      transcript: script.transcript ?? '',
      toolCalls: script.toolCalls ?? [],
    }
  }
}

const simpleScenario: Scenario = {
  id: 'unit-simple',
  title: 'writes the requested file',
  kind: 'agent',
  tags: ['unit'],
  prompt: 'write it',
  fixture: { 'src/a.js': 'const a = 1\n' },
  assertions: [fileMatches('src/a.js', [/const a = 2/])],
}

describe('runScenario — agent scenarios', () => {
  test('passes when every assertion holds', async () => {
    const result = await runScenario(simpleScenario, {
      version: VERSION,
      driver: fakeDriver({ writes: { 'src/a.js': 'const a = 2\n' } }),
    })
    expect(result.status).toBe('passed')
    expect(result.assertions.every((a) => a.passed)).toBe(true)
  })

  test('fails, with a reason, when a required assertion breaks', async () => {
    const result = await runScenario(simpleScenario, {
      version: VERSION,
      driver: fakeDriver({ writes: { 'src/a.js': 'const a = 99\n' } }),
    })
    expect(result.status).toBe('failed')
    expect(result.failureReason).toContain('src/a.js')
  })

  test('reports partial when only an optional assertion fails', async () => {
    const scenario: Scenario = {
      ...simpleScenario,
      id: 'unit-partial',
      assertions: [
        fileMatches('src/a.js', [/const a = 2/]),
        fileMatches('src/a.js', [/documented/], { required: false, name: 'has docs' }),
      ],
    }
    const result = await runScenario(scenario, {
      version: VERSION,
      driver: fakeDriver({ writes: { 'src/a.js': 'const a = 2\n' } }),
    })
    expect(result.status).toBe('partial')
    expect(result.failureReason).toContain('has docs')
  })

  test('skips agent scenarios when no driver is available', async () => {
    const result = await runScenario(simpleScenario, { version: VERSION })
    expect(result.status).toBe('skipped')
    expect(result.failureReason).toContain('provider key')
  })

  test('retries a transient failure and records the attempt count', async () => {
    const result = await runScenario(simpleScenario, {
      version: VERSION,
      maxAttempts: 3,
      sleep: noSleep,
      driver: fakeDriver({
        failuresBeforeSuccess: 1,
        writes: { 'src/a.js': 'const a = 2\n' },
      }),
    })
    expect(result.status).toBe('passed')
    expect(result.attempts).toBe(2)
  })

  test('reports error, not failed, when the agent never succeeds', async () => {
    const result = await runScenario(simpleScenario, {
      version: VERSION,
      maxAttempts: 2,
      sleep: noSleep,
      driver: fakeDriver({ throws: new Error('provider exploded') }),
    })
    expect(result.status).toBe('error')
    expect(result.failureReason).toContain('provider exploded')
    // A run that burned every retry must not report zero attempts — the
    // attempt count is how you tell a flaky provider from a broken scenario.
    expect(result.attempts).toBe(2)
  })

  test('an assertion that throws fails that assertion, not the run', async () => {
    const scenario: Scenario = {
      ...simpleScenario,
      id: 'unit-throwing-assertion',
      assertions: [
        custom('explodes', true, () => {
          throw new Error('bad assertion')
        }),
      ],
    }
    const result = await runScenario(scenario, {
      version: VERSION,
      driver: fakeDriver({ writes: {} }),
    })
    expect(result.status).toBe('failed')
    expect(result.failureReason).toContain('assertion threw')
  })

  test('counts tool usage', async () => {
    const scenario: Scenario = { ...simpleScenario, id: 'unit-tools', assertions: [] }
    const result = await runScenario(scenario, {
      version: VERSION,
      driver: fakeDriver({ toolCalls: ['read_files', 'write_file', 'read_files'] }),
    })
    expect(result.toolUsage).toEqual({ read_files: 2, write_file: 1 })
  })

  test('records a duration', async () => {
    const result = await runScenario(simpleScenario, {
      version: VERSION,
      driver: fakeDriver({ writes: { 'src/a.js': 'const a = 2\n' } }),
    })
    expect(result.durationMs).toBeGreaterThanOrEqual(0)
  })
})

describe('scope and secret assertions', () => {
  test('onlyTouches catches an out-of-scope edit', async () => {
    const scenario: Scenario = {
      id: 'unit-scope',
      title: 'scope',
      kind: 'agent',
      tags: [],
      prompt: 'x',
      fixture: { 'a.js': 'a\n', 'b.js': 'b\n' },
      assertions: [onlyTouches(['a.js'])],
    }
    const result = await runScenario(scenario, {
      version: VERSION,
      driver: fakeDriver({ writes: { 'a.js': 'a2\n', 'b.js': 'b2\n' } }),
    })
    expect(result.status).toBe('failed')
    expect(result.failureReason).toContain('b.js')
  })

  test('onlyTouches passes when the agent stays in scope', async () => {
    const scenario: Scenario = {
      id: 'unit-scope-ok',
      title: 'scope',
      kind: 'agent',
      tags: [],
      prompt: 'x',
      fixture: { 'a.js': 'a\n', 'b.js': 'b\n' },
      assertions: [onlyTouches(['a.js'])],
    }
    const result = await runScenario(scenario, {
      version: VERSION,
      driver: fakeDriver({ writes: { 'a.js': 'a2\n' } }),
    })
    expect(result.status).toBe('passed')
  })

  test('noSecretsLeaked catches a key written into a file', async () => {
    const fakeKey = 'sk-or-v1-0123456789abcdef0123456789abcdef0123456789abcdef'
    const scenario: Scenario = {
      id: 'unit-secret',
      title: 'secret',
      kind: 'agent',
      tags: [],
      prompt: 'x',
      assertions: [noSecretsLeaked({ alsoCheck: ['config.js'] })],
    }
    const result = await runScenario(scenario, {
      version: VERSION,
      driver: fakeDriver({ writes: { 'config.js': `const key = '${fakeKey}'\n` } }),
    })
    expect(result.status).toBe('failed')
    expect(result.failureReason).toContain('config.js')
  })
})

describe('the shipped scenario suite', () => {
  test('every scenario has a unique id', () => {
    const ids = allScenarios.map((s) => s.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  test('ships between 10 and 20 scenarios', () => {
    expect(allScenarios.length).toBeGreaterThanOrEqual(10)
    expect(allScenarios.length).toBeLessThanOrEqual(20)
  })

  test('every scenario declares at least one assertion', () => {
    for (const scenario of allScenarios) {
      expect(scenario.assertions.length).toBeGreaterThan(0)
    }
  })

  test('every agent scenario has a prompt, every offline one an execute()', () => {
    for (const scenario of allScenarios) {
      if (scenario.kind === 'agent') {
        expect(scenario.prompt, `${scenario.id} needs a prompt`).toBeTruthy()
      } else {
        expect(scenario.execute, `${scenario.id} needs execute()`).toBeTruthy()
      }
    }
  })

  test('covers the required capability areas', () => {
    const ids = new Set(allScenarios.map((s) => s.id))
    for (const required of [
      'fix-bug',
      'add-feature',
      'add-feature-with-tests',
      'find-vulnerability',
      'multi-file-change',
      'respect-repo-instructions',
      'refuse-dangerous-command',
      'recover-invalid-model-response',
      'handle-tool-errors',
      'stay-in-scope',
      'detect-failing-test',
      'fix-without-breaking',
      'handle-incomplete-response',
      'cross-file-consistency',
      'avoid-secret-exposure',
    ]) {
      expect(ids.has(required), `missing scenario: ${required}`).toBe(true)
    }
  })

  test('filterScenarios narrows by kind, tag and id', () => {
    expect(filterScenarios({ kind: 'offline' }).length).toBe(offlineScenarios.length)
    expect(filterScenarios({ ids: ['fix-bug'] }).map((s) => s.id)).toEqual(['fix-bug'])
    expect(filterScenarios({ tags: ['security'] }).length).toBeGreaterThan(0)
  })
})

describe('the offline suite runs green without a model', () => {
  test('every offline scenario passes end to end', async () => {
    const report = await runScenarios(offlineScenarios, { version: VERSION })

    const notPassing = report.results.filter((r) => r.status !== 'passed')
    expect(
      notPassing.map((r) => `${r.scenarioId}: ${r.failureReason}`),
    ).toEqual([])
    expect(report.totals.passed).toBe(offlineScenarios.length)
  })

  test('the report carries the totals needed to compare versions', async () => {
    const report = await runScenarios(offlineScenarios.slice(0, 2), {
      version: '9.9.9',
    })
    expect(report.version).toBe('9.9.9')
    expect(report.startedAt).toBeTruthy()
    expect(report.totals.passed + report.totals.failed).toBe(2)
  })
})

// Regression: a full eval run against a rate-limited account burned every
// retry in under a second and reported seven identical errors, because the
// retry fired immediately. The provider tells us how long to wait.
describe('retry backoff', () => {
  test('honours a Retry-After response header', () => {
    const error = { responseHeaders: { 'retry-after': '120' } }
    expect(retryDelayMs(error, 1)).toBe(120_000)
  })

  test('reads Retry-After out of the JSON body when there is no header', () => {
    const error = {
      responseBody: JSON.stringify({
        error: { metadata: { headers: { 'Retry-After': '30' } } },
      }),
    }
    expect(retryDelayMs(error, 1)).toBe(30_000)
  })

  test('falls back to exponential backoff', () => {
    expect(retryDelayMs(new Error('boom'), 1)).toBe(5_000)
    expect(retryDelayMs(new Error('boom'), 2)).toBe(10_000)
    expect(retryDelayMs(new Error('boom'), 3)).toBe(20_000)
  })

  test('caps the wait even if the provider asks for an hour', () => {
    const error = { responseHeaders: { 'retry-after': '3600' } }
    expect(retryDelayMs(error, 1)).toBe(120_000)
  })

  test('ignores a nonsense Retry-After', () => {
    expect(retryDelayMs({ responseHeaders: { 'retry-after': 'soon' } }, 1)).toBe(5_000)
    expect(retryDelayMs({ responseHeaders: { 'retry-after': '-5' } }, 1)).toBe(5_000)
  })

  test('waits between attempts instead of retrying instantly', async () => {
    const waits: number[] = []
    await runScenario(simpleScenario, {
      version: VERSION,
      maxAttempts: 3,
      sleep: async (ms) => {
        waits.push(ms)
      },
      driver: fakeDriver({ throws: new Error('rate limited') }),
    })
    // One wait between each pair of attempts, never after the last.
    expect(waits.length).toBe(2)
    expect(waits.every((ms) => ms > 0)).toBe(true)
  })
})
