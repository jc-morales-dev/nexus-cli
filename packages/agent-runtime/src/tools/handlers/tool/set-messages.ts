import type { NexusToolHandlerFunction } from '../handler-function-type'
import type {
  NexusToolCall,
  NexusToolOutput,
} from '@nexus/common/tools/list'
import type { AgentState } from '@nexus/common/types/session-state'

export const handleSetMessages = (async (params: {
  previousToolCallFinished: Promise<void>
  toolCall: NexusToolCall<'set_messages'>

  agentState: AgentState
}): Promise<{ output: NexusToolOutput<'set_messages'> }> => {
  const { previousToolCallFinished, toolCall, agentState } = params

  await previousToolCallFinished
  agentState.messageHistory = toolCall.input.messages
  return { output: [{ type: 'json', value: { message: 'Messages set.' } }] }
}) satisfies NexusToolHandlerFunction<'set_messages'>
