import { afterEach, describe, expect, test } from 'bun:test'

import {
  classifyError,
  describeError,
  formatCliError,
  missingApiKeyMessage,
} from '../cli-errors'
import { setDebugMode } from '../debug-mode'

const FAKE_KEY = 'sk-or-v1-0123456789abcdef0123456789abcdef0123456789abcdef'

function httpError(message: string, statusCode: number): Error {
  const error = new Error(message) as Error & { statusCode: number }
  error.statusCode = statusCode
  return error
}

function osError(message: string, code: string, path?: string): Error {
  const error = new Error(message) as Error & { code: string; path?: string }
  error.code = code
  if (path) error.path = path
  return error
}

afterEach(() => {
  setDebugMode(false)
})

describe('classifyError — API keys', () => {
  test('recognises the "no key configured" throw from the model provider', () => {
    const result = classifyError(
      new Error('No OpenRouter API key set. Run "/key sk-or-..." to add yours.'),
    )
    expect(result.kind).toBe('missing-api-key')
    expect(result.detail).toContain('OPENROUTER_API_KEY')
    expect(result.hint).toContain('/key')
  })

  test('names the provider, the env var and the fix without printing a key', () => {
    const message = missingApiKeyMessage()
    expect(message).toContain('openrouter')
    expect(message).toContain('OPENROUTER_API_KEY')
    expect(message).toContain('/key')
    expect(message).not.toContain('sk-')
  })

  test('distinguishes a rejected key (401) from a missing one', () => {
    const result = classifyError(httpError('Unauthorized', 401))
    expect(result.kind).toBe('invalid-api-key')
    expect(result.hint).toContain('/key')
  })

  test('never echoes the key back, even when the provider does', () => {
    const output = describeError(httpError(`invalid key ${FAKE_KEY}`, 401), {
      debug: true,
    })
    expect(output).not.toContain(FAKE_KEY)
  })
})

describe('classifyError — models and providers', () => {
  test('detects an unknown model from the provider wording', () => {
    const result = classifyError(
      new Error('No endpoints found for model `acme/does-not-exist`'),
    )
    expect(result.kind).toBe('invalid-model')
    expect(result.detail).toContain('acme/does-not-exist')
    expect(result.hint).toContain('openrouter.ai/models')
  })

  test('reads the model id off the error object when present', () => {
    const error = Object.assign(new Error('model not found'), {
      modelId: 'deepseek/deepseek-v3.2',
    })
    const result = classifyError(error)
    expect(result.kind).toBe('invalid-model')
    expect(result.detail).toContain('deepseek/deepseek-v3.2')
  })

  test('treats 5xx as a provider outage, not a user misconfiguration', () => {
    const result = classifyError(httpError('Bad gateway', 502))
    expect(result.kind).toBe('provider-unavailable')
    expect(result.detail).toContain('no en tu configuración')
  })

  test('treats 429 as rate limiting', () => {
    expect(classifyError(httpError('slow down', 429)).kind).toBe('rate-limited')
  })

  test('treats 402 as out of credits', () => {
    expect(classifyError(httpError('payment required', 402)).kind).toBe(
      'out-of-credits',
    )
  })

  test('treats 403 as forbidden rather than a bad key', () => {
    expect(classifyError(httpError('forbidden', 403)).kind).toBe('forbidden')
  })
})

describe('classifyError — network', () => {
  test('separates a timeout from being offline', () => {
    const timeout = classifyError(osError('socket hang up', 'ETIMEDOUT'))
    const offline = classifyError(osError('getaddrinfo failed', 'ENOTFOUND'))
    expect(timeout.kind).toBe('timeout')
    expect(offline.kind).toBe('offline')
    expect(timeout.detail).not.toBe(offline.detail)
  })

  test('classifies a 408 as a timeout', () => {
    expect(classifyError(httpError('request timeout', 408)).kind).toBe('timeout')
  })

  test('classifies a refused connection as offline', () => {
    expect(classifyError(osError('connect refused', 'ECONNREFUSED')).kind).toBe(
      'offline',
    )
  })

  // An explicit status code beats keyword-matching the message: a 504 saying
  // "gateway timeout" is the provider failing, and telling the user to check
  // their connection would send them after the wrong problem.
  test('attributes a 504 to the provider, not to the network', () => {
    expect(classifyError(httpError('Gateway timeout', 504)).kind).toBe(
      'provider-unavailable',
    )
  })

  test('still catches a timeout that only says so in the message', () => {
    expect(classifyError(new Error('the request timed out')).kind).toBe('timeout')
  })
})

describe('classifyError — filesystem', () => {
  test('reports which path the OS refused', () => {
    const result = classifyError(
      osError('permission denied', 'EACCES', '/etc/hosts'),
    )
    expect(result.kind).toBe('permission-denied')
    expect(result.detail).toContain('/etc/hosts')
  })

  test('calls out a read-only filesystem specifically', () => {
    const result = classifyError(osError('read-only', 'EROFS', '/mnt/ro/file'))
    expect(result.hint).toContain('solo lectura')
  })

  test('points at the PATH when an external binary is missing', () => {
    const result = classifyError(osError('spawn rg ENOENT', 'ENOENT'))
    expect(result.kind).toBe('not-found')
    expect(result.hint).toContain('PATH')
  })
})

describe('classifyError — model output', () => {
  test('recognises an unparseable model response', () => {
    const result = classifyError(new Error('Failed to parse JSON response'))
    expect(result.kind).toBe('invalid-model-response')
    expect(result.hint).toContain('reintentar')
  })

  test('recognises a truncated stream', () => {
    expect(classifyError(new Error('Unexpected end of JSON input')).kind).toBe(
      'invalid-model-response',
    )
  })

  test('falls back to unknown when nothing matches', () => {
    expect(classifyError(new Error('something odd happened')).kind).toBe('unknown')
  })
})

describe('formatCliError', () => {
  test('shows no stack trace by default', () => {
    const error = new Error('boom')
    const output = describeError(error)
    expect(output).not.toContain('at ')
    expect(error.stack).toBeDefined()
  })

  test('shows the stack under --debug', () => {
    const output = describeError(new Error('boom'), { debug: true })
    expect(output).toContain('[debug]')
  })

  test('honours the process-wide debug flag', () => {
    setDebugMode(true)
    expect(describeError(new Error('boom'))).toContain('[debug]')
  })

  test('suggests --debug when it has nothing better to offer', () => {
    expect(describeError(new Error('something odd'))).toContain('--debug')
  })

  test('leads with a hint instead of --debug when it has one', () => {
    const output = describeError(httpError('Unauthorized', 401))
    expect(output).toContain('→')
    expect(output).not.toContain('--debug')
  })

  test('prefixes the headline with the caller-supplied title', () => {
    const output = formatCliError(classifyError(httpError('boom', 503)), {
      fallbackTitle: 'Error de red',
    })
    expect(output.startsWith('Error de red:')).toBe(true)
  })

  test('redacts a key that appears inside a stack trace in debug mode', () => {
    const error = new Error('failure')
    error.stack = `Error: failure\n    at fetch (https://openrouter.ai/api?key=${FAKE_KEY})`
    const output = describeError(error, { debug: true })
    expect(output).not.toContain(FAKE_KEY)
  })
})
