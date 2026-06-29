import { getFreebuffRootAgentIdForModel } from '@nexus/common/constants/free-agents'

import { getSelectedFreebuffModel } from '../state/freetier-model-store'
import { AGENT_MODE_TO_ID, IS_FREEBUFF, type AgentMode } from './constants'

export function getAgentIdForMode(agentMode: AgentMode): string {
  if (IS_FREEBUFF && agentMode === 'LITE') {
    return getFreebuffRootAgentIdForModel(getSelectedFreebuffModel())
  }

  return AGENT_MODE_TO_ID[agentMode]
}
