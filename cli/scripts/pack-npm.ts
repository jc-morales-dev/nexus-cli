#!/usr/bin/env bun
/**
 * Assemble the publishable npm packages (../npm-dist) for NEXUS.
 *
 * NEXUS can't run on plain Node (OpenTUI needs Bun's FFI), so — like esbuild,
 * biome, and turbo — we ship self-contained prebuilt binaries inside npm
 * packages and a tiny Node bin shim that execs the right one:
 *
 *   @victor00128/nexus-cli            → shim + optionalDependencies (universal)
 *   @victor00128/nexus-cli-<platform> → the actual binary (os/cpu restricted)
 *
 * npm only downloads the optionalDependency matching the user's os/cpu.
 *
 * Usage:
 *   bun run pack:npm                       → build for the current platform only
 *   bun run pack:npm win32-x64 linux-x64 darwin-x64 darwin-arm64
 *                                          → cross-compile every listed target
 *
 * Cross-compiling downloads the target Bun runtime on demand. If that download
 * flakes (slow connections), pre-download the official bun-<target>.zip files
 * and point BUN_RUNTIMES_DIR at a directory shaped like:
 *   $BUN_RUNTIMES_DIR/bun-linux-x64/bun
 *   $BUN_RUNTIMES_DIR/bun-darwin-aarch64/bun
 */
import { spawnSync } from 'child_process'
import { copyFileSync, existsSync, mkdirSync, writeFileSync } from 'fs'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const cliRoot = join(__dirname, '..')
const repoRoot = dirname(cliRoot)
const npmDistDir = join(repoRoot, 'npm-dist')
const version = process.env.npm_package_version ?? '1.0.0'

const SCOPE = '@victor00128'
const BASE_NAME = 'nexus-cli'

interface Target {
  key: string // npm-style key: <platform>-<arch>
  bunTarget: string // bun build --target value
  bunRuntimeFolder: string // folder name inside the official bun-<target>.zip
  platform: NodeJS.Platform
  arch: string
  exeName: string
  rgVendorDir: string // sdk/dist/vendor/ripgrep subdir
}

const TARGETS: Record<string, Target> = {
  'win32-x64': {
    key: 'win32-x64',
    bunTarget: 'bun-windows-x64',
    bunRuntimeFolder: 'bun-windows-x64',
    platform: 'win32',
    arch: 'x64',
    exeName: 'nexus.exe',
    rgVendorDir: 'x64-win32',
  },
  'linux-x64': {
    key: 'linux-x64',
    bunTarget: 'bun-linux-x64',
    bunRuntimeFolder: 'bun-linux-x64',
    platform: 'linux',
    arch: 'x64',
    exeName: 'nexus',
    rgVendorDir: 'x64-linux',
  },
  'linux-arm64': {
    key: 'linux-arm64',
    bunTarget: 'bun-linux-arm64',
    bunRuntimeFolder: 'bun-linux-aarch64',
    platform: 'linux',
    arch: 'arm64',
    exeName: 'nexus',
    rgVendorDir: 'arm64-linux',
  },
  'darwin-x64': {
    key: 'darwin-x64',
    bunTarget: 'bun-darwin-x64',
    bunRuntimeFolder: 'bun-darwin-x64',
    platform: 'darwin',
    arch: 'x64',
    exeName: 'nexus',
    rgVendorDir: 'x64-darwin',
  },
  'darwin-arm64': {
    key: 'darwin-arm64',
    bunTarget: 'bun-darwin-arm64',
    bunRuntimeFolder: 'bun-darwin-aarch64',
    platform: 'darwin',
    arch: 'arm64',
    exeName: 'nexus',
    rgVendorDir: 'arm64-darwin',
  },
}

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

function run(cmd: string, args: string[], extraEnv: Record<string, string> = {}) {
  const r = spawnSync(cmd, args, {
    cwd: cliRoot,
    stdio: 'inherit',
    env: { ...process.env, ...DIST_ENV, ...extraEnv },
  })
  if (r.status !== 0) {
    throw new Error(`"${cmd} ${args.join(' ')}" failed (exit ${r.status})`)
  }
}

function buildTarget(target: Target) {
  const extraEnv: Record<string, string> = {
    OVERRIDE_TARGET: target.bunTarget,
    OVERRIDE_PLATFORM: target.platform,
    OVERRIDE_ARCH: target.arch,
  }

  // Optional pre-downloaded Bun runtime (workaround for flaky downloads).
  const runtimesDir = process.env.BUN_RUNTIMES_DIR
  if (runtimesDir) {
    const runtimeExe = target.platform === 'win32' ? 'bun.exe' : 'bun'
    const candidate = join(runtimesDir, target.bunRuntimeFolder, runtimeExe)
    if (existsSync(candidate)) {
      extraEnv.BUN_COMPILE_EXECUTABLE_PATH = candidate
      console.log(`[pack:npm] usando runtime local: ${candidate}`)
    }
  }

  run('bun', ['run', 'scripts/build-binary.ts', 'nexus', version], extraEnv)
}

