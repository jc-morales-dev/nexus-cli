import { postStreamProcessing } from './write-file'

import type { NexusToolHandlerFunction } from '../handler-function-type'
import type { FileProcessingState } from './write-file'
import type {
  ClientToolCall,
  NexusToolCall,
  NexusToolOutput,
} from '@nexus/common/tools/list'
import type { Logger } from '@nexus/common/types/contracts/logger'

export const handleCreatePlan = (async (params: {
  previousToolCallFinished: Promise<void>
  toolCall: NexusToolCall<'create_plan'>

  fileProcessingState: FileProcessingState
  logger: Logger

  requestClientToolCall: (
    toolCall: ClientToolCall<'create_plan'>,
  ) => Promise<NexusToolOutput<'create_plan'>>
  writeToClient: (chunk: string) => void
}): Promise<{
  output: NexusToolOutput<'create_plan'>
}> => {
  const {
    fileProcessingState,
    logger,
    previousToolCallFinished,
    toolCall,
    requestClientToolCall,
    writeToClient,
  } = params
  const { path, plan } = toolCall.input

  logger.debug(
    {
      path,
      plan,
    },
    'Create plan',
  )
  // Add the plan file to the processing queue
  const change = {
    tool: 'create_plan' as const,
    path,
    content: plan,
    messages: [],
    toolCallId: toolCall.toolCallId,
  }
  fileProcessingState.promisesByPath[path].push(Promise.resolve(change))
  fileProcessingState.allPromises.push(Promise.resolve(change))

  await previousToolCallFinished
  return {
    output: await postStreamProcessing<'create_plan'>(
      change,
      fileProcessingState,
      writeToClient,
      requestClientToolCall,
    ),
  }
}) satisfies NexusToolHandlerFunction<'create_plan'>
