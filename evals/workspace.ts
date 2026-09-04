/**
 * Scratch workspaces for evals.
 *
 * Every scenario gets a fresh directory outside the repo. Agents in these evals
 * are allowed to write files, and pointing them at the working tree would make
 * results depend on whatever the previous scenario left behind — the opposite
 * of repeatable.
 */

import { spawn } from 'child_process'
import fs from 'fs'
import os from 'os'
import path from 'path'

import type { FileTree } from './types'

export interface Workspace {
  dir: string
  /** Snapshot of the fixture, used to compute `changedFiles`. */
  baseline: Map<string, string>
}

export function createWorkspace(scenarioId: string, fixture: FileTree = {}): Workspace {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), `nexus-eval-${scenarioId}-`))
  const baseline = new Map<string, string>()

  for (const [relativePath, contents] of Object.entries(fixture)) {
    const target = path.join(dir, relativePath)
    fs.mkdirSync(path.dirname(target), { recursive: true })
    fs.writeFileSync(target, contents)
    baseline.set(normalise(relativePath), contents)
  }

  return { dir, baseline }
}

export function destroyWorkspace(workspace: Workspace): void {
  try {
    fs.rmSync(workspace.dir, { recursive: true, force: true })
  } catch {
    // A leftover temp directory is not worth failing an eval run over.
  }
}

export function readWorkspaceFile(workspace: Workspace, relativePath: string): string | undefined {
  const target = path.join(workspace.dir, relativePath)
  try {
    return fs.readFileSync(target, 'utf8')
  } catch {
    return undefined
  }
}

/** Every path that differs from the fixture: added, removed or edited. */
export function diffWorkspace(workspace: Workspace): string[] {
  const current = new Map<string, string>()
  walk(workspace.dir, workspace.dir, current)

  const changed = new Set<string>()
  for (const [file, contents] of current) {
    if (workspace.baseline.get(file) !== contents) changed.add(file)
  }
  for (const file of workspace.baseline.keys()) {
    if (!current.has(file)) changed.add(file)
  }
  return [...changed].sort()
}

/** Directories an agent has no business being judged on. */
const IGNORED_DIRS = new Set(['.git', 'node_modules', '.nexus', 'dist', '.agents'])

function walk(root: string, dir: string, out: Map<string, string>): void {
  let entries: fs.Dirent[]
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true })
  } catch {
    return
  }

  for (const entry of entries) {
    if (IGNORED_DIRS.has(entry.name)) continue
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      walk(root, full, out)
    } else if (entry.isFile()) {
      try {
        out.set(normalise(path.relative(root, full)), fs.readFileSync(full, 'utf8'))
      } catch {
        // Binary or unreadable file — not something evals assert on.
      }
    }
  }
}

/** Run a command inside a workspace, with a hard timeout. */
export function runInWorkspace(
  workspace: Workspace,
  command: string,
  args: string[],
  timeoutMs = 120_000,
): Promise<{ exitCode: number; stdout: string; stderr: string }> {
  return new Promise((resolve) => {
    const child = spawn(command, args, {
      cwd: workspace.dir,
      shell: process.platform === 'win32',
      env: { ...process.env, NO_COLOR: '1' },
    })

    let stdout = ''
    let stderr = ''
    const timer = setTimeout(() => child.kill('SIGKILL'), timeoutMs)

    child.stdout?.on('data', (chunk) => {
      stdout += String(chunk)
    })
    child.stderr?.on('data', (chunk) => {
      stderr += String(chunk)
    })
    child.on('error', (error) => {
      clearTimeout(timer)
      resolve({ exitCode: 127, stdout, stderr: `${stderr}\n${error.message}` })
    })
    child.on('close', (code) => {
      clearTimeout(timer)
      resolve({ exitCode: code ?? 1, stdout, stderr })
    })
  })
}

function normalise(p: string): string {
  return p.replace(/\\/g, '/')
}
