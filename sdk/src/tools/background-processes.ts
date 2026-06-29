/**
 * Registry for long-running background processes started by the agent
 * (run_terminal_command with process_type 'BACKGROUND') — dev servers, watchers,
 * builds, slow test runs, etc.
 *
 * Each process streams its combined stdout/stderr to a log file under
 * `.nexus/bg/<pid>.log`, so the agent can monitor it by reading that file with
 * its normal read tools, and the user can list/kill them with the `/bg` command.
 *
 * Processes are children of the NEXUS process, so they're cleaned up on exit
 * (killAll) — we don't want to orphan a dev server after the CLI closes.
 */
import fs from 'fs'

import type { ChildProcess } from 'child_process'

export type BackgroundStatus = 'running' | 'completed' | 'error'

interface BackgroundProcess {
  id: number
  command: string
  status: BackgroundStatus
  exitCode: number | null
  logPath: string
  startedAt: number
  child: ChildProcess
}

export interface BackgroundProcessSummary {
  id: number
  command: string
  status: BackgroundStatus
  exitCode: number | null
  logPath: string
}

export class BackgroundProcessRegistry {
  private procs = new Map<number, BackgroundProcess>()

  register(proc: BackgroundProcess): void {
    this.procs.set(proc.id, proc)
  }

  /** Record that a process finished. Appends an exit marker to its log. */
  markExited(id: number, exitCode: number | null): void {
    const proc = this.procs.get(id)
    if (!proc) return
    proc.status = exitCode && exitCode !== 0 ? 'error' : 'completed'
    proc.exitCode = exitCode
    try {
      fs.appendFileSync(
        proc.logPath,
        `\n[nexus] process ${id} exited with code ${exitCode ?? 'unknown'}\n`,
      )
    } catch {
      /* best-effort */
    }
  }

  get(id: number): BackgroundProcess | undefined {
    return this.procs.get(id)
  }

  /** Newest first. */
  list(): BackgroundProcessSummary[] {
    return [...this.procs.values()]
      .sort((a, b) => b.startedAt - a.startedAt)
      .map(({ id, command, status, exitCode, logPath }) => ({
        id,
        command,
        status,
        exitCode,
        logPath,
      }))
  }

  /** Kill one running process. Returns true if a running process was killed. */
  kill(id: number): boolean {
    const proc = this.procs.get(id)
    if (!proc || proc.status !== 'running') return false
    try {
      const killed = proc.child.kill('SIGTERM')
      if (!killed) proc.child.kill('SIGKILL')
    } catch {
      return false
    }
    proc.status = 'completed'
    return true
  }

  /** Kill every still-running process (e.g. on CLI exit). Returns the count. */
  killAll(): number {
    let count = 0
    for (const proc of this.procs.values()) {
      if (proc.status === 'running') {
        try {
          if (!proc.child.kill('SIGTERM')) proc.child.kill('SIGKILL')
          proc.status = 'completed'
          count++
        } catch {
          /* ignore */
        }
      }
    }
    return count
  }

  /** Forget finished processes (and kill+forget running ones). */
  clear(): void {
    this.killAll()
    this.procs.clear()
  }
}

/** Process-wide singleton shared by the terminal runner and the /bg command. */
export const backgroundProcesses = new BackgroundProcessRegistry()

// Best-effort cleanup so we don't orphan background children (e.g. a dev server)
// when NEXUS exits. child.kill is synchronous, which 'exit' allows.
process.once('exit', () => {
  try {
    backgroundProcesses.killAll()
  } catch {
    /* ignore */
  }
})
