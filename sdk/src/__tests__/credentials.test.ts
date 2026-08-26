import { describe, expect, test } from 'bun:test'

import {
  getConfigDir,
  getCredentialsPath,
  getUserCredentials,
  userFromJson,
} from '../credentials'

describe('credentials', () => {
  const testEnv = {
    NEXT_PUBLIC_CB_ENVIRONMENT: 'test',
  } as const

  describe('getConfigDir', () => {
    test('returns path with environment suffix for non-prod environments', () => {
      const dir = getConfigDir(testEnv as any)
      expect(dir).toContain('nexus-test')
      expect(dir).toContain('.config')
    })

    test('returns path without suffix for prod environment', () => {
      const prodEnv = { NEXT_PUBLIC_CB_ENVIRONMENT: 'prod' }
      const dir = getConfigDir(prodEnv as any)
      expect(dir).toContain('nexus')
      expect(dir).not.toContain('nexus-prod')
    })

    test('returns path without suffix when environment is undefined', () => {
      const emptyEnv = {}
      const dir = getConfigDir(emptyEnv as any)
      expect(dir).toContain('nexus')
      expect(dir).not.toContain('nexus-')
    })
  })

  describe('getCredentialsPath', () => {
    test('returns path within config directory', () => {
      const credPath = getCredentialsPath(testEnv as any)
      expect(credPath).toContain('credentials.json')
      expect(credPath).toContain('nexus-test')
    })
  })

  describe('userFromJson', () => {
    test('returns null for invalid JSON', () => {
      const user = userFromJson('not valid json')
      expect(user).toBeNull()
    })

    test('returns null for missing default user', () => {
      const json = JSON.stringify({ someOtherKey: { value: 'test' } })
      const user = userFromJson(json)
      expect(user).toBeNull()
    })

    test('returns null for empty object', () => {
      const user = userFromJson('{}')
      expect(user).toBeNull()
    })
  })

  describe('getUserCredentials', () => {
    test('returns null when credentials file does not exist', () => {
      const env = { NEXT_PUBLIC_CB_ENVIRONMENT: 'nonexistent' } as any
      const user = getUserCredentials(env)
      expect(user).toBeNull()
    })
  })
})
