/**
 * Conventional Commits → changelog entries and version bumps.
 *
 * Why hand-rolled instead of semantic-release or changesets:
 *
 * - changesets versions many publishable packages independently. NEXUS has one
 *   product, and the six package.json files it publishes are *generated* by
 *   `cli/scripts/pack-npm.ts` — there is nothing for changesets to version.
 * - semantic-release assumes a single `npm publish`. NEXUS publishes five
 *   cross-compiled binary packages plus a shim, in a specific order, and would
 *   need custom plugins for all of it — plus ~30 transitive dependencies to do
 *   a job that is two hundred lines of parsing.
 *
 * What is left is exactly this: read commit subjects, group them, decide the
 * bump. No dependencies.
 */

export type BumpKind = 'major' | 'minor' | 'patch' | 'none'

export interface ParsedCommit {
  type: string
  scope?: string
  subject: string
  breaking: boolean
  hash: string
}

/** Commit types that show up in the changelog, in display order. */
export const CHANGELOG_SECTIONS: Array<{ type: string; heading: string }> = [
  { type: 'feat', heading: 'Novedades' },
  { type: 'fix', heading: 'Correcciones' },
  { type: 'perf', heading: 'Rendimiento' },
  { type: 'refactor', heading: 'Refactors' },
  { type: 'docs', heading: 'Documentación' },
  { type: 'test', heading: 'Tests' },
  { type: 'build', heading: 'Build' },
  { type: 'ci', heading: 'CI' },
]

/** Types that exist but are deliberately not user-facing. */
const HIDDEN_TYPES = new Set(['chore', 'style'])

const HEADER = /^(?<type>[a-z]+)(?:\((?<scope>[^)]+)\))?(?<breaking>!)?:\s*(?<subject>.+)$/

/**
 * Parse one `<hash> <subject>` line. Returns undefined for anything that isn't
 * a conventional commit — merge commits and older history, which simply don't
 * appear in the changelog rather than breaking the run.
 */
export function parseCommit(line: string): ParsedCommit | undefined {
  const trimmed = line.trim()
  if (!trimmed) return undefined

  const spaceIndex = trimmed.indexOf(' ')
  if (spaceIndex < 0) return undefined

  const hash = trimmed.slice(0, spaceIndex)
  const message = trimmed.slice(spaceIndex + 1)

  const match = HEADER.exec(message)
  if (!match?.groups) return undefined

  return {
    type: match.groups.type,
    scope: match.groups.scope,
    subject: match.groups.subject.trim(),
    breaking: Boolean(match.groups.breaking),
    hash,
  }
}

export function parseCommits(log: string): ParsedCommit[] {
  return log
    .split(/\r?\n/)
    .map(parseCommit)
    .filter((c): c is ParsedCommit => c !== undefined)
}

/**
 * The SemVer bump these commits imply.
 *
 * Pre-1.0 rules are deliberately NOT applied: NEXUS is past 1.0, so a breaking
 * change is a major and nothing downgrades it.
 */
export function determineBump(commits: ParsedCommit[]): BumpKind {
  if (commits.length === 0) return 'none'
  if (commits.some((c) => c.breaking)) return 'major'
  if (commits.some((c) => c.type === 'feat')) return 'minor'
  if (commits.some((c) => c.type === 'fix' || c.type === 'perf')) return 'patch'
  return 'none'
}

export function bumpVersion(current: string, bump: BumpKind): string {
  const match = /^(\d+)\.(\d+)\.(\d+)/.exec(current)
  if (!match) throw new Error(`Not a SemVer version: "${current}"`)

  const [major, minor, patch] = match.slice(1, 4).map(Number)
  switch (bump) {
    case 'major':
      return `${major + 1}.0.0`
    case 'minor':
      return `${major}.${minor + 1}.0`
    case 'patch':
      return `${major}.${minor}.${patch + 1}`
    case 'none':
      return current
  }
}

export interface ChangelogOptions {
  version: string
  date: string
  /** Repo URL, used to link commit hashes. Omit to render plain hashes. */
  repoUrl?: string
  previousTag?: string
}

/**
 * Render one CHANGELOG section for a release.
 *
 * Breaking changes get their own block at the top: they're the only entries a
 * user *must* read before upgrading.
 */
export function renderChangelogEntry(
  commits: ParsedCommit[],
  options: ChangelogOptions,
): string {
  const lines: string[] = [`## ${options.version} — ${options.date}`, '']

  const breaking = commits.filter((c) => c.breaking)
  if (breaking.length > 0) {
    lines.push('### ⚠️ Cambios incompatibles', '')
    for (const commit of breaking) {
      lines.push(formatCommit(commit, options.repoUrl))
    }
    lines.push('')
  }

  for (const section of CHANGELOG_SECTIONS) {
    const entries = commits.filter((c) => c.type === section.type && !c.breaking)
    if (entries.length === 0) continue

    lines.push(`### ${section.heading}`, '')
    for (const commit of entries) {
      lines.push(formatCommit(commit, options.repoUrl))
    }
    lines.push('')
  }

  const hidden = commits.filter((c) => HIDDEN_TYPES.has(c.type))
  if (
    lines.length === 2 &&
    hidden.length > 0
  ) {
    lines.push('Solo cambios internos de mantenimiento.', '')
  }

  return lines.join('\n')
}

function formatCommit(commit: ParsedCommit, repoUrl?: string): string {
  const scope = commit.scope ? `**${commit.scope}:** ` : ''
  const short = commit.hash.slice(0, 7)
  const link = repoUrl ? `([\`${short}\`](${repoUrl}/commit/${commit.hash}))` : `(\`${short}\`)`
  return `- ${scope}${commit.subject} ${link}`
}

/** Heading for changes that are on `main` but not in any release yet. */
export const UNRELEASED_HEADING = '## No publicado'

/**
 * Drop the "No publicado" section.
 *
 * Those changes are about to become a numbered release, and the generated
 * entry already covers them — leaving both would list everything twice.
 */
export function stripUnreleasedSection(changelog: string): string {
  const lines = changelog.split(/\r?\n/)
  const start = lines.findIndex((line) => line.trim() === UNRELEASED_HEADING)
  if (start < 0) return changelog

  let end = start + 1
  while (end < lines.length && !lines[end].startsWith('## ')) {
    end++
  }
  return [...lines.slice(0, start), ...lines.slice(end)].join('\n')
}

/**
 * Insert a new entry into an existing CHANGELOG, right below the title.
 *
 * Idempotent by version: re-running for a version already present returns the
 * file unchanged, so a re-run of the release workflow can't duplicate a
 * section.
 */
export function insertIntoChangelog(existing: string, entry: string, version: string): string {
  if (new RegExp(`^## ${escapeRegExp(version)}\\b`, 'm').test(existing)) {
    return existing
  }

  const lines = stripUnreleasedSection(existing).split(/\r?\n/)
  const titleIndex = lines.findIndex((line) => line.startsWith('# '))

  if (titleIndex < 0) {
    return `${entry}\n${existing}`
  }

  // Skip the title and any prose directly under it, stopping at the first
  // release heading so the intro paragraph stays at the top.
  let insertAt = titleIndex + 1
  while (insertAt < lines.length && !lines[insertAt].startsWith('## ')) {
    insertAt++
  }

  const before = lines.slice(0, insertAt).join('\n').replace(/\s+$/, '')
  const after = lines.slice(insertAt).join('\n')
  return `${before}\n\n${entry}${after ? `\n${after}` : '\n'}`
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}
