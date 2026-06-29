import type { NexusToolHandlerFunction } from '../handler-function-type'

export const handleApplyPatch = (async ({
  previousToolCallFinished,
  toolCall,
  requestClientToolCall,
}) => {
  await previousToolCallFinished
  const clientToolCall = {
    toolCallId: toolCall.toolCallId,
    toolName: 'apply_patch' as const,
    input: toolCall.input,
  }
  return {
    output: await requestClientToolCall(clientToolCall),
  }
}) satisfies NexusToolHandlerFunction<'apply_patch'>
