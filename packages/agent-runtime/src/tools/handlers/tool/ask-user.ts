import type { NexusToolHandlerFunction } from '../handler-function-type'
import type {
  NexusToolCall,
  NexusToolOutput,
} from '@nexus/common/tools/list'

type ToolName = 'ask_user'

// Handler for ask_user - delegates to client
export const handleAskUser = (async (params: {
  previousToolCallFinished: Promise<void>
  toolCall: NexusToolCall<ToolName>
  requestClientToolCall: (toolCall: any) => Promise<any>
}): Promise<{ output: NexusToolOutput<ToolName> }> => {
  const { previousToolCallFinished, toolCall, requestClientToolCall } = params

  await previousToolCallFinished

  const result = await requestClientToolCall(toolCall as any)
  return {
    output: result,
  }
}) satisfies NexusToolHandlerFunction<ToolName>
