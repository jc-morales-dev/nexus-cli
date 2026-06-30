/**
 * Extract the set of files the agent edited during the current turn, by walking
 * the assistant tool-call parts in the message history. Mirrors the scanning
 * approach in reliability-guards.ts but keeps the tool input so we can read the
 * `path` argument.
 */
import path from 'node:path'

import type { Message } from '@nexus/common/types/messages/nexus-message'

/** Tools that write a single file at a known `path` argument. */
const PATH_EDIT_TOOLS = new Set(['str_replace', 'write_file'])

function readString(obj: unknown, key: string): string | undefined {
  if (!obj || typeof obj !== 'object') return undefined
  const value = (obj as Record<string, unknown>)[key]
  return typeof value === 'string' && value.length > 0 ? value : undefined
}

/**
 * Absolute paths of files edited from `fromIndex` onward (this turn). Resolved
 * against `projectRoot`. De-duplicated, order-preserving by first edit.
 *
 * Fails safe: an out-of-range `fromIndex` (e.g. history was pruned) scans the
 * whole history rather than throwing.
 */
export function extractEditedFilePaths(
  messages: Message[],
  fromIndex: number,
  projectRoot: string,
): string[] {
  const slice =
    fromIndex > 0
      ? messages.slice(Math.min(fromIndex, messages.length))
      : messages
  const seen = new Set<string>()
  const out: string[] = []

  for (const message of slice) {
    if (!message || message.role !== 'assistant') continue
    const content = (message as { content?: unknown }).content
    if (!Array.isArray(content)) continue
    for (const part of content) {
      if (
        !part ||
        typeof part !== 'object' ||
        (part as { type?: unknown }).type !== 'tool-call'
      ) {
        continue
      }
      const toolName = String((part as { toolName?: unknown }).toolName ?? '')
      if (!PATH_EDIT_TOOLS.has(toolName)) continue
      const relOrAbs = readString((part as { input?: unknown }).input, 'path')
      if (!relOrAbs) continue
      const abs = path.isAbsolute(relOrAbs)
        ? path.normalize(relOrAbs)
        : path.resolve(projectRoot, relOrAbs)
      if (seen.has(abs)) continue
      seen.add(abs)
      out.push(abs)
    }
  }
  return out
}
