import path from 'path'

import { toPosixPath } from '@nexus/common/util/path-format'

export type ResolvedProjectPath = {
  /**
   * Absolute path in the host's native form (backslashes on Windows). It is
   * handed straight to `fs` and to `path.dirname`/`path.sep` comparisons, so
   * its separators must never be flattened.
   */
  fullPath: string
  /**
   * Project-relative path, forward-slash separated on every platform.
   *
   * This is the file's *identity*: what the model reads in tool output, what
   * keys the `getFiles` result map, what keys an undo checkpoint. It must not
   * change shape between Windows and POSIX.
   */
  relativePath: string
}

/**
 * Path-traversal guard.
 *
 * Must be given the NATIVE output of `path.relative`. It normalises internally
 * so the '..' checks hold whatever the separator: on Windows `path.relative`
 * emits '..\\outside.ts', which a bare `startsWith('../')` would wave through.
 */
function escapesProject(nativeRelativePath: string): boolean {
  const normalized = toPosixPath(nativeRelativePath)
  return (
    normalized === '..' ||
    normalized.startsWith('../') ||
    path.isAbsolute(nativeRelativePath)
  )
}

export function resolveFilePathWithinProject(
  projectRoot: string,
  filePath: string,
): ResolvedProjectPath | null {
  const resolvedRoot = path.resolve(projectRoot)
  const fullPath = path.isAbsolute(filePath)
    ? path.resolve(filePath)
    : path.resolve(resolvedRoot, filePath)
  const nativeRelativePath = path.relative(resolvedRoot, fullPath)

  // Guard on the native string, before normalising: the checks depend on seeing
  // exactly what `path.relative` produced.
  if (nativeRelativePath === '' || escapesProject(nativeRelativePath)) {
    return null
  }

  return { fullPath, relativePath: toPosixPath(nativeRelativePath) }
}

export function getProjectPathLookupKeys(
  projectRoot: string,
  filePath: string,
): string[] {
  const resolvedPath = resolveFilePathWithinProject(projectRoot, filePath)
  const keys = resolvedPath ? [resolvedPath.relativePath, filePath] : [filePath]

  return [...new Set(keys)]
}