/** Copy LICENSE + NOTICE from the repo root into a package dir. */
function copyLicenseFiles(pkgDir: string) {
  for (const name of ['LICENSE', 'NOTICE']) {
    const src = join(repoRoot, name)
    if (existsSync(src)) {
      copyFileSync(src, join(pkgDir, name))
    }
  }
}

function writePlatformPackage(target: Target) {
  const pkgName = `${SCOPE}/${BASE_NAME}-${target.key}`
  const pkgDir = join(npmDistDir, 'npm', `${BASE_NAME}-${target.key}`)
  const pkgBinDir = join(pkgDir, 'bin')
  mkdirSync(pkgBinDir, { recursive: true })

  // Binary — build-binary always writes cli/bin/nexus(.exe on win32 targets).
  const builtName = target.platform === 'win32' ? 'nexus.exe' : 'nexus'
  copyFileSync(join(cliRoot, 'bin', builtName), join(pkgBinDir, target.exeName))

  // tree-sitter.wasm MUST sit next to the binary (read from disk at runtime).
  copyFileSync(
    join(cliRoot, 'bin', 'tree-sitter.wasm'),
    join(pkgBinDir, 'tree-sitter.wasm'),
  )

  // ripgrep for the TARGET platform (the binary can also self-extract its
  // embedded copy on first run; shipping it pre-extracted skips that step).
  const rgName = target.platform === 'win32' ? 'rg.exe' : 'rg'
  const rgSrc = join(repoRoot, 'sdk', 'dist', 'vendor', 'ripgrep', target.rgVendorDir, rgName)
  if (existsSync(rgSrc)) {
    copyFileSync(rgSrc, join(pkgBinDir, rgName))
  }

  // Apache-2.0 compliance: the binary is a derived work, so every published
  // package carries LICENSE + NOTICE. npm auto-includes LICENSE and README but
  // NOT NOTICE, so NOTICE has to be listed in "files" explicitly below.
  copyLicenseFiles(pkgDir)

  writeFileSync(
    join(pkgDir, 'package.json'),
    JSON.stringify(
      {
        name: pkgName,
        version,
        description: `NEXUS CLI — binario ${target.key}. Instalado automáticamente por ${SCOPE}/${BASE_NAME}.`,
        license: 'Apache-2.0',
        preferUnplugged: true,
        os: [target.platform],
        cpu: [target.arch],
        files: ['bin/', 'NOTICE'],
      },
      null,
      2,
    ) + '\n',
  )
  console.log(`[pack:npm] paquete listo: ${pkgDir}`)
}

function writeMainPackage(builtKeys: string[]) {
  // The main package is universal: the shim picks the platform package at run
  // time. optionalDependencies always lists ALL platforms — npm skips the ones
  // that don't match the user's os/cpu. (Publishing requires every listed
  // platform package to exist at this version, so build all of them.)
  const optionalDependencies = Object.fromEntries(
    Object.keys(TARGETS).map((key) => [`${SCOPE}/${BASE_NAME}-${key}`, version]),
  )
  writeFileSync(
    join(npmDistDir, 'package.json'),
    JSON.stringify(
      {
        name: `${SCOPE}/${BASE_NAME}`,
        version,
        description:
          'NEXUS — un CLI de coding con IA, gratis. Traé tu propia API key de OpenRouter (gratis o de pago) y usá cualquier modelo.',
        keywords: ['ai', 'cli', 'coding-agent', 'openrouter', 'llm', 'terminal'],
        license: 'Apache-2.0',
        bin: { nexus: 'bin/nexus.js' },
        files: ['bin/nexus.js', 'NOTICE'],
        engines: { node: '>=16' },
        optionalDependencies,
      },
      null,
      2,
    ) + '\n',
  )
  copyLicenseFiles(npmDistDir)
  console.log(
    `[pack:npm] paquete principal listo (targets construidos: ${builtKeys.join(', ')})`,
  )
}

// ---------------------------------------------------------------------------

const requested = process.argv.slice(2).filter((a) => !a.startsWith('-'))
const invalid = requested.filter((a) => !TARGETS[a])
if (invalid.length > 0) {
  throw new Error(
    `Targets inválidos: ${invalid.join(', ')}. Válidos: ${Object.keys(TARGETS).join(', ')}`,
  )
}
const currentKey = `${process.platform}-${process.arch}`
const targetKeys = requested.length > 0 ? requested : [currentKey]

for (const key of targetKeys) {
  const target = TARGETS[key]
  console.log(`\n[pack:npm] ▸ construyendo ${key} ...`)
  buildTarget(target)
  writePlatformPackage(target)
}
writeMainPackage(targetKeys)

console.log(
  `\n✅ npm-dist listo (v${version}).\n` +
    `   Publicar (en orden — primero TODAS las plataformas, después el principal):\n` +
    Object.keys(TARGETS)
      .map((k) => `     cd npm-dist/npm/${BASE_NAME}-${k} && npm publish --access public`)
      .join('\n') +
    `\n     cd npm-dist && npm publish --access public`,
)
