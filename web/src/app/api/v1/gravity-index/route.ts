import { trackEvent } from '@nexus/common/analytics'
import { env } from '@nexus/internal/env'

import { postGravityIndex } from './_post'

import type { NextRequest } from 'next/server'

import { getUserInfoFromApiKey } from '@/db/user'
import { logger, loggerWithContext } from '@/util/logger'

export async function POST(req: NextRequest) {
  return postGravityIndex({
    req,
    getUserInfoFromApiKey,
    logger,
    loggerWithContext,
    trackEvent,
    fetch,
    serverEnv: { GRAVITY_API_KEY: env.GRAVITY_API_KEY },
  })
}
