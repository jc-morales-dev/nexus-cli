import { describe, expect, test } from 'bun:test'
import path from 'path'

import {
  checkApiKey,
  checkConfigDir,
  checkEnvFileIgnored,
  checkGit,
  checkModel,
  checkProjectWritable,
  checkProviderReachable,
  checkRipgrep,
  checkRuntime,
  checkSettingsFile,
  checkSettingsPermissions,
  runAllChecks,
  summarize,
} from '../checks'
import { formatReport } from '../index'

import type { CheckResult, DoctorContext } from '../checks'

const FAKE_KEY = 'sk-or-v1-0123456789abcdef0123456789abcdef0123456789abcdef'
const CONFIG_DIR = path.join('/home', 'dev', '.config', 'nexus')
const SETTINGS_PATH = path.join(CONFIG_DIR, 'settings.json')
const PROJECT_DIR = path.join('/home', 'dev', 'project')
const ENV_PATH = path.join(PROJECT_DIR, '.env')
const GITIGNORE_PATH = path.join(PROJECT_DIR, '.gitignore')

/**
 * A fully faked environment. Every check runs against this, so the suite never
 * touches the real filesystem, PATH or network — which is also what makes the
 * "no key configured" and "read-only directory" cases testable at all.
 */
function makeContext(overrides: Partial<DoctorContext> = {}): DoctorContext {
  const files = new Map<string, string>()
  const modes = new Map<string, number>()
  const unwritable = new Set<string>()
  const unreadable = new Set<string>()

  const base: DoctorContext = {
    env: {},
    platform: 'linux',
    arch: 'x64',
    runtimeVersion: '1.3.11',
    nexusVersion: '1.0.3',
    homeDir: '/home/dev',
    cwd: PROJECT_DIR,
    configDir: CONFIG_DIR,
    fs: {
      existsSync: (p) => files.has(p) || p === CONFIG_DIR || p === PROJECT_DIR,
      readFileSync: (p) => {
        const content = files.get(p)
        if (content === undefined) throw new Error(`ENOENT: ${p}`)
        return content
      },
      statSync: (p) => ({
        mode: modes.get(p) ?? 0o600,
        isDirectory: () => !files.has(p),
      }),
      accessSync: (p, mode) => {
        if (mode === 2 && unwritable.has(p)) throw new Error('EACCES')
        if (mode === 4 && unreadable.has(p)) throw new Error('EACCES')
      },
    },
    accessMode: { R_OK: 4, W_OK: 2 },
    which: async () => undefined,
    probe: async () => 200,
    allowNetwork: false,
    ...overrides,
  }

  // Expose the fakes so individual tests can seed them.
  ;(base as any).__files = files
  ;(base as any).__modes = modes
  ;(base as any).__unwritable = unwritable
  ;(base as any).__unreadable = unreadable
  return base
}

function seedFile(ctx: DoctorContext, filePath: string, content: string): void {
  ;(ctx as any).__files.set(filePath, content)
}

