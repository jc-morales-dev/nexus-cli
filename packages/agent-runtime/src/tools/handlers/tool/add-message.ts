import { assistantMessage, userMessage } from '@nexus/common/util/messages'

import type { NexusToolHandlerFunction } from '../handler-function-type'
import type {
  NexusToolCall,
  NexusToolOutput,
} from '@nexus/common/tools/list'
import type { AgentState } from '@nexus/common/types/session-state'

export const handleAddMessage = (async (params: {
  previousToolCallFinished: Promise<void>
  toolCall: NexusToolCall<'add_message'>

  agentState: AgentState
}): Promise<{
  output: NexusToolOutput<'add_message'>
}> => {
  const {
    previousToolCallFinished,
    toolCall,

    agentState,
  } = params

  await previousToolCallFinished

  agentState.messageHistory.push(
    toolCall.input.role === 'user'
      ? userMessage(toolCall.input.content)
      : assistantMessage(toolCall.input.content),
  )

  return { output: [{ type: 'json', value: { message: 'Message added.' } }] }
}) satisfies NexusToolHandlerFunction<'add_message'>
