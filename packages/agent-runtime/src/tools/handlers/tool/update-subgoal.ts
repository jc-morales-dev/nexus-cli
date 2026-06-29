import { jsonToolResult } from '@nexus/common/util/messages'

import type { NexusToolHandlerFunction } from '../handler-function-type'
import type {
  NexusToolCall,
  NexusToolOutput,
} from '@nexus/common/tools/list'
import type { Subgoal } from '@nexus/common/types/session-state'

type ToolName = 'update_subgoal'
export const handleUpdateSubgoal = (async (params: {
  previousToolCallFinished: Promise<void>
  toolCall: NexusToolCall<ToolName>
  agentContext: Record<string, Subgoal>
}): Promise<{ output: NexusToolOutput<ToolName> }> => {
  const { previousToolCallFinished, toolCall, agentContext } = params

  let messages: string[] = []
  if (!agentContext[toolCall.input.id]) {
    messages.push(
      `Subgoal with id ${toolCall.input.id} not found. Creating new subgoal.`,
    )
    agentContext[toolCall.input.id] = {
      objective: undefined,
      status: undefined,
      plan: undefined,
      logs: [],
    }
  }
  if (toolCall.input.status) {
    agentContext[toolCall.input.id].status = toolCall.input.status
  }
  if (toolCall.input.plan) {
    agentContext[toolCall.input.id].plan = toolCall.input.plan
  }
  if (toolCall.input.log) {
    agentContext[toolCall.input.id].logs.push(toolCall.input.log)
  }
  messages.push('Successfully updated subgoal.')

  await previousToolCallFinished

  return {
    output: jsonToolResult({
      message: messages.join('\n\n'),
    }),
  }
}) satisfies NexusToolHandlerFunction<ToolName>
