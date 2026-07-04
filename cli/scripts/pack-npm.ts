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

// Distribution env, baked into the binary at compile time (NEXT_PUBLIC_* reads
// are inlined by --define). Self-contained on purpose: `bun run pack:npm` must
// work with no .env file, on any machine or CI runner.
//  - prod => user config lives in ~/.config/nexus (not the -dev suffix)
//  - the app URL stays on localhost: every backend call is a no-op in BYOK, and
//    if a stray one slips through, localhost fails instantly instead of hanging
//  - PostHog/Stripe values are placeholders — analytics is disabled in BYOK
const DIST_ENV: Record<string, string> = {
  NEXT_PUBLIC_CB_ENVIRONMENT: 'prod',
  NEXT_PUBLIC_NEXUS_APP_URL: 'http://localhost:3000',
  NEXT_PUBLIC_SUPPORT_EMAIL: 'soporte@nexus.local',
  NEXT_PUBLIC_POSTHOG_API_KEY: 'phc_disabled',
  NEXT_PUBLIC_POSTHOG_HOST_URL: 'https://us.i.posthog.com',
  NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: 'pk_disabled',
  NEXT_PUBLIC_STRIPE_CUSTOMER_PORTAL: 'https://localhost',
  NEXT_PUBLIC_WEB_PORT: '3000',
}
const buildEnv = { ...process.env, ...DIST_ENV }

function run(cmd: string, args: string[]) {
  const r = spawnSync(cmd, args, { cwd: cliRoot, stdio: 'inherit', env: buildEnv })
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
