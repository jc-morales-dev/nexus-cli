import { LITE_DEEPSEEK_FLASH_MODEL_ID } from '@nexus/common/constants/lite-agents'

import { publisher } from '../constants'
import type { SecretAgentDefinition } from '../types/secret-agent-definition'
import { createReviewer } from './code-reviewer'

const definition: SecretAgentDefinition = {
  id: 'code-reviewer-deepseek-flash',
  publisher,
  ...createReviewer(LITE_DEEPSEEK_FLASH_MODEL_ID),
}

export default definition
