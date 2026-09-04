import { describe, expect, test } from 'bun:test'

import {
  bumpVersion,
  determineBump,
  insertIntoChangelog,
  parseCommit,
  parseCommits,
  renderChangelogEntry,
  stripUnreleasedSection,
} from '../release/conventional-commits'

describe('parseCommit', () => {
  test('parses type, scope and subject', () => {
    const commit = parseCommit('abc1234 feat(cli): add nexus doctor')
    expect(commit).toMatchObject({
      type: 'feat',
      scope: 'cli',
      subject: 'add nexus doctor',
      breaking: false,
      hash: 'abc1234',
    })
  })

  test('parses a commit with no scope', () => {
    expect(parseCommit('abc1234 fix: stop leaking keys')).toMatchObject({
      type: 'fix',
      scope: undefined,
      subject: 'stop leaking keys',
    })
  })

  test('marks a breaking change from the bang', () => {
    expect(parseCommit('abc1234 feat(sdk)!: drop the backend path')?.breaking).toBe(true)
  })

  test('ignores non-conventional lines instead of throwing', () => {
    expect(parseCommit("abc1234 Merge branch 'main'")).toBeUndefined()
    expect(parseCommit('abc1234')).toBeUndefined()
    expect(parseCommit('')).toBeUndefined()
  })

  test('parseCommits drops the unparseable lines', () => {
    const log = [
      'aaa1111 feat: one',
      "bbb2222 Merge pull request #3 from x",
      'ccc3333 fix: two',
    ].join('\n')
    expect(parseCommits(log).map((c) => c.type)).toEqual(['feat', 'fix'])
  })
})

describe('determineBump', () => {
  test('a breaking change wins over everything else', () => {
    expect(
      determineBump(parseCommits('a1 feat: x\nb2 fix!: y')),
    ).toBe('major')
  })

  test('a feature means minor', () => {
    expect(determineBump(parseCommits('a1 feat: x\nb2 fix: y'))).toBe('minor')
  })

  test('only fixes means patch', () => {
    expect(determineBump(parseCommits('a1 fix: x\nb2 perf: y'))).toBe('patch')
  })

  test('docs and chores alone mean no release', () => {
    expect(determineBump(parseCommits('a1 docs: x\nb2 chore: y'))).toBe('none')
  })

  test('no commits means no release', () => {
    expect(determineBump([])).toBe('none')
  })
})

describe('bumpVersion', () => {
  test.each([
    ['1.2.3', 'major', '2.0.0'],
    ['1.2.3', 'minor', '1.3.0'],
    ['1.2.3', 'patch', '1.2.4'],
    ['1.2.3', 'none', '1.2.3'],
    ['0.9.9', 'minor', '0.10.0'],
  ] as const)('%s + %s → %s', (current, bump, expected) => {
    expect(bumpVersion(current, bump)).toBe(expected)
  })

  test('rejects a non-SemVer input rather than guessing', () => {
    expect(() => bumpVersion('latest', 'patch')).toThrow(/SemVer/)
  })
})

