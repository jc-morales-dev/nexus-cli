import type { CiEnv } from './types/contracts/env'

/**
 * Test-only helpers for CI env snapshots.
 * Keep production code using `@nexus/common/env-ci`.
 */
export const createTestCiEnv = (overrides: Partial<CiEnv> = {}): CiEnv => ({
  CI: undefined,
  GITHUB_ACTIONS: undefined,
  RENDER: undefined,
  IS_PULL_REQUEST: undefined,
  NEXUS_GITHUB_TOKEN: undefined,
  NEXUS_API_KEY: 'test-api-key',
  ...overrides,
})
