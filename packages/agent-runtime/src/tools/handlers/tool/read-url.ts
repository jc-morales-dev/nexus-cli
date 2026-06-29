import type { NexusToolHandlerFunction } from '../handler-function-type'
import type {
  ClientToolCall,
  NexusToolCall,
  NexusToolOutput,
} from '@nexus/common/tools/list'

export const handleReadUrl = (async (params: {
  previousToolCallFinished: Promise<void>
  toolCall: NexusToolCall<'read_url'>
  requestClientToolCall: (
    toolCall: ClientToolCall<'read_url'>,
  ) => Promise<NexusToolOutput<'read_url'>>
}): Promise<{
  output: NexusToolOutput<'read_url'>
}> => {
  const { previousToolCallFinished, toolCall, requestClientToolCall } = params

  await previousToolCallFinished
  return { output: await requestClientToolCall(toolCall) }
}) satisfies NexusToolHandlerFunction<'read_url'>