describe('checkApiKey', () => {
  test('is a hard error when no key is configured anywhere', () => {
    const result = checkApiKey(makeContext())
    expect(result.status).toBe('error')
    expect(result.hint).toContain('openrouter.ai/keys')
  })

  test('never prints the key, only a mask', () => {
    const ctx = makeContext({ env: { OPENROUTER_API_KEY: FAKE_KEY } })
    const result = checkApiKey(ctx)
    expect(result.status).toBe('ok')
    expect(result.detail).not.toContain(FAKE_KEY)
    expect(result.detail).toContain('sk-or-v1-…cdef')
  })

  test('says which source the key came from', () => {
    const fromEnv = checkApiKey(makeContext({ env: { OPENROUTER_API_KEY: FAKE_KEY } }))
    expect(fromEnv.detail).toContain('variable de entorno')

    const ctx = makeContext()
    seedFile(ctx, SETTINGS_PATH, JSON.stringify({ openRouterApiKey: FAKE_KEY }))
    expect(checkApiKey(ctx).detail).toContain('settings.json')
  })

  test('warns — but does not fail — on a key with an unexpected prefix', () => {
    const ctx = makeContext({ env: { OPENROUTER_API_KEY: 'gateway-token-abcdef123456' } })
    const result = checkApiKey(ctx)
    expect(result.status).toBe('warn')
    expect(result.detail).not.toContain('gateway-token-abcdef123456')
  })

  test('prefers the environment variable when it differs from the saved key', () => {
    const ctx = makeContext({ env: { OPENROUTER_API_KEY: FAKE_KEY } })
    seedFile(ctx, SETTINGS_PATH, JSON.stringify({ openRouterApiKey: 'sk-or-other-value-here' }))
    expect(checkApiKey(ctx).detail).toContain('variable de entorno')
  })

  // The CLI's pre-init copies the saved key into the environment. Reporting
  // that as "you exported it" would send the user to edit a shell profile that
  // has nothing to do with the key they actually need to change.
  test('credits settings.json when the env var is just the pre-init copy', () => {
    const ctx = makeContext({ env: { OPENROUTER_API_KEY: FAKE_KEY } })
    seedFile(ctx, SETTINGS_PATH, JSON.stringify({ openRouterApiKey: FAKE_KEY }))
    const result = checkApiKey(ctx)
    expect(result.detail).toContain('settings.json')
    expect(result.detail).toContain('/key')
  })
})

describe('checkSettingsFile', () => {
  test('passes when there is no settings file yet', () => {
    expect(checkSettingsFile(makeContext()).status).toBe('ok')
  })

  test('fails on a corrupt settings file and says where it is', () => {
    const ctx = makeContext()
    seedFile(ctx, SETTINGS_PATH, '{ not json')
    const result = checkSettingsFile(ctx)
    expect(result.status).toBe('error')
    expect(result.hint).toContain(SETTINGS_PATH)
  })

  test('fails when the file parses to a non-object', () => {
    const ctx = makeContext()
    seedFile(ctx, SETTINGS_PATH, '"a string"')
    expect(checkSettingsFile(ctx).status).toBe('error')
  })
})

describe('checkSettingsPermissions', () => {
  test('warns when the file holding the key is world-readable', () => {
    const ctx = makeContext()
    seedFile(ctx, SETTINGS_PATH, '{}')
    ;(ctx as any).__modes.set(SETTINGS_PATH, 0o644)
    const result = checkSettingsPermissions(ctx)
    expect(result.status).toBe('warn')
    expect(result.hint).toContain('chmod 600')
  })

  test('passes on 600', () => {
    const ctx = makeContext()
    seedFile(ctx, SETTINGS_PATH, '{}')
    ;(ctx as any).__modes.set(SETTINGS_PATH, 0o600)
    expect(checkSettingsPermissions(ctx).status).toBe('ok')
  })

  test('does not apply the POSIX rule on Windows', () => {
    const ctx = makeContext({ platform: 'win32' })
    seedFile(ctx, SETTINGS_PATH, '{}')
    ;(ctx as any).__modes.set(SETTINGS_PATH, 0o644)
    expect(checkSettingsPermissions(ctx).status).toBe('ok')
  })
})

describe('checkConfigDir and checkProjectWritable', () => {
  test('fails when the config directory cannot be written', () => {
    const ctx = makeContext()
    ;(ctx as any).__unwritable.add(CONFIG_DIR)
    expect(checkConfigDir(ctx).status).toBe('error')
  })

  test('warns when the project directory is read-only but readable', () => {
    const ctx = makeContext()
    ;(ctx as any).__unwritable.add(PROJECT_DIR)
    const result = checkProjectWritable(ctx)
    expect(result.status).toBe('warn')
    expect(result.hint).toContain('no va a poder editarlo')
  })

  test('fails when the project directory cannot even be read', () => {
    const ctx = makeContext()
    ;(ctx as any).__unreadable.add(PROJECT_DIR)
    expect(checkProjectWritable(ctx).status).toBe('error')
  })
})

