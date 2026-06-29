#!/usr/bin/env bun
/**
 * Assemble the publishable npm package (../npm-dist) for NEXUS.
 *
 * NEXUS can't run on plain Node (OpenTUI needs Bun's FFI), so — like esbuild,
 * biome, and turbo — we ship a self-contained prebuilt binary inside the npm
 * package and a tiny Node bin shim that execs it. This script builds the binary
 * for the current platform and copies it (plus its sibling assets) into
 * npm-dist/bin, ready for `cd npm-dist && npm publish`.
 *
 * Multi-platform: run this on each target OS (or in CI) and publish per-platform
 * packages; the main package can then list them as optionalDependencies and the
 * shim picks the right one. v1 ships the current platform only.
 */
import { spawnSync } from 'child_process'
import { copyFileSync, existsSync, mkdirSync } from 'fs'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const cliRoot = join(__dirname, '..')
const repoRoot = dirname(cliRoot)
const version = process.env.npm_package_version ?? '1.0.0'

const isWindows = process.platform === 'win32'
const exeName = isWindows ? 'nexus.exe' : 'nexus'
const npmBinDir = join(repoRoot, 'npm-dist', 'bin')

function run(cmd: string, args: string[]) {
  const r = spawnSync(cmd, args, { cwd: cliRoot, stdio: 'inherit', env: process.env })
  if (r.status !== 0) {
    throw new Error(`"${cmd} ${args.join(' ')}" failed (exit ${r.status})`)
  }
}

// 1. Build the self-contained binary for this platform.
run('bun', ['run', 'scripts/build-binary.ts', 'nexus', version])

// 2. Copy the binary + its sibling assets into the npm package.
mkdirSync(npmBinDir, { recursive: true })
const assets = [exeName, 'tree-sitter.wasm', isWindows ? 'rg.exe' : 'rg']
for (const asset of assets) {
  const src = join(cliRoot, 'bin', asset)
  if (existsSync(src)) {
    copyFileSync(src, join(npmBinDir, asset))
    console.log(`copied ${asset}`)
  }
}

console.log(
  `\n✅ npm-dist listo (v${version}, ${process.platform}-${process.arch}).\n` +
    `   Publicar:  cd npm-dist && npm publish --access public`,
)
