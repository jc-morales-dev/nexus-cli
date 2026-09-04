import { afterEach, describe, expect, it } from 'bun:test'

import {
  clearRegisteredSecrets,
  isSensitiveKey,
  maskSecret,
  redactDeep,
  redactSecrets,
  registerSecret,
  unregisterSecret,
  REDACTED,
} from '../redact'

// Fake keys only. Every literal here is made up and matches no real account.
const FAKE_OPENROUTER = 'sk-or-v1-0123456789abcdef0123456789abcdef0123456789abcdef'
const FAKE_ANTHROPIC = 'sk-ant-api03-abcdefghijklmnop1234567890'
const FAKE_GITHUB = 'ghp_abcdefghijklmnopqrstuvwxyz0123456789'

afterEach(() => {
  clearRegisteredSecrets()
})

describe('maskSecret', () => {
  it('keeps the provider prefix and the last four characters', () => {
    expect(maskSecret(FAKE_OPENROUTER)).toBe('sk-or-v1-…cdef')
  })

  it('never leaks the middle of the key', () => {
    const masked = maskSecret(FAKE_OPENROUTER)
    expect(masked).not.toContain('0123456789abcdef0123')
    expect(masked.length).toBeLessThan(FAKE_OPENROUTER.length)
  })

  it('masks short values whole rather than showing half of them', () => {
    expect(maskSecret('short12')).toBe(REDACTED)
    expect(maskSecret('')).toBe(REDACTED)
  })

  it('masks values with no separator prefix without exposing a head', () => {
    const masked = maskSecret('abcdefghijklmnopqrstuvwxyz')
    expect(masked).toBe('…wxyz')
  })
})

describe('redactSecrets', () => {
  it('redacts an OpenRouter key embedded in prose', () => {
    const text = `Request failed with key ${FAKE_OPENROUTER} on attempt 2`
    const result = redactSecrets(text)
    expect(result).not.toContain(FAKE_OPENROUTER)
    expect(result).toContain('sk-or-v1-…cdef')
    expect(result).toContain('on attempt 2')
  })

  it('redacts keys from several providers at once', () => {
    const text = `${FAKE_ANTHROPIC} and ${FAKE_GITHUB}`
    const result = redactSecrets(text)
    expect(result).not.toContain(FAKE_ANTHROPIC)
    expect(result).not.toContain(FAKE_GITHUB)
  })

  it('redacts a bearer token that matches no provider pattern', () => {
    const opaque = 'Zm9vYmFyYmF6cXV4MTIzNDU2Nzg5'
    const result = redactSecrets(`Authorization: Bearer ${opaque}`)
    expect(result).not.toContain(opaque)
    expect(result).toContain('Bearer')
  })

  it('redacts a key assigned to a header-like field name', () => {
    const result = redactSecrets('x-api-key: abcdefghijklmnopqrstuvwxyz')
    expect(result).not.toContain('abcdefghijklmnopqrstuvwxyz')
  })

  it('redacts a registered secret that matches no known pattern', () => {
    const custom = 'my-selfhosted-gateway-token-value'
    registerSecret(custom)
    const result = redactSecrets(`gateway rejected ${custom}`)
    expect(result).not.toContain(custom)
    expect(result).toContain('gateway rejected')
  })

  it('redacts every occurrence of a registered secret, not just the first', () => {
    const custom = 'repeated-secret-value-123'
    registerSecret(custom)
    const result = redactSecrets(`${custom} then ${custom}`)
    expect(result).not.toContain(custom)
  })

  it('stops redacting a secret once it is unregistered', () => {
    const custom = 'temporary-secret-value-1'
    registerSecret(custom)
    unregisterSecret(custom)
    expect(redactSecrets(custom)).toBe(custom)
  })

  it('ignores values too short to be a real secret', () => {
    registerSecret('dev')
    expect(redactSecrets('running in dev mode')).toBe('running in dev mode')
  })

  it('leaves ordinary text untouched', () => {
    const text = 'Read 42 files from src/utils and wrote 3 edits (commit a1b2c3d4)'
    expect(redactSecrets(text)).toBe(text)
  })

  it('does not treat a git SHA as a secret', () => {
    const text = 'HEAD is now at 9f2c1ab3d4e5f60718293a4b5c6d7e8f90a1b2c3'
    expect(redactSecrets(text)).toBe(text)
  })

  it('handles empty input', () => {
    expect(redactSecrets('')).toBe('')
  })
})

describe('isSensitiveKey', () => {
  it('treats header and field names that carry credentials as sensitive', () => {
    const sensitive = [
      'authorization',
      'Authorization',
      'apiKey',
      'api_key',
      'x-api-key',
      'x-openrouter-api-key',
      'password',
      'client_secret',
      'refresh_token',
      'OPENROUTER_API_KEY',
    ]
    for (const key of sensitive) {
      expect(isSensitiveKey(key)).toBe(true)
    }
  })

  it('does not flag ordinary field names', () => {
    for (const key of ['model', 'message', 'keyboard', 'tokens', 'apiKeyPresent']) {
      expect(isSensitiveKey(key)).toBe(false)
    }
  })
})

describe('redactDeep', () => {
  it('masks values under sensitive keys whatever their shape', () => {
    const result = redactDeep({
      headers: { Authorization: `Bearer ${FAKE_OPENROUTER}`, 'User-Agent': 'nexus' },
      model: 'deepseek/deepseek-v3.2',
    }) as any
    expect(JSON.stringify(result)).not.toContain(FAKE_OPENROUTER)
    expect(result.model).toBe('deepseek/deepseek-v3.2')
    expect(result.headers['User-Agent']).toBe('nexus')
  })

  it('masks a non-string value under a sensitive key', () => {
    const result = redactDeep({ apiKey: { nested: 'value' } }) as any
    expect(result.apiKey).toBe(REDACTED)
  })

  it('scans strings nested in arrays', () => {
    const result = redactDeep({ items: [`key=${FAKE_OPENROUTER}`] })
    expect(JSON.stringify(result)).not.toContain(FAKE_OPENROUTER)
  })

  it('converts errors and scans their message and stack', () => {
    const error = new Error(`auth failed for ${FAKE_OPENROUTER}`)
    const result = redactDeep({ error }) as any
    expect(result.error.name).toBe('Error')
    expect(result.error.message).not.toContain(FAKE_OPENROUTER)
    expect(JSON.stringify(result)).not.toContain(FAKE_OPENROUTER)
  })

  it('survives circular references instead of throwing', () => {
    const node: any = { name: 'root' }
    node.self = node
    const result = redactDeep(node) as any
    expect(result.name).toBe('root')
    expect(result.self).toBe('[Circular]')
  })

  it('truncates structures deeper than the limit', () => {
    const deep = { a: { b: { c: { d: 'leaf' } } } }
    const result = redactDeep(deep, 2) as any
    expect(result.a.b).toBe('[Truncated]')
  })

  it('passes primitives through unchanged', () => {
    expect(redactDeep(42)).toBe(42)
    expect(redactDeep(true)).toBe(true)
    expect(redactDeep(null)).toBe(null)
    expect(redactDeep(undefined)).toBe(undefined)
  })
})
