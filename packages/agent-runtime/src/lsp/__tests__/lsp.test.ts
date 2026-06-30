import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { extractEditedFilePaths } from '../edited-files'
import {
  collectDiagnostics,
  formatDiagnosticsForAgent,
  lspEnabled,
} from '../index'
import { clearTsConfigCache, tsProvider } from '../ts-provider'

// ── Helpers ────────────────────────────────────────────────────────────────

let tmp: string

beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'nexus-lsp-'))
  clearTsConfigCache()
})

afterEach(() => {
  fs.rmSync(tmp, { recursive: true, force: true })
})

function writeFile(rel: string, content: string): string {
  const abs = path.join(tmp, rel)
  fs.mkdirSync(path.dirname(abs), { recursive: true })
  fs.writeFileSync(abs, content)
  return abs
}

function writeTsconfig(): void {
  writeFile(
    'tsconfig.json',
    JSON.stringify({
      compilerOptions: {
        strict: true,
        noEmit: true,
        skipLibCheck: true,
        module: 'esnext',
        target: 'esnext',
        moduleResolution: 'bundler',
      },
      include: ['**/*.ts'],
    }),
  )
}

// ── TypeScript provider ──────────────────────────────────────────────────────

describe('tsProvider', () => {
  // Building a real TS Program loads lib.d.ts on the first (cold) call, which can
  // take several seconds — hence the generous timeouts here.
  const TS_TIMEOUT = 30_000

  test(
    'reports a type error in an edited file',
    () => {
      writeTsconfig()
      const file = writeFile('bad.ts', 'export const x: number = "hello"\n')

      const diags = tsProvider.getDiagnostics([file])

      expect(diags.length).toBeGreaterThan(0)
      expect(diags[0]!.file).toBe(path.resolve(file))
      expect(diags[0]!.line).toBe(1)
      expect(diags[0]!.message.toLowerCase()).toContain('not assignable')
    },
    TS_TIMEOUT,
  )

  test(
    'reports a syntax error',
    () => {
      writeTsconfig()
      const file = writeFile('broken.ts', 'export function f( {\n')

      const diags = tsProvider.getDiagnostics([file])

      expect(diags.length).toBeGreaterThan(0)
    },
    TS_TIMEOUT,
  )

  test(
    'returns nothing for a clean file',
    () => {
      writeTsconfig()
      const file = writeFile('good.ts', 'export const x: number = 42\n')

      expect(tsProvider.getDiagnostics([file])).toEqual([])
    },
    TS_TIMEOUT,
  )

  test('ignores files with no tsconfig (fails soft)', () => {
    const file = writeFile('orphan.ts', 'export const x: number = "nope"\n')
    // No tsconfig written → provider has no config context → no diagnostics.
    expect(tsProvider.getDiagnostics([file])).toEqual([])
  })

  test(
    'only reports diagnostics for the requested file, not its neighbours',
    () => {
      writeTsconfig()
      writeFile('neighbour.ts', 'export const y: string = 123\n') // has an error
      const clean = writeFile('clean.ts', 'export const z = 1\n')

      // We ask only about the clean file; the neighbour's error must not leak.
      const diags = tsProvider.getDiagnostics([clean])
      expect(diags).toEqual([])
    },
    TS_TIMEOUT,
  )
})

// ── Edited-file extraction ───────────────────────────────────────────────────

describe('extractEditedFilePaths', () => {
  const assistantEdit = (toolName: string, p: string) => ({
    role: 'assistant' as const,
    content: [{ type: 'tool-call', toolName, input: { path: p } }],
  })

  test('pulls write_file and str_replace paths, resolved to absolute', () => {
    const root = path.resolve('/tmp/proj')
    const messages = [
      assistantEdit('write_file', 'src/a.ts'),
      assistantEdit('str_replace', 'src/b.ts'),
      assistantEdit('read_files', 'src/c.ts'), // not an edit tool
    ] as any

    const files = extractEditedFilePaths(messages, 0, root)
    expect(files).toEqual([
      path.resolve(root, 'src/a.ts'),
      path.resolve(root, 'src/b.ts'),
    ])
  })

  test('de-duplicates repeated edits to the same file', () => {
    const root = path.resolve('/tmp/proj')
    const messages = [
      assistantEdit('str_replace', 'x.ts'),
      assistantEdit('str_replace', 'x.ts'),
    ] as any
    expect(extractEditedFilePaths(messages, 0, root)).toEqual([
      path.resolve(root, 'x.ts'),
    ])
  })

  test('honours fromIndex (only this turn)', () => {
    const root = path.resolve('/tmp/proj')
    const messages = [
      assistantEdit('write_file', 'old.ts'),
      assistantEdit('write_file', 'new.ts'),
    ] as any
    expect(extractEditedFilePaths(messages, 1, root)).toEqual([
      path.resolve(root, 'new.ts'),
    ])
  })
})

// ── Router + formatting + toggle ─────────────────────────────────────────────

describe('collectDiagnostics + formatting', () => {
  test(
    'routes .ts files through the ts provider',
    async () => {
      writeTsconfig()
      const file = writeFile('bad.ts', 'export const x: number = "hello"\n')
      const diags = await collectDiagnostics([file])
      expect(diags.length).toBeGreaterThan(0)
    },
    30_000,
  )

  test('skips files with no registered provider', async () => {
    const file = writeFile('readme.md', '# hello\n')
    expect(await collectDiagnostics([file])).toEqual([])
  })

  test('formats diagnostics with relative paths', () => {
    const root = path.resolve('/tmp/proj')
    const text = formatDiagnosticsForAgent(
      [
        {
          file: path.resolve(root, 'src/a.ts'),
          line: 3,
          column: 5,
          message: 'Type error',
          code: 2322,
        },
      ],
      root,
    )
    expect(text).toContain('1 compiler error')
    expect(text).toContain('src')
    expect(text).toContain(':3:5')
    expect(text).toContain('[2322]')
  })
})

describe('lspEnabled', () => {
  const original = process.env.NEXUS_LSP
  afterEach(() => {
    if (original === undefined) delete process.env.NEXUS_LSP
    else process.env.NEXUS_LSP = original
  })

  test('on by default', () => {
    delete process.env.NEXUS_LSP
    expect(lspEnabled()).toBe(true)
  })

  test('off when NEXUS_LSP=0', () => {
    process.env.NEXUS_LSP = '0'
    expect(lspEnabled()).toBe(false)
  })

  test('off when NEXUS_LSP=false', () => {
    process.env.NEXUS_LSP = 'false'
    expect(lspEnabled()).toBe(false)
  })
})
