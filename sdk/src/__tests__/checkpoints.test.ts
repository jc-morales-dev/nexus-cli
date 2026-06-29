import fs from 'fs'
import os from 'os'
import path from 'path'

import { describe, test, expect } from 'bun:test'

import { CheckpointManager } from '../checkpoints'

function freshDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'nexus-cp-'))
}

describe('CheckpointManager', () => {
  test('undo restores a modified file to its prior content', () => {
    const dir = freshDir()
    const f = path.join(dir, 'a.txt')
    fs.writeFileSync(f, 'original')
    const cm = new CheckpointManager()
    cm.beginCheckpoint('edit a')

    cm.recordPriorState('a.txt', f, 'original')
    fs.writeFileSync(f, 'changed') // the agent's edit

    expect(cm.canUndo()).toBe(true)
    const res = cm.undo()
    expect(res?.restored).toEqual(['a.txt'])
    expect(fs.readFileSync(f, 'utf8')).toBe('original')
    fs.rmSync(dir, { recursive: true, force: true })
  })

  test('undo deletes a file the agent created (prior = null)', () => {
    const dir = freshDir()
    const f = path.join(dir, 'new.txt')
    fs.writeFileSync(f, 'created by agent')
    const cm = new CheckpointManager()
    cm.recordPriorState('new.txt', f, null)

    const res = cm.undo()
    expect(res?.deleted).toEqual(['new.txt'])
    expect(fs.existsSync(f)).toBe(false)
    fs.rmSync(dir, { recursive: true, force: true })
  })

  test('undo recreates a file the agent deleted', () => {
    const dir = freshDir()
    const f = path.join(dir, 'gone.txt')
    // The file is currently gone (the agent deleted it); prior held its content.
    const cm = new CheckpointManager()
    cm.recordPriorState('gone.txt', f, 'i was here')

    const res = cm.undo()
    expect(res?.restored).toEqual(['gone.txt'])
    expect(fs.readFileSync(f, 'utf8')).toBe('i was here')
    fs.rmSync(dir, { recursive: true, force: true })
  })

  test('keeps only the first touch per file (restores the original pre-turn state)', () => {
    const dir = freshDir()
    const f = path.join(dir, 'a.txt')
    fs.writeFileSync(f, 'v0')
    const cm = new CheckpointManager()

    cm.recordPriorState('a.txt', f, 'v0') // first edit this turn
    fs.writeFileSync(f, 'v1')
    cm.recordPriorState('a.txt', f, 'v1') // second edit — must be ignored
    fs.writeFileSync(f, 'v2')

    cm.undo()
    expect(fs.readFileSync(f, 'utf8')).toBe('v0') // back to original, not v1
    fs.rmSync(dir, { recursive: true, force: true })
  })

  test('multi-level undo reverts checkpoints one turn at a time', () => {
    const dir = freshDir()
    const fa = path.join(dir, 'a.txt')
    const fb = path.join(dir, 'b.txt')
    fs.writeFileSync(fa, 'a0')
    fs.writeFileSync(fb, 'b0')
    const cm = new CheckpointManager()

    cm.beginCheckpoint('turn 1')
    cm.recordPriorState('a.txt', fa, 'a0')
    fs.writeFileSync(fa, 'a1')

    cm.beginCheckpoint('turn 2')
    cm.recordPriorState('b.txt', fb, 'b0')
    fs.writeFileSync(fb, 'b1')

    cm.undo() // undoes turn 2
    expect(fs.readFileSync(fb, 'utf8')).toBe('b0')
    expect(fs.readFileSync(fa, 'utf8')).toBe('a1') // turn 1 untouched

    cm.undo() // undoes turn 1
    expect(fs.readFileSync(fa, 'utf8')).toBe('a0')
    expect(cm.canUndo()).toBe(false)
    fs.rmSync(dir, { recursive: true, force: true })
  })

  test('a turn that opens a checkpoint but never edits leaves nothing to undo', () => {
    const cm = new CheckpointManager()
    cm.beginCheckpoint('no edits this turn')
    expect(cm.canUndo()).toBe(false)
    expect(cm.undo()).toBeNull()
  })

  test('clear() drops all checkpoints', () => {
    const dir = freshDir()
    const f = path.join(dir, 'a.txt')
    fs.writeFileSync(f, 'x')
    const cm = new CheckpointManager()
    cm.recordPriorState('a.txt', f, 'x')
    expect(cm.canUndo()).toBe(true)
    cm.clear()
    expect(cm.canUndo()).toBe(false)
    fs.rmSync(dir, { recursive: true, force: true })
  })
})
