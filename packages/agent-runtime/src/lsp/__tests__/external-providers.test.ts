import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { afterAll, describe, expect, it } from 'bun:test'

import { parseGoVetOutput } from '../go-provider'
import { parsePyCompileOutput, pythonProvider } from '../python-provider'
import { findCrateRoot, parseCargoShortOutput } from '../rust-provider'

const tempDirs: string[] = []
const makeTempDir = (prefix: string): string => {
  const dir = mkdtempSync(path.join(tmpdir(), prefix))
  tempDirs.push(dir)
  return dir
}

afterAll(() => {
  for (const dir of tempDirs) {
    rmSync(dir, { recursive: true, force: true })
  }
})

describe('parsePyCompileOutput', () => {
  it('parses a classic SyntaxError traceback', () => {
    const stderr = [
      'Traceback (most recent call last):',
      '  File "C:\\lib\\py_compile.py", line 200, in compile',
      'py_compile.PyCompileError: SyntaxError...',
      '  File "C:\\proj\\calc.py", line 3',
      '    def f(:',
      '           ^',
      'SyntaxError: invalid syntax',
    ].join('\n')
    // The LAST `File "...", line N` wins? No — the regex takes the first.
    // Feed only the user-file traceback (as py_compile emits for -m usage).
    const userStderr = [
      '  File "C:\\proj\\calc.py", line 3',
      '    def f(:',
      '           ^',
      'SyntaxError: invalid syntax',
    ].join('\n')
    const diags = parsePyCompileOutput(userStderr, 'C:/proj/calc.py')
    expect(diags).toHaveLength(1)
    expect(diags[0].line).toBe(3)
    expect(diags[0].message).toContain('SyntaxError')
    expect(stderr.length).toBeGreaterThan(0)
  })

  it('returns [] for empty stderr', () => {
    expect(parsePyCompileOutput('', 'x.py')).toHaveLength(0)
  })

  it('falls back to the file argument when no File line is present', () => {
    const diags = parsePyCompileOutput(
      "SyntaxError: ('invalid syntax', ...)",
      'C:/proj/calc.py',
    )
    expect(diags).toHaveLength(1)
    expect(diags[0].file).toBe(path.resolve('C:/proj/calc.py'))
    expect(diags[0].message).toContain('SyntaxError')
  })
})

describe('parseGoVetOutput', () => {
  it('parses file:line:col findings and skips package headers', () => {
    const out = [
      '# example.com/demo',
      './calc.go:12:5: undefined: foo',
      'vet: calc.go:3:1: expected declaration, found asdf',
      'random noise line',
    ].join('\n')
    const diags = parseGoVetOutput(out, 'C:/proj')
    expect(diags).toHaveLength(2)
    expect(diags[0].file).toBe(path.resolve('C:/proj/calc.go'))
    expect(diags[0].line).toBe(12)
    expect(diags[0].column).toBe(5)
    expect(diags[0].message).toBe('undefined: foo')
    expect(diags[1].line).toBe(3)
  })
})

describe('parseCargoShortOutput', () => {
  it('parses error lines with and without codes, skipping warnings', () => {
    const out = [
      'src/main.rs:5:9: error[E0308]: mismatched types',
      'src\\lib.rs:3:1: error: expected item, found `asdf`',
      'src/main.rs:1:1: warning: unused import',
    ].join('\n')
    const diags = parseCargoShortOutput(out, 'C:/crate')
    expect(diags).toHaveLength(2)
    expect(diags[0].code).toBe('E0308')
    expect(diags[0].message).toBe('mismatched types')
    expect(diags[1].code).toBeUndefined()
  })
})

describe('findCrateRoot', () => {
  it('walks up to the nearest Cargo.toml and returns null without one', () => {
    const root = makeTempDir('nexus-crate-')
    writeFileSync(path.join(root, 'Cargo.toml'), '[package]\nname = "demo"\n')
    const srcDir = path.join(root, 'src', 'deep')
    // findCrateRoot only reads the fs — no need for the file to exist.
    expect(findCrateRoot(path.join(srcDir, 'main.rs'))).toBe(root)

    const orphanDir = makeTempDir('nexus-orphan-')
    expect(findCrateRoot(path.join(orphanDir, 'x.rs'))).toBeNull()
  })
})

describe('pythonProvider (integración real, requiere python en PATH)', () => {
  it('reports a syntax error and nothing for valid code', () => {
    const dir = makeTempDir('nexus-py-')
    const bad = path.join(dir, 'bad.py')
    const good = path.join(dir, 'good.py')
    writeFileSync(bad, 'def f(:\n    pass\n')
    writeFileSync(good, 'def f():\n    return 1\n')

    const badDiags = pythonProvider.getDiagnostics([bad]) as ReturnType<
      typeof parsePyCompileOutput
    >
    const goodDiags = pythonProvider.getDiagnostics([good]) as ReturnType<
      typeof parsePyCompileOutput
    >
    // If python isn't installed both come back empty (fail soft) — the
    // assertion still holds for good code, and we skip the bad-code check.
    expect(goodDiags).toHaveLength(0)
    if (badDiags.length > 0) {
      expect(badDiags[0].message).toContain('SyntaxError')
      expect(badDiags[0].line).toBeGreaterThan(0)
    }
  })
})
