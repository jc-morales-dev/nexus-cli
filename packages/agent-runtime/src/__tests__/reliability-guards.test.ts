import { describe, test, expect } from 'bun:test'

import {
  editedWithoutValidation,
  extractToolCalls,
  findRepeatedToolCall,
} from '../reliability-guards'

import type { Message } from '@nexus/common/types/messages/codebuff-message'

/** Build an assistant message carrying a single tool call. */
function call(toolName: string, input: unknown = {}): Message {
  return {
    role: 'assistant',
    content: [{ type: 'tool-call', toolCallId: 't', toolName, input }],
  } as unknown as Message
}

/** A plain assistant text message (no tool calls). */
function text(s: string): Message {
  return { role: 'assistant', content: s } as unknown as Message
}

describe('extractToolCalls', () => {
  test('flattens tool-call parts in order, ignoring text and non-arrays', () => {
    const messages = [
      text('hello'),
      call('read_files', { paths: ['a.ts'] }),
      { role: 'user', content: 'hi' } as unknown as Message,
      call('str_replace', { file: 'a.ts' }),
    ]
    const calls = extractToolCalls(messages)
    expect(calls.map((c) => c.toolName)).toEqual(['read_files', 'str_replace'])
  })

  test('is defensive about malformed content', () => {
    const messages = [
      { role: 'assistant' } as unknown as Message,
      { role: 'assistant', content: null } as unknown as Message,
      { role: 'assistant', content: [{ type: 'text', text: 'x' }] } as unknown as Message,
    ]
    expect(extractToolCalls(messages)).toEqual([])
  })
})

describe('findRepeatedToolCall', () => {
  test('detects the same call repeated >= threshold within the window', () => {
    const messages = [
      call('str_replace', { file: 'a.ts', old: 'x' }),
      call('str_replace', { file: 'a.ts', old: 'x' }),
      call('str_replace', { file: 'a.ts', old: 'x' }),
    ]
    const repeated = findRepeatedToolCall(messages)
    expect(repeated).not.toBeNull()
    expect(repeated!.toolName).toBe('str_replace')
    expect(repeated!.count).toBe(3)
  })

  test('does not flag varied calls (different inputs)', () => {
    const messages = [
      call('read_files', { paths: ['a.ts'] }),
      call('read_files', { paths: ['b.ts'] }),
      call('read_files', { paths: ['c.ts'] }),
    ]
    expect(findRepeatedToolCall(messages)).toBeNull()
  })

  test('does not flag below threshold', () => {
    const messages = [
      call('str_replace', { file: 'a.ts' }),
      call('str_replace', { file: 'a.ts' }),
    ]
    expect(findRepeatedToolCall(messages)).toBeNull()
  })

  test('only considers the recent window, not old repeats', () => {
    // Two old identical calls, then 9 varied calls -> the old pair falls out of
    // the 10-wide window and should not trigger.
    const messages = [
      call('str_replace', { file: 'old.ts' }),
      call('str_replace', { file: 'old.ts' }),
      ...Array.from({ length: 9 }, (_, i) => call('read_files', { paths: [`f${i}.ts`] })),
    ]
    expect(findRepeatedToolCall(messages)).toBeNull()
  })
})

describe('editedWithoutValidation', () => {
  test('true when an edit happens with no validation after it', () => {
    const messages = [
      call('read_files', { paths: ['a.ts'] }),
      call('str_replace', { file: 'a.ts' }),
    ]
    expect(editedWithoutValidation(messages, 0)).toBe(true)
  })

  test('false when validation happens after the edit', () => {
    const messages = [
      call('str_replace', { file: 'a.ts' }),
      call('run_terminal_command', { command: 'bun typecheck' }),
    ]
    expect(editedWithoutValidation(messages, 0)).toBe(false)
  })

  test('false when there were no edits', () => {
    const messages = [
      call('read_files', { paths: ['a.ts'] }),
      call('glob', { pattern: '**/*.ts' }),
    ]
    expect(editedWithoutValidation(messages, 0)).toBe(false)
  })

  test('spawning an editor counts as edit, spawning a basher/reviewer as validation', () => {
    const edited = [call('spawn_agents', { agents: [{ agent_type: 'editor' }] })]
    expect(editedWithoutValidation(edited, 0)).toBe(true)

    const validated = [
      call('spawn_agents', { agents: [{ agent_type: 'editor' }] }),
      call('spawn_agents', { agents: [{ agent_type: 'basher' }] }),
    ]
    expect(editedWithoutValidation(validated, 0)).toBe(false)
  })

  test('respects fromIndex: edits before the turn start are ignored', () => {
    const messages = [
      call('str_replace', { file: 'old.ts' }), // previous turn
      call('read_files', { paths: ['a.ts'] }), // this turn, no edits
    ]
    expect(editedWithoutValidation(messages, 1)).toBe(false)
  })

  test('fails safe when fromIndex is past the end (history pruned)', () => {
    const messages = [call('str_replace', { file: 'a.ts' })]
    expect(editedWithoutValidation(messages, 99)).toBe(false)
  })
})
