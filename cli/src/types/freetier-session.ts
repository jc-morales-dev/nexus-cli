export type { FreeTierSessionServerResponse } from '@nexus/common/types/freetier-session'

import type { FreeTierSessionServerResponse } from '@nexus/common/types/freetier-session'

/**
 * CLI session shape. Most states are wire-level `/api/v1/freetier/session`
 * responses; `takeover_prompt` is local-only so startup can ask before POSTing
 * and rotating another running CLI's instance id.
 */
export type FreeTierSessionResponse =
  | FreeTierSessionServerResponse
  | {
      status: 'takeover_prompt'
      model: string
    }

export type FreeTierSessionStatus = FreeTierSessionResponse['status']
