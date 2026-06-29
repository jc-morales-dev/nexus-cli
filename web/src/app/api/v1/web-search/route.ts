import { consumeCreditsWithFallback } from '@nexus/billing/credit-delegation'
import { ensureSubscriberBlockGrant } from '@nexus/billing/subscription'
import { getUserUsageData } from '@nexus/billing/usage-service'
import { trackEvent } from '@nexus/common/analytics'
import { env } from '@nexus/internal/env'

import { postWebSearch } from './_post'

import type { NextRequest } from 'next/server'

import { getUserInfoFromApiKey } from '@/db/user'
import { logger, loggerWithContext } from '@/util/logger'

export async function POST(req: NextRequest) {
  return postWebSearch({
    req,
    getUserInfoFromApiKey,
    logger,
    loggerWithContext,
    trackEvent,
    getUserUsageData,
    consumeCreditsWithFallback,
    fetch,
    serverEnv: { SERPER_API_KEY: env.SERPER_API_KEY },
    ensureSubscriberBlockGrant,
  })
}
