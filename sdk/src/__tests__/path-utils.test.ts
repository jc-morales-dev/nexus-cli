import { describe, expect, test } from 'bun:test'
import path from 'path'

import {
  getProjectPathLookupKeys,
  resolveFilePathWithinProject,
} from '../tools/path-utils'

// A POSIX-looking fixture root is not a real path on Windows: `path.resolve`
// binds it to the current drive ('/repo' -> 'E:\repo'). Resolving it here too
// keeps the fixture and the code under test on the same drive.
const REPO = path.resolve('/repo')

describe('resolveFilePathWithinProject', () => {
  test('normalizes relative paths to full and project-relative paths', () => {
    expect(resolveFilePathWithinProject(REPO, 'src/file.ts')).toEqual({
      fullPath: path.join(REPO, 'src', 'file.ts'),
      relativePath: 'src/file.ts',
    })
  })

  test('normalizes absolute paths inside the project', () => {
    expect(
      resolveFilePathWithinProject(REPO, path.join(REPO, 'src', 'file.ts')),
    ).toEqual({
      fullPath: path.join(REPO, 'src', 'file.ts'),
      relativePath: 'src/file.ts',
    })
  })

  test('allows file names that start with two dots inside the project', () => {
    expect(
      resolveFilePathWithinProject(REPO, path.join(REPO, '..config')),
    ).toEqual({
      fullPath: path.join(REPO, '..config'),
      relativePath: '..config',
    })
  })

  test('returns a project-relative path with forward slashes on every platform', () => {
    const resolved = resolveFilePathWithinProject(REPO, 'src/nested/file.ts')
    expect(resolved?.relativePath).toBe('src/nested/file.ts')
    expect(resolved?.relativePath).not.toContain('\\')
  })

  test('rejects paths outside the project', () => {
    expect(resolveFilePathWithinProject(REPO, '../outside.ts')).toBeNull()
    expect(resolveFilePathWithinProject(REPO, '/outside.ts')).toBeNull()
    expect(
      resolveFilePathWithinProject(REPO, `${REPO}-sibling/file.ts`),
    ).toBeNull()
  })

  // Regression guard: `path.relative` emits native separators, so on Windows an
  // escape reads '..\\outside.ts'. Normalising before the check — instead of
  // after — would let every one of these through.
  test('rejects traversal regardless of the native separator', () => {
    expect(resolveFilePathWithinProject(REPO, '..')).toBeNull()
    expect(resolveFilePathWithinProject(REPO, '../outside.ts')).toBeNull()
    expect(
      resolveFilePathWithinProject(REPO, 'src/../../outside.ts'),
    ).toBeNull()
    expect(
      resolveFilePathWithinProject(REPO, path.join('..', 'outside.ts')),
    ).toBeNull()
    expect(resolveFilePathWithinProject(REPO, REPO)).toBeNull()
  })
})

describe('getProjectPathLookupKeys', () => {
  test('returns the normalized relative key before the original absolute key', () => {
    const absolute = path.join(REPO, 'src', 'file.ts')
    expect(getProjectPathLookupKeys(REPO, absolute)).toEqual([
      'src/file.ts',
      absolute,
    ])
  })

  test('dedupes relative paths that are already normalized', () => {
    expect(getProjectPathLookupKeys(REPO, 'src/file.ts')).toEqual([
      'src/file.ts',
    ])
  })

  test('returns only the original key for paths outside the project', () => {
    expect(getProjectPathLookupKeys(REPO, '/outside.ts')).toEqual([
      '/outside.ts',
    ])
  })
})
