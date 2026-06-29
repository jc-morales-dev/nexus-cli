import { jsonToolResult } from '@nexus/common/util/messages'

import type { NexusToolHandlerFunction } from '../handler-function-type'
import type {
  NexusToolCall,
  NexusToolOutput,
} from '@nexus/common/tools/list'

type ToolName = 'write_todos'
export const handleWriteTodos = (async (params: {
  previousToolCallFinished: Promise<void>
  toolCall: NexusToolCall<ToolName>
}): Promise<{ output: NexusToolOutput<ToolName> }> => {
  const { previousToolCallFinished } = params

  await previousToolCallFinished

  return { output: jsonToolResult({ message: 'Todos written' }) }
}) satisfies NexusToolHandlerFunction<ToolName>
