import { env } from '@nexus/common/env'

import { describeError } from './cli-errors'

import type { ChatMessage } from '../types/chat'

const defaultAppUrl = env.NEXT_PUBLIC_NEXUS_APP_URL || 'https://nexus.com'

/**
 * Check if an error indicates the user is out of credits.
 * Standardized on statusCode === 402 for payment required detection.
 */
export const isOutOfCreditsError = (error: unknown): boolean => {
  if (
    error &&
    typeof error === 'object' &&
    'statusCode' in error &&
    (error as { statusCode: unknown }).statusCode === 402
  ) {
    return true
  }
  return false
}

export const OUT_OF_CREDITS_MESSAGE = `Out of credits. Please add credits at ${defaultAppUrl}/usage`

/**
 * Turn a failed turn into the chat message the user reads.
 *
 * This used to append `error.stack` to the message body, which put a 30-line
 * V8 trace in the middle of the conversation for every transient network blip
 * and taught the user nothing. It now renders the classified error: what went
 * wrong and what to do about it, with the stack behind `--debug`.
 */
export const createErrorMessage = (
  error: unknown,
  aiMessageId: string,
): Partial<ChatMessage> => {
  return {
    id: aiMessageId,
    content: `**Error:** ${describeError(error)}`,
    blocks: undefined,
    isComplete: true,
  }
}
