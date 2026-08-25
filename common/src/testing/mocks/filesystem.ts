import { mock } from 'bun:test'
import nodePath from 'path'

import { toPosixPath } from '../../util/path-format'

import type { NexusFileSystem } from '../../types/filesystem'
import type { Mock } from 'bun:test'
import type { PathLike , Stats } from 'node:fs'

export interface CreateMockFsOptions {
  files?: Record<string, string>
  directories?: Record<string, string[]>
  readFileImpl?: (path: string) => Promise<string>
  readdirImpl?: (path: string) => Promise<string[]>
  writeFileImpl?: (path: string, content: string) => Promise<void>
  mkdirImpl?: (
    path: string,
    options?: { recursive?: boolean },
  ) => Promise<string | undefined>
  statImpl?: (path: string) => Promise<Stats>
}

export interface MockFs extends NexusFileSystem {}

export interface MockFsWithMocks {
  readFile: Mock<
    (path: PathLike, options?: { encoding?: BufferEncoding }) => Promise<string>
  >
  readdir: Mock<(path: PathLike) => Promise<string[]>>
  writeFile: Mock<(path: PathLike, data: string) => Promise<void>>
  mkdir: Mock<
    (
      path: PathLike,
      options?: { recursive?: boolean },
    ) => Promise<string | undefined>
  >
  stat: Mock<(path: PathLike) => Promise<Stats>>
}

/**
 * Canonical mock-fs key: absolutise with the host `path` module, then flatten
 * separators to '/'.
 *
 * Both halves matter on Windows, and only together do fixtures and production
 * meet:
 *  - `path.resolve` is what reconciles a POSIX fixture root. Production either
 *    resolves ('/repo' -> 'E:\repo') or joins ('\repo\...'); resolving the
 *    fixture key too gives both the same drive letter.
 *  - flattening separators makes '\' and '/' interchangeable, since fixtures
 *    are written with '/' and the native `path` module emits '\'.
 *
 * On POSIX both steps are the identity for the absolute paths these tests use.
 */
const normalizePath = (path: PathLike): string =>
  toPosixPath(nodePath.resolve(String(path)))

const normalizeKeys = <T>(record: Record<string, T>): Record<string, T> =>
  Object.fromEntries(
    Object.entries(record).map(([key, value]) => [normalizePath(key), value]),
  )

/**
 * The same canonical key the mock uses internally, exported for tests that pass
 * custom `*Impl` callbacks. Those callbacks receive an already-canonical path,
 * so they must canonicalise their own fixture literals before comparing —
 * otherwise the comparison misses on Windows.
 */
export const mockFsPath = (path: PathLike): string => normalizePath(path)

/** Creates a mock filesystem compatible with NexusFileSystem. */
export function createMockFs(options: CreateMockFsOptions = {}): MockFs {
  const {
    files = {},
    directories = {},
    readFileImpl,
    readdirImpl,
    writeFileImpl,
    mkdirImpl,
    statImpl,
  } = options

  const writtenFiles: Record<string, string> = normalizeKeys(files)
  const normalizedDirs: Record<string, string[]> = normalizeKeys(directories)
  const createdDirs: Set<string> = new Set(Object.keys(normalizedDirs))

  const defaultReadFile = async (path: PathLike): Promise<string> => {
    const pathStr = normalizePath(path)
    if (pathStr in writtenFiles) {
      return writtenFiles[pathStr]
    }
    throw new Error(`File not found: ${pathStr}`)
  }

  const defaultReaddir = async (path: PathLike): Promise<string[]> => {
    const pathStr = normalizePath(path)
    if (pathStr in normalizedDirs) {
      return normalizedDirs[pathStr]
    }
    throw new Error(`Directory not found: ${pathStr}`)
  }

  const defaultWriteFile = async (
    path: PathLike,
    data: string,
  ): Promise<void> => {
    const pathStr = normalizePath(path)
    writtenFiles[pathStr] = data
  }

  const defaultMkdir = async (path: PathLike): Promise<string | undefined> => {
    const pathStr = normalizePath(path)
    createdDirs.add(pathStr)
    return undefined
  }

  const defaultStat = async (path: PathLike): Promise<Stats> => {
    const pathStr = normalizePath(path)
    const isFile = pathStr in writtenFiles
    const isDir = pathStr in normalizedDirs || createdDirs.has(pathStr)

    if (!isFile && !isDir) {
      throw new Error(`Path not found: ${pathStr}`)
    }

    return {
      isFile: () => isFile,
      isDirectory: () => isDir,
      isBlockDevice: () => false,
      isCharacterDevice: () => false,
      isSymbolicLink: () => false,
      isFIFO: () => false,
      isSocket: () => false,
      dev: 0,
      ino: 0,
      mode: isDir ? 0o755 : 0o644,
      nlink: 1,
      uid: 0,
      gid: 0,
      rdev: 0,
      size: isFile ? writtenFiles[pathStr].length : 0,
      blksize: 4096,
      blocks: 0,
      atimeMs: Date.now(),
      mtimeMs: Date.now(),
      ctimeMs: Date.now(),
      birthtimeMs: Date.now(),
      atime: new Date(),
      mtime: new Date(),
      ctime: new Date(),
      birthtime: new Date(),
    } as Stats
  }

  // Custom *Impl callbacks get the same canonical key as the defaults. They
  // compare against fixture literals just like the built-in lookups do, so
  // skipping normalization here would make them miss on Windows.
  const readFileFn = readFileImpl
    ? async (path: PathLike) => readFileImpl(normalizePath(path))
    : defaultReadFile

  const readdirFn = readdirImpl
    ? async (path: PathLike) => readdirImpl(normalizePath(path))
    : defaultReaddir

  const writeFileFn = writeFileImpl
    ? async (path: PathLike, data: string) =>
        writeFileImpl(normalizePath(path), data)
    : defaultWriteFile

  const mkdirFn = mkdirImpl
    ? async (path: PathLike, opts?: { recursive?: boolean }) =>
        mkdirImpl(normalizePath(path), opts)
    : defaultMkdir

  const statFn = statImpl
    ? async (path: PathLike) => statImpl(normalizePath(path))
    : defaultStat

  return {
    readFile: mock(readFileFn),
    readdir: mock(readdirFn),
    writeFile: mock(writeFileFn),
    mkdir: mock(mkdirFn),
    stat: mock(statFn),
  } as unknown as MockFs
}

export function restoreMockFs(mockFs: MockFs): void {
  const mocks = mockFs as unknown as MockFsWithMocks
  mocks.readFile.mockRestore()
  mocks.readdir.mockRestore()
  mocks.writeFile.mockRestore()
  mocks.mkdir.mockRestore()
  mocks.stat.mockRestore()
}

export function clearMockFs(mockFs: MockFs): void {
  const mocks = mockFs as unknown as MockFsWithMocks
  mocks.readFile.mockClear()
  mocks.readdir.mockClear()
  mocks.writeFile.mockClear()
  mocks.mkdir.mockClear()
  mocks.stat.mockClear()
}