describe('renderChangelogEntry', () => {
  const options = { version: '1.1.0', date: '2026-08-26', repoUrl: 'https://github.com/x/y' }

  test('groups commits under their section headings', () => {
    const entry = renderChangelogEntry(
      parseCommits('a1 feat(cli): doctor command\nb2 fix(sdk): redact keys'),
      options,
    )
    expect(entry).toContain('## 1.1.0 — 2026-08-26')
    expect(entry).toContain('### Novedades')
    expect(entry).toContain('### Correcciones')
    expect(entry).toContain('**cli:** doctor command')
  })

  test('puts breaking changes in their own block at the top', () => {
    const entry = renderChangelogEntry(
      parseCommits('a1 feat!: new config format\nb2 fix: something'),
      options,
    )
    expect(entry.indexOf('Cambios incompatibles')).toBeLessThan(
      entry.indexOf('### Correcciones'),
    )
  })

  test('does not repeat a breaking change in its type section', () => {
    const entry = renderChangelogEntry(parseCommits('a1 feat!: new format'), options)
    expect(entry.match(/new format/g)?.length).toBe(1)
  })

  test('links commit hashes when a repo url is given', () => {
    const entry = renderChangelogEntry(parseCommits('abc1234567 fix: x'), options)
    expect(entry).toContain('https://github.com/x/y/commit/abc1234567')
    expect(entry).toContain('`abc1234`')
  })

  test('renders plain hashes with no repo url', () => {
    const entry = renderChangelogEntry(parseCommits('abc1234567 fix: x'), {
      version: '1.0.1',
      date: '2026-01-01',
    })
    expect(entry).toContain('`abc1234`')
    expect(entry).not.toContain('http')
  })

  test('says so when a release is maintenance only', () => {
    const entry = renderChangelogEntry(parseCommits('a1 chore: bump deps'), options)
    expect(entry).toContain('mantenimiento')
  })

  test('hides chore commits from the user-facing sections', () => {
    const entry = renderChangelogEntry(
      parseCommits('a1 feat: real change\nb2 chore: bump deps'),
      options,
    )
    expect(entry).not.toContain('bump deps')
  })
})

describe('insertIntoChangelog', () => {
  const existing = `# Changelog

Some intro prose.

## 1.0.0 — 2026-01-01

### Novedades

- first release (\`aaa1111\`)
`

  test('inserts the new entry above the previous release', () => {
    const result = insertIntoChangelog(existing, '## 1.1.0 — 2026-08-26\n\n- new\n', '1.1.0')
    expect(result.indexOf('## 1.1.0')).toBeLessThan(result.indexOf('## 1.0.0'))
  })

  test('keeps the title and intro at the top', () => {
    const result = insertIntoChangelog(existing, '## 1.1.0 — 2026-08-26\n\n- new\n', '1.1.0')
    expect(result.startsWith('# Changelog')).toBe(true)
    expect(result).toContain('Some intro prose.')
  })

  test('is idempotent — a rerun does not duplicate the section', () => {
    const once = insertIntoChangelog(existing, '## 1.1.0 — 2026-08-26\n\n- new\n', '1.1.0')
    const twice = insertIntoChangelog(once, '## 1.1.0 — 2026-08-26\n\n- new\n', '1.1.0')
    expect(twice).toBe(once)
  })

  test('handles a changelog with no title', () => {
    const result = insertIntoChangelog('', '## 1.0.0 — x\n\n- new\n', '1.0.0')
    expect(result).toContain('## 1.0.0')
  })

  test('preserves the older releases verbatim', () => {
    const result = insertIntoChangelog(existing, '## 1.1.0 — 2026-08-26\n\n- new\n', '1.1.0')
    expect(result).toContain('- first release (`aaa1111`)')
  })

  // The pending changes are exactly the ones the generated entry describes;
  // keeping both would list every change twice in the published changelog.
  test('replaces the "No publicado" section with the new version', () => {
    const withUnreleased = [
      '# Changelog',
      '',
      '## No publicado',
      '',
      '- something pending',
      '',
      '## 1.0.0 — 2026-01-01',
      '',
      '- first release',
      '',
    ].join('\n')

    const result = insertIntoChangelog(
      withUnreleased,
      '## 1.1.0 — 2026-08-26\n\n- new\n',
      '1.1.0',
    )
    expect(result).not.toContain('No publicado')
    expect(result).not.toContain('something pending')
    expect(result).toContain('## 1.1.0')
    expect(result).toContain('## 1.0.0')
  })
})

describe('stripUnreleasedSection', () => {
  test('leaves a changelog without the section untouched', () => {
    const changelog = '# Changelog\n\n## 1.0.0 — x\n\n- a\n'
    expect(stripUnreleasedSection(changelog)).toBe(changelog)
  })

  test('removes only the unreleased block', () => {
    const result = stripUnreleasedSection(
      ['# Changelog', '', '## No publicado', '', '- pending', '', '## 1.0.0 — x', '', '- a'].join(
        '\n',
      ),
    )
    expect(result).not.toContain('pending')
    expect(result).toContain('## 1.0.0')
  })
})