describe('checkEnvFileIgnored', () => {
  test('passes when there is no .env', () => {
    expect(checkEnvFileIgnored(makeContext()).status).toBe('ok')
  })

  test('warns when a .env exists with no .gitignore', () => {
    const ctx = makeContext()
    seedFile(ctx, ENV_PATH, 'OPENROUTER_API_KEY=x')
    const result = checkEnvFileIgnored(ctx)
    expect(result.status).toBe('warn')
    expect(result.hint).toContain('.gitignore')
  })

  test('warns when the .gitignore does not cover .env', () => {
    const ctx = makeContext()
    seedFile(ctx, ENV_PATH, 'OPENROUTER_API_KEY=x')
    seedFile(ctx, GITIGNORE_PATH, 'node_modules\ndist\n')
    expect(checkEnvFileIgnored(ctx).status).toBe('warn')
  })

  test('passes when .env is ignored', () => {
    const ctx = makeContext()
    seedFile(ctx, ENV_PATH, 'OPENROUTER_API_KEY=x')
    seedFile(ctx, GITIGNORE_PATH, 'node_modules\n.env\n')
    expect(checkEnvFileIgnored(ctx).status).toBe('ok')
  })

  test('never echoes the contents of the .env', () => {
    const ctx = makeContext()
    seedFile(ctx, ENV_PATH, `OPENROUTER_API_KEY=${FAKE_KEY}`)
    const result = checkEnvFileIgnored(ctx)
    expect(JSON.stringify(result)).not.toContain(FAKE_KEY)
  })
})

describe('checkRuntime and checkModel', () => {
  test('warns on a runtime older than the tested minimum', () => {
    expect(checkRuntime(makeContext({ runtimeVersion: '1.1.0' })).status).toBe('warn')
  })

  test('accepts the pinned runtime', () => {
    expect(checkRuntime(makeContext({ runtimeVersion: '1.3.11' })).status).toBe('ok')
  })

  test('reports a forced model override as such', () => {
    const result = checkModel(makeContext({ env: { NEXUS_MODEL: 'deepseek/deepseek-v3.2' } }))
    expect(result.detail).toContain('Forzado')
  })

  test('warns when no model is configured', () => {
    expect(checkModel(makeContext()).status).toBe('warn')
  })

  test('reports both tiers when they are set', () => {
    const result = checkModel(
      makeContext({
        env: { NEXUS_MODEL_STRONG: 'a/strong', NEXUS_MODEL_CHEAP: 'a/cheap' },
      }),
    )
    expect(result.detail).toContain('a/strong')
    expect(result.detail).toContain('a/cheap')
  })
})

describe('external tools', () => {
  test('warns rather than fails when git is missing', async () => {
    expect((await checkGit(makeContext())).status).toBe('warn')
  })

  test('reports the resolved git path when present', async () => {
    const ctx = makeContext({ which: async () => '/usr/bin/git' })
    expect((await checkGit(ctx)).detail).toBe('/usr/bin/git')
  })

  test('honours NEXUS_RG_PATH for ripgrep', async () => {
    const ctx = makeContext({ env: { NEXUS_RG_PATH: '/opt/rg' } })
    seedFile(ctx, '/opt/rg', '')
    expect((await checkRipgrep(ctx)).status).toBe('ok')
  })
})

