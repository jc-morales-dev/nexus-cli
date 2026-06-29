import type { NexusToolHandlerFunction } from '../handler-function-type'
import type {
  ClientToolCall,
  NexusToolCall,
  NexusToolOutput,
} from '@nexus/common/tools/list'

type ToolName = 'run_file_change_hooks'
export const handleRunFileChangeHooks = (async (params: {
  previousToolCallFinished: Promise<void>
  toolCall: NexusToolCall<ToolName>
  requestClientToolCall: (
    toolCall: ClientToolCall<ToolName>,
  ) => Promise<NexusToolOutput<ToolName>>
}): Promise<{ output: NexusToolOutput<ToolName> }> => {
  const { previousToolCallFinished, toolCall, requestClientToolCall } = params

  await previousToolCallFinished
  return { output: await requestClientToolCall(toolCall) }
}) satisfies NexusToolHandlerFunction<'run_file_change_hooks'>
