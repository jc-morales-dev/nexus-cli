import { mock } from 'bun:test'

import type { NexusApiClient } from '../../utils/nexus-api'

export interface MockApiClientOverrides {
  get?: ReturnType<typeof mock>
  post?: ReturnType<typeof mock>
  put?: ReturnType<typeof mock>
  patch?: ReturnType<typeof mock>
  delete?: ReturnType<typeof mock>
  request?: ReturnType<typeof mock>
  me?: ReturnType<typeof mock>
  usage?: ReturnType<typeof mock>
  loginCode?: ReturnType<typeof mock>
  loginStatus?: ReturnType<typeof mock>
  publish?: ReturnType<typeof mock>
  logout?: ReturnType<typeof mock>
  feedback?: ReturnType<typeof mock>
  baseUrl?: string
  authToken?: string
}

/**
 * Default OK response for mock API methods.
 * Returns { ok: true, status: 200 } without data, matching our ApiResponse type
 * where `data` is optional for responses without a body.
 */
const defaultOkResponse = () =>
  Promise.resolve({ ok: true as const, status: 200 })

/**
 * Creates a mock NexusApiClient with sensible defaults.
 * All methods return { ok: true, status: 200 } by default.
 * Pass overrides to customize specific methods.
 */
export const createMockApiClient = (
  overrides: MockApiClientOverrides = {},
): NexusApiClient => ({
  get: (overrides.get ?? mock(defaultOkResponse)) as NexusApiClient['get'],
  post: (overrides.post ??
    mock(defaultOkResponse)) as NexusApiClient['post'],
  put: (overrides.put ?? mock(defaultOkResponse)) as NexusApiClient['put'],
  patch: (overrides.patch ??
    mock(defaultOkResponse)) as NexusApiClient['patch'],
  delete: (overrides.delete ??
    mock(defaultOkResponse)) as NexusApiClient['delete'],
  request: (overrides.request ??
    mock(defaultOkResponse)) as NexusApiClient['request'],
  me: (overrides.me ?? mock(defaultOkResponse)) as NexusApiClient['me'],
  usage: (overrides.usage ??
    mock(defaultOkResponse)) as NexusApiClient['usage'],
  loginCode: (overrides.loginCode ??
    mock(defaultOkResponse)) as NexusApiClient['loginCode'],
  loginStatus: (overrides.loginStatus ??
    mock(defaultOkResponse)) as NexusApiClient['loginStatus'],
  publish: (overrides.publish ??
    mock(defaultOkResponse)) as NexusApiClient['publish'],
  logout: (overrides.logout ??
    mock(defaultOkResponse)) as NexusApiClient['logout'],
  feedback: (overrides.feedback ??
    mock(defaultOkResponse)) as NexusApiClient['feedback'],
  baseUrl: overrides.baseUrl ?? 'https://test.nexus.com',
  authToken: overrides.authToken,
})
