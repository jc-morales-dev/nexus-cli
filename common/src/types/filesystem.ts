import type fs from 'fs'

/** File system used for Nexus SDK.
 *
 * Compatible with `fs.promises` from the `'fs'` module.
 */
export type NexusFileSystem = Pick<
  typeof fs.promises,
  'mkdir' | 'readdir' | 'readFile' | 'stat' | 'unlink' | 'writeFile'
>
