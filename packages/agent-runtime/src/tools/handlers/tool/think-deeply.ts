import type { NexusToolHandlerFunction } from '../handler-function-type'
import type {
  NexusToolCall,
  NexusToolOutput,
} from '@nexus/common/tools/list'
import type { Logger } from '@nexus/common/types/contracts/logger'

export const handleThinkDeeply = (async (params: {
  previousToolCallFinished: Promise<any>
  toolCall: NexusToolCall<'think_deeply'>
  logger: Logger
}): Promise<{ output: NexusToolOutput<'think_deeply'> }> => {
  const { previousToolCallFinished, toolCall, logger } = params
  const { thought } = toolCall.input

  logger.debug(
    {
      thought,
    },
    'Thought deeply',
  )

  await previousToolCallFinished
  return { output: [{ type: 'json', value: { message: 'Thought logged.' } }] }
}) satisfies NexusToolHandlerFunction<'think_deeply'>
