import fs from 'fs'
import os from 'os'
import path from 'path'

import { afterEach, beforeEach, describe, expect, test } from 'bun:test'

import {
  canonicalizeWorkspacePath,
  getWorkspaceTrustStatus,
  getWorkspaceTrustStorePath,
  trustWorkspace,
  untrustWorkspace,
} from '../workspace-trust'

describe('workspace trust store', () => {
  let tempDir: string
  let workspaceDir: string
  let configDir: string

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nexus-trust-'))
    workspaceDir = path.join(tempDir, 'workspace')
    configDir = path.join(tempDir, 'config')
    fs.mkdirSync(workspaceDir)
  })

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true })
  })

  test('is untrusted by default and persists explicit trust', () => {
    const options = { configDir, env: {} }
    expect(getWorkspaceTrustStatus(workspaceDir, options)).toMatchObject({
      trusted: false,
      source: 'none',
    })

    expect(trustWorkspace(workspaceDir, options)).toMatchObject({
      trusted: true,
      source: 'store',
    })
    expect(getWorkspaceTrustStatus(workspaceDir, options)).toMatchObject({
      trusted: true,
      source: 'store',
    })

    expect(untrustWorkspace(workspaceDir, options).trusted).toBe(false)
    expect(getWorkspaceTrustStatus(workspaceDir, options).trusted).toBe(false)
  })

  test('supports an explicit one-process environment override', () => {
    expect(
      getWorkspaceTrustStatus(workspaceDir, {
        configDir,
        env: { NEXUS_TRUST_WORKSPACE: '1' },
      }),
    ).toMatchObject({ trusted: true, source: 'environment' })
  })

  test('canonicalizes aliases before comparing trust', () => {
    const aliasDir = path.join(tempDir, 'workspace-alias')
    try {
      fs.symlinkSync(
        workspaceDir,
        aliasDir,
        process.platform === 'win32' ? 'junction' : 'dir',
      )
    } catch {
      return
    }

    const options = { configDir, env: {} }
    trustWorkspace(aliasDir, options)
    expect(getWorkspaceTrustStatus(workspaceDir, options).trusted).toBe(true)
    expect(canonicalizeWorkspacePath(aliasDir)).toBe(
      canonicalizeWorkspacePath(workspaceDir),
    )
  })

  test('writes owner-only state where permission bits are supported', () => {
    trustWorkspace(workspaceDir, { configDir, env: {} })

    if (process.platform !== 'win32') {
      const storePath = getWorkspaceTrustStorePath({ configDir })
      expect(fs.statSync(configDir).mode & 0o777).toBe(0o700)
      expect(fs.statSync(storePath).mode & 0o777).toBe(0o600)
    }
  })

  test('does not follow a symbolic-link trust store when writing', () => {
    if (process.platform === 'win32') return

    fs.mkdirSync(configDir, { recursive: true })
    const victimPath = path.join(tempDir, 'victim.json')
    fs.writeFileSync(victimPath, 'unchanged')
    fs.symlinkSync(victimPath, getWorkspaceTrustStorePath({ configDir }))

    expect(() => trustWorkspace(workspaceDir, { configDir, env: {} })).toThrow(
      'symbolic-link trust store',
    )
    expect(fs.readFileSync(victimPath, 'utf8')).toBe('unchanged')
  })
})
