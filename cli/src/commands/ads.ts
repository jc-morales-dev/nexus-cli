import { isByokDirectMode } from '@nexus/common/constants/byok'

import { useChatStore } from '../state/chat-store'
import { logger } from '../utils/logger'
import { getSystemMessage } from '../utils/message-history'
import { saveSettings, loadSettings } from '../utils/settings'

import type { ChatMessage } from '../types/chat'

export const handleAdsEnable = (): {
  postUserMessage: (messages: ChatMessage[]) => ChatMessage[]
} => {
  logger.info('[gravity] Enabling ads')

  saveSettings({ adsEnabled: true })

  return {
    postUserMessage: (messages) => [
      ...messages,
      getSystemMessage('Ads enabled. You will see contextual ads above the input.'),
    ],
  }
}

export const handleAdsDisable = (): {
  postUserMessage: (messages: ChatMessage[]) => ChatMessage[]
} => {
  logger.info('[gravity] Disabling ads')
  saveSettings({ adsEnabled: false })

  return {
    postUserMessage: (messages) => [
      ...messages,
      getSystemMessage('Ads disabled.'),
    ],
  }
}

export const getAdsEnabled = (): boolean => {
  // BYOK direct mode is a personal, account-less setup — never fetch ads.
  if (isByokDirectMode()) return false
  // Nexus LITE is a paid mode now, so use the normal saved setting.
  const settings = loadSettings()
  return settings.adsEnabled ?? false
}
