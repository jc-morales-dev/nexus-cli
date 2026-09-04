import fs from 'fs'
import os from 'os'
import path from 'path'
import { randomUUID } from 'crypto'

const TRUST_STORE_FILE_NAME = 'trusted-workspaces.json'
const TRUST_STORE_VERSION = 1
const CONFIG_DIR_MODE = 0o700
const TRUST_STORE_MODE = 0o600

export const TRUST_WORKSPACE_ENV_VAR = 'NEXUS_TRUST_WORKSPACE'

type TrustStore = {
  version: typeof TRUST_STORE_VERSION
  workspaces: string[]
}

export type WorkspaceTrustSource = 'environment' | 'store' | 'none'

export type WorkspaceTrustStatus = {
  trusted: boolean
  workspacePath: string
  source: WorkspaceTrustSource
}

export type WorkspaceTrustOptions = {
  /** Override used by tests and embedders that keep NEXUS state elsewhere. */
  configDir?: string
  /** Environment override used by tests. Defaults to process.env. */
  env?: NodeJS.ProcessEnv
}

function defaultConfigDir(): string {
  return path.join(os.homedir(), '.config', 'nexus')
}

export function getWorkspaceTrustStorePath(
  options: WorkspaceTrustOptions = {},
): string {
  return path.join(
    options.configDir ?? defaultConfigDir(),
    TRUST_STORE_FILE_NAME,
  )
}

/**
 * Return a stable workspace identity. Existing paths are resolved through
 * links/junctions so trusting an alias trusts the actual directory, not a
 * spelling of it. Windows identities are case-insensitive.
 */
export function canonicalizeWorkspacePath(workspacePath: string): string {
  const resolved = path.resolve(workspacePath)
  let canonical = resolved
  try {
    canonical = fs.realpathSync.native(resolved)
  } catch {
    // A missing path cannot execute local agents yet. Keeping the resolved
    // identity makes the API deterministic for status checks and tests.
  }
  return process.platform === 'win32' ? canonical.toLowerCase() : canonical
}

function emptyTrustStore(): TrustStore {
  return { version: TRUST_STORE_VERSION, workspaces: [] }
}

function readTrustStore(options: WorkspaceTrustOptions): TrustStore {
  const storePath = getWorkspaceTrustStorePath(options)
  try {
    const parsed = JSON.parse(fs.readFileSync(storePath, 'utf8')) as unknown
    if (!parsed || typeof parsed !== 'object') return emptyTrustStore()

    const candidate = parsed as Record<string, unknown>
    if (
      candidate.version !== TRUST_STORE_VERSION ||
      !Array.isArray(candidate.workspaces)
    ) {
      return emptyTrustStore()
    }

    const workspaces = candidate.workspaces
      .filter((value): value is string => typeof value === 'string')
      .map(canonicalizeWorkspacePath)

    return {
      version: TRUST_STORE_VERSION,
      workspaces: [...new Set(workspaces)],
    }
  } catch {
    return emptyTrustStore()
  }
}

function writeTrustStore(
  store: TrustStore,
  options: WorkspaceTrustOptions,
): void {
  const storePath = getWorkspaceTrustStorePath(options)
  const configDir = path.dirname(storePath)
  fs.mkdirSync(configDir, { recursive: true, mode: CONFIG_DIR_MODE })

  try {
    fs.chmodSync(configDir, CONFIG_DIR_MODE)
  } catch {
    // Permission bits are advisory on Windows and some network filesystems.
  }

  try {
    if (fs.lstatSync(storePath).isSymbolicLink()) {
      throw new Error(
        `Refusing to replace symbolic-link trust store: ${storePath}`,
      )
    }
  } catch (error) {
    if (
      error instanceof Error &&
      !('code' in error && error.code === 'ENOENT')
    ) {
      throw error
    }
  }

  const tempPath = path.join(
    configDir,
    `.${TRUST_STORE_FILE_NAME}.${process.pid}.${randomUUID()}.tmp`,
  )

  try {
    fs.writeFileSync(tempPath, `${JSON.stringify(store, null, 2)}\n`, {
      encoding: 'utf8',
      mode: TRUST_STORE_MODE,
      flag: 'wx',
    })
    try {
      fs.chmodSync(tempPath, TRUST_STORE_MODE)
    } catch {
      // See the chmod note above.
    }
    fs.renameSync(tempPath, storePath)
    try {
      fs.chmodSync(storePath, TRUST_STORE_MODE)
    } catch {
      // See the chmod note above.
    }
  } finally {
    try {
      fs.rmSync(tempPath, { force: true })
    } catch {
      // Best-effort cleanup after a failed atomic replacement.
    }
  }
}

export function getWorkspaceTrustStatus(
  workspacePath: string = process.cwd(),
  options: WorkspaceTrustOptions = {},
): WorkspaceTrustStatus {
  const canonicalPath = canonicalizeWorkspacePath(workspacePath)
  const env = options.env ?? process.env

  if (env[TRUST_WORKSPACE_ENV_VAR] === '1') {
    return {
      trusted: true,
      workspacePath: canonicalPath,
      source: 'environment',
    }
  }

  const trusted = readTrustStore(options).workspaces.includes(canonicalPath)
  return {
    trusted,
    workspacePath: canonicalPath,
    source: trusted ? 'store' : 'none',
  }
}

export function isWorkspaceTrusted(
  workspacePath: string = process.cwd(),
  options: WorkspaceTrustOptions = {},
): boolean {
  return getWorkspaceTrustStatus(workspacePath, options).trusted
}

export function trustWorkspace(
  workspacePath: string = process.cwd(),
  options: WorkspaceTrustOptions = {},
): WorkspaceTrustStatus {
  const canonicalPath = canonicalizeWorkspacePath(workspacePath)
  const store = readTrustStore(options)
  if (!store.workspaces.includes(canonicalPath)) {
    store.workspaces.push(canonicalPath)
    store.workspaces.sort()
    writeTrustStore(store, options)
  }
  return { trusted: true, workspacePath: canonicalPath, source: 'store' }
}

export function untrustWorkspace(
  workspacePath: string = process.cwd(),
  options: WorkspaceTrustOptions = {},
): WorkspaceTrustStatus {
  const canonicalPath = canonicalizeWorkspacePath(workspacePath)
  const store = readTrustStore(options)
  const workspaces = store.workspaces.filter((item) => item !== canonicalPath)
  if (workspaces.length !== store.workspaces.length) {
    writeTrustStore({ ...store, workspaces }, options)
  }
  return { trusted: false, workspacePath: canonicalPath, source: 'none' }
}
