/**
 * In-session checkpoints / undo for agent file edits (NEXUS).
 *
 * Every time the agent writes a file (via change-file.ts), we record that
 * file's PRIOR content the first time it's touched within the current
 * checkpoint. A checkpoint groups all the edits of one user turn. `/undo` then
 * restores the files of the most recent checkpoint to how they were before the
 * agent touched them (deleting files the agent created).
 *
 * Design notes:
 * - A new checkpoint boundary is opened at the start of each run() (one user
 *   turn). It's created lazily on the first actual edit, so turns that don't
 *   edit anything don't leave empty checkpoints.
 * - State is in-memory and per-process (the CLI imports the SDK, so the manager
 *   is a shared singleton). Undo is a between-turns user action.
 * - Restore uses Node fs synchronously (the SDK runs locally for NEXUS) and is
 *   tolerant of per-file errors so one bad path can't abort the whole undo.
 */
import fs from 'fs'
import path from 'path'

interface FileSnapshot {
  absPath: string
  /** The file's content before the agent touched it, or null if it didn't exist. */
  prior: string | null
}

interface Checkpoint {
  id: number
  label: string
  timestamp: number
  /** relPath -> snapshot. Only the FIRST touch per file per checkpoint is kept. */
  files: Map<string, FileSnapshot>
}

const MAX_CHECKPOINTS = 30

export interface UndoResult {
  label: string
  restored: string[]
  deleted: string[]
}

export interface CheckpointSummary {
  id: number
  label: string
  fileCount: number
}

export class CheckpointManager {
  private checkpoints: Checkpoint[] = []
  private nextId = 1
  /** Set by beginCheckpoint; materialized into a real checkpoint on first edit. */
  private pendingLabel: string | null = null

  /** Open a new checkpoint boundary for the next batch of edits (one turn). */
  beginCheckpoint(label = ''): void {
    this.pendingLabel = label.trim().slice(0, 80)
  }

  /** Record a file's prior state before the agent overwrites it. */
  recordPriorState(relPath: string, absPath: string, prior: string | null): void {
    let current = this.checkpoints[this.checkpoints.length - 1]
    // Start a fresh checkpoint when a new boundary was opened, or if none exist.
    if (this.pendingLabel !== null || !current) {
      current = {
        id: this.nextId++,
        label: this.pendingLabel ?? '',
        timestamp: Date.now(),
        files: new Map(),
      }
      this.checkpoints.push(current)
      this.pendingLabel = null
      if (this.checkpoints.length > MAX_CHECKPOINTS) this.checkpoints.shift()
    }
    if (!current.files.has(relPath)) {
      current.files.set(relPath, { absPath, prior })
    }
  }

  /** True if there's at least one non-empty checkpoint to undo. */
  canUndo(): boolean {
    return this.checkpoints.some((cp) => cp.files.size > 0)
  }

  /** Restore the most recent non-empty checkpoint. Returns null if none. */
  undo(): UndoResult | null {
    let idx = -1
    for (let i = this.checkpoints.length - 1; i >= 0; i--) {
      if (this.checkpoints[i].files.size > 0) {
        idx = i
        break
      }
    }
    if (idx === -1) return null

    const [checkpoint] = this.checkpoints.splice(idx, 1)
    const restored: string[] = []
    const deleted: string[] = []

    for (const [relPath, snap] of checkpoint.files) {
      try {
        if (snap.prior === null) {
          // The agent created this file — remove it to undo.
          if (fs.existsSync(snap.absPath)) fs.rmSync(snap.absPath)
          deleted.push(relPath)
        } else {
          fs.mkdirSync(path.dirname(snap.absPath), { recursive: true })
          fs.writeFileSync(snap.absPath, snap.prior)
          restored.push(relPath)
        }
      } catch {
        /* tolerate per-file failures so one bad path doesn't abort the undo */
      }
    }

    return { label: checkpoint.label, restored, deleted }
  }

  /** Most-recent-first list of non-empty checkpoints (for UI/inspection). */
  list(): CheckpointSummary[] {
    return this.checkpoints
      .filter((cp) => cp.files.size > 0)
      .map((cp) => ({ id: cp.id, label: cp.label, fileCount: cp.files.size }))
      .reverse()
  }

  /** Drop all checkpoints (e.g. on /new). */
  clear(): void {
    this.checkpoints = []
    this.pendingLabel = null
  }
}

/** Process-wide singleton shared by the SDK edit path and the CLI /undo command. */
export const checkpoints = new CheckpointManager()
