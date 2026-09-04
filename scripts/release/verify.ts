#!/usr/bin/env bun
/**
 * Pre-publish gate.
 *
 * Runs inside the release workflow, after the packages are built and before
 * anything reaches npm. Publishing is irreversible — a version number can
 * never be reused — so everything checkable is checked here.
 *
 *   bun scripts/release/verify.ts v1.2.0
 */

import fs from 'fs'
import path from 'path'

const repoRoot = path.join(import.meta.dir, '..', '..')
const npmDist = path.join(repoRoot, 'npm-dist')

const PLATFORMS = [
  'win32-x64',
  'linux-x64',
  'linux-arm64',
  'darwin-x64',
  'darwin-arm64',
] as const

interface Problem {
  message: string
}

function readJson(file: string): any {
  return JSON.parse(fs.readFileSync(file, 'utf8'))
}

function verify(tag: string): Problem[] {
  const problems: Problem[] = []
  const expected = tag.replace(/^v/, '')

  if (!/^\d+\.\d+\.\d+$/.test(expected)) {
    problems.push({ message: `El tag "${tag}" no es una versión SemVer.` })
    return problems
  }

  // 1. The tag has to match the source of truth. A mismatch means the tag was
  //    pushed without running prepare.ts, and the published version would not
  //    be the one anyone reviewed.
  const cliVersion = readJson(path.join(repoRoot, 'cli', 'package.json')).version
  if (cliVersion !== expected) {
    problems.push({
      message: `El tag dice ${expected} pero cli/package.json dice ${cliVersion}.`,
    })
  }

  // 2. The main package must exist and carry that version.
  const mainPath = path.join(npmDist, 'package.json')
  if (!fs.existsSync(mainPath)) {
    problems.push({ message: 'Falta npm-dist/package.json — ¿corrió pack:npm?' })
    return problems
  }
  const main = readJson(mainPath)
  if (main.version !== expected) {
    problems.push({
      message: `npm-dist/package.json dice ${main.version}, se esperaba ${expected}.`,
    })
  }

  // 3. Every platform package must exist, at the same version, with a binary
  //    inside. npm resolves the optionalDependencies at exactly this version;
  //    a missing one means users on that platform get a broken install.
  for (const platform of PLATFORMS) {
    const dir = path.join(npmDist, 'npm', `nexus-cli-${platform}`)
    const pkgPath = path.join(dir, 'package.json')

    if (!fs.existsSync(pkgPath)) {
      problems.push({ message: `Falta el paquete de ${platform}.` })
      continue
    }

    const pkg = readJson(pkgPath)
    if (pkg.version !== expected) {
      problems.push({
        message: `nexus-cli-${platform} dice ${pkg.version}, se esperaba ${expected}.`,
      })
    }

    const exeName = platform.startsWith('win32') ? 'nexus.exe' : 'nexus'
    if (!fs.existsSync(path.join(dir, 'bin', exeName))) {
      problems.push({ message: `nexus-cli-${platform} no tiene el binario bin/${exeName}.` })
    }

    // tree-sitter.wasm is read from disk next to the binary at runtime. A
    // package without it installs fine and then fails on first use.
    if (!fs.existsSync(path.join(dir, 'bin', 'tree-sitter.wasm'))) {
      problems.push({ message: `nexus-cli-${platform} no tiene bin/tree-sitter.wasm.` })
    }

    // Apache-2.0: the binary is a derived work, so every package ships NOTICE.
    if (!fs.existsSync(path.join(dir, 'NOTICE'))) {
      problems.push({ message: `nexus-cli-${platform} no incluye NOTICE (Apache-2.0).` })
    }

    const declared = main.optionalDependencies?.[`@jc-morales-dev/nexus-cli-${platform}`]
    if (declared !== expected) {
      problems.push({
        message: `El paquete principal declara ${platform} en ${declared ?? '(nada)'}, se esperaba ${expected}.`,
      })
    }
  }

  // 4. The changelog must mention this release. A published version with no
  //    entry is a version nobody can find out anything about.
  const changelogPath = path.join(repoRoot, 'CHANGELOG.md')
  if (!fs.existsSync(changelogPath)) {
    problems.push({ message: 'Falta CHANGELOG.md.' })
  } else if (!fs.readFileSync(changelogPath, 'utf8').includes(`## ${expected}`)) {
    problems.push({ message: `CHANGELOG.md no tiene una entrada para ${expected}.` })
  }

  // 5. No credential may ship inside a package.
  for (const platform of PLATFORMS) {
    const pkgPath = path.join(npmDist, 'npm', `nexus-cli-${platform}`, 'package.json')
    if (!fs.existsSync(pkgPath)) continue
    const raw = fs.readFileSync(pkgPath, 'utf8')
    if (/sk-or-v1-[A-Za-z0-9]{16,}|sk-ant-|ghp_[A-Za-z0-9]{20,}/.test(raw)) {
      problems.push({ message: `nexus-cli-${platform}/package.json contiene algo con forma de API key.` })
    }
  }

  return problems
}

const tag = process.argv[2]
if (!tag) {
  console.error('Uso: bun scripts/release/verify.ts <tag>   (ej: v1.2.0)')
  process.exit(2)
}

const problems = verify(tag)
if (problems.length > 0) {
  console.error(`\n✗ ${problems.length} problema(s) — no se publica nada:\n`)
  for (const problem of problems) {
    console.error(`  - ${problem.message}`)
  }
  process.exit(1)
}

console.log(`✓ Todo verificado para ${tag}. Listo para publicar.`)
