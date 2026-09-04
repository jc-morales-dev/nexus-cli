import { describe, test, expect } from 'bun:test'

import {
  isOutOfCreditsError,
  OUT_OF_CREDITS_MESSAGE,
  createErrorMessage,
} from '../error-handling'

describe('error-handling', () => {
  describe('isOutOfCreditsError', () => {
    test('returns true for error with statusCode 402', () => {
      const error = { statusCode: 402, message: 'Payment required' }
      expect(isOutOfCreditsError(error)).toBe(true)
    })

    test('returns false for error with statusCode 401', () => {
      const error = { statusCode: 401, message: 'Unauthorized' }
      expect(isOutOfCreditsError(error)).toBe(false)
    })

    test('returns false for error with statusCode 403', () => {
      const error = { statusCode: 403, message: 'Forbidden' }
      expect(isOutOfCreditsError(error)).toBe(false)
    })

    test('returns false for error with statusCode 500', () => {
      const error = { statusCode: 500, message: 'Server error' }
      expect(isOutOfCreditsError(error)).toBe(false)
    })

    test('returns false for null error', () => {
      expect(isOutOfCreditsError(null)).toBe(false)
    })

    test('returns false for undefined error', () => {
      expect(isOutOfCreditsError(undefined)).toBe(false)
    })

    test('returns false for string error', () => {
      expect(isOutOfCreditsError('error string')).toBe(false)
    })

    test('returns false for Error object without statusCode', () => {
      const error = new Error('Plain error')
      expect(isOutOfCreditsError(error)).toBe(false)
    })

    test('returns false for error with non-402 numeric statusCode', () => {
      const error = { statusCode: 400, message: 'Bad request' }
      expect(isOutOfCreditsError(error)).toBe(false)
    })

    test('returns false for error with string statusCode', () => {
      const error = { statusCode: '402', message: 'Payment required' }
      expect(isOutOfCreditsError(error)).toBe(false)
    })

    test('returns true for 402 errors with additional properties', () => {
      const error = {
        statusCode: 402,
        message: 'Payment required',
        details: { credits: 0 },
        timestamp: new Date().toISOString(),
      }
      expect(isOutOfCreditsError(error)).toBe(true)
    })
  })

  describe('OUT_OF_CREDITS_MESSAGE', () => {
    test('contains usage URL', () => {
      expect(OUT_OF_CREDITS_MESSAGE).toContain('/usage')
    })

    test('contains out of credits message', () => {
      expect(OUT_OF_CREDITS_MESSAGE.toLowerCase()).toContain('out of credits')
    })

    test('contains add credits instruction', () => {
      expect(OUT_OF_CREDITS_MESSAGE.toLowerCase()).toContain('add credits')
    })
  })

  // createErrorMessage renders a *classified* error now: a headline, an
  // explanation and a next step, instead of the provider's raw message with a
  // stack trace stapled to it. These tests assert the classification is right
  // and that the raw text does not leak, which is a stronger contract than the
  // substring checks they replace.
  describe('createErrorMessage', () => {
    test('creates a complete message with the given id', () => {
      const result = createErrorMessage(new Error('Something went wrong'), 'msg-123')

      expect(result.id).toBe('msg-123')
      expect(result.content).toContain('**Error:**')
      expect(result.isComplete).toBe(true)
      expect(result.blocks).toBeUndefined()
    })

    test('surfaces an unrecognised message rather than swallowing it', () => {
      const result = createErrorMessage(new Error('Something went wrong'), 'msg-1')
      expect(result.content).toContain('Something went wrong')
    })

    test('accepts a bare string error', () => {
      expect(createErrorMessage('String error', 'msg-456').content).toContain(
        'String error',
      )
    })

    test('accepts an object with a message property', () => {
      const error = { message: 'Object error message', code: 'ERR_001' }
      expect(createErrorMessage(error, 'msg-789').content).toContain(
        'Object error message',
      )
    })

    test('does not print a stack trace by default', () => {
      const error = new Error('Error with stack')
      const result = createErrorMessage(error, 'msg-stack')

      expect(error.stack).toBeDefined()
      expect(result.content).not.toContain('at ')
      expect(result.content).not.toContain('error-handling.test')
    })

    test('offers --debug when there is nothing more specific to say', () => {
      const result = createErrorMessage({ code: 'ERR_UNKNOWN' }, 'msg-no-msg')
      expect(result.content).toContain('--debug')
    })

    test('handles null and empty-message errors without throwing', () => {
      expect(createErrorMessage(null, 'msg-null').content).toContain('**Error:**')
      expect(createErrorMessage({ message: '' }, 'msg-empty').content).toContain(
        '**Error:**',
      )
      expect(createErrorMessage({ message: 123 }, 'msg-num').content).toContain(
        '**Error:**',
      )
    })

    test('explains a 402 as missing credits and how to avoid it', () => {
      const result = createErrorMessage(
        { statusCode: 402, message: 'Payment required' },
        'msg-402',
      )
      expect(result.content).toContain('saldo')
      expect(result.content).toContain('/model')
    })

    test('explains a 401 as a rejected key and points at /key', () => {
      const result = createErrorMessage(
        { statusCode: 401, message: 'Invalid authentication token' },
        'msg-auth',
      )
      expect(result.content).toContain('/key')
      expect(result.content).not.toContain('sk-')
    })

    test('blames the provider, not the user, on a 500', () => {
      const result = createErrorMessage(
        { statusCode: 500, message: 'Internal server error' },
        'msg-500',
      )
      expect(result.content).toContain('proveedor')
    })

    test('explains a 429 as rate limiting', () => {
      const result = createErrorMessage(
        { statusCode: 429, message: 'Too many requests', retryAfter: 60 },
        'msg-rate',
      )
      expect(result.content).toContain('Límite de velocidad')
    })

    test('explains a 403 as a permissions problem', () => {
      const result = createErrorMessage(
        { statusCode: 403, message: 'Access denied' },
        'msg-403',
      )
      expect(result.content).toContain('Acceso denegado')
    })

    test('reads a 404 as an unavailable model', () => {
      const result = createErrorMessage(
        { statusCode: 404, message: 'Resource not found' },
        'msg-404',
      )
      expect(result.content).toContain('Modelo inexistente')
      expect(result.content).toContain('/model')
    })

    test('distinguishes a timeout from a generic failure', () => {
      const timeoutError = new Error('Request timeout')
      ;(timeoutError as any).code = 'ETIMEDOUT'
      const result = createErrorMessage(timeoutError, 'msg-timeout')

      expect(result.content).toContain('tiempo de espera')
    })

    test('preserves the message id and completion flags', () => {
      const result = createErrorMessage(new Error('Test'), 'unique-id-123')
      expect(result.id).toBe('unique-id-123')
      expect(result.isComplete).toBe(true)
      expect(result.blocks).toBeUndefined()
    })

    test('only reports the top-level message of a nested error', () => {
      const error = {
        message: 'Outer error',
        cause: { message: 'Inner error', cause: { message: 'Root cause' } },
      }
      const result = createErrorMessage(error, 'msg-nested')

      expect(result.content).toContain('Outer error')
      expect(result.content).not.toContain('Root cause')
    })
  })

  describe('out-of-credits detection stays independent of formatting', () => {
    test.each([429, 500, 400, 403, 404, 409])(
      'status %i is not treated as out of credits',
      (statusCode) => {
        expect(isOutOfCreditsError({ statusCode, message: 'x' })).toBe(false)
      },
    )
  })
})
