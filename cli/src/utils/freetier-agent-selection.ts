import { getFreeTierRootAgentIdForModel } from '@nexus/common/constants/free-agents'

import { getSelectedFreeTierModel } from '../state/freetier-model-store'
import { AGENT_MODE_TO_ID, IS_FREETIER, type AgentMode } from './constants'

export function getAgentIdForMode(agentMode: AgentMode): string {
  if (IS_FREETIER && agentMode === 'LITE') {
    return getFreeTierRootAgentIdForModel(getSelectedFreeTierModel())
  }

  return AGENT_MODE_TO_ID[agentMode]
}