describe('checkProviderReachable', () => {
  test('is skipped without network access', async () => {
    const result = await checkProviderReachable(makeContext({ allowNetwork: false }))
    expect(result.status).toBe('ok')
    expect(result.detail).toContain('--no-network')
  })

  test('fails on a 401 and tells the user to replace the key', async () => {
    const ctx = makeContext({
      allowNetwork: true,
      env: { OPENROUTER_API_KEY: FAKE_KEY },
      probe: async () => 401,
    })
    const result = await checkProviderReachable(ctx)
    expect(result.status).toBe('error')
    expect(result.hint).toContain('/key')
  })

  // Regression: an earlier version probed /api/v1/models, which is public and
  // answers 200 for a revoked key — so doctor reported a healthy connection
  // for an installation that could not run a single completion.
  test('probes an authenticated endpoint, not the public model catalogue', async () => {
    let probed = ''
    const ctx = makeContext({
      allowNetwork: true,
      env: { OPENROUTER_API_KEY: FAKE_KEY },
      probe: async (url) => {
        probed = url
        return 200
      },
    })
    await checkProviderReachable(ctx)
    expect(probed).not.toContain('/models')
    expect(probed).toContain('/key')
  })

  test('treats a 403 as a rejected key too', async () => {
    const ctx = makeContext({
      allowNetwork: true,
      env: { OPENROUTER_API_KEY: FAKE_KEY },
      probe: async () => 403,
    })
    expect((await checkProviderReachable(ctx)).status).toBe('error')
  })

  test('blames the provider on a 5xx', async () => {
    const ctx = makeContext({
      allowNetwork: true,
      env: { OPENROUTER_API_KEY: FAKE_KEY },
      probe: async () => 503,
    })
    const result = await checkProviderReachable(ctx)
    expect(result.status).toBe('warn')
    expect(result.detail).toContain('de su lado')
  })

  test('warns instead of throwing when the request fails outright', async () => {
    const ctx = makeContext({
      allowNetwork: true,
      env: { OPENROUTER_API_KEY: FAKE_KEY },
      probe: async () => {
        throw new Error('getaddrinfo ENOTFOUND openrouter.ai')
      },
    })
    expect((await checkProviderReachable(ctx)).status).toBe('warn')
  })

  test('does not leak the key when the probe error quotes it', async () => {
    const ctx = makeContext({
      allowNetwork: true,
      env: { OPENROUTER_API_KEY: FAKE_KEY },
      probe: async () => {
        throw new Error(`failed with Authorization: Bearer ${FAKE_KEY}`)
      },
    })
    const result = await checkProviderReachable(ctx)
    expect(JSON.stringify(result)).not.toContain(FAKE_KEY)
  })
})

describe('suite and summary', () => {
  test('runs every check and returns one result each', async () => {
    const results = await runAllChecks(makeContext())
    expect(results.length).toBeGreaterThanOrEqual(12)
    expect(new Set(results.map((r) => r.id)).size).toBe(results.length)
  })

  test('summarises counts and exits non-zero only on hard errors', () => {
    const results: CheckResult[] = [
      { id: 'a', label: 'a', status: 'ok', detail: '' },
      { id: 'b', label: 'b', status: 'warn', detail: '' },
      { id: 'c', label: 'c', status: 'error', detail: '' },
    ]
    expect(summarize(results)).toEqual({
      passed: 1,
      warnings: 1,
      errors: 1,
      exitCode: 1,
    })
  })

  test('exits zero when only warnings are present', () => {
    const results: CheckResult[] = [
      { id: 'a', label: 'a', status: 'ok', detail: '' },
      { id: 'b', label: 'b', status: 'warn', detail: '' },
    ]
    expect(summarize(results).exitCode).toBe(0)
  })

  test('a full run with no key configured reports at least one error', async () => {
    const results = await runAllChecks(makeContext())
    expect(summarize(results).errors).toBeGreaterThan(0)
  })
})

describe('formatReport', () => {
  test('uses the documented indicators and ends with a summary line', () => {
    const results: CheckResult[] = [
      { id: 'a', label: 'Uno', status: 'ok', detail: 'bien' },
      { id: 'b', label: 'Dos', status: 'warn', detail: 'ojo', hint: 'revisá esto' },
      { id: 'c', label: 'Tres', status: 'error', detail: 'roto', hint: 'arreglá esto' },
    ]
    const report = formatReport(results, summarize(results))

    expect(report).toContain('✓ OK')
    expect(report).toContain('! WARNING')
    expect(report).toContain('✗ ERROR')
    expect(report).toContain('1 checks passed')
    expect(report).toContain('1 warnings')
    expect(report).toContain('1 errors')
    expect(report).toContain('revisá esto')
  })

  test('does not print hints for passing checks', () => {
    const results: CheckResult[] = [
      { id: 'a', label: 'Uno', status: 'ok', detail: 'bien', hint: 'no mostrar' },
    ]
    expect(formatReport(results, summarize(results))).not.toContain('no mostrar')
  })

  test('redacts a secret that reached a check result', () => {
    const results: CheckResult[] = [
      { id: 'a', label: 'Uno', status: 'warn', detail: `key ${FAKE_KEY}` },
    ]
    expect(formatReport(results, summarize(results))).not.toContain(FAKE_KEY)
  })
})
