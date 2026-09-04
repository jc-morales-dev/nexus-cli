#!/usr/bin/env bun
/**
 * Prepare a release: work out the next version, update CHANGELOG.md, and bump
 * `cli/package.json`.
 *
 *   bun scripts/release/prepare.ts              # version derived from commits
 *   bun scripts/release/prepare.ts 1.2.0        # explicit version
 *   bun scripts/release/prepare.ts --dry-run    # print, change nothing
 *
 * Deliberately does NOT commit, tag or publish. Committing is the maintainer's
 * call, and pushing the tag is what actually triggers the release workflow —
 * keeping those manual means no script can publish by accident.
 *
 * `cli/package.json` is the single source of truth for the version. The six
 * publishable package.json files under `npm-dist/` are generated from it by
 * `cli/scripts/pack-npm.ts`, so they are never edited here.
 */

import { spawnSync } from 'child_process'
import fs from 'fs'
import path from 'path'

import {
  bumpVersion,
  determineBump,
  insertIntoChangelog,
  parseCommits,
  renderChangelogEntry,
} from './conventional-commits'

const repoRoot = path.join(import.meta.dir, '..', '..')
const cliPackagePath = path.join(repoRoot, 'cli', 'package.json')
const changelogPath = path.join(repoRoot, 'CHANGELOG.md')
const REPO_URL = 'https://github.com/jc-morales-dev/nexus-cli'

function git(args: string[]): string {
  const result = spawnSync('git', args, { cwd: repoRoot, encoding: 'utf8' })
  if (result.status !== 0) {
    throw new Error(`git ${args.join(' ')} failed: ${result.stderr?.trim()}`)
  }
  return result.stdout.trim()
}

/** The most recent `v*` tag, or undefined on a repo that has never released. */
function lastReleaseTag(): string | undefined {
  const result = spawnSync('git', ['describe', '--tags', '--abbrev=0', '--match', 'v*'], {
    cwd: repoRoot,
    encoding: 'utf8',
  })
  return result.status === 0 ? result.stdout.trim() : undefined
}

function readCurrentVersion(): string {
  const pkg = JSON.parse(fs.readFileSync(cliPackagePath, 'utf8')) as { version: string }
  return pkg.version
}

function writeVersion(version: string): void {
  const raw = fs.readFileSync(cliPackagePath, 'utf8')
  // Textual replacement of the first "version" field, so the rest of the file
  // (key order, formatting) survives untouched.
  const updated = raw.replace(/("version"\s*:\s*")[^"]+(")/, `$1${version}$2`)
  fs.writeFileSync(cliPackagePath, updated)
}

function main(): void {
  const args = process.argv.slice(2)
  const dryRun = args.includes('--dry-run')
  const explicitVersion = args.find((a) => /^\d+\.\d+\.\d+$/.test(a))

  const previousTag = lastReleaseTag()
  const range = previousTag ? `${previousTag}..HEAD` : 'HEAD'
  const log = git(['log', range, '--no-merges', '--format=%H %s'])
  const commits = parseCommits(log)

  const currentVersion = readCurrentVersion()
  const bump = determineBump(commits)
  const version = explicitVersion ?? bumpVersion(currentVersion, bump)

  console.log(`Versión actual:   ${currentVersion}`)
  console.log(`Commits desde:    ${previousTag ?? '(sin tags previos)'} — ${commits.length} relevantes`)
  console.log(`Bump detectado:   ${bump}`)
  console.log(`Versión nueva:    ${version}`)

  if (!explicitVersion && bump === 'none') {
    console.log('\nNada que publicar: ningún commit feat/fix/perf desde la última release.')
    console.log('Pasá una versión explícita si querés forzarla.')
    process.exit(0)
  }

  if (version === currentVersion) {
    console.error(
      `\nLa versión ${version} ya es la actual. Publicar dos veces la misma versión en npm es imposible.`,
    )
    process.exit(1)
  }

  const date = new Date().toISOString().slice(0, 10)
  const entry = renderChangelogEntry(commits, {
    version,
    date,
    repoUrl: REPO_URL,
    previousTag,
  })

  if (dryRun) {
    console.log('\n--- CHANGELOG (dry run) ---\n')
    console.log(entry)
    return
  }

  const existingChangelog = fs.existsSync(changelogPath)
    ? fs.readFileSync(changelogPath, 'utf8')
    : '# Changelog\n'
  fs.writeFileSync(changelogPath, insertIntoChangelog(existingChangelog, entry, version))
  writeVersion(version)

  console.log(`
Listo. Se actualizaron:
  - cli/package.json  →  ${version}
  - CHANGELOG.md

Revisá el diff y, si está bien:

  git add cli/package.json CHANGELOG.md
  git commit -m "release: ${version}"
  git tag v${version}
  git push origin main --tags

El push del tag dispara .github/workflows/release.yml, que construye los
binarios, verifica y publica. Nada se publica si los tests fallan.`)
}

main()
