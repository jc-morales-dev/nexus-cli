/**
 * Flatten native path separators to '/'.
 *
 * Use this on paths that are *identities* — tool output the model reads, keys
 * of a result record, checkpoint keys — so that a given file has the same name
 * on every platform. On POSIX it is the identity function.
 *
 * Do NOT use it on a path that is about to be handed to `fs`, to `spawn`, or to
 * a `path.sep` comparison. Windows extended-length paths (`\\?\C:\...`) and UNC
 * paths (`\\server\share`) break when their separators are flattened.
 */
export function toPosixPath(filePath: string): string {
  return filePath.replace(/\\/g, '/')
}
