import { jsonToolResult } from '@nexus/common/util/messages'

import { getFileReadingUpdates } from '../../../get-file-reading-updates'
import { renderReadFilesResult } from '../../../util/render-read-files-result'

import type { NexusToolHandlerFunction } from '../handler-function-type'
import type {
  NexusToolCall,
  NexusToolOutput,
} from '@nexus/common/tools/list'
import type { ParamsExcluding } from '@nexus/common/types/function-params'
import type { ProjectFileContext } from '@nexus/common/util/file'

type ToolName = 'read_files'
export const handleReadFiles = (async (
  params: {
    previousToolCallFinished: Promise<void>
    toolCall: NexusToolCall<ToolName>

    fileContext: ProjectFileContext
  } & ParamsExcluding<typeof getFileReadingUpdates, 'requestedFiles'>,
): Promise<{ output: NexusToolOutput<ToolName> }> => {
  const {
    previousToolCallFinished,
    toolCall,

    fileContext,
  } = params
  const { paths } = toolCall.input

  await previousToolCallFinished

  const addedFiles = await getFileReadingUpdates({
    ...params,
    requestedFiles: paths,
  })

  return {
    output: jsonToolResult(
      renderReadFilesResult(addedFiles, fileContext.tokenCallers ?? {}),
    ),
  }
}) satisfies NexusToolHandlerFunction<ToolName>
