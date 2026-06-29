import fs from 'fs'
import os from 'os'
import path from 'path'

import { describe, test, expect } from 'bun:test'

import { BackgroundProcessRegistry } from '../tools/background-processes'

import type { ChildProcess } from 'child_process'

function fakeChild(): { child: ChildProcess; killed: () => boolean } {
  let wasKilled = false
  const child = {
    kill: () => {
      wasKilled = true
      return true
    },
  } as unknown as ChildProcess
  return { child, killed: () => wasKilled }
}

function tmpLog(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nexus-bg-'))
  return path.join(dir, 'p.log')
}

function reg(
  registry: BackgroundProcessRegistry,
  id: number,
  child: ChildProcess,
  command = 'sleep 1',
) {
  registry.register({
    id,
    command,
    status: 'running',
    exitCode: null,
    logPath: tmpLog(),
    startedAt: id, // monotonic-ish for sort assertions
    child,
  })
}

describe('BackgroundProcessRegistry', () => {
  test('lists registered processes, newest first', () => {
    const r = new BackgroundProcessRegistry()
    reg(r, 1, fakeChild().child, 'first')
    reg(r, 2, fakeChild().child, 'second')
    const list = r.list()
    expect(list.map((p) => p.id)).toEqual([2, 1])
    expect(list[0].status).toBe('running')
  })

  test('markExited sets completed/error from the exit code', () => {
    const r = new BackgroundProcessRegistry()
    reg(r, 1, fakeChild().child)
    reg(r, 2, fakeChild().child)
    r.markExited(1, 0)
    r.markExited(2, 1)
    const byId = Object.fromEntries(r.list().map((p) => [p.id, p]))
    expect(byId[1].status).toBe('completed')
    expect(byId[2].status).toBe('error')
    expect(byId[2].exitCode).toBe(1)
  })

  test('kill terminates a running process and reports success', () => {
    const r = new BackgroundProcessRegistry()
    const fc = fakeChild()
    reg(r, 7, fc.child)
    expect(r.kill(7)).toBe(true)
    expect(fc.killed()).toBe(true)
    expect(r.get(7)?.status).toBe('completed')
    // Killing again (already stopped) is a no-op.
    expect(r.kill(7)).toBe(false)
    // Unknown id.
    expect(r.kill(999)).toBe(false)
  })

  test('killAll stops every running process and returns the count', () => {
    const r = new BackgroundProcessRegistry()
    reg(r, 1, fakeChild().child)
    reg(r, 2, fakeChild().child)
    r.markExited(2, 0) // already finished
    expect(r.killAll()).toBe(1) // only #1 was still running
    expect(r.list().every((p) => p.status !== 'running')).toBe(true)
  })

  test('markExited appends an exit marker to the log file', () => {
    const r = new BackgroundProcessRegistry()
    const logPath = tmpLog()
    fs.writeFileSync(logPath, 'output so far\n')
    r.register({
      id: 5,
      command: 'x',
      status: 'running',
      exitCode: null,
      logPath,
      startedAt: 5,
      child: fakeChild().child,
    })
    r.markExited(5, 0)
    expect(fs.readFileSync(logPath, 'utf8')).toContain('exited with code 0')
  })
})
