export type { FreebuffSessionServerResponse } from '@nexus/common/types/freetier-session'

import type { FreebuffSessionServerResponse } from '@nexus/common/types/freetier-session'

/**
 * CLI session shape. Most states are wire-level `/api/v1/freebuff/session`
 * responses; `takeover_prompt` is local-only so startup can ask before POSTing
 * and rotating another running CLI's instance id.
 */
export type FreebuffSessionResponse =
  | FreebuffSessionServerResponse
  | {
      status: 'takeover_prompt'
      model: string
    }

export type FreebuffSessionStatus = FreebuffSessionResponse['status']
