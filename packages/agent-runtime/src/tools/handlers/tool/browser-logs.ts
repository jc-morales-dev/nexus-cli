import type { NexusToolHandlerFunction } from '../handler-function-type'
import type {
  ClientToolCall,
  NexusToolCall,
  NexusToolOutput,
} from '@nexus/common/tools/list'

export const handleBrowserLogs = (async (params: {
  previousToolCallFinished: Promise<void>
  toolCall: NexusToolCall<'browser_logs'>
  requestClientToolCall: (
    toolCall: ClientToolCall<'browser_logs'>,
  ) => Promise<NexusToolOutput<'browser_logs'>>
}): Promise<{
  output: NexusToolOutput<'browser_logs'>
}> => {
  const { previousToolCallFinished, toolCall, requestClientToolCall } = params

  await previousToolCallFinished
  return { output: await requestClientToolCall(toolCall) }
}) satisfies NexusToolHandlerFunction<'browser_logs'>
