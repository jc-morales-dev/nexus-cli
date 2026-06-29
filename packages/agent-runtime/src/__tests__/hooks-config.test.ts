import { describe, test, expect } from 'bun:test'

import {
  hasAnyHooks,
  hookTimeoutSeconds,
  matchingHooks,
  parseHooksConfig,
} from '../hooks/hooks-config'

describe('parseHooksConfig', () => {
  test('parses a valid config', () => {
    const cfg = parseHooksConfig(
      JSON.stringify({
        PostToolUse: [{ matcher: 'write_file', command: 'bun run format' }],
        Stop: [{ command: 'bun run typecheck', timeout: 120 }],
      }),
    )
    expect(cfg.PostToolUse).toHaveLength(1)
    expect(cfg.PostToolUse[0].command).toBe('bun run format')
    expect(cfg.Stop[0].timeout).toBe(120)
  })

  test('invalid JSON yields empty hooks (never throws)', () => {
    const cfg = parseHooksConfig('not json {{{')
    expect(cfg.PostToolUse).toEqual([])
    expect(cfg.Stop).toEqual([])
  })

  test('drops entries without a command', () => {
    const cfg = parseHooksConfig(
      JSON.stringify({ Stop: [{ matcher: 'x' }, { command: '   ' }, { command: 'ok' }] }),
    )
    expect(cfg.Stop).toHaveLength(1)
    expect(cfg.Stop[0].command).toBe('ok')
  })

  test('drops a malformed regex matcher but keeps the command', () => {
    const cfg = parseHooksConfig(
      JSON.stringify({ PostToolUse: [{ matcher: '(((', command: 'echo hi' }] }),
    )
    expect(cfg.PostToolUse).toHaveLength(1)
    expect(cfg.PostToolUse[0].matcher).toBeUndefined()
  })

  test('non-array hook lists are ignored', () => {
    const cfg = parseHooksConfig(JSON.stringify({ PostToolUse: 'nope', Stop: 42 }))
    expect(cfg.PostToolUse).toEqual([])
    expect(cfg.Stop).toEqual([])
  })
})

describe('matchingHooks', () => {
  const hooks = [
    { matcher: 'write_file|str_replace', command: 'format' },
    { command: 'always' }, // no matcher = matches whenever a tool ran
    { matcher: 'run_terminal_command', command: 'never-here' },
  ]

  test('matches by regex and includes no-matcher hooks', () => {
    const matched = matchingHooks(hooks, ['read_files', 'write_file']).map(
      (h) => h.command,
    )
    expect(matched).toContain('format')
    expect(matched).toContain('always')
    expect(matched).not.toContain('never-here')
  })

  test('no tools ran -> no hooks fire (not even no-matcher ones)', () => {
    expect(matchingHooks(hooks, [])).toEqual([])
  })

  test('no-matcher hook fires for any tool', () => {
    const matched = matchingHooks(hooks, ['glob']).map((h) => h.command)
    expect(matched).toEqual(['always'])
  })
})

describe('hookTimeoutSeconds + hasAnyHooks', () => {
  test('defaults to 60s, honors a custom timeout', () => {
    expect(hookTimeoutSeconds({ command: 'x' })).toBe(60)
    expect(hookTimeoutSeconds({ command: 'x', timeout: 10 })).toBe(10)
  })

  test('hasAnyHooks reflects whether any hook is configured', () => {
    expect(hasAnyHooks(null)).toBe(false)
    expect(hasAnyHooks({ PostToolUse: [], Stop: [] })).toBe(false)
    expect(hasAnyHooks({ PostToolUse: [{ command: 'x' }], Stop: [] })).toBe(true)
  })
})
